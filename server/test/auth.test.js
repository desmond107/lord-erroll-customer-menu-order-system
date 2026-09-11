import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, seedFixture } from './setup.js';

const { issueToken, verifyToken, canAccessSection, hashPin, loginWithPin } = await import(
  '../src/lib/auth.js'
);

test('a tampered session token is rejected', () => {
  const token = issueToken({ id: 7, role: 'waiter', name: 'Test' });
  assert.equal(verifyToken(token).id, 7);

  const [payload, mac] = token.split('.');
  assert.equal(verifyToken(`${payload}.${'a'.repeat(mac.length)}`), null);

  const forged = Buffer.from(JSON.stringify({ id: 1, role: 'admin', exp: Date.now() + 1000 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${mac}`), null, 'a swapped payload invalidates the signature');
});

test('an expired token is rejected', () => {
  const payload = Buffer.from(JSON.stringify({ id: 1, role: 'admin', exp: Date.now() - 1 })).toString('base64url');
  const token = issueToken({ id: 1, role: 'admin', name: 'x' });
  assert.equal(verifyToken(`${payload}.${token.split('.')[1]}`), null);
});

test('a waiter only reaches their own sections', () => {
  const f = seedFixture();
  const other = db.prepare("INSERT INTO sections (code, name) VALUES ('EW', 'East Wing')").run().lastInsertRowid;

  const waiter = { role: 'waiter', sections: [{ id: f.sectionId }] };
  assert.equal(canAccessSection(waiter, f.sectionId), true);
  assert.equal(canAccessSection(waiter, other), false);

  // Managers, and both passes, work the whole floor.
  for (const role of ['manager', 'admin', 'kitchen', 'bar']) {
    assert.equal(canAccessSection({ role, sections: [] }, other), true);
  }
  assert.equal(canAccessSection(null, f.sectionId), false);
});

test('a PIN is verified against its hash, not stored in the clear', () => {
  const id = db
    .prepare("INSERT INTO staff (name, role, pin_hash) VALUES ('Test Waiter', 'waiter', ?)")
    .run(hashPin('4821')).lastInsertRowid;

  const stored = db.prepare('SELECT pin_hash FROM staff WHERE id = ?').get(id).pin_hash;
  assert.ok(!stored.includes('4821'));
  assert.ok(loginWithPin(id, '4821'));
  assert.equal(loginWithPin(id, '4822'), null);
});

test('repeated wrong PINs lock the account out, and a correct one clears it', async () => {
  const { loginAttempts } = await import('../src/lib/rate-limit.js');
  const { config } = await import('../src/config.js');
  const keys = [`ip:203.0.113.9`, 'pin:42'];

  for (let i = 0; i < config.loginMaxAttempts - 1; i += 1) loginAttempts.fail(keys);
  assert.equal(loginAttempts.blocked(keys), null, 'still open one attempt short of the limit');

  loginAttempts.fail(keys);
  const hit = loginAttempts.blocked(keys);
  assert.ok(hit, 'the limit locks the attempt out');
  assert.ok(hit.retryAfter > 0);

  loginAttempts.clear(keys);
  assert.equal(loginAttempts.blocked(keys), null, 'a successful sign-in wipes the count');
});

test('a lockout on one identity does not lock a different staff member out', async () => {
  const { loginAttempts } = await import('../src/lib/rate-limit.js');
  const { config } = await import('../src/config.js');

  const attacked = ['pin:101'];
  for (let i = 0; i < config.loginMaxAttempts; i += 1) loginAttempts.fail(attacked);
  assert.ok(loginAttempts.blocked(attacked));
  assert.equal(loginAttempts.blocked(['pin:102']), null);
});
