import fs from 'node:fs';
import path from 'node:path';
import { db, audit } from '../db.js';
import { config } from '../config.js';

/**
 * Local snapshot of the whole database. SQLite's own backup API is used so the
 * copy is consistent even while the floor is writing orders into it.
 * Nothing leaves the building — the destination is a local path, so point
 * BACKUP_DIR at an external drive or a NAS mount.
 */
export async function runBackup() {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(config.backupDir, `lord-erroll-${stamp}.db`);

  await db.backup(target);
  prune();

  const size = fs.statSync(target).size;
  audit('system', null, 'backup', 'system', { target, bytes: size });
  return { target, bytes: size };
}

function prune() {
  const cutoff = Date.now() - config.backupRetentionDays * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(config.backupDir)) {
    if (!name.startsWith('lord-erroll-') || !name.endsWith('.db')) continue;
    const file = path.join(config.backupDir, name);
    if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
  }
}

/** Runs a snapshot at 04:00, the quietest hour on the floor. */
export function scheduleNightlyBackup() {
  const tick = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(4, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next - now;
    setTimeout(async () => {
      try {
        const { target } = await runBackup();
        console.log(`[backup] wrote ${target}`);
      } catch (err) {
        console.error('[backup] failed:', err.message);
      }
      tick();
    }, delay).unref?.();
  };
  tick();
}

if (process.argv.includes('--once')) {
  runBackup()
    .then(({ target, bytes }) => {
      console.log(`Backup written: ${target} (${(bytes / 1024).toFixed(0)} KB)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Backup failed:', err.message);
      process.exit(1);
    });
}
