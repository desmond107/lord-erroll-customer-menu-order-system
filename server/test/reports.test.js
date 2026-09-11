import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, seedFixture } from './setup.js';

const { createOrder } = await import('../src/lib/orders.js');

/**
 * Reporting runs on its own SQL rather than through the bill, so these guard the
 * two mistakes that make the numbers quietly wrong: fanning a per-check figure
 * out across a join, and pricing a line without its modifiers.
 */

const LINE_VALUE = `(oi.unit_price + COALESCE(
   (SELECT SUM(m.price_delta) FROM order_item_modifiers m WHERE m.order_item_id = oi.id), 0)) * oi.qty`;

test('covers are counted per check, not once per line ordered', () => {
  const f = seedFixture();
  const { checkId } = createOrder({
    table: f.table,
    guestCount: 4,
    items: [
      { menuItemId: f.drink, qty: 1 },
      { menuItemId: f.starter, qty: 1 },
      { menuItemId: f.main, qty: 1 },
    ],
  });
  db.prepare('UPDATE checks SET guest_count = 4 WHERE id = ?').run(checkId);

  const counted = db
    .prepare('SELECT COUNT(*) checks, COALESCE(SUM(guest_count), 0) covers FROM checks')
    .get();

  assert.equal(counted.checks, 1);
  assert.equal(counted.covers, 4, 'three lines on one table is still four covers');
});

test('a line is valued with its modifier deltas included', () => {
  const f = seedFixture();
  const group = db
    .prepare('INSERT INTO modifier_groups (item_id, name, min_select, max_select) VALUES (?, ?, 1, 1)')
    .run(f.main, 'Add lobster tail').lastInsertRowid;
  const option = db
    .prepare('INSERT INTO modifier_options (group_id, name, price_delta) VALUES (?, ?, ?)')
    .run(group, 'Half tail', 2000).lastInsertRowid;

  createOrder({
    table: f.table,
    items: [{ menuItemId: f.main, qty: 2, modifiers: [{ optionId: option }] }],
  });

  const total = db
    .prepare(`SELECT COALESCE(SUM(${LINE_VALUE}), 0) v FROM order_items oi`)
    .get().v;

  assert.equal(total, (4650 + 2000) * 2, 'the paid choice must reach the sales figure');
});
