import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

// The server is launched from the server workspace, so its working directory is
// not the repository root. Point dotenv at the root .env explicitly, or every
// setting in it is silently ignored in favour of the defaults below.
dotenv.config({ path: path.join(ROOT, '.env') });

const num = (v, fallback) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
const bool = (v, fallback) => (v === undefined ? fallback : String(v).toLowerCase() === 'true');
const list = (v) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

const DEFAULT_SECRET = 'change-me-before-go-live';

const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

/**
 * Where this copy of the server is reachable from, which decides how much it has
 * to defend itself.
 *
 * `lan`    — the original on-premise install. Plain HTTP on the restaurant's own
 *            network, no proxy in front, nothing routable from outside.
 * `public` — reachable from the internet, behind TLS and a reverse proxy. Cookies
 *            must be secure-only, origins must be pinned, and a default session
 *            secret is fatal rather than merely alarming.
 *
 * It is set explicitly rather than guessed, because guessing wrong in the `lan`
 * direction silently drops every staff cookie and no one can sign in.
 */
const exposure = (process.env.EXPOSURE || 'lan').toLowerCase() === 'public' ? 'public' : 'lan';
const isPublic = exposure === 'public';

// Express only honours X-Forwarded-* headers from proxies it trusts. Trusting
// everything lets any client forge its own address, which would hand the login
// rate limiter a fresh quota on every request. One hop is right for a single
// reverse proxy; raise it only if you actually run more.
const trustProxy = num(process.env.TRUST_PROXY, isPublic ? 1 : 0);

export const config = {
  port: num(process.env.PORT, 4000),
  host: process.env.HOST || '0.0.0.0',
  databasePath: path.resolve(ROOT, process.env.DATABASE_PATH || './data/lord-erroll.db'),
  sessionSecret: process.env.SESSION_SECRET || DEFAULT_SECRET,
  publicBaseUrl,
  backupDir: path.resolve(ROOT, process.env.BACKUP_DIR || './data/backups'),
  backupRetentionDays: num(process.env.BACKUP_RETENTION_DAYS, 30),
  serviceChargePercent: num(process.env.SERVICE_CHARGE_PERCENT, 10),
  vatPercent: num(process.env.VAT_PERCENT, 16),
  pricesIncludeVat: bool(process.env.PRICES_INCLUDE_VAT, true),
  currency: process.env.CURRENCY || 'KES',
  usdRate: num(process.env.USD_RATE, 129),
  webDist: path.resolve(ROOT, 'web', 'dist'),
  isProd: process.env.NODE_ENV === 'production',

  exposure,
  isPublic,
  trustProxy,
  // The guest app and every staff screen are served by this same process, so
  // browsers call it same-origin and send no Origin header worth allowing.
  // These are for anything genuinely cross-origin, such as a separately hosted
  // copy of the front end.
  allowedOrigins: [...new Set([...(publicBaseUrl ? [publicBaseUrl] : []), ...list(process.env.ALLOWED_ORIGINS)])],
  // Dropped by the browser over plain HTTP, so it can never be on by default on
  // the LAN. Overridable for the odd setup that terminates TLS elsewhere.
  cookieSecure: bool(process.env.COOKIE_SECURE, isPublic),
  forceHttps: bool(process.env.FORCE_HTTPS, isPublic),
  hstsSeconds: num(process.env.HSTS_SECONDS, isPublic ? 15552000 : 0),

  // Staff sign in with a four-digit PIN, which is 9000 guesses. On the LAN that
  // is bounded by who is standing in the building; from the internet it is a
  // few minutes of scripting, so the attempt budget is what makes it survivable.
  loginMaxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 8),
  loginWindowMinutes: num(process.env.LOGIN_WINDOW_MINUTES, 10),
  loginLockoutMinutes: num(process.env.LOGIN_LOCKOUT_MINUTES, 15),
};

/**
 * Refuses to start an internet-facing server that anyone could forge a manager
 * session against. On the LAN the same mistake is only shouted about at startup,
 * because failing closed there stops service over a risk the front door already
 * contains.
 */
export function assertDeployable() {
  const problems = [];
  if (!config.isPublic) return problems;

  if (config.sessionSecret === DEFAULT_SECRET || config.sessionSecret.length < 32) {
    problems.push(
      'SESSION_SECRET must be set to at least 32 random characters. Anyone who knows it can mint a manager session.'
    );
  }
  if (!config.publicBaseUrl.startsWith('https://')) {
    problems.push(
      `PUBLIC_BASE_URL must be an https:// address when EXPOSURE=public (currently "${config.publicBaseUrl || 'unset'}").`
    );
  }
  return problems;
}

export const usingDefaultSecret = () => config.sessionSecret === DEFAULT_SECRET;

export const SECTION_SORT = ['BAR', 'WW', 'EW', 'CLM'];
