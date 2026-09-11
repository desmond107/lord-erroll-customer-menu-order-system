import { Router } from 'express';
import { db, audit } from '../db.js';
import { requireStaff, canAccessSection } from '../lib/auth.js';
import {
  serializeOrder, serializeCheck, recomputeOrderStatus, createOrder, nowIso, serviceSettings,
} from '../lib/orders.js';
import { broadcastOrder, emitTo, rooms } from '../lib/realtime.js';

export const floorRouter = Router();
floorRouter.use(requireStaff());

const visibleSections = (staff) =>
  staff.role === 'waiter' ? staff.sections.map((s) => s.id) : db.prepare('SELECT id FROM sections').all().map((r) => r.id);

/** The waiter's home screen: every table in their sections, with what is happening on it. */
floorRouter.get('/', (req, res) => {
  const ids = visibleSections(req.staff);
  if (!ids.length) return res.json({ sections: [] });
  const placeholders = ids.map(() => '?').join(',');

  const sections = db
    .prepare(`SELECT * FROM sections WHERE id IN (${placeholders}) AND active = 1 ORDER BY sort_order`)
    .all(...ids);

  const payload = sections.map((section) => {
    const tables = db
      .prepare('SELECT * FROM dining_tables WHERE section_id = ? AND active = 1 ORDER BY sort_order, code')
      .all(section.id)
      .map((table) => {
        const check = db
          .prepare("SELECT * FROM checks WHERE table_id = ? AND status IN ('open','billed') ORDER BY id DESC LIMIT 1")
          .get(table.id);

        const stats = check
          ? db
              .prepare(
                `SELECT
                   COUNT(*) AS items,
                   SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS pending,
                   SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
                   SUM(CASE WHEN held = 1 AND status NOT IN ('void','served') THEN 1 ELSE 0 END) AS held,
                   SUM(CASE WHEN allergy_note IS NOT NULL AND status NOT IN ('void','served') THEN 1 ELSE 0 END) AS allergies
                 FROM order_items WHERE check_id = ? AND status NOT IN ('void','unavailable')`
              )
              .get(check.id)
          : null;

        const oldest = check
          ? db
              .prepare(
                `SELECT MIN(created_at) t FROM orders
                 WHERE check_id = ? AND status IN ('sent','acknowledged','preparing','ready')`
              )
              .get(check.id).t
          : null;

        const openRequests = db
          .prepare("SELECT id, type, note, created_at AS createdAt FROM service_requests WHERE table_id = ? AND status = 'open' ORDER BY id")
          .all(table.id);

        return {
          id: table.id,
          code: table.code,
          number: table.number,
          label: table.label,
          seats: table.seats,
          sectionCode: section.code,
          check: check
            ? {
                id: check.id,
                code: check.code,
                status: check.status,
                guestCount: check.guest_count,
                openedAt: check.opened_at,
                oldestOpenOrderAt: oldest,
                items: stats.items ?? 0,
                pending: stats.pending ?? 0,
                ready: stats.ready ?? 0,
                held: stats.held ?? 0,
                allergies: stats.allergies ?? 0,
                total: db
                  .prepare(
                    `SELECT COALESCE(SUM(
                       (oi.unit_price + COALESCE(
                         (SELECT SUM(m.price_delta) FROM order_item_modifiers m WHERE m.order_item_id = oi.id), 0)
                       ) * oi.qty), 0) t
                     FROM order_items oi
                     WHERE oi.check_id = ? AND oi.status NOT IN ('void','unavailable') AND oi.comped = 0`
                  )
                  .get(check.id).t,
              }
            : null,
          requests: openRequests,
        };
      });

    return { id: section.id, code: section.code, name: section.name, tables };
  });

  res.json({ sections: payload, settings: serviceSettings() });
});

/** Live order feed for the waiter's sections, newest first. */
floorRouter.get('/orders', (req, res) => {
  const ids = visibleSections(req.staff);
  if (!ids.length) return res.json([]);
  const placeholders = ids.map(() => '?').join(',');
  const statuses = req.query.status
    ? String(req.query.status).split(',')
    : ['sent', 'acknowledged', 'preparing', 'ready'];
  const statusPlaceholders = statuses.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT id FROM orders
       WHERE section_id IN (${placeholders}) AND status IN (${statusPlaceholders})
       ORDER BY created_at DESC, id DESC LIMIT 200`
    )
    .all(...ids, ...statuses);
  res.json(rows.map((r) => serializeOrder(r.id)));
});

floorRouter.get('/orders/:id', (req, res) => {
  const order = serializeOrder(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json(order);
});

/** Acknowledging stops the guest's "waiting to be seen" state. */
floorRouter.post('/orders/:id/acknowledge', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!canAccessSection(req.staff, order.section_id)) {
    return res.status(403).json({ error: 'That table is not in your section.' });
  }

  db.prepare(
    `UPDATE orders SET acknowledged_at = COALESCE(acknowledged_at, ?), acknowledged_by = COALESCE(acknowledged_by, ?),
     status = CASE WHEN status = 'sent' THEN 'acknowledged' ELSE status END WHERE id = ?`
  ).run(nowIso(), req.staff.id, id);

  audit('order', id, 'acknowledged', `staff:${req.staff.id}`);
  const payload = serializeOrder(id);
  broadcastOrder('order:updated', payload);
  res.json(payload);
});

/** "Fire mains" — releases held courses to the kitchen. */
floorRouter.post('/checks/:id/fire', (req, res) => {
  const checkId = Number(req.params.id);
  const course = req.body?.course ? Number(req.body.course) : null;
  const check = db.prepare('SELECT * FROM checks WHERE id = ?').get(checkId);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  if (!canAccessSection(req.staff, check.section_id)) {
    return res.status(403).json({ error: 'That table is not in your section.' });
  }

  const result = course
    ? db.prepare("UPDATE order_items SET held = 0, fired_at = ? WHERE check_id = ? AND held = 1 AND course = ? AND status = 'sent'").run(nowIso(), checkId, course)
    : db.prepare("UPDATE order_items SET held = 0, fired_at = ? WHERE check_id = ? AND held = 1 AND status = 'sent'").run(nowIso(), checkId);

  audit('check', checkId, 'fired', `staff:${req.staff.id}`, { course, items: result.changes });

  db.prepare('SELECT DISTINCT order_id FROM order_items WHERE check_id = ?')
    .all(checkId)
    .forEach(({ order_id }) => {
      recomputeOrderStatus(order_id);
      broadcastOrder('order:updated', serializeOrder(order_id));
    });

  res.json({ fired: result.changes, check: serializeCheck(checkId) });
});

/**
 * Moves a single line along the pipeline. The kitchen marks preparing/ready,
 * the waiter marks served, and either can flag an item unavailable.
 */
floorRouter.post('/items/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { status, reason } = req.body ?? {};
  const allowed = ['sent', 'preparing', 'ready', 'served', 'void', 'unavailable'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Unknown status.' });

  const item = db
    .prepare('SELECT oi.*, o.section_id, o.check_id AS oc FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?')
    .get(id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (!canAccessSection(req.staff, item.section_id)) {
    return res.status(403).json({ error: 'That table is not in your section.' });
  }
  if ((status === 'void' || status === 'unavailable') && !['waiter', 'manager', 'admin', 'kitchen', 'bar'].includes(req.staff.role)) {
    return res.status(403).json({ error: 'Not permitted.' });
  }

  const stamps = {
    preparing: 'started_at',
    ready: 'ready_at',
    served: 'served_at',
  };
  const column = stamps[status];
  db.prepare(
    `UPDATE order_items SET status = ?, void_reason = ?${column ? `, ${column} = ?` : ''} WHERE id = ?`
  ).run(...[status, status === 'void' || status === 'unavailable' ? reason ?? null : null, ...(column ? [nowIso()] : []), id]);

  audit('order_item', id, status, `staff:${req.staff.id}`, { reason });
  recomputeOrderStatus(item.order_id);

  const order = serializeOrder(item.order_id);
  broadcastOrder('order:updated', order);
  emitTo([rooms.table(order.tableCode)], 'check:updated', serializeCheck(item.check_id));
  res.json(order);
});

/** Serve everything that is ready on a check in one tap. */
floorRouter.post('/checks/:id/serve-ready', (req, res) => {
  const checkId = Number(req.params.id);
  const check = db.prepare('SELECT * FROM checks WHERE id = ?').get(checkId);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  if (!canAccessSection(req.staff, check.section_id)) return res.status(403).json({ error: 'Not your section.' });

  const changed = db
    .prepare("UPDATE order_items SET status = 'served', served_at = ? WHERE check_id = ? AND status = 'ready'")
    .run(nowIso(), checkId).changes;

  db.prepare('SELECT DISTINCT order_id FROM order_items WHERE check_id = ?')
    .all(checkId)
    .forEach(({ order_id }) => {
      recomputeOrderStatus(order_id);
      broadcastOrder('order:updated', serializeOrder(order_id));
    });

  audit('check', checkId, 'serve_ready', `staff:${req.staff.id}`, { items: changed });
  res.json({ served: changed, check: serializeCheck(checkId) });
});

/** A waiter ringing an order in on a guest's behalf — full table service. */
floorRouter.post('/orders', (req, res, next) => {
  try {
    const { tableCode, items, note, clientOpId, guestCount } = req.body ?? {};
    const table = db
      .prepare(
        `SELECT t.*, s.code AS section_code, s.name AS section_name
         FROM dining_tables t JOIN sections s ON s.id = t.section_id WHERE t.code = ? AND t.active = 1`
      )
      .get(tableCode);
    if (!table) return res.status(404).json({ error: 'Unknown table.' });
    if (!canAccessSection(req.staff, table.section_id)) {
      return res.status(403).json({ error: 'That table is not in your section.' });
    }

    const result = createOrder({
      table, items, note, source: 'waiter', staffId: req.staff.id, clientOpId, guestCount,
    });

    // A waiter-entered order is acknowledged by definition — they took it in person.
    db.prepare(
      "UPDATE orders SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ? WHERE id = ?"
    ).run(nowIso(), req.staff.id, result.orderId);

    const order = serializeOrder(result.orderId);
    if (!result.duplicate) {
      broadcastOrder('order:new', order);
      emitTo([rooms.table(table.code)], 'check:updated', serializeCheck(order.checkId));
    }
    res.status(result.duplicate ? 200 : 201).json({ order, duplicate: result.duplicate });
  } catch (err) {
    next(err);
  }
});

floorRouter.get('/checks/:id', (req, res) => {
  const check = serializeCheck(Number(req.params.id));
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  res.json(check);
});

floorRouter.get('/tables/:code/check', (req, res) => {
  const table = db.prepare('SELECT * FROM dining_tables WHERE code = ?').get(req.params.code);
  if (!table) return res.status(404).json({ error: 'Unknown table.' });
  const check = db
    .prepare("SELECT id FROM checks WHERE table_id = ? AND status IN ('open','billed') ORDER BY id DESC LIMIT 1")
    .get(table.id);
  res.json(check ? serializeCheck(check.id) : null);
});

floorRouter.patch('/checks/:id', (req, res) => {
  const id = Number(req.params.id);
  const check = db.prepare('SELECT * FROM checks WHERE id = ?').get(id);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  const { guestCount, guestName } = req.body ?? {};
  db.prepare('UPDATE checks SET guest_count = COALESCE(?, guest_count), guest_name = COALESCE(?, guest_name) WHERE id = ?')
    .run(guestCount ?? null, guestName ?? null, id);
  const payload = serializeCheck(id);
  emitTo([rooms.table(payload.tableCode), rooms.section(payload.sectionCode), rooms.admin()], 'check:updated', payload);
  res.json(payload);
});

// -------------------------------------------------------- service requests
floorRouter.get('/requests', (req, res) => {
  const ids = visibleSections(req.staff);
  if (!ids.length) return res.json([]);
  const placeholders = ids.map(() => '?').join(',');
  res.json(
    db
      .prepare(
        `SELECT r.id, r.type, r.note, r.status, r.created_at AS createdAt,
                t.code AS tableCode, s.code AS sectionCode
         FROM service_requests r
         JOIN dining_tables t ON t.id = r.table_id
         JOIN sections s ON s.id = r.section_id
         WHERE r.section_id IN (${placeholders}) AND r.status != 'resolved'
         ORDER BY r.created_at DESC`
      )
      .all(...ids)
  );
});

floorRouter.post('/requests/:id/:action', (req, res) => {
  const id = Number(req.params.id);
  const action = req.params.action;
  if (!['acknowledge', 'resolve'].includes(action)) return res.status(400).json({ error: 'Unknown action.' });

  const request = db
    .prepare(
      `SELECT r.*, t.code AS table_code, s.code AS section_code
       FROM service_requests r JOIN dining_tables t ON t.id = r.table_id JOIN sections s ON s.id = r.section_id
       WHERE r.id = ?`
    )
    .get(id);
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (!canAccessSection(req.staff, request.section_id)) return res.status(403).json({ error: 'Not your section.' });

  const status = action === 'resolve' ? 'resolved' : 'acknowledged';
  db.prepare('UPDATE service_requests SET status = ?, handled_by = ?, resolved_at = ? WHERE id = ?')
    .run(status, req.staff.id, status === 'resolved' ? nowIso() : null, id);

  const payload = {
    id, type: request.type, note: request.note, status,
    tableCode: request.table_code, sectionCode: request.section_code,
    handledBy: req.staff.name,
  };
  emitTo([rooms.section(request.section_code), rooms.admin(), rooms.table(request.table_code)], 'request:updated', payload);
  res.json(payload);
});
