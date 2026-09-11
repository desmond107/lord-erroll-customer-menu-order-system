import { Router } from 'express';
import { db } from '../db.js';
import {
  issueToken, setAuthCookie, clearAuthCookie, loginWithPin, loginWithPassword, requireStaff,
} from '../lib/auth.js';

export const authRouter = Router();

/** Roster shown on the PIN pad. Names only — no secrets, no email addresses. */
authRouter.get('/staff', (_req, res) => {
  const staff = db
    .prepare(
      `SELECT s.id, s.name, s.role,
              (SELECT GROUP_CONCAT(sec.code, ',') FROM staff_sections ss
                 JOIN sections sec ON sec.id = ss.section_id WHERE ss.staff_id = s.id) AS sections
       FROM staff s
       WHERE s.active = 1 AND s.pin_hash IS NOT NULL
       ORDER BY CASE s.role WHEN 'waiter' THEN 0 WHEN 'kitchen' THEN 1 WHEN 'bar' THEN 2 ELSE 3 END, s.name`
    )
    .all();
  res.json(staff.map((s) => ({ ...s, sections: s.sections ? s.sections.split(',') : [] })));
});

authRouter.post('/pin', (req, res) => {
  const { staffId, pin } = req.body ?? {};
  const staff = loginWithPin(staffId, pin);
  if (!staff) return res.status(401).json({ error: 'That PIN was not recognised.' });
  const token = issueToken(staff);
  setAuthCookie(res, token);
  res.json({ token, staff: profile(staff.id) });
});

authRouter.post('/password', (req, res) => {
  const { email, password } = req.body ?? {};
  const staff = loginWithPassword(email ?? '', password ?? '');
  if (!staff) return res.status(401).json({ error: 'Those details were not recognised.' });
  const token = issueToken(staff);
  setAuthCookie(res, token);
  res.json({ token, staff: profile(staff.id) });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireStaff(), (req, res) => res.json(profile(req.staff.id)));

function profile(id) {
  const staff = db.prepare('SELECT id, name, role FROM staff WHERE id = ?').get(id);
  staff.sections = db
    .prepare('SELECT s.id, s.code, s.name FROM staff_sections ss JOIN sections s ON s.id = ss.section_id WHERE ss.staff_id = ? ORDER BY s.sort_order')
    .all(id);
  return staff;
}
