import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, seedFixture } from './setup.js';

const { createOrder, serializeOrder, computeCheckTotals, recomputeOrderStatus } = await import(
  '../src/lib/orders.js'
);

test('a drink fires immediately and routes to the bar', () => {
  const f = seedFixture();
  const { orderId } = createOrder({ table: f.table, items: [{ menuItemId: f.drink, qty: 2 }] });
  const [line] = serializeOrder(orderId).items;

  assert.equal(line.station, 'bar');
  assert.equal(line.course, 0);
  assert.equal(line.held, false, 'drinks never wait for a course to be fired');
  assert.ok(line.firedAt, 'an unheld line is stamped as fired straight away');
});

test('a main is held when a starter arrives in the same round', () => {
  const f = seedFixture();
  const { orderId } = createOrder({
    table: f.table,
    items: [{ menuItemId: f.starter, qty: 1 }, { menuItemId: f.main, qty: 1 }],
  });
  const items = serializeOrder(orderId).items;

  assert.equal(items.find((i) => i.name === 'Tuna Tartare').held, false);
  assert.equal(items.find((i) => i.name === 'Dry Aged Ribeye').held, true);
});

test('a main ordered on its own fires immediately', () => {
  const f = seedFixture();
  const { orderId } = createOrder({ table: f.table, items: [{ menuItemId: f.main, qty: 1 }] });

  assert.equal(serializeOrder(orderId).items[0].held, false);
});

test('a main is held while an earlier course is still open on the check', () => {
  const f = seedFixture();
  createOrder({ table: f.table, items: [{ menuItemId: f.starter, qty: 1 }] });
  const second = createOrder({ table: f.table, items: [{ menuItemId: f.main, qty: 1 }] });

  assert.equal(serializeOrder(second.orderId).items[0].held, true);
});

test('a guest cannot order an item that has no confirmed price', () => {
  const f = seedFixture();
  assert.throws(
    () => createOrder({ table: f.table, items: [{ menuItemId: f.unpriced, qty: 1 }] }),
    /no confirmed price/
  );
});

test('a waiter may ring an unpriced item, but only with an explicit price', () => {
  const f = seedFixture();
  assert.throws(
    () => createOrder({ table: f.table, source: 'waiter', staffId: f.waiterId, items: [{ menuItemId: f.unpriced, qty: 1 }] }),
    /no confirmed price/
  );

  const { orderId } = createOrder({
    table: f.table,
    source: 'waiter',
    staffId: f.waiterId,
    items: [{ menuItemId: f.unpriced, qty: 1, unitPrice: 5200 }],
  });
  assert.equal(serializeOrder(orderId).items[0].unitPrice, 5200);

  const logged = db
    .prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'manual_price'").get().c;
  assert.equal(logged, 1, 'a manual price is always written to the audit log');
});

test('the client never sets the price', () => {
  const f = seedFixture();
  const { orderId } = createOrder({
    table: f.table,
    items: [{ menuItemId: f.drink, qty: 1, unitPrice: 1 }],
  });

  assert.equal(serializeOrder(orderId).items[0].unitPrice, 1500, 'the menu price wins');
});

test('replaying an order with the same client op id does not ring it twice', () => {
  const f = seedFixture();
  const first = createOrder({
    table: f.table,
    clientOpId: 'op-1',
    items: [{ menuItemId: f.drink, qty: 1 }],
  });
  const replay = createOrder({
    table: f.table,
    clientOpId: 'op-1',
    items: [{ menuItemId: f.drink, qty: 1 }],
  });

  assert.equal(replay.duplicate, true);
  assert.equal(replay.orderId, first.orderId);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM orders').get().c, 1);
});

test('an 86d item cannot be ordered', () => {
  const f = seedFixture();
  db.prepare('UPDATE menu_items SET available = 0 WHERE id = ?').run(f.drink);

  assert.throws(
    () => createOrder({ table: f.table, items: [{ menuItemId: f.drink, qty: 1 }] }),
    /just come off the menu/
  );
});

test('rounds accumulate on one open check rather than opening new ones', () => {
  const f = seedFixture();
  const a = createOrder({ table: f.table, items: [{ menuItemId: f.drink, qty: 1 }] });
  const b = createOrder({ table: f.table, items: [{ menuItemId: f.starter, qty: 1 }] });

  assert.equal(a.checkId, b.checkId);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM checks').get().c, 1);
  assert.equal(serializeOrder(b.orderId).round, 2);
});

test('order status never falls back once part of a round reaches the pass', () => {
  const f = seedFixture();
  const { orderId } = createOrder({
    table: f.table,
    items: [{ menuItemId: f.drink, qty: 1 }, { menuItemId: f.starter, qty: 1 }],
  });

  db.prepare("UPDATE orders SET acknowledged_at = datetime('now'), status = 'acknowledged' WHERE id = ?").run(orderId);

  // The kitchen finishes its half while the bar has not started.
  db.prepare("UPDATE order_items SET status = 'ready' WHERE order_id = ? AND station = 'kitchen'").run(orderId);
  assert.equal(recomputeOrderStatus(orderId), 'preparing');

  db.prepare("UPDATE order_items SET status = 'ready' WHERE order_id = ?").run(orderId);
  assert.equal(recomputeOrderStatus(orderId), 'ready');

  db.prepare("UPDATE order_items SET status = 'served' WHERE order_id = ?").run(orderId);
  assert.equal(recomputeOrderStatus(orderId), 'served');
});

test('voided and comped lines leave the bill', () => {
  const f = seedFixture();
  const { orderId, checkId } = createOrder({
    table: f.table,
    items: [{ menuItemId: f.drink, qty: 2 }, { menuItemId: f.starter, qty: 1 }],
  });
  assert.equal(computeCheckTotals(checkId).subtotal, 1500 * 2 + 1800);

  const items = serializeOrder(orderId).items;
  db.prepare("UPDATE order_items SET status = 'void' WHERE id = ?")
    .run(items.find((i) => i.name === 'Highlander').id);
  assert.equal(computeCheckTotals(checkId).subtotal, 1800);

  db.prepare('UPDATE order_items SET comped = 1 WHERE id = ?')
    .run(items.find((i) => i.name === 'Tuna Tartare').id);
  assert.equal(computeCheckTotals(checkId).subtotal, 0);
});
