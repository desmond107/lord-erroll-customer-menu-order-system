import crypto from 'node:crypto';
import { Router } from 'express';
import { db, audit, getSetting, setSetting } from '../db.js';
import { requireStaff, hashPin, hashPassword } from '../lib/auth.js';
import { buildMenu } from './menu.js';
import { emitTo, rooms } from '../lib/realtime.js';

export const adminRouter = Router();
adminRouter.use(requireStaff('manager', 'admin'));

const broadcastMenu = (payload) => {
  const sectionRooms = db.prepare('SELECT code FROM sections').all().map((s) => rooms.section(s.code));
  const tableRooms = db.prepare('SELECT code FROM dining_tables WHERE active = 1').all().map((t) => rooms.table(t.code));
  emitTo([...sectionRooms, ...tableRooms, rooms.station('kitchen'), rooms.station('bar'), rooms.admin()], 'menu:updated', payload);
};

// ------------------------------------------------------------------- menu
adminRouter.get('/menu', (_req, res) => res.json({ categories: buildMenu({ audience: 'staff' }) }));

/** Everything a manager must finish before go-live, in one list. */
adminRouter.get('/menu/review', (_req, res) => {
  const missingPrice = db
    .prepare(
      `SELECT i.id, i.name, c.name AS category, 'item' AS kind
       FROM menu_items i JOIN menu_categories c ON c.id = i.category_id
       WHERE i.active = 1 AND i.price_kes IS NULL
         AND NOT EXISTS (SELECT 1 FROM menu_item_variants v WHERE v.item_id = i.id)
       ORDER BY c.sort_order, i.sort_order`
    )
    .all();

  const missingVariantPrice = db
    .prepare(
      `SELECT v.id, i.name || ' — ' || v.label AS name, c.name AS category, 'variant' AS kind
       FROM menu_item_variants v
       JOIN menu_items i ON i.id = v.item_id
       JOIN menu_categories c ON c.id = i.category_id
       WHERE i.active = 1 AND v.price_kes IS NULL
       ORDER BY c.sort_order, i.sort_order, v.sort_order`
    )
    .all();

  // Prices that exist but were never confirmed against the printed menu —
  // this is where the demo-price script's values surface.
  const unconfirmedPrice = db
    .prepare(
      `SELECT i.id, i.name, c.name AS category, i.price_kes AS price
       FROM menu_items i JOIN menu_categories c ON c.id = i.category_id
       WHERE i.active = 1 AND i.price_review = 1 AND i.price_kes IS NOT NULL
       ORDER BY c.sort_order, i.sort_order`
    )
    .all();

  const missingDescription = db
    .prepare(
      `SELECT i.id, i.name, c.name AS category FROM menu_items i JOIN menu_categories c ON c.id = i.category_id
       WHERE i.active = 1 AND (i.description IS NULL OR i.description = '') ORDER BY c.sort_order, i.sort_order`
    )
    .all();

  const allergensUnverified = db
    .prepare(
      `SELECT i.id, i.name, c.name AS category FROM menu_items i JOIN menu_categories c ON c.id = i.category_id
       WHERE i.active = 1 AND i.allergen_review = 1 ORDER BY c.sort_order, i.sort_order`
    )
    .all();

  const emptyCategories = db
    .prepare(
      `SELECT c.id, c.name, c.note FROM menu_categories c
       WHERE c.active = 1 AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.category_id = c.id AND i.active = 1)
       ORDER BY c.sort_order`
    )
    .all();

  const emptyChoiceGroups = db
    .prepare(
      `SELECT g.id, i.name AS item, g.name FROM modifier_groups g
       JOIN menu_items i ON i.id = g.item_id
       WHERE NOT EXISTS (SELECT 1 FROM modifier_options o WHERE o.group_id = g.id)`
    )
    .all();

  res.json({
    missingPrice,
    missingVariantPrice,
    unconfirmedPrice,
    missingDescription,
    allergensUnverified,
    emptyCategories,
    emptyChoiceGroups,
    readyForGoLive:
      missingPrice.length === 0 &&
      missingVariantPrice.length === 0 &&
      unconfirmedPrice.length === 0 &&
      allergensUnverified.length === 0,
  });
});

adminRouter.post('/menu/categories', (req, res) => {
  const { code, name, kind = 'food', station = 'kitchen', course = 2, note = null } = req.body ?? {};
  if (!code || !name) return res.status(400).json({ error: 'A code and a name are required.' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM menu_categories').get().s;
  const info = db
    .prepare('INSERT INTO menu_categories (code, name, kind, station, course, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(String(code).toUpperCase(), name, kind, station, course, note, sort);
  audit('menu_category', info.lastInsertRowid, 'created', `staff:${req.staff.id}`, { name });
  broadcastMenu({ reason: 'category-created' });
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.patch('/menu/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  const fields = pick(req.body, { name: 'name', kind: 'kind', station: 'station', course: 'course', note: 'note', sortOrder: 'sort_order', active: 'active' });
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update.' });
  applyUpdate('menu_categories', id, fields);
  audit('menu_category', id, 'updated', `staff:${req.staff.id}`, fields);
  broadcastMenu({ reason: 'category-updated' });
  res.json({ ok: true });
});

adminRouter.post('/menu/items', (req, res) => {
  const b = req.body ?? {};
  if (!b.categoryId || !b.name) return res.status(400).json({ error: 'A category and a name are required.' });
  const category = db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(b.categoryId);
  if (!category) return res.status(400).json({ error: 'Unknown category.' });

  const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM menu_items WHERE category_id = ?').get(b.categoryId).s;
  const info = db
    .prepare(
      `INSERT INTO menu_items (category_id, name, description, price_kes, price_usd, station, course,
        dietary, allergens, is_set_menu, price_review, allergen_review, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.categoryId, b.name, b.description ?? null,
      numOrNull(b.price), numOrNull(b.priceUsd),
      b.station ?? category.station, b.course ?? category.course,
      JSON.stringify(b.dietary ?? []), JSON.stringify(b.allergens ?? []),
      b.isSetMenu ? 1 : 0, numOrNull(b.price) === null ? 1 : 0, b.allergensVerified ? 0 : 1, sort
    );
  audit('menu_item', info.lastInsertRowid, 'created', `staff:${req.staff.id}`, { name: b.name });
  broadcastMenu({ reason: 'item-created' });
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.patch('/menu/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const fields = pick(b, {
    name: 'name', description: 'description', station: 'station', course: 'course',
    sortOrder: 'sort_order', active: 'active', available: 'available',
    unavailableReason: 'unavailable_reason', isSetMenu: 'is_set_menu', categoryId: 'category_id',
  });
  if (b.price !== undefined) {
    fields.price_kes = numOrNull(b.price);
    fields.price_review = fields.price_kes === null ? 1 : 0;
  }
  if (b.priceUsd !== undefined) fields.price_usd = numOrNull(b.priceUsd);
  if (b.dietary !== undefined) fields.dietary = JSON.stringify(b.dietary);
  if (b.allergens !== undefined) fields.allergens = JSON.stringify(b.allergens);
  if (b.allergensVerified !== undefined) fields.allergen_review = b.allergensVerified ? 0 : 1;
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update.' });

  fields.updated_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  applyUpdate('menu_items', id, fields);
  audit('menu_item', id, 'updated', `staff:${req.staff.id}`, fields);
  broadcastMenu({ reason: 'item-updated', itemId: id });
  res.json({ ok: true });
});

adminRouter.delete('/menu/items/:id', (req, res) => {
  // Items are retired, never deleted: closed checks still reference them.
  db.prepare('UPDATE menu_items SET active = 0 WHERE id = ?').run(Number(req.params.id));
  audit('menu_item', Number(req.params.id), 'retired', `staff:${req.staff.id}`);
  broadcastMenu({ reason: 'item-retired' });
  res.json({ ok: true });
});

adminRouter.post('/menu/items/:id/variants', (req, res) => {
  const itemId = Number(req.params.id);
  const { label, price } = req.body ?? {};
  if (!label) return res.status(400).json({ error: 'A label is required.' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM menu_item_variants WHERE item_id = ?').get(itemId).s;
  const info = db
    .prepare('INSERT INTO menu_item_variants (item_id, label, price_kes, price_review, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(itemId, label, numOrNull(price), numOrNull(price) === null ? 1 : 0, sort);
  broadcastMenu({ reason: 'variant-created' });
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.patch('/menu/variants/:id', (req, res) => {
  const id = Number(req.params.id);
  const fields = pick(req.body, { label: 'label', available: 'available', sortOrder: 'sort_order' });
  if (req.body?.price !== undefined) {
    fields.price_kes = numOrNull(req.body.price);
    fields.price_review = fields.price_kes === null ? 1 : 0;
  }
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update.' });
  applyUpdate('menu_item_variants', id, fields);
  audit('menu_variant', id, 'updated', `staff:${req.staff.id}`, fields);
  broadcastMenu({ reason: 'variant-updated' });
  res.json({ ok: true });
});

adminRouter.delete('/menu/variants/:id', (req, res) => {
  db.prepare('DELETE FROM menu_item_variants WHERE id = ?').run(Number(req.params.id));
  broadcastMenu({ reason: 'variant-deleted' });
  res.json({ ok: true });
});

adminRouter.post('/menu/groups/:id/options', (req, res) => {
  const groupId = Number(req.params.id);
  const { name, priceDelta = 0, description = null } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM modifier_options WHERE group_id = ?').get(groupId).s;
  const info = db
    .prepare('INSERT INTO modifier_options (group_id, name, description, price_delta, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(groupId, name, description, Number(priceDelta) || 0, sort);
  broadcastMenu({ reason: 'option-created' });
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.delete('/menu/options/:id', (req, res) => {
  db.prepare('DELETE FROM modifier_options WHERE id = ?').run(Number(req.params.id));
  broadcastMenu({ reason: 'option-deleted' });
  res.json({ ok: true });
});

/**
 * Bulk import, built for the spirits list: one row per SKU, so a bottle and a
 * tot of the same label arrive as two rows sharing an item name.
 * Columns: category,item,variant,price,description,station,course,dietary,allergens
 */
adminRouter.post('/menu/import', (req, res) => {
  const rows = parseCsv(String(req.body?.csv ?? ''));
  if (!rows.length) return res.status(400).json({ error: 'No rows found in that file.' });

  const result = { categories: 0, items: 0, variants: 0, errors: [] };
  const run = db.transaction(() => {
    rows.forEach((row, index) => {
      const line = index + 2;
      const categoryName = row.category?.trim();
      const itemName = row.item?.trim();
      if (!categoryName || !itemName) {
        result.errors.push(`Line ${line}: category and item are both required.`);
        return;
      }

      let category = db.prepare('SELECT * FROM menu_categories WHERE lower(name) = lower(?) OR code = ?')
        .get(categoryName, categoryName.toUpperCase());
      if (!category) {
        const code = categoryName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);
        const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM menu_categories').get().s;
        db.prepare('INSERT INTO menu_categories (code, name, kind, station, course, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
          .run(code, categoryName, row.station === 'kitchen' ? 'food' : 'drink', row.station || 'bar', Number(row.course) || 0, sort);
        category = db.prepare('SELECT * FROM menu_categories WHERE code = ?').get(code);
        result.categories++;
      }

      let item = db.prepare('SELECT * FROM menu_items WHERE category_id = ? AND lower(name) = lower(?)')
        .get(category.id, itemName);
      const price = numOrNull(row.price);
      const variantLabel = row.variant?.trim();

      if (!item) {
        const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM menu_items WHERE category_id = ?').get(category.id).s;
        const info = db
          .prepare(
            `INSERT INTO menu_items (category_id, name, description, price_kes, station, course, dietary, allergens, price_review, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            category.id, itemName, row.description?.trim() || null,
            variantLabel ? null : price,
            row.station || category.station, Number(row.course) || category.course,
            JSON.stringify(splitList(row.dietary)), JSON.stringify(splitList(row.allergens)),
            variantLabel || price !== null ? 0 : 1, sort
          );
        item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
        result.items++;
      } else if (!variantLabel && price !== null) {
        db.prepare("UPDATE menu_items SET price_kes = ?, price_review = 0, updated_at = datetime('now') WHERE id = ?")
          .run(price, item.id);
      }

      if (variantLabel) {
        const existing = db.prepare('SELECT id FROM menu_item_variants WHERE item_id = ? AND lower(label) = lower(?)')
          .get(item.id, variantLabel);
        if (existing) {
          db.prepare('UPDATE menu_item_variants SET price_kes = ?, price_review = ? WHERE id = ?')
            .run(price, price === null ? 1 : 0, existing.id);
        } else {
          const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM menu_item_variants WHERE item_id = ?').get(item.id).s;
          db.prepare('INSERT INTO menu_item_variants (item_id, label, price_kes, price_review, sort_order) VALUES (?, ?, ?, ?, ?)')
            .run(item.id, variantLabel, price, price === null ? 1 : 0, sort);
          result.variants++;
        }
      }
    });
  });
  run();

  audit('menu', null, 'imported', `staff:${req.staff.id}`, result);
  broadcastMenu({ reason: 'imported' });
  res.json(result);
});

// ----------------------------------------------------- sections and tables
adminRouter.get('/floor', (_req, res) => {
  const sections = db.prepare('SELECT * FROM sections ORDER BY sort_order').all();
  res.json(
    sections.map((s) => ({
      id: s.id, code: s.code, name: s.name, description: s.description, active: !!s.active,
      tables: db
        .prepare('SELECT id, code, number, label, seats, active, qr_token AS qrToken FROM dining_tables WHERE section_id = ? ORDER BY sort_order, code')
        .all(s.id)
        .map((t) => ({ ...t, active: !!t.active })),
    }))
  );
});

adminRouter.post('/sections', (req, res) => {
  const { code, name, description = null } = req.body ?? {};
  if (!code || !name) return res.status(400).json({ error: 'A code and a name are required.' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM sections').get().s;
  const info = db.prepare('INSERT INTO sections (code, name, description, sort_order) VALUES (?, ?, ?, ?)')
    .run(String(code).toUpperCase(), name, description, sort);
  audit('section', info.lastInsertRowid, 'created', `staff:${req.staff.id}`, { code, name });
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.patch('/sections/:id', (req, res) => {
  const fields = pick(req.body, { name: 'name', description: 'description', active: 'active', sortOrder: 'sort_order' });
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update.' });
  applyUpdate('sections', Number(req.params.id), fields);
  res.json({ ok: true });
});

adminRouter.post('/tables', (req, res) => {
  const { sectionId, number, label = null, seats = 4 } = req.body ?? {};
  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);
  if (!section) return res.status(400).json({ error: 'Unknown section.' });
  const padded = String(number).padStart(2, '0');
  const code = `${section.code}-${padded}`;
  if (db.prepare('SELECT id FROM dining_tables WHERE code = ?').get(code)) {
    return res.status(409).json({ error: `${code} already exists.` });
  }
  const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM dining_tables WHERE section_id = ?').get(section.id).s;
  const info = db
    .prepare('INSERT INTO dining_tables (code, section_id, number, label, seats, qr_token, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(code, section.id, padded, label, Number(seats) || 4, crypto.randomBytes(9).toString('base64url'), sort);
  audit('table', info.lastInsertRowid, 'created', `staff:${req.staff.id}`, { code });
  res.status(201).json({ id: info.lastInsertRowid, code });
});

adminRouter.patch('/tables/:id', (req, res) => {
  const fields = pick(req.body, { label: 'label', seats: 'seats', active: 'active', sortOrder: 'sort_order' });
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update.' });
  applyUpdate('dining_tables', Number(req.params.id), fields);
  res.json({ ok: true });
});

/** Rotating a token invalidates the printed card — used if one is photographed. */
adminRouter.post('/tables/:id/rotate-token', (req, res) => {
  const token = crypto.randomBytes(9).toString('base64url');
  db.prepare('UPDATE dining_tables SET qr_token = ? WHERE id = ?').run(token, Number(req.params.id));
  audit('table', Number(req.params.id), 'token_rotated', `staff:${req.staff.id}`);
  res.json({ qrToken: token });
});

// ------------------------------------------------------------------ staff
adminRouter.get('/staff', (_req, res) => {
  res.json(
    db
      .prepare('SELECT id, name, role, email, active, created_at AS createdAt FROM staff ORDER BY role, name')
      .all()
      .map((s) => ({
        ...s,
        active: !!s.active,
        sections: db
          .prepare('SELECT sec.id, sec.code, sec.name FROM staff_sections ss JOIN sections sec ON sec.id = ss.section_id WHERE ss.staff_id = ?')
          .all(s.id),
      }))
  );
});

adminRouter.post('/staff', (req, res) => {
  const { name, role, email = null, password = null, sections = [] } = req.body ?? {};
  if (!name || !['waiter', 'kitchen', 'bar', 'manager', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'A name and a valid role are required.' });
  }
  const usesPassword = ['manager', 'admin'].includes(role);
  if (usesPassword && (!email || !password)) {
    return res.status(400).json({ error: 'Managers sign in with an email address and a password.' });
  }

  const pin = usesPassword ? null : String(crypto.randomInt(1000, 10000));
  const info = db
    .prepare('INSERT INTO staff (name, role, pin_hash, email, password_hash) VALUES (?, ?, ?, ?, ?)')
    .run(name, role, pin ? hashPin(pin) : null, email ? String(email).toLowerCase() : null, password ? hashPassword(password) : null);

  setSections(info.lastInsertRowid, sections);
  audit('staff', info.lastInsertRowid, 'created', `staff:${req.staff.id}`, { name, role });
  // The PIN is returned exactly once, at creation.
  res.status(201).json({ id: info.lastInsertRowid, pin });
});

adminRouter.patch('/staff/:id', (req, res) => {
  const id = Number(req.params.id);
  const fields = pick(req.body, { name: 'name', role: 'role', active: 'active' });
  if (req.body?.email !== undefined) fields.email = req.body.email ? String(req.body.email).toLowerCase() : null;
  if (req.body?.password) fields.password_hash = hashPassword(req.body.password);
  if (Object.keys(fields).length) applyUpdate('staff', id, fields);
  if (Array.isArray(req.body?.sections)) setSections(id, req.body.sections);
  audit('staff', id, 'updated', `staff:${req.staff.id}`, { fields: Object.keys(fields) });
  res.json({ ok: true });
});

adminRouter.post('/staff/:id/reset-pin', (req, res) => {
  const pin = String(crypto.randomInt(1000, 10000));
  db.prepare('UPDATE staff SET pin_hash = ? WHERE id = ?').run(hashPin(pin), Number(req.params.id));
  audit('staff', Number(req.params.id), 'pin_reset', `staff:${req.staff.id}`);
  res.json({ pin });
});

function setSections(staffId, sectionIds) {
  db.prepare('DELETE FROM staff_sections WHERE staff_id = ?').run(staffId);
  const stmt = db.prepare('INSERT OR IGNORE INTO staff_sections (staff_id, section_id) VALUES (?, ?)');
  for (const id of sectionIds) stmt.run(staffId, Number(id));
}

// --------------------------------------------------------------- settings
adminRouter.get('/settings', (_req, res) => {
  res.json({
    restaurant: getSetting('restaurant', {}),
    billing: getSetting('billing', {}),
    service: getSetting('service', {}),
  });
});

adminRouter.put('/settings/:key', (req, res) => {
  const key = req.params.key;
  if (!['restaurant', 'billing', 'service'].includes(key)) return res.status(400).json({ error: 'Unknown setting.' });
  setSetting(key, req.body ?? {});
  audit('settings', null, `updated:${key}`, `staff:${req.staff.id}`, req.body);
  broadcastMenu({ reason: 'settings' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- helpers
function pick(body, map) {
  const out = {};
  for (const [from, to] of Object.entries(map)) {
    if (body?.[from] !== undefined) {
      out[to] = typeof body[from] === 'boolean' ? (body[from] ? 1 : 0) : body[from];
    }
  }
  return out;
}

function applyUpdate(table, id, fields) {
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...Object.values(fields), id);
}

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const splitList = (v) => (v ? String(v).split(/[;|]/).map((s) => s.trim()).filter(Boolean) : []);

/** Small RFC4180-ish CSV reader — enough for a spreadsheet export. */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const clean = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (clean.length < 2) return [];
  const header = clean[0].map((h) => h.trim().toLowerCase());
  return clean.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
