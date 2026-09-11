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
