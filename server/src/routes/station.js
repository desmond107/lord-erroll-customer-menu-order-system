import { Router } from 'express';
import { db, audit } from '../db.js';
import { requireStaff } from '../lib/auth.js';
import { serializeOrder, serializeCheck, recomputeOrderStatus, nowIso } from '../lib/orders.js';
import { broadcastOrder, emitTo, rooms } from '../lib/realtime.js';

export const stationRouter = Router();
stationRouter.use(requireStaff('kitchen', 'bar', 'manager', 'admin'));

/**
 * The kitchen and bar queues. Drinks and food are deliberately separate screens:
 * a round of cocktails should not sit behind a 500g porterhouse.
 * Held courses stay off the board until the waiter fires them.
 */
stationRouter.get('/:station/queue', (req, res) => {
  const station = req.params.station;
  if (!['kitchen', 'bar'].includes(station)) return res.status(400).json({ error: 'Unknown station.' });

  const rows = db
    .prepare(
      `SELECT oi.*, o.created_at AS order_created_at, o.round, o.source, o.note AS order_note,
              t.code AS table_code, t.label AS table_label, s.code AS section_code, s.name AS section_name,
              c.id AS check_id_ref, c.guest_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN checks c ON c.id = oi.check_id
       JOIN dining_tables t ON t.id = o.table_id
       JOIN sections s ON s.id = o.section_id
       WHERE oi.station = ? AND oi.held = 0 AND oi.status IN ('sent','preparing','ready')
       ORDER BY oi.course, COALESCE(oi.fired_at, oi.created_at), oi.id`
    )
    .all(station);

  // The board is grouped by table so a station works a whole table at once.
  const tickets = new Map();
  for (const row of rows) {
    const key = `${row.check_id}:${row.order_id}`;
    if (!tickets.has(key)) {
      tickets.set(key, {
        key,
        orderId: row.order_id,
        checkId: row.check_id,
        tableCode: row.table_code,
        tableLabel: row.table_label,
        sectionCode: row.section_code,
        sectionName: row.section_name,
        round: row.round,
        source: row.source,
        guestCount: row.guest_count,
        orderNote: row.order_note,
        firedAt: row.fired_at ?? row.order_created_at,
        createdAt: row.order_created_at,
        items: [],
      });
    }
    const modifiers = db
      .prepare('SELECT group_name AS groupName, option_name AS optionName, cover FROM order_item_modifiers WHERE order_item_id = ? ORDER BY id')
      .all(row.id);
    tickets.get(key).items.push({
      id: row.id,
      name: row.name,
      variantLabel: row.variant_label,
      qty: row.qty,
      course: row.course,
      note: row.note,
      allergyNote: row.allergy_note,
      status: row.status,
      firedAt: row.fired_at,
      startedAt: row.started_at,
      modifiers,
    });
  }

  const list = [...tickets.values()].map((t) => ({
    ...t,
    hasAllergyNote: t.items.some((i) => i.allergyNote),
    allReady: t.items.every((i) => i.status === 'ready'),
  }));

  res.json({ station, tickets: list, serverTime: new Date().toISOString() });
});

/** Bump a whole ticket: everything on it moves to preparing, or to ready. */
stationRouter.post('/tickets/:orderId/:action', (req, res) => {
  const orderId = Number(req.params.orderId);
  const action = req.params.action;
  const station = req.body?.station;
  if (!['start', 'ready'].includes(action)) return res.status(400).json({ error: 'Unknown action.' });
  if (!['kitchen', 'bar'].includes(station)) return res.status(400).json({ error: 'Unknown station.' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Ticket not found.' });

  const target = action === 'start' ? 'preparing' : 'ready';
  const column = action === 'start' ? 'started_at' : 'ready_at';
  const from = action === 'start' ? "('sent')" : "('sent','preparing')";

  const changed = db
    .prepare(
      `UPDATE order_items SET status = ?, ${column} = ?
       WHERE order_id = ? AND station = ? AND held = 0 AND status IN ${from}`
    )
    .run(target, nowIso(), orderId, station).changes;

  audit('order', orderId, `station_${action}`, `staff:${req.staff.id}`, { station, items: changed });
  recomputeOrderStatus(orderId);

  const payload = serializeOrder(orderId);
  broadcastOrder('order:updated', payload);
  emitTo([rooms.table(payload.tableCode)], 'check:updated', serializeCheck(payload.checkId));
  res.json({ changed, order: payload });
});

/** 86 an item from the station screen — it leaves every guest menu at once. */
stationRouter.post('/menu/:itemId/availability', (req, res) => {
  const itemId = Number(req.params.itemId);
  const { available, reason } = req.body ?? {};
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(itemId);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  db.prepare("UPDATE menu_items SET available = ?, unavailable_reason = ?, updated_at = datetime('now') WHERE id = ?")
    .run(available ? 1 : 0, available ? null : reason ?? null, itemId);

  audit('menu_item', itemId, available ? 'available' : '86', `staff:${req.staff.id}`, { reason });
  emitTo(
    [...db.prepare('SELECT code FROM sections').all().map((s) => rooms.section(s.code)),
     rooms.station('kitchen'), rooms.station('bar'), rooms.admin()],
    'menu:updated',
    { itemId, available: !!available, reason: reason ?? null, name: item.name }
  );
  // Every guest device is listening on its own table room.
  db.prepare('SELECT code FROM dining_tables WHERE active = 1')
    .all()
    .forEach((t) => emitTo([rooms.table(t.code)], 'menu:updated', { itemId, available: !!available, name: item.name }));

  res.json({ id: itemId, available: !!available });
});

/** What the station currently has 86'd, so it can be put back on. */
stationRouter.get('/:station/eighty-sixed', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT id, name, unavailable_reason AS reason FROM menu_items
         WHERE station = ? AND available = 0 AND active = 1 ORDER BY name`
      )
      .all(req.params.station)
  );
});
