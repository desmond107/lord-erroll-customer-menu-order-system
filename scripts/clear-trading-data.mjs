#!/usr/bin/env node
/**
 * Wipes every check, order, payment and service request, so the floor opens on a
 * clean slate. The menu, the staff, the tables and the settings are untouched.
 *
 *   node scripts/clear-trading-data.mjs           show what would go
 *   node scripts/clear-trading-data.mjs --yes     do it
 *
 * For clearing test service before go-live. Running it on a trading day destroys
 * that day's takings, which is why it refuses to act without --yes and takes a
 * backup of its own first.
 */
const confirmed = process.argv.includes('--yes');
process.env.DATABASE_PATH ??= './data/lord-erroll.db';
const { db, audit } = await import('../server/src/db.js');
const { runBackup } = await import('../server/src/lib/backup.js');

// Children first: order_item_modifiers hangs off order_items, which hangs off
// orders, which hang off checks.
const TABLES = ['order_item_modifiers', 'order_items', 'orders', 'payments', 'service_requests', 'checks'];

const counts = Object.fromEntries(
  TABLES.map((t) => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c])
);
const total = Object.values(counts).reduce((a, b) => a + b, 0);

console.log('\nTrading data currently held:');
for (const [table, count] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(22)} ${count}`);
}

if (total === 0) {
  console.log('\nNothing to clear.\n');
  process.exit(0);
}

if (!confirmed) {
  console.log(`\n${total} rows would be deleted permanently. Re-run with --yes to do it.\n`);
  process.exit(0);
}

const { target } = await runBackup();
console.log(`\nBacked up to ${target}`);

db.transaction(() => {
  for (const table of TABLES) db.prepare(`DELETE FROM ${table}`).run();
  // No id reset is needed: these tables key on a plain INTEGER PRIMARY KEY, so
  // SQLite reuses the numbering from 1 once the rows are gone. There is no
  // sqlite_sequence table to clear unless a table declares AUTOINCREMENT.
  audit('system', null, 'trading_data_cleared', 'system', counts);
})();

console.log(`Cleared ${total} rows. The menu, staff, tables and settings are untouched.\n`);
