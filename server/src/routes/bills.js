import { Router } from 'express';
import { db, audit } from '../db.js';
import { requireStaff, canAccessSection } from '../lib/auth.js';
import { serializeCheck, computeCheckTotals, nowIso } from '../lib/orders.js';
import { emitTo, rooms } from '../lib/realtime.js';

export const billsRouter = Router();
billsRouter.use(requireStaff());

const loadCheck = (id) => db.prepare('SELECT * FROM checks WHERE id = ?').get(Number(id));

function pushCheck(checkId) {
  const payload = serializeCheck(checkId);
  emitTo([rooms.table(payload.tableCode), rooms.section(payload.sectionCode), rooms.admin()], 'check:updated', payload);
  return payload;
}

billsRouter.get('/:id', (req, res) => {
  const check = loadCheck(req.params.id);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  res.json(serializeCheck(check.id));
});

/** Split evenly, split by item, or keep it as one bill. */
billsRouter.post('/:id/split', (req, res) => {
  const check = loadCheck(req.params.id);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  const { mode = 'single', ways = 1, assignments = [] } = req.body ?? {};
  if (!['single', 'even', 'item'].includes(mode)) return res.status(400).json({ error: 'Unknown split mode.' });

  db.prepare('UPDATE checks SET split_mode = ?, split_ways = ? WHERE id = ?')
    .run(mode, Math.max(1, Math.min(24, Number(ways) || 1)), check.id);

  if (mode === 'item') {
    const stmt = db.prepare('UPDATE order_items SET split_group = ? WHERE id = ? AND check_id = ?');
    const apply = db.transaction((rows) => {
      for (const a of rows) stmt.run(a.splitGroup ?? null, a.itemId, check.id);
    });
    apply(assignments);
  } else {
    db.prepare('UPDATE order_items SET split_group = NULL WHERE check_id = ?').run(check.id);
  }

  audit('check', check.id, 'split', `staff:${req.staff.id}`, { mode, ways });
  res.json(billsBreakdown(check.id));
});

/** Per-share amounts, whichever way the table is splitting. */
billsRouter.get('/:id/breakdown', (req, res) => {
  const check = loadCheck(req.params.id);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  res.json(billsBreakdown(check.id));
});

function billsBreakdown(checkId) {
  const check = loadCheck(checkId);
  const totals = computeCheckTotals(checkId);

  if (check.split_mode === 'even') {
    const ways = check.split_ways || 1;
    const share = +(totals.total / ways).toFixed(2);
    // Rounding remainder lands on the first share rather than quietly vanishing.
    const shares = Array.from({ length: ways }, (_, i) => ({
      label: `Guest ${i + 1}`,
      amount: i === 0 ? +(totals.total - share * (ways - 1)).toFixed(2) : share,
    }));
    return { ...totals, mode: 'even', shares };
  }

  if (check.split_mode === 'item') {
    const groups = new Map();
    for (const line of totals.lines) {
      const key = line.splitGroup ?? 0;
      if (!groups.has(key)) groups.set(key, { label: key === 0 ? 'Unassigned' : `Guest ${key}`, lines: [], subtotal: 0 });
      const g = groups.get(key);
      g.lines.push(line);
      g.subtotal += line.lineTotal;
    }
    const ratio = totals.subtotal > 0 ? totals.total / totals.subtotal : 0;
    const shares = [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, g]) => ({
        splitGroup: key,
        label: g.label,
        lines: g.lines,
        subtotal: +g.subtotal.toFixed(2),
        amount: +(g.subtotal * ratio).toFixed(2),
      }));
    return { ...totals, mode: 'item', shares };
  }

  return { ...totals, mode: 'single', shares: [{ label: 'Table', amount: totals.total }] };
}

/** Discounts and comps are manager-only and always land in the audit log. */
billsRouter.post('/:id/discount', requireStaff('manager', 'admin'), (req, res) => {
  const check = loadCheck(req.params.id);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  const percent = Math.max(0, Math.min(100, Number(req.body?.percent) || 0));
  db.prepare('UPDATE checks SET discount_percent = ?, discount_reason = ? WHERE id = ?')
    .run(percent, req.body?.reason ?? null, check.id);
  audit('check', check.id, 'discount', `staff:${req.staff.id}`, { percent, reason: req.body?.reason });
  res.json(pushCheck(check.id));
});

billsRouter.post('/items/:itemId/comp', requireStaff('manager', 'admin'), (req, res) => {
  const itemId = Number(req.params.itemId);
  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const comped = req.body?.comped !== false;
  db.prepare('UPDATE order_items SET comped = ? WHERE id = ?').run(comped ? 1 : 0, itemId);
  audit('order_item', itemId, comped ? 'comped' : 'uncomped', `staff:${req.staff.id}`, { reason: req.body?.reason });
  res.json(pushCheck(item.check_id));
});

/**
 * Records a payment. Card and M-Pesa need the internet to authorise, but this
 * endpoint only records the outcome, so cash and account settlement keep working
 * with the line down.
 */
billsRouter.post('/:id/payments', (req, res) => {
  const check = loadCheck(req.params.id);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  if (!canAccessSection(req.staff, check.section_id)) return res.status(403).json({ error: 'Not your section.' });

  const { method, amount, reference = null, splitGroup = null } = req.body ?? {};
  if (!['cash', 'card', 'mpesa', 'account', 'comp'].includes(method)) {
    return res.status(400).json({ error: 'Unknown payment method.' });
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'Enter an amount.' });

  db.prepare(
    'INSERT INTO payments (check_id, method, amount, reference, split_group, staff_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(check.id, method, value, reference, splitGroup, req.staff.id);

  audit('check', check.id, 'payment', `staff:${req.staff.id}`, { method, amount: value, reference });

  const totals = computeCheckTotals(check.id);
  if (totals.balance <= 0.5) {
    db.prepare("UPDATE checks SET status = 'closed', billed_at = COALESCE(billed_at, ?), closed_at = ? WHERE id = ?")
      .run(nowIso(), nowIso(), check.id);
    db.prepare("UPDATE service_requests SET status = 'resolved', resolved_at = ? WHERE check_id = ? AND status != 'resolved'")
      .run(nowIso(), check.id);
    audit('check', check.id, 'closed', `staff:${req.staff.id}`, { total: totals.total });
  } else {
    db.prepare("UPDATE checks SET status = 'billed', billed_at = COALESCE(billed_at, ?) WHERE id = ?")
      .run(nowIso(), check.id);
  }

  res.json(pushCheck(check.id));
});

/** Close a settled or zero-value check and free the table. */
billsRouter.post('/:id/close', (req, res) => {
  const check = loadCheck(req.params.id);
  if (!check) return res.status(404).json({ error: 'Check not found.' });
  const totals = computeCheckTotals(check.id);
  if (totals.balance > 0.5 && !['manager', 'admin'].includes(req.staff.role)) {
    return res.status(409).json({ error: `KES ${totals.balance.toFixed(0)} is still outstanding. A manager can force-close.` });
  }
  db.prepare("UPDATE checks SET status = 'closed', closed_at = ?, billed_at = COALESCE(billed_at, ?) WHERE id = ?")
    .run(nowIso(), nowIso(), check.id);
  db.prepare("UPDATE service_requests SET status = 'resolved', resolved_at = ? WHERE check_id = ? AND status != 'resolved'")
    .run(nowIso(), check.id);
  audit('check', check.id, 'closed', `staff:${req.staff.id}`, { balance: totals.balance });
  res.json(pushCheck(check.id));
});
