import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every test file gets its own throwaway database, so the tests never touch
// the restaurant's own data and can run in parallel.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-erroll-test-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret';
process.env.SERVICE_CHARGE_PERCENT = '10';
process.env.VAT_PERCENT = '16';
process.env.PRICES_INCLUDE_VAT = 'true';

const { db, migrate, setSetting } = await import('../src/db.js');
migrate();

setSetting('service', {
  ageAmberMinutes: 10,
  ageRedMinutes: 20,
  hideUnpricedFromGuests: true,
  holdMainsByDefault: true,
});
setSetting('billing', {
  serviceChargePercent: 10,
  vatPercent: 16,
  pricesIncludeVat: true,
  usdRate: 129,
});

/** A minimal floor and menu: one section, one table, a starter, a main, a drink. */
export function seedFixture() {
  db.exec(`
    DELETE FROM order_item_modifiers; DELETE FROM order_items; DELETE FROM orders;
    DELETE FROM payments; DELETE FROM checks; DELETE FROM service_requests;
    DELETE FROM modifier_options; DELETE FROM modifier_groups;
    DELETE FROM menu_item_variants; DELETE FROM menu_items; DELETE FROM menu_categories;
    DELETE FROM dining_tables; DELETE FROM sections;
  `);

  const section = db
    .prepare("INSERT INTO sections (code, name) VALUES ('WW', 'West Wing')")
    .run().lastInsertRowid;
  const tableId = db
    .prepare("INSERT INTO dining_tables (code, section_id, number, qr_token) VALUES ('WW-01', ?, '01', 'tok-ww-01')")
    .run(section).lastInsertRowid;

  const foodCat = db
    .prepare("INSERT INTO menu_categories (code, name, kind, station, course) VALUES ('STARTERS', 'Starters', 'food', 'kitchen', 1)")
    .run().lastInsertRowid;
  const mainCat = db
    .prepare("INSERT INTO menu_categories (code, name, kind, station, course) VALUES ('GRILL', 'Grill', 'food', 'kitchen', 2)")
    .run().lastInsertRowid;
  const barCat = db
    .prepare("INSERT INTO menu_categories (code, name, kind, station, course) VALUES ('COCKTAILS', 'Cocktails', 'drink', 'bar', 0)")
    .run().lastInsertRowid;

  const item = (categoryId, name, price, station, course) =>
    db
      .prepare(
        `INSERT INTO menu_items (category_id, name, price_kes, station, course, price_review)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(categoryId, name, price, station, course, price === null ? 1 : 0).lastInsertRowid;

  db.exec("DELETE FROM staff_sections; DELETE FROM staff;");
  const waiterId = db
    .prepare("INSERT INTO staff (name, role, pin_hash) VALUES ('Test Waiter', 'waiter', 'x')")
    .run().lastInsertRowid;
  db.prepare('INSERT INTO staff_sections (staff_id, section_id) VALUES (?, ?)').run(waiterId, section);

  return {
    sectionId: section,
    tableId,
    waiterId,
    table: db
      .prepare('SELECT t.*, s.code AS section_code FROM dining_tables t JOIN sections s ON s.id = t.section_id WHERE t.id = ?')
      .get(tableId),
    starter: item(foodCat, 'Tuna Tartare', 1800, 'kitchen', 1),
    main: item(mainCat, 'Dry Aged Ribeye', 4650, 'kitchen', 2),
    drink: item(barCat, 'Highlander', 1500, 'bar', 0),
    unpriced: item(mainCat, 'Market Fish', null, 'kitchen', 2),
  };
}

export { db };
