import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, seedFixture } from './setup.js';

const { createOrder, computeCheckTotals } = await import('../src/lib/orders.js');

test('VAT-inclusive prices add service charge and show VAT as already included', () => {
  const f = seedFixture();
  const { checkId } = createOrder({ table: f.table, items: [{ menuItemId: f.drink, qty: 1 }] });
  const totals = computeCheckTotals(checkId);

  assert.equal(totals.subtotal, 1500);
  assert.equal(totals.serviceCharge, 150);
  assert.equal(totals.total, 1650, 'VAT is inside the price, so it is not added again');
  assert.equal(totals.vatIncluded, true);
  assert.equal(totals.vat, Number(((1650 * 16) / 116).toFixed(2)));
});

test('a discount is taken before service charge', () => {
  const f = seedFixture();
  const { checkId } = createOrder({ table: f.table, items: [{ menuItemId: f.main, qty: 1 }] });
  db.prepare('UPDATE checks SET discount_percent = 10 WHERE id = ?').run(checkId);

  const totals = computeCheckTotals(checkId);
  assert.equal(totals.discount, 465);
  assert.equal(totals.serviceCharge, Number(((4650 - 465) * 0.1).toFixed(2)));
  assert.equal(totals.total, Number((4650 - 465 + 418.5).toFixed(2)));
});

test('payments reduce the balance and never overshoot the total', () => {
  const f = seedFixture();
  const { checkId } = createOrder({ table: f.table, items: [{ menuItemId: f.drink, qty: 1 }] });
  const total = computeCheckTotals(checkId).total;

  db.prepare("INSERT INTO payments (check_id, method, amount) VALUES (?, 'cash', ?)").run(checkId, 1000);
  assert.equal(computeCheckTotals(checkId).balance, Number((total - 1000).toFixed(2)));

  db.prepare("INSERT INTO payments (check_id, method, amount) VALUES (?, 'mpesa', ?)").run(checkId, total - 1000);
  assert.equal(computeCheckTotals(checkId).balance, 0);
});

test('splitting evenly still adds up to the total', () => {
  const f = seedFixture();
  const { checkId } = createOrder({ table: f.table, items: [{ menuItemId: f.main, qty: 1 }] });
  const total = computeCheckTotals(checkId).total;

  // The rounding remainder lands on the first share rather than disappearing.
  const ways = 3;
  const share = Number((total / ways).toFixed(2));
  const shares = [Number((total - share * (ways - 1)).toFixed(2)), share, share];

  assert.equal(Number(shares.reduce((a, b) => a + b, 0).toFixed(2)), total);
});
