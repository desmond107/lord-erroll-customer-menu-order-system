import { Router } from 'express';
import { db } from '../db.js';
import { requireStaff } from '../lib/auth.js';

export const reportsRouter = Router();
reportsRouter.use(requireStaff('manager', 'admin'));

/** Defaults to today. Dates are plain YYYY-MM-DD in the restaurant's own timezone. */
/**
 * A line is worth its unit price plus its modifiers, times quantity — the same
 * arithmetic the bill uses. Summing `unit_price` alone would quietly under-report
 * every dish that carries a paid choice.
 */
const LINE_VALUE = `(oi.unit_price + COALESCE(
   (SELECT SUM(m.price_delta) FROM order_item_modifiers m WHERE m.order_item_id = oi.id), 0)) * oi.qty`;

function range(req) {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || from;
  return { from: `${from} 00:00:00`, to: `${to} 23:59:59`, label: from === to ? from : `${from} → ${to}` };
}

/** The end-of-day sheet: what was sold, how it was paid for, what was given away. */
reportsRouter.get('/summary', (req, res) => {
  const { from, to, label } = range(req);

  // Covers are counted on the checks alone. Counting them across the join with
  // order_items would multiply every table by its number of lines.
  const covers = db
    .prepare('SELECT COUNT(*) checks, COALESCE(SUM(guest_count), 0) covers FROM checks WHERE opened_at BETWEEN ? AND ?')
    .get(from, to);

  const sales = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN oi.comped = 0 THEN ${LINE_VALUE} ELSE 0 END), 0) AS netSales,
         COALESCE(SUM(CASE WHEN oi.comped = 1 THEN ${LINE_VALUE} ELSE 0 END), 0) AS compedValue
       FROM order_items oi
       JOIN checks c ON c.id = oi.check_id
       WHERE c.opened_at BETWEEN ? AND ? AND oi.status NOT IN ('void','unavailable')`
    )
    .get(from, to);

  const voids = db
    .prepare(
      `SELECT COUNT(*) count, COALESCE(SUM(oi.unit_price * oi.qty), 0) value
       FROM order_items oi JOIN checks c ON c.id = oi.check_id
       WHERE c.opened_at BETWEEN ? AND ? AND oi.status = 'void'`
    )
    .get(from, to);

  const payments = db
    .prepare(
      `SELECT p.method, COUNT(*) count, COALESCE(SUM(p.amount), 0) amount
       FROM payments p JOIN checks c ON c.id = p.check_id
       WHERE c.opened_at BETWEEN ? AND ? GROUP BY p.method ORDER BY amount DESC`
    )
    .all(from, to);

  const bySection = db
    .prepare(
      `SELECT s.code, s.name,
              COUNT(DISTINCT c.id) checks,
              COALESCE(SUM(CASE WHEN oi.comped = 0 THEN ${LINE_VALUE} ELSE 0 END), 0) sales
       FROM sections s
       LEFT JOIN checks c ON c.section_id = s.id AND c.opened_at BETWEEN ? AND ?
       LEFT JOIN order_items oi ON oi.check_id = c.id AND oi.status NOT IN ('void','unavailable')
       GROUP BY s.id ORDER BY sales DESC`
    )
    .all(from, to);

  const openChecks = db.prepare("SELECT COUNT(*) c FROM checks WHERE status = 'open'").get().c;

  res.json({
    label,
    checks: covers.checks,
    covers: covers.covers,
    netSales: round(sales.netSales),
    compedValue: round(sales.compedValue),
    averageCheck: covers.checks ? round(sales.netSales / covers.checks) : 0,
    averageCover: covers.covers ? round(sales.netSales / covers.covers) : 0,
    voids: { count: voids.count, value: round(voids.value) },
    payments: payments.map((p) => ({ ...p, amount: round(p.amount) })),
    bySection: bySection.map((s) => ({ ...s, sales: round(s.sales) })),
    openChecks,
  });
});

/** Best sellers, and the tail that never moves. */
reportsRouter.get('/items', (req, res) => {
  const { from, to } = range(req);
  const rows = db
    .prepare(
      `SELECT oi.name, oi.variant_label AS variant, cat.name AS category,
              SUM(oi.qty) qty,
              COALESCE(SUM(CASE WHEN oi.comped = 0 THEN ${LINE_VALUE} ELSE 0 END), 0) sales
       FROM order_items oi
       JOIN checks c ON c.id = oi.check_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN menu_categories cat ON cat.id = mi.category_id
       WHERE c.opened_at BETWEEN ? AND ? AND oi.status NOT IN ('void','unavailable')
       GROUP BY oi.name, oi.variant_label
       ORDER BY sales DESC, qty DESC`
    )
    .all(from, to);
  res.json(rows.map((r) => ({ ...r, sales: round(r.sales) })));
});

/** Category mix — how much of the night was food against drink. */
reportsRouter.get('/categories', (req, res) => {
  const { from, to } = range(req);
  res.json(
    db
      .prepare(
        `SELECT cat.name category, cat.kind, SUM(oi.qty) qty,
                COALESCE(SUM(CASE WHEN oi.comped = 0 THEN ${LINE_VALUE} ELSE 0 END), 0) sales
         FROM order_items oi
         JOIN checks c ON c.id = oi.check_id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         JOIN menu_categories cat ON cat.id = mi.category_id
         WHERE c.opened_at BETWEEN ? AND ? AND oi.status NOT IN ('void','unavailable')
         GROUP BY cat.id ORDER BY sales DESC`
      )
      .all(from, to)
      .map((r) => ({ ...r, sales: round(r.sales) }))
  );
});

/**
 * Service timing — the numbers that say whether the floor is actually faster.
 * Acknowledgement is the promise to the guest; ready is the kitchen's pace.
 */
reportsRouter.get('/service', (req, res) => {
  const { from, to } = range(req);

  const ack = db
    .prepare(
      `SELECT AVG((julianday(acknowledged_at) - julianday(created_at)) * 86400) avgSeconds,
              COUNT(*) orders,
              SUM(CASE WHEN (julianday(acknowledged_at) - julianday(created_at)) * 86400 <= 60 THEN 1 ELSE 0 END) within60
       FROM orders WHERE created_at BETWEEN ? AND ? AND acknowledged_at IS NOT NULL AND source = 'guest'`
    )
    .get(from, to);

  const prep = db
    .prepare(
      `SELECT oi.station,
              AVG((julianday(oi.ready_at) - julianday(COALESCE(oi.fired_at, oi.created_at))) * 86400) avgSeconds,
              COUNT(*) items
       FROM order_items oi
       WHERE oi.created_at BETWEEN ? AND ? AND oi.ready_at IS NOT NULL
       GROUP BY oi.station`
    )
    .all(from, to);

  const turn = db
    .prepare(
      `SELECT AVG((julianday(closed_at) - julianday(opened_at)) * 1440) avgMinutes, COUNT(*) checks
       FROM checks WHERE opened_at BETWEEN ? AND ? AND closed_at IS NOT NULL`
    )
    .get(from, to);

  const byHour = db
    .prepare(
      `SELECT strftime('%H', o.created_at) hour, COUNT(*) orders,
              COALESCE(SUM(${LINE_VALUE}), 0) sales
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.status NOT IN ('void','unavailable')
       WHERE o.created_at BETWEEN ? AND ?
       GROUP BY hour ORDER BY hour`
    )
    .all(from, to);

  res.json({
    acknowledgement: {
      averageSeconds: ack.avgSeconds ? Math.round(ack.avgSeconds) : null,
      orders: ack.orders,
      withinTargetPercent: ack.orders ? Math.round((ack.within60 / ack.orders) * 100) : null,
    },
    preparation: prep.map((p) => ({ station: p.station, averageSeconds: Math.round(p.avgSeconds ?? 0), items: p.items })),
    tableTurn: { averageMinutes: turn.avgMinutes ? Math.round(turn.avgMinutes) : null, checks: turn.checks },
    byHour: byHour.map((h) => ({ ...h, sales: round(h.sales) })),
  });
});

/** Per-waiter view, for staffing decisions rather than league tables. */
reportsRouter.get('/staff', (req, res) => {
  const { from, to } = range(req);
  res.json(
    db
      .prepare(
        `SELECT st.name, st.role,
                COUNT(DISTINCT o.id) ordersTaken,
                COALESCE(SUM(${LINE_VALUE}), 0) sales,
                AVG((julianday(o.acknowledged_at) - julianday(o.created_at)) * 86400) avgAckSeconds
         FROM staff st
         LEFT JOIN orders o ON (o.staff_id = st.id OR o.acknowledged_by = st.id) AND o.created_at BETWEEN ? AND ?
         LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.status NOT IN ('void','unavailable') AND oi.comped = 0
         WHERE st.role = 'waiter'
         GROUP BY st.id ORDER BY sales DESC`
      )
      .all(from, to)
      .map((r) => ({
        ...r,
        sales: round(r.sales),
        avgAckSeconds: r.avgAckSeconds ? Math.round(r.avgAckSeconds) : null,
      }))
  );
});

/** Voids and comps, itemised — the report a manager is asked for at month end. */
reportsRouter.get('/exceptions', (req, res) => {
  const { from, to } = range(req);
  const voids = db
    .prepare(
      `SELECT oi.id, oi.name, oi.qty, oi.unit_price AS unitPrice, oi.void_reason AS reason,
              t.code AS tableCode, oi.created_at AS createdAt
       FROM order_items oi
       JOIN checks c ON c.id = oi.check_id
       JOIN dining_tables t ON t.id = c.table_id
       WHERE c.opened_at BETWEEN ? AND ? AND oi.status IN ('void','unavailable')
       ORDER BY oi.created_at DESC`
    )
    .all(from, to);

  const comps = db
    .prepare(
      `SELECT oi.id, oi.name, oi.qty, oi.unit_price AS unitPrice, t.code AS tableCode, oi.created_at AS createdAt
       FROM order_items oi
       JOIN checks c ON c.id = oi.check_id
       JOIN dining_tables t ON t.id = c.table_id
       WHERE c.opened_at BETWEEN ? AND ? AND oi.comped = 1
       ORDER BY oi.created_at DESC`
    )
    .all(from, to);

  const discounts = db
    .prepare(
      `SELECT c.code, c.discount_percent AS percent, c.discount_reason AS reason, t.code AS tableCode
       FROM checks c JOIN dining_tables t ON t.id = c.table_id
       WHERE c.opened_at BETWEEN ? AND ? AND c.discount_percent > 0`
    )
    .all(from, to);

  res.json({ voids, comps, discounts });
});

/** Raw sales lines, for the accountant's spreadsheet. */
reportsRouter.get('/export.csv', (req, res) => {
  const { from, to } = range(req);
  const rows = db
    .prepare(
      `SELECT c.code AS check_code, t.code AS table_code, s.code AS section, c.opened_at, c.closed_at,
              oi.name, oi.variant_label, oi.qty, oi.unit_price, oi.status, oi.comped
       FROM order_items oi
       JOIN checks c ON c.id = oi.check_id
       JOIN dining_tables t ON t.id = c.table_id
       JOIN sections s ON s.id = c.section_id
       WHERE c.opened_at BETWEEN ? AND ?
       ORDER BY c.id, oi.id`
    )
    .all(from, to);

  const header = ['check', 'table', 'section', 'opened_at', 'closed_at', 'item', 'variant', 'qty', 'unit_price', 'status', 'comped'];
  const escape = (v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
  const csv = [header.join(','), ...rows.map((r) => Object.values(r).map(escape).join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lord-erroll-sales-${req.query.from ?? 'today'}.csv"`);
  res.send(csv);
});

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
