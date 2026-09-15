/**
 * Wipe every row a citizen or an admin CREATED, keep everything the product
 * needs to boot.
 *
 * WHY THIS EXISTS
 * ───────────────────────────────────────────────────────────────────────────
 * A dev database accumulates the exhaust of its own test suites. Ours had 883
 * reports, of which 432 were literally titled "Test report", 216 "Need
 * groceries urgently" and 83 "Visibility probe request" — Maestro runs, the
 * SEC-REG/SEC-FU security regressions, the photo-verification E2E scripts and
 * a concurrency probe, all hitting the real API and therefore all landing in
 * the real tables. 149 of 258 users were OTP accounts named after their own
 * phone number.
 *
 * None of that is a bug: the admin console's counters are honest SQL over real
 * rows (admin-dashboard.service.ts), so they faithfully reported a database
 * full of test exhaust. The fix is the data, not the query. After this runs
 * every tile reads zero, and the next number that appears is one a real person
 * produced through the mobile app.
 *
 * WHAT IT KEEPS, AND WHY THAT LIST IS NOT NEGOTIABLE
 * ───────────────────────────────────────────────────────────────────────────
 * Lookup tables (`report_statuses`, `flag_statuses`, `mission_*_statuses`,
 * `ticket_*`, `sponsor_statuses`, `broadcast_*`, `progress_statuses`,
 * `photo_verification_statuses`, `user_statuses`, `community_update_statuses`)
 * are referenced by FK from the tables below — dropping them would make the API
 * unable to insert anything at all. `report_categories`, `platform_settings`
 * and the admin RBAC tables are configuration an admin curated, not activity.
 * The two rows in `admin_users` and their `user` / `account` / `session` rows
 * stay so whoever runs this is still signed into the console afterwards.
 *
 * SAFETY
 * ───────────────────────────────────────────────────────────────────────────
 *   - Hard-blocked when NODE_ENV=production. There is no override flag, on
 *     purpose: the same pattern ADR 0007 uses for the dev OTP fallback.
 *   - Dry-run by default. It prints what it would delete and exits 0 unless
 *     `--yes` is passed, so a mistyped command cannot destroy anything.
 *   - Take a dump first anyway:
 *       docker compose exec -T postgres pg_dump -U uthavu -d uthavu_dev \
 *         --format=custom > before-reset.dump
 *
 * Run it with:  pnpm --filter api db:reset-dev -- --yes
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './index';

/**
 * Emptied wholesale. Ordering does not matter — a single TRUNCATE statement
 * over the whole set resolves the FKs between them in one pass.
 *
 * Deliberately WITHOUT `CASCADE`. Cascade would silently reach any table
 * somebody adds later that references these, and "silently" is the wrong
 * failure mode for a destructive script: a missing table here should stop the
 * run with Postgres naming it, so this list gets updated on purpose.
 */
const TRUNCATE_TABLES = [
  // Citizen activity — the reports graph and everything hanging off it.
  'alerts',
  'mission_completions',
  'mission_messages',
  'mission_volunteers',
  'missions',
  'photo_uploads',
  'report_comment_flags',
  'report_comments',
  'report_photos',
  'report_saves',
  'reports',
  'support_ticket_messages',
  'support_tickets',
  'devices',

  // Admin-authored test content. Also exhaust: ten seeded sponsors, ten
  // placements and a broadcast nobody sent. Keeping them would leave the
  // Monetization and Announcements sections telling the same fiction the
  // Dashboard just stopped telling.
  'broadcasts',
  'community_updates',
  'sponsor_placements',
  'sponsors',

  // The audit trail of admin actions taken ON the rows above. Its targets are
  // about to stop existing, so every entry would dangle. Audit logs are
  // append-only in normal operation — this script is the one exception, and it
  // only exists for a dev database.
  'admin_audit_logs',

  // Suspension records and in-flight OTP challenges. Both are per-user state
  // for users that are about to be deleted.
  'user_account_status',
  'verification',
] as const;

/** Counted before and after so the run reports what it actually did. */
const REPORTED_TABLES = [
  ...TRUNCATE_TABLES,
  'user',
  'session',
  'account',
] as const;

async function countRows(table: string): Promise<number> {
  const rows = await db.execute<{ count: string }>(
    sql`select count(*) as count from ${sql.identifier(table)}`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function snapshot(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    REPORTED_TABLES.map(async (t) => [t, await countRows(t)] as const),
  );
  return Object.fromEntries(entries);
}

export async function resetDevData({
  confirmed,
  nodeEnv = process.env.NODE_ENV,
}: {
  confirmed: boolean;
  nodeEnv?: string;
}): Promise<Record<string, number>> {
  if (nodeEnv === 'production') {
    throw new Error(
      'Refusing to run reset-dev-data with NODE_ENV=production. This script deletes ' +
        'every report, mission, comment and citizen account in the database.',
    );
  }

  const before = await snapshot();

  if (!confirmed) {
    console.log('DRY RUN — nothing was deleted. Re-run with --yes to apply.\n');
    console.log('Would empty:');
    for (const table of TRUNCATE_TABLES) {
      console.log(`  ${table.padEnd(26)} ${before[table]} row(s)`);
    }
    console.log(
      `\nWould delete non-staff rows from "user" (cascading to session/account).\n` +
        `  user   ${before.user} total, ${before.user - (await countStaff())} to delete\n` +
        `  KEPT:  lookup tables, report_categories, platform_settings, admin RBAC, admin logins`,
    );
    return before;
  }

  // One transaction: a half-reset — reports gone, the users who filed them
  // still present — is a worse state than either end of the operation.
  await db.transaction(async (tx) => {
    // RESTART IDENTITY is a no-op for our UUIDv7 keys but costs nothing and is
    // correct if a serial column is ever added.
    await tx.execute(
      sql`truncate table ${sql.join(
        TRUNCATE_TABLES.map((t) => sql.identifier(t)),
        sql`, `,
      )} restart identity`,
    );

    // Staff survive. `admin_users.user_id` is the only definition of "staff"
    // this codebase has — the same predicate AdminDashboardService uses to keep
    // two console logins from inflating the community's size by two forever.
    await tx.execute(
      sql`delete from "user" where id not in (select user_id from admin_users)`,
    );
  });

  return snapshot();
}

async function countStaff(): Promise<number> {
  return countRows('admin_users');
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes');
  const before = await snapshot();
  const after = await resetDevData({ confirmed });

  if (!confirmed) return;

  console.log('Reset complete.\n');
  console.log('table                        before     after');
  console.log('───────────────────────────────────────────────');
  for (const table of REPORTED_TABLES) {
    const changed = before[table] !== after[table];
    console.log(
      `${table.padEnd(28)} ${String(before[table]).padStart(6)}    ${String(
        after[table],
      ).padStart(6)}${changed ? '' : '   (kept)'}`,
    );
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
