#!/usr/bin/env node
/**
 * Sets a manager or admin password from the command line.
 *
 *   node scripts/set-staff-password.mjs admin@lord-erroll.local 'new-password'
 *   ADMIN_PASSWORD='new-password' node scripts/set-staff-password.mjs --admin
 *   node scripts/set-staff-password.mjs --list
 *
 * This is the only way back in when nobody knows the admin password: every other
 * route to it requires already being signed in as an admin. Run it on the machine
 * holding the database, as someone who already has access to that machine.
 */
process.env.DATABASE_PATH ??= './data/lord-erroll.db';
const { db, audit } = await import('../server/src/db.js');
const { hashPassword } = await import('../server/src/lib/auth.js');

const args = process.argv.slice(2);

if (args.includes('--list') || args.length === 0) {
  const rows = db
    .prepare(
      `SELECT id, name, role, email, (password_hash IS NOT NULL) AS has_password
       FROM staff WHERE active = 1 AND role IN ('manager','admin') ORDER BY role, id`
    )
    .all();
  console.log('\nAccounts that sign in with an email address and a password:\n');
  rows.forEach((r) => console.log(`  ${String(r.id).padStart(3)}  ${r.role.padEnd(8)} ${(r.email ?? '—').padEnd(32)} ${r.name}`));
  console.log('\nUsage: node scripts/set-staff-password.mjs <email> <password>\n');
  process.exit(0);
}

const targetAdmin = args.includes('--admin');
const email = targetAdmin ? null : args[0];
const password = targetAdmin ? process.env.ADMIN_PASSWORD : args[1];

if (!password) {
  console.error('\nNo password given. Pass it as the second argument, or set ADMIN_PASSWORD with --admin.\n');
  process.exit(1);
}

const staff = targetAdmin
  ? db.prepare("SELECT * FROM staff WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1").get()
  : db.prepare('SELECT * FROM staff WHERE lower(email) = lower(?) AND active = 1').get(email);

if (!staff) {
  console.error(`\nNo active account found for ${targetAdmin ? 'the admin role' : email}. Run with --list to see them.\n`);
  process.exit(1);
}

// Said out loud rather than enforced: a short password on a LAN-only server is a
// different risk from the same password on one facing the internet.
if (password.length < 12) {
  console.warn(
    `\n  ⚠ That password is ${password.length} characters. On an internet-facing server, use a long one.\n`
  );
}

db.prepare("UPDATE staff SET password_hash = ? WHERE id = ?").run(hashPassword(password), staff.id);
audit('staff', staff.id, 'password_set', 'cli');

console.log(`\nPassword set for ${staff.name} (${staff.role}, ${staff.email}).`);
console.log('Any session they already had stays valid until it expires.\n');
