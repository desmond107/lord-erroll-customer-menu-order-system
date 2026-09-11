import { Router } from 'express';
import { db, audit } from '../db.js';
import { requireStaff } from '../lib/auth.js';
import { emitTo, rooms } from '../lib/realtime.js';

/**
 * Allergen sign-off.
 *
 * Every item carries a proposed allergen list, transcribed from the printed
 * menu. A proposal is not a sign-off: until a chef confirms it, the item stays
 * flagged, because the person who can say what is actually in a dish is the
 * person cooking it.
 *
 * This lives outside the admin router on purpose. That router is managers and
 * admins only, and the one role that must be able to do this — the kitchen — is
 * not on it.
 */
export const allergensRouter = Router();
allergensRouter.use(requireStaff('kitchen', 'manager', 'admin'));

const parse = (raw) => {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const shape = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  description: r.description,
  allergens: parse(r.allergens),
  dietary: parse(r.dietary),
  signedOff: r.allergen_review === 0,
  signedBy: r.allergen_signed_by,
  signedAt: r.allergen_signed_at,
});

/** The whole menu, in the order it is printed, with sign-off state on each item. */
allergensRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT i.id, i.name, i.description, i.allergens, i.dietary, i.allergen_review,
              i.allergen_signed_by, i.allergen_signed_at, c.name AS category, c.id AS category_id,
              c.sort_order AS cat_sort
       FROM menu_items i JOIN menu_categories c ON c.id = i.category_id
       WHERE i.active = 1 AND c.active = 1
       ORDER BY c.sort_order, i.sort_order, i.id`
    )
    .all();

  const categories = [];
  for (const r of rows) {
    let group = categories.find((g) => g.id === r.category_id);
    if (!group) {
      group = { id: r.category_id, name: r.category, items: [] };
      categories.push(group);
    }
    group.items.push(shape(r));
  }

  res.json({
    categories,
    outstanding: rows.filter((r) => r.allergen_review === 1).length,
    total: rows.length,
  });
});

const broadcast = () => {
  const sections = db.prepare('SELECT code FROM sections').all().map((s) => rooms.section(s.code));
  const tables = db.prepare('SELECT code FROM dining_tables WHERE active = 1').all().map((t) => rooms.table(t.code));
  emitTo([...sections, ...tables, rooms.station('kitchen'), rooms.admin()], 'menu:updated', {
    reason: 'allergens-signed-off',
  });
};

/**
 * Sign one item off, optionally correcting the list first. The correction and
 * the signature are one action: a chef who has to save twice may sign off a list
 * they have just changed and not re-checked.
 */
allergensRouter.post('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT id, name FROM menu_items WHERE id = ? AND active = 1').get(id);
  if (!item) return res.status(404).json({ error: 'Unknown item.' });

  const { allergens } = req.body ?? {};
  if (allergens !== undefined && !Array.isArray(allergens)) {
    return res.status(400).json({ error: 'Allergens must be a list.' });
  }

  const signedAt = new Date().toISOString();
  db.prepare(
    `UPDATE menu_items
     SET allergens = COALESCE(?, allergens), allergen_review = 0,
         allergen_signed_by = ?, allergen_signed_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(allergens === undefined ? null : JSON.stringify(allergens), req.staff.name, signedAt, id);

  audit('menu_item', id, 'allergens_signed_off', `staff:${req.staff.id}`, { allergens });
  broadcast();
  res.json({ ok: true, signedBy: req.staff.name, signedAt });
});

/**
 * Sign off a batch whose lists are already correct — a whole category of bottled
 * drinks, say, where nothing is prepared in the kitchen. The lists themselves are
 * not touched here; this only records that they were checked.
 */
allergensRouter.post('/bulk', (req, res) => {
  const ids = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map(Number).filter(Number.isInteger) : null;
  const categoryId = req.body?.categoryId === undefined ? null : Number(req.body.categoryId);
  if (!ids?.length && categoryId === null) {
    return res.status(400).json({ error: 'Give either a list of items or a category to sign off.' });
  }

  const signedAt = new Date().toISOString();
  const targets = ids?.length
    ? db.prepare(`SELECT id FROM menu_items WHERE active = 1 AND id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare('SELECT id FROM menu_items WHERE active = 1 AND category_id = ?').all(categoryId);

  const sign = db.prepare(
    `UPDATE menu_items SET allergen_review = 0, allergen_signed_by = ?, allergen_signed_at = ?,
       updated_at = datetime('now') WHERE id = ?`
  );
  db.transaction(() => targets.forEach((t) => sign.run(req.staff.name, signedAt, t.id)))();

  audit('menu_item', null, 'allergens_signed_off_bulk', `staff:${req.staff.id}`, {
    count: targets.length,
    categoryId,
  });
  broadcast();
  res.json({ ok: true, signedOff: targets.length, signedBy: req.staff.name, signedAt });
});

/** Withdraw a sign-off, for when a recipe changes and the list must be rechecked. */
allergensRouter.post('/items/:id/reopen', (req, res) => {
  const id = Number(req.params.id);
  db.prepare(
    `UPDATE menu_items SET allergen_review = 1, allergen_signed_by = NULL, allergen_signed_at = NULL,
       updated_at = datetime('now') WHERE id = ?`
  ).run(id);
  audit('menu_item', id, 'allergens_reopened', `staff:${req.staff.id}`);
  broadcast();
  res.json({ ok: true });
});
