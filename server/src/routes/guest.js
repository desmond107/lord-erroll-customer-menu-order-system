import { Router } from 'express';
import { db, audit } from '../db.js';
import { requireGuestTable } from '../lib/auth.js';
import { buildMenu } from './menu.js';
import {
  createOrder, serializeOrder, serializeCheck, openCheckForTable, computeCheckTotals, serviceSettings,
} from '../lib/orders.js';
import { broadcastOrder, emitTo, rooms } from '../lib/realtime.js';

export const guestRouter = Router();

/**
 * First call a guest device makes after scanning the table card.
 * The QR token is the only credential, and it only ever unlocks this one table.
 */
guestRouter.get('/session', requireGuestTable, (req, res) => {
  const table = req.table;
  const open = db
    .prepare("SELECT id FROM checks WHERE table_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .get(table.id);

  res.json({
    table: {
      code: table.code,
      number: table.number,
      label: table.label,
      seats: table.seats,
      sectionCode: table.section_code,
      sectionName: table.section_name,
    },
    check: open ? serializeCheck(open.id) : null,
    menu: buildMenu({ audience: 'guest' }),
    settings: publicSettings(),
  });
});

guestRouter.get('/menu', requireGuestTable, (_req, res) => {
  res.json({ categories: buildMenu({ audience: 'guest' }) });
});

/** Live view of this table's own check. Polled as a fallback if the socket drops. */
guestRouter.get('/check', requireGuestTable, (req, res) => {
  const open = db
    .prepare("SELECT id FROM checks WHERE table_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .get(req.table.id);
  res.json(open ? serializeCheck(open.id) : null);
});

guestRouter.post('/orders', requireGuestTable, (req, res, next) => {
  try {
    const { items, note, clientOpId, guestCount } = req.body ?? {};
    const result = createOrder({
      table: req.table,
      items,
      note,
      source: 'guest',
      clientOpId,
      guestCount,
    });
    const order = serializeOrder(result.orderId);

    if (!result.duplicate) {
      broadcastOrder('order:new', order);
      emitTo([rooms.table(req.table.code)], 'check:updated', serializeCheck(order.checkId));
    }
    res.status(result.duplicate ? 200 : 201).json({ order, duplicate: result.duplicate });
  } catch (err) {
    next(err);
  }
});

/** One tap: "Request Waiter", "The bill, please", water, or anything else. */
guestRouter.post('/requests', requireGuestTable, (req, res) => {
  const { type = 'waiter', note = null, clientOpId = null } = req.body ?? {};
  if (!['waiter', 'bill', 'water', 'assistance'].includes(type)) {
    return res.status(400).json({ error: 'Unknown request type.' });
  }

  if (clientOpId) {
    const dupe = db.prepare('SELECT id FROM service_requests WHERE client_op_id = ?').get(clientOpId);
    if (dupe) return res.json({ id: dupe.id, duplicate: true });
  }

  const check = db
    .prepare("SELECT id FROM checks WHERE table_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .get(req.table.id);

  const info = db
    .prepare(
      'INSERT INTO service_requests (table_id, section_id, check_id, type, note, client_op_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(req.table.id, req.table.section_id, check?.id ?? null, type, note?.trim() || null, clientOpId);

  const payload = {
    id: info.lastInsertRowid,
    type,
    note: note?.trim() || null,
    tableCode: req.table.code,
    sectionCode: req.table.section_code,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  audit('service_request', payload.id, 'created', `guest:${req.table.code}`, { type });
  emitTo(
    [rooms.section(req.table.section_code), rooms.admin(), rooms.table(req.table.code)],
    'request:new',
    payload
  );
  res.status(201).json(payload);
});

guestRouter.get('/requests', requireGuestTable, (req, res) => {
  res.json(
    db
      .prepare(
        "SELECT id, type, note, status, created_at AS createdAt FROM service_requests WHERE table_id = ? AND status != 'resolved' ORDER BY id DESC"
      )
      .all(req.table.id)
  );
});

/** Guests can ask for the bill and choose how it is split; a waiter settles it. */
guestRouter.post('/bill', requireGuestTable, (req, res) => {
  const { splitMode = 'single', splitWays = 1 } = req.body ?? {};
  const check = openCheckForTable(req.table);

  db.prepare('UPDATE checks SET split_mode = ?, split_ways = ? WHERE id = ?').run(
    ['single', 'even', 'item'].includes(splitMode) ? splitMode : 'single',
    Math.max(1, Math.min(24, Number(splitWays) || 1)),
    check.id
  );

  db.prepare(
    'INSERT INTO service_requests (table_id, section_id, check_id, type, note) VALUES (?, ?, ?, ?, ?)'
  ).run(req.table.id, req.table.section_id, check.id, 'bill', splitMode === 'even' ? `Split evenly ${splitWays} ways` : null);

  const payload = serializeCheck(check.id);
  emitTo(
    [rooms.section(req.table.section_code), rooms.admin(), rooms.table(req.table.code)],
    'request:new',
    { type: 'bill', tableCode: req.table.code, sectionCode: req.table.section_code, status: 'open', createdAt: new Date().toISOString() }
  );
  emitTo([rooms.table(req.table.code)], 'check:updated', payload);
  res.json(payload);
});

guestRouter.get('/totals', requireGuestTable, (req, res) => {
  const check = db
    .prepare("SELECT id FROM checks WHERE table_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .get(req.table.id);
  res.json(check ? computeCheckTotals(check.id) : null);
});

function publicSettings() {
  const s = serviceSettings();
  return { ageAmberMinutes: s.ageAmberMinutes, ageRedMinutes: s.ageRedMinutes };
}
