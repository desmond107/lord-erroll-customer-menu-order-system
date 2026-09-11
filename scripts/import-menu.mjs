#!/usr/bin/env node
/**
 * Writes the transcribed printed menu in `menu-source.mjs` into the database.
 *
 *   node scripts/import-menu.mjs --dry-run   show what would change
 *   node scripts/import-menu.mjs             apply it
 *
 * Idempotent: items are matched by name within their category, so running it
 * twice changes nothing the second time. Prices, descriptions, dietary flags and
 * servings are taken from the printed menu and overwrite whatever was there,
 * which is the point — the demo placeholder prices are what this removes.
 *
 * Allergen lists are written as PROPOSALS and every item is left unsigned. A
 * chef signs off in Admin → Menu; nothing here counts as that sign-off.
 */
import { MENU } from './menu-source.mjs';

const dryRun = process.argv.includes('--dry-run');
process.env.DATABASE_PATH ??= './data/lord-erroll.db';
const { db } = await import('../server/src/db.js');

const json = (v) => JSON.stringify(v ?? []);
const changes = { categories: [], priced: [], described: [], inserted: [], moved: [], retired: [], unpriced: [], keptSignedOff: [] };

// Categories the printed menu needs that the system did not have. Everything
// else already exists; this only fills gaps and re-sorts to the printed order.
const NEW_CATEGORIES = {
  WHITE: { name: 'White Wine', kind: 'drink', station: 'bar', course: 0 },
  RED: { name: 'Red Wine', kind: 'drink', station: 'bar', course: 0 },
};

const apply = db.transaction(() => {
  const seenItemIds = new Set();
  const touchedCategoryIds = [];

  MENU.forEach((block, categoryIndex) => {
    let cat = db.prepare('SELECT * FROM menu_categories WHERE code = ?').get(block.category);

    if (!cat) {
      const spec = NEW_CATEGORIES[block.category];
      if (!spec) throw new Error(`Unknown category ${block.category} with no definition to create it.`);
      db.prepare(
        'INSERT INTO menu_categories (code, name, kind, station, course, sort_order, active) VALUES (?,?,?,?,?,?,1)'
      ).run(block.category, spec.name, spec.kind, spec.station, spec.course, categoryIndex);
      cat = db.prepare('SELECT * FROM menu_categories WHERE code = ?').get(block.category);
      changes.categories.push(`${block.category} — ${spec.name}`);
    }

    // Re-sort to the order the menu is printed in.
    db.prepare('UPDATE menu_categories SET sort_order = ?, active = 1 WHERE id = ?').run(categoryIndex, cat.id);
    touchedCategoryIds.push(cat.id);

    block.items.forEach((src, itemIndex) => {
      const names = [src.name, src.renameFrom].filter(Boolean);
      // Matched anywhere in the menu, not just this category: the printed list
      // puts several wines under a different heading than the system did, and
      // those must move rather than be duplicated.
      let row = null;
      for (const n of names) {
        row = db.prepare('SELECT * FROM menu_items WHERE name = ? AND category_id = ?').get(n, cat.id);
        if (row) break;
      }
      if (!row) {
        for (const n of names) {
          row = db.prepare('SELECT * FROM menu_items WHERE name = ?').get(n);
          if (row) break;
        }
        if (row) changes.moved.push(`${row.name} → ${block.category}`);
      }

      const hasVariants = Array.isArray(src.variants) && src.variants.length > 0;
      const price = hasVariants ? null : (src.price ?? null);
      const priceReview = hasVariants ? 0 : (price === null ? 1 : 0);

      if (!row) {
        const info = db.prepare(
          `INSERT INTO menu_items
             (category_id, name, description, price_kes, station, course, dietary, allergens,
              price_review, allergen_review, sort_order, active)
           VALUES (?,?,?,?,?,?,?,?,?,1,?,1)`
        ).run(cat.id, src.name, src.description ?? null, price, cat.station, cat.course,
              json(src.dietary), json(src.allergens), priceReview, itemIndex);
        row = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
        changes.inserted.push(`${block.category} · ${src.name}`);
      } else {
        const before = { price: row.price_kes, description: row.description };
        // A chef's signed-off allergen list outranks the transcription. Re-running
        // this must never quietly replace what a chef certified with a proposal
        // derived from the printed menu.
        const allergens = row.allergen_review === 0 ? row.allergens : json(src.allergens);
        if (row.allergen_review === 0 && allergens !== json(src.allergens)) {
          changes.keptSignedOff.push(`${block.category} · ${src.name}`);
        }
        db.prepare(
          `UPDATE menu_items SET category_id = ?, name = ?, description = ?, price_kes = ?,
             station = ?, course = ?, dietary = ?, allergens = ?, price_review = ?,
             sort_order = ?, active = 1, updated_at = datetime('now')
           WHERE id = ?`
        ).run(cat.id, src.name, src.description ?? row.description, price, cat.station, cat.course,
              json(src.dietary), allergens, priceReview, itemIndex, row.id);

        if (!hasVariants && before.price !== price) {
          changes.priced.push(`${block.category} · ${src.name}: ${before.price ?? '—'} → ${price ?? '—'}`);
        }
        if (!before.description && src.description) changes.described.push(`${block.category} · ${src.name}`);
      }

      seenItemIds.add(row.id);
      if (price === null && !hasVariants) changes.unpriced.push(`${block.category} · ${src.name}`);

      // Servings are replaced wholesale by what the printed menu offers. A
      // bottle-only wine must not keep a by-the-glass serving the menu dropped.
      const wanted = hasVariants ? src.variants : [];
      const existing = db.prepare('SELECT * FROM menu_item_variants WHERE item_id = ?').all(row.id);
      for (const v of existing) {
        if (!wanted.some((w) => w.label === v.label)) {
          db.prepare('DELETE FROM menu_item_variants WHERE id = ?').run(v.id);
          changes.retired.push(`serving removed — ${src.name} · ${v.label}`);
        }
      }
      wanted.forEach((w, i) => {
        const hit = existing.find((v) => v.label === w.label);
        if (hit) {
          db.prepare('UPDATE menu_item_variants SET price_kes = ?, price_review = ?, sort_order = ? WHERE id = ?')
            .run(w.price, w.price == null ? 1 : 0, i, hit.id);
          if (hit.price_kes !== w.price) {
            changes.priced.push(`${block.category} · ${src.name} (${w.label}): ${hit.price_kes ?? '—'} → ${w.price}`);
          }
        } else {
          db.prepare('INSERT INTO menu_item_variants (item_id, label, price_kes, price_review, sort_order) VALUES (?,?,?,?,?)')
            .run(row.id, w.label, w.price, w.price == null ? 1 : 0, i);
          changes.priced.push(`${block.category} · ${src.name} (${w.label}): new at ${w.price}`);
        }
      });
    });
  });

  // Anything still active in a transcribed category that the printed menu does
  // not list is retired rather than deleted, so an accidental omission in the
  // transcription can be undone without losing its history.
  const placeholders = touchedCategoryIds.map(() => '?').join(',');
  const orphans = db
    .prepare(`SELECT id, name FROM menu_items WHERE active = 1 AND category_id IN (${placeholders})`)
    .all(...touchedCategoryIds)
    .filter((r) => !seenItemIds.has(r.id));
  for (const o of orphans) {
    db.prepare('UPDATE menu_items SET active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(o.id);
    changes.retired.push(`item retired — ${o.name}`);
  }
});

if (dryRun) {
  db.exec('BEGIN');
  try { apply(); } finally { /* leave the report, discard the writes */ }
}
if (!dryRun) apply();
if (dryRun) db.exec('ROLLBACK');

const report = (label, rows, limit = 8) => {
  if (!rows.length) return;
  console.log(`\n${label} (${rows.length})`);
  rows.slice(0, limit).forEach((r) => console.log('  ' + r));
  if (rows.length > limit) console.log(`  … and ${rows.length - limit} more`);
};

console.log(dryRun ? '\nDRY RUN — nothing was written.' : '\nMenu imported from the printed menus.');
report('Categories created', changes.categories);
report('Items added', changes.inserted, 12);
report('Items moved to the printed category', changes.moved);
report('Prices corrected', changes.priced, 10);
report('Descriptions added', changes.described, 5);
report('Retired', changes.retired, 100);
report('Allergen lists left as the chef signed them', changes.keptSignedOff, 10);
report('Still unpriced — the printed menu gives no price', changes.unpriced, 10);
console.log('');
