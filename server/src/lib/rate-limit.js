import { config } from '../config.js';

/**
 * Failed-attempt tracking for the sign-in routes.
 *
 * Staff PINs are four digits, and the roster endpoint hands out every staff id
 * by design so the pad can show names. On the restaurant LAN that is fine: the
 * guess rate is bounded by someone standing at a tablet. Reachable from the
 * internet it is nine thousand guesses, so the whole of the PIN pad's security
 * rests on this budget.
 *
 * Counters live in memory. This process owns one SQLite file and does not run in
 * a cluster, so there is nothing to share them with, and a restart clearing them
 * is not a way in — an attacker cannot restart the server.
 */

const MINUTE = 60_000;

class AttemptTracker {
  #entries = new Map();

  constructor({ max, windowMs, blockMs }) {
    this.max = max;
    this.windowMs = windowMs;
    this.blockMs = blockMs;

    // Without this a stream of attempts from rotating addresses would grow the
    // map for the life of the process.
    this.timer = setInterval(() => this.#prune(), 5 * MINUTE);
    this.timer.unref?.();
  }

  #prune() {
    const now = Date.now();
    for (const [key, e] of this.#entries) {
      if (e.blockedUntil < now && e.last + this.windowMs < now) this.#entries.delete(key);
    }
  }

  /** Seconds left on a lockout, or 0 when the key is free to try again. */
  retryAfter(key) {
    const e = this.#entries.get(key);
    if (!e || e.blockedUntil <= Date.now()) return 0;
    return Math.ceil((e.blockedUntil - Date.now()) / 1000);
  }

  /** The first of `keys` that is currently locked out, if any. */
  blocked(keys) {
    for (const key of keys) {
      const seconds = this.retryAfter(key);
      if (seconds > 0) return { key, retryAfter: seconds };
    }
    return null;
  }

  fail(keys) {
    const now = Date.now();
    for (const key of keys) {
      const e = this.#entries.get(key);
      // Attempts older than the window are not evidence of an attack in progress.
      if (!e || e.last + this.windowMs < now) {
        this.#entries.set(key, { count: 1, last: now, blockedUntil: 0 });
        continue;
      }
      e.count += 1;
      e.last = now;
      if (e.count >= this.max) {
        e.blockedUntil = now + this.blockMs;
        e.count = 0;
      }
    }
  }

  /** A correct sign-in clears the slate, so a staff member who fumbles a PIN
   *  and then gets it right is not locked out by their own next mistake. */
  clear(keys) {
    keys.forEach((key) => this.#entries.delete(key));
  }
}

export const loginAttempts = new AttemptTracker({
  max: config.loginMaxAttempts,
  windowMs: config.loginWindowMinutes * MINUTE,
  blockMs: config.loginLockoutMinutes * MINUTE,
});

/**
 * `req.ip` is only as trustworthy as `trust proxy`, which is why that setting is
 * pinned to a hop count rather than left at `true`. With a forged header honoured,
 * every request would look like a new client and the budget above would be free.
 */
export const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

/**
 * Guards a sign-in route. `keysFor` returns the identities to charge an attempt
 * against — the caller's address, and the account being tried, so that hammering
 * one account cannot be hidden behind a pool of addresses and vice versa.
 */
export function loginGuard(keysFor) {
  return (req, res, next) => {
    const hit = loginAttempts.blocked(keysFor(req));
    if (!hit) return next();
    res.set('Retry-After', String(hit.retryAfter));
    return res.status(429).json({
      error: `Too many sign-in attempts. Try again in ${Math.ceil(hit.retryAfter / 60)} minute(s).`,
    });
  };
}
