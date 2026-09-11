import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { config } from '../config.js';

const COOKIE = 'le_staff';
const MAX_AGE_MS = 16 * 60 * 60 * 1000; // one long shift

const sign = (data) =>
  crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

export function issueToken(staff) {
  const payload = Buffer.from(
    JSON.stringify({ id: staff.id, role: staff.role, name: staff.name, exp: Date.now() + MAX_AGE_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, mac] = token.split('.');
  const expected = sign(payload);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// A cookie cleared with different attributes than it was set with is left in
// place by the browser, so both sides read from one description.
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  // The restaurant LAN is plain HTTP, where `secure` would drop the cookie
  // entirely and no one could sign in. Behind TLS it is the opposite: without
  // it the session travels in clear text on any downgrade. So it follows the
  // deployment rather than being fixed either way.
  secure: config.cookieSecure,
});

export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export const clearAuthCookie = (res) => res.clearCookie(COOKIE, cookieOptions());

function readToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[COOKIE] ?? null;
}

/** Populates req.staff when a valid session is present. Never rejects. */
export function attachStaff(req, _res, next) {
  const claims = verifyToken(readToken(req));
  if (claims) {
    const row = db.prepare('SELECT id, name, role, active FROM staff WHERE id = ?').get(claims.id);
    if (row?.active) {
      req.staff = row;
      req.staff.sections = db
        .prepare(
          'SELECT s.id, s.code, s.name FROM staff_sections ss JOIN sections s ON s.id = ss.section_id WHERE ss.staff_id = ?'
        )
        .all(row.id);
    }
  }
  next();
}

/** Route guard. `requireStaff('manager','admin')` restricts by role. */
export function requireStaff(...roles) {
  return (req, res, next) => {
    if (!req.staff) return res.status(401).json({ error: 'Sign in to continue.' });
    if (roles.length && !roles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'Your role does not have access to this.' });
    }
    next();
  };
}

/** Managers and admins see and act on every section; waiters only on their own. */
export function canAccessSection(staff, sectionId) {
  if (!staff) return false;
  if (['manager', 'admin', 'kitchen', 'bar'].includes(staff.role)) return true;
  return staff.sections.some((s) => s.id === sectionId);
}

export function loginWithPin(staffId, pin) {
  const row = db.prepare('SELECT * FROM staff WHERE id = ? AND active = 1').get(staffId);
  if (!row?.pin_hash || !bcrypt.compareSync(String(pin), row.pin_hash)) return null;
  return row;
}

export function loginWithPassword(email, password) {
  const row = db.prepare('SELECT * FROM staff WHERE email = ? AND active = 1').get(String(email).toLowerCase());
  if (!row?.password_hash || !bcrypt.compareSync(String(password), row.password_hash)) return null;
  return row;
}

export const hashPin = (pin) => bcrypt.hashSync(String(pin), 10);
export const hashPassword = (pw) => bcrypt.hashSync(String(pw), 10);

/**
 * Guests authenticate only by the opaque token printed in their table's QR code.
 * It grants access to that one table and nothing else.
 */
export function resolveGuestTable(req) {
  const token = req.get('x-table-token') || req.query.t || req.body?.tableToken;
  if (!token) return null;
  return db
    .prepare(
      `SELECT t.*, s.code AS section_code, s.name AS section_name
       FROM dining_tables t JOIN sections s ON s.id = t.section_id
       WHERE t.qr_token = ? AND t.active = 1`
    )
    .get(String(token));
}

export function requireGuestTable(req, res, next) {
  const table = resolveGuestTable(req);
  if (!table) return res.status(401).json({ error: 'Please rescan the card on your table.' });
  req.table = table;
  next();
}
