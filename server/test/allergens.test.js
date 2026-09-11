import assert from 'node:assert/strict';
import http from 'node:http';
import { test, after } from 'node:test';
import express from 'express';
import { db, seedFixture } from './setup.js';

const { attachStaff, issueToken } = await import('../src/lib/auth.js');
const { allergensRouter } = await import('../src/routes/allergens.js');

// The router is mounted on a bare app so the tests exercise the real guards and
// the real handlers, rather than a reimplementation of them.
const app = express();
app.use(express.json());
app.use(attachStaff);
app.use('/api/allergens', allergensRouter);
const server = http.createServer(app).listen(0);
after(() => server.close());

const url = (path) => `http://127.0.0.1:${server.address().port}${path}`;

const call = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(url(path), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const staffToken = (role, name = 'Test') => {
  const id = db.prepare('INSERT INTO staff (name, role, pin_hash) VALUES (?, ?, ?)').run(name, role, 'x')
    .lastInsertRowid;
  return issueToken({ id, role, name });
};

test('a chef can sign off an allergen list, and it records who and when', async () => {
  const f = seedFixture();
  const token = staffToken('kitchen', 'Chef Achieng');

  const before = await call('/api/allergens', { token });
  assert.equal(before.status, 200);
  assert.ok(before.body.outstanding > 0, 'items start unsigned');

  const signed = await call(`/api/allergens/items/${f.starter}`, {
    token,
    method: 'POST',
    body: { allergens: ['fish', 'sesame'] },
  });
  assert.equal(signed.status, 200);
  assert.equal(signed.body.signedBy, 'Chef Achieng');

  const row = db.prepare('SELECT allergens, allergen_review, allergen_signed_by FROM menu_items WHERE id = ?').get(f.starter);
  assert.equal(row.allergen_review, 0);
  assert.equal(row.allergen_signed_by, 'Chef Achieng');
  assert.deepEqual(JSON.parse(row.allergens), ['fish', 'sesame']);
});

test('the floor cannot sign off allergens, and neither can a stranger', async () => {
  seedFixture();
  const waiter = staffToken('waiter', 'Test Waiter Two');

  assert.equal((await call('/api/allergens', { token: waiter })).status, 403);
  assert.equal((await call('/api/allergens')).status, 401);
});

test('a whole category can be signed off in one action', async () => {
  const f = seedFixture();
  const token = staffToken('manager', 'Duty Manager Two');

  const categoryId = db.prepare('SELECT category_id c FROM menu_items WHERE id = ?').get(f.drink).c;
  const res = await call('/api/allergens/bulk', { token, method: 'POST', body: { categoryId } });

  assert.equal(res.status, 200);
  assert.ok(res.body.signedOff >= 1);
  assert.equal(db.prepare('SELECT allergen_review r FROM menu_items WHERE id = ?').get(f.drink).r, 0);
});

test('a sign-off can be withdrawn when a recipe changes', async () => {
  const f = seedFixture();
  const token = staffToken('kitchen', 'Chef Otieno');

  await call(`/api/allergens/items/${f.main}`, { token, method: 'POST', body: { allergens: ['dairy'] } });
  assert.equal(db.prepare('SELECT allergen_review r FROM menu_items WHERE id = ?').get(f.main).r, 0);

  const res = await call(`/api/allergens/items/${f.main}/reopen`, { token, method: 'POST' });
  assert.equal(res.status, 200);

  const row = db.prepare('SELECT allergen_review, allergen_signed_by FROM menu_items WHERE id = ?').get(f.main);
  assert.equal(row.allergen_review, 1, 'back on the list to be checked');
  assert.equal(row.allergen_signed_by, null, 'the old signature does not linger');
});

test('a bad allergen payload is refused rather than stored', async () => {
  const f = seedFixture();
  const token = staffToken('kitchen', 'Chef Wanjiru');

  const res = await call(`/api/allergens/items/${f.starter}`, {
    token,
    method: 'POST',
    body: { allergens: 'shellfish' },
  });
  assert.equal(res.status, 400);
  assert.equal(db.prepare('SELECT allergen_review r FROM menu_items WHERE id = ?').get(f.starter).r, 1);
});
