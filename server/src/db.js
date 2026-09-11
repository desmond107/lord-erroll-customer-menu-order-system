import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);

// WAL keeps reads fast while the floor is writing orders, and survives power cuts
// far better than the default rollback journal.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function migrate() {
  const schemaPath = new URL('./schema.sql', import.meta.url);
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  addMissingColumns();
}

/**
 * `CREATE TABLE IF NOT EXISTS` leaves an existing table alone, so a column added
 * to the schema never reaches a database that already has the table. These run
 * the missing ALTERs instead, which SQLite has no IF NOT EXISTS form for.
 */
function addMissingColumns() {
  const additions = [
    ['menu_items', 'allergen_signed_by', 'TEXT'],
    ['menu_items', 'allergen_signed_at', 'TEXT'],
  ];
  for (const [table, column, type] of additions) {
    const present = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!present) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Wrap a function so every statement inside runs in one transaction. */
export const tx = (fn) => db.transaction(fn);

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, JSON.stringify(value));
}

export function audit(entity, entityId, action, actor, payload) {
  db.prepare(
    'INSERT INTO audit_log (entity, entity_id, action, actor, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(entity, entityId ?? null, action, actor ?? 'system', payload ? JSON.stringify(payload) : null);
}
