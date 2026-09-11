#!/usr/bin/env node
/**
 * DEMO DATA ONLY — fills in placeholder prices so the whole platform can be
 * walked through before the real menu prices are transcribed.
 *
 * Every price written here keeps `price_review = 1`, so each one still appears
 * in Admin → Menu → Needs review as unconfirmed. Nothing here is a real Lord
 * Erroll price and none of it should reach a paying guest.
 *
 *   node scripts/demo-prices.js          apply demo prices
 *   node scripts/demo-prices.js --clear  remove them again
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new Database(path.join(root, 'data', 'lord-erroll.db'));

if (process.argv.includes('--clear')) {
  const items = db.prepare('UPDATE menu_items SET price_kes = NULL WHERE price_review = 1').run().changes;
  const variants = db.prepare('UPDATE menu_item_variants SET price_kes = NULL WHERE price_review = 1').run().changes;
  console.log(`Cleared demo prices from ${items} items and ${variants} variants.`);
  process.exit(0);
}

// Placeholder bands by category, in KES.
const BANDS = {
  OYSTERS: [2400, 4200], STARTERS: [1800, 2900], SOUPS: [1200, 1600], SALADS: [1600, 2400],
  GRILL: [3800, 9800], OCEAN: [3600, 8600], SIDES: [700, 1100], GREENFIRE: [2200, 3200],
  DESSERTS: [1200, 1900], CHAMPAGNE: [9000, 68000], WHITE_CONNOISSEUR: [4800, 9500],
  ROSE: [4200, 7800], RED_CONNOISSEUR: [5200, 24000], SOFT: [300, 700],
  SIGNATURES: [1400, 1900], CLASSICS: [1200, 1700], BUBBLES: [1500, 2200], SETMENUS: [6500, 6850],
};

const round = (n) => Math.round(n / 50) * 50;
const pick = (band, i, total) => round(band[0] + ((band[1] - band[0]) * (total > 1 ? i / (total - 1) : 0.4)));

const items = db
  .prepare(
    `SELECT i.id, i.name, i.price_kes, c.code AS cat FROM menu_items i
     JOIN menu_categories c ON c.id = i.category_id WHERE i.active = 1 ORDER BY c.sort_order, i.sort_order`
  )
  .all();

const byCat = items.reduce((acc, it) => ((acc[it.cat] ??= []).push(it), acc), {});
const setItemPrice = db.prepare('UPDATE menu_items SET price_kes = ? WHERE id = ?');
const setVariantPrice = db.prepare('UPDATE menu_item_variants SET price_kes = ? WHERE id = ?');
const variantsOf = db.prepare('SELECT id, label FROM menu_item_variants WHERE item_id = ? ORDER BY sort_order');

let itemCount = 0;
let variantCount = 0;

const apply = db.transaction(() => {
  for (const [cat, list] of Object.entries(byCat)) {
    const band = BANDS[cat];
    if (!band) continue;
    list.forEach((item, i) => {
      const base = pick(band, i, list.length);
      const variants = variantsOf.all(item.id);

      if (variants.length) {
        variants.forEach((v) => {
          const label = v.label.toLowerCase();
          let price = base;
          if (label.includes('glass')) price = round(base / 5.5);
          else if (label.includes('12')) price = round(base * 1.85);
          else if (label.includes('1 litre')) price = round(base * 1.6);
          setVariantPrice.run(price, v.id);
          variantCount++;
        });
      } else if (item.price_kes === null) {
        setItemPrice.run(base, item.id);
        itemCount++;
      }
    });
  }
});
apply();

console.log(`Demo prices applied to ${itemCount} items and ${variantCount} variants.`);
console.log('All of them remain flagged as unconfirmed in Admin → Menu → Needs review.');
