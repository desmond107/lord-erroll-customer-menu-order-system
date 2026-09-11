import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, migrate, tx, setSetting, getSetting } from '../db.js';
import { config } from '../config.js';
import { categories, sections } from './menu.js';

const reset = process.argv.includes('--reset');
const out = [];

migrate();

if (reset) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM order_item_modifiers; DELETE FROM order_items; DELETE FROM orders;
    DELETE FROM payments; DELETE FROM service_requests; DELETE FROM checks;
    DELETE FROM modifier_options; DELETE FROM modifier_groups;
    DELETE FROM menu_item_variants; DELETE FROM menu_items; DELETE FROM menu_categories;
    DELETE FROM staff_sections; DELETE FROM staff;
    DELETE FROM dining_tables; DELETE FROM sections;
    DELETE FROM audit_log;
    PRAGMA foreign_keys = ON;
  `);
  // No table uses AUTOINCREMENT, so ids restart on their own once the rows are
  // gone. Touching sqlite_sequence here would throw: SQLite only creates that
  // table for AUTOINCREMENT columns, and the throw would leave the database
  // wiped but unseeded.
  out.push('Cleared existing data (--reset).');
}

const token = () => crypto.randomBytes(9).toString('base64url');
const pin = () => String(crypto.randomInt(1000, 10000));

// ------------------------------------------------------------- sections
const insSection = db.prepare(
  `INSERT INTO sections (code, name, description, sort_order) VALUES (@code, @name, @description, @sort)
   ON CONFLICT(code) DO UPDATE SET name = excluded.name, description = excluded.description`
);
const insTable = db.prepare(
  `INSERT INTO dining_tables (code, section_id, number, seats, qr_token, sort_order)
   VALUES (@code, @section_id, @number, @seats, @qr_token, @sort)
   ON CONFLICT(code) DO NOTHING`
);

const seedFloor = tx(() => {
  sections.forEach((s, i) => {
    insSection.run({ code: s.code, name: s.name, description: s.description, sort: i });
    const sectionId = db.prepare('SELECT id FROM sections WHERE code = ?').get(s.code).id;
    for (let n = 1; n <= s.tables; n++) {
      const number = String(n).padStart(2, '0');
      insTable.run({
        code: `${s.code}-${number}`,
        section_id: sectionId,
        number,
        seats: s.code === 'BAR' ? 2 : 4,
        qr_token: token(),
        sort: n,
      });
    }
  });
});
seedFloor();
out.push(
  `Floor: ${db.prepare('SELECT COUNT(*) c FROM sections').get().c} sections, ` +
    `${db.prepare('SELECT COUNT(*) c FROM dining_tables').get().c} tables.`
);

// ----------------------------------------------------------------- menu
const insCat = db.prepare(
  `INSERT INTO menu_categories (code, name, kind, station, course, note, sort_order)
   VALUES (@code, @name, @kind, @station, @course, @note, @sort)
   ON CONFLICT(code) DO UPDATE SET
     name = excluded.name, kind = excluded.kind, station = excluded.station,
     course = excluded.course, note = excluded.note, sort_order = excluded.sort_order`
);
const findItem = db.prepare('SELECT id FROM menu_items WHERE category_id = ? AND name = ?');
const insItem = db.prepare(
  `INSERT INTO menu_items
     (category_id, name, description, price_kes, price_usd, station, course, dietary, allergens,
      is_set_menu, price_review, allergen_review, sort_order)
   VALUES (@category_id, @name, @description, @price, @usd, @station, @course, @dietary, @allergens,
           @is_set, @price_review, 1, @sort)`
);
const insVariant = db.prepare(
  `INSERT INTO menu_item_variants (item_id, label, price_kes, price_review, sort_order)
   VALUES (?, ?, ?, ?, ?)`
);
const insGroup = db.prepare(
  'INSERT INTO modifier_groups (item_id, name, min_select, max_select, course, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
);
const insOption = db.prepare(
  'INSERT INTO modifier_options (group_id, name, price_delta, sort_order) VALUES (?, ?, ?, ?)'
);

let created = 0;
let reviewCount = 0;
const seedMenu = tx(() => {
  categories.forEach((cat, ci) => {
    insCat.run({
      code: cat.code,
      name: cat.name,
      kind: cat.kind,
      station: cat.station,
      course: cat.course,
      note: cat.note ?? null,
      sort: ci,
    });
    const categoryId = db.prepare('SELECT id FROM menu_categories WHERE code = ?').get(cat.code).id;

    cat.items.forEach((item, ii) => {
      if (findItem.get(categoryId, item.name)) return; // never clobber manager edits
      const hasPrice = typeof item.price === 'number';
      const needsReview = !hasPrice && !(item.variants?.length > 0);
      const info = insItem.run({
        category_id: categoryId,
        name: item.name,
        description: item.description ?? null,
        price: hasPrice ? item.price : null,
        usd: item.usd ?? null,
        station: item.station ?? cat.station,
        course: item.course ?? cat.course,
        dietary: JSON.stringify(item.dietary ?? []),
        allergens: JSON.stringify(item.allergens ?? []),
        is_set: item.isSet ? 1 : 0,
        price_review: needsReview || (item.variants?.length > 0 ? 1 : 0) ? 1 : 0,
        sort: ii,
      });
      const itemId = info.lastInsertRowid;
      created++;
      if (!hasPrice) reviewCount++;

      (item.variants ?? []).forEach((v, vi) => {
        const vHasPrice = typeof v.price === 'number';
        insVariant.run(itemId, v.label, vHasPrice ? v.price : null, vHasPrice ? 0 : 1, vi);
      });

      (item.modifiers ?? []).forEach((g, gi) => {
        const gInfo = insGroup.run(itemId, g.name, g.min ?? 0, g.max ?? 1, g.course ?? 0, gi);
        (g.options ?? []).forEach((o, oi) =>
          insOption.run(gInfo.lastInsertRowid, o.name, o.delta ?? 0, oi)
        );
      });
    });
  });
});
seedMenu();
out.push(`Menu: ${db.prepare('SELECT COUNT(*) c FROM menu_categories').get().c} categories, ${created} new items.`);
out.push(`      ${reviewCount} items have no price in the source menu and are flagged for manager review.`);

// ---------------------------------------------------------------- staff
const credentials = [];
function ensureStaff({ name, role, email, password, sections: sectionCodes }) {
  const existing = email
    ? db.prepare('SELECT id FROM staff WHERE email = ?').get(email)
    : db.prepare('SELECT id FROM staff WHERE name = ? AND role = ?').get(name, role);
  if (existing) return existing.id;

  let plainPin = null;
  let pinHash = null;
  if (!password) {
    plainPin = pin();
    pinHash = bcrypt.hashSync(plainPin, 10);
  }
  const info = db
    .prepare(
      'INSERT INTO staff (name, role, pin_hash, email, password_hash) VALUES (?, ?, ?, ?, ?)'
    )
    .run(name, role, pinHash, email ?? null, password ? bcrypt.hashSync(password, 10) : null);
  const id = info.lastInsertRowid;

  for (const code of sectionCodes ?? []) {
    const s = db.prepare('SELECT id FROM sections WHERE code = ?').get(code);
    if (s) db.prepare('INSERT OR IGNORE INTO staff_sections (staff_id, section_id) VALUES (?, ?)').run(id, s.id);
  }
  credentials.push({ name, role, login: email ?? name, secret: password ?? plainPin });
  return id;
}

const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
ensureStaff({ name: 'System Administrator', role: 'admin', email: 'admin@lord-erroll.local', password: adminPassword });
ensureStaff({ name: 'Duty Manager', role: 'manager', email: 'manager@lord-erroll.local', password: adminPassword });
ensureStaff({ name: 'Kitchen Pass', role: 'kitchen' });
ensureStaff({ name: 'Bar Pass', role: 'bar' });
ensureStaff({ name: 'Waiter — Bar Side', role: 'waiter', sections: ['BAR'] });
ensureStaff({ name: 'Waiter — West Wing', role: 'waiter', sections: ['WW'] });
ensureStaff({ name: 'Waiter — East Wing', role: 'waiter', sections: ['EW'] });
ensureStaff({ name: 'Waiter — Clairmont', role: 'waiter', sections: ['CLM'] });
ensureStaff({ name: 'Floor Supervisor', role: 'waiter', sections: ['BAR', 'WW', 'EW', 'CLM'] });

// ------------------------------------------------------------- settings
if (getSetting('restaurant') === null) {
  setSetting('restaurant', {
    name: 'The Lord Erroll',
    tagline: 'Gourmet Restaurant',
    address: '89 Ruaka Road, Nairobi',
    email: 'reservations@lord-erroll.com',
  });
}
if (getSetting('billing') === null) {
  setSetting('billing', {
    serviceChargePercent: config.serviceChargePercent,
    vatPercent: config.vatPercent,
    pricesIncludeVat: config.pricesIncludeVat,
    usdRate: config.usdRate,
  });
}
if (getSetting('service') === null) {
  setSetting('service', {
    // Colour-coded order-age thresholds on the waiter and station screens, in minutes.
    ageAmberMinutes: 10,
    ageRedMinutes: 20,
    // Unpriced items stay off the guest menu so nobody orders something we cannot bill.
    hideUnpricedFromGuests: true,
    // Mains are held for the waiter to fire unless this is switched off.
    holdMainsByDefault: true,
  });
}

console.log('\n  The Lord Erroll — database seeded\n  ' + '─'.repeat(54));
out.forEach((l) => console.log('  ' + l));
if (credentials.length) {
  console.log('\n  Sign-in credentials (shown once — store them safely):');
  for (const c of credentials) {
    console.log(`    ${c.role.padEnd(8)} ${String(c.login).padEnd(28)} ${c.secret}`);
  }
}
console.log('');
