import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { uuidv7 } from 'uuidv7';
import type { db as Db } from '../../db';
import { reportCategories, reportStatuses } from '../../db/schema/reports-schema';
import {
  missionCompletionStatuses,
  missionVolunteerStatuses,
  progressStatuses,
} from '../../db/schema/missions-schema';
import { flagStatuses } from '../../db/schema/comments-schema';
import { ticketCategories, ticketStatuses } from '../../db/schema/tickets-schema';
import { userStatuses } from '../../db/schema/user-status-schema';
import { adminPermissions, adminRolePermissions, adminRoles } from '../../db/schema/admin-schema';
import {
  adminAuditActions,
  adminAuditTargetTypes,
} from '../../db/schema/audit-schema';
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_TARGET_TYPES,
} from '../admin-audit-catalogue';
import { ADMIN_PERMISSIONS, ADMIN_ROLES, ADMIN_ROLE_PERMISSIONS } from '../admin-rbac';

/**
 * Shared setup for the admin specs.
 *
 * Every admin spec gets its OWN database, dropped and rebuilt from migration
 * 0000 on each run. That is COORDINATION.md §3 taken literally ("verify against
 * a clean state, not your evolved local one") and it is what makes these suites
 * safe to run in parallel Jest workers: admin queries are platform-wide counts
 * and unfiltered lists, so there is no id to scope an assertion to the way the
 * citizen specs do. Sharing the dev database would put other workers' inserts
 * inside every measurement.
 *
 * The rebuild also proves the migration series actually builds these tables from
 * nothing — not merely that they exist on a machine where someone added them by
 * hand.
 *
 * NOTE ON USAGE: `jest.mock('../../db', ...)` is hoisted above the imports, so
 * its factory cannot close over anything — each spec must inline its own factory
 * with its database name as a literal. This helper covers everything after that.
 */
export function specDatabaseUrl(databaseName: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function createSpecDatabase(databaseName: string): Promise<void> {
  // onnotice silenced: `drop database if exists` emits a NOTICE on a first run,
  // which postgres.js otherwise prints as a wall of test noise.
  const admin = postgres(process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {},
  });
  await admin.unsafe(`drop database if exists ${databaseName} with (force)`);
  await admin.unsafe(`create database ${databaseName}`);
  await admin.end();

  const migrationClient = postgres(specDatabaseUrl(databaseName), { max: 1 });
  await migrate(drizzle(migrationClient), {
    migrationsFolder: path.join(__dirname, '..', '..', '..', 'drizzle'),
  });
  await migrationClient.end();
}

export interface SeededLookups {
  categoryIds: Record<string, string>;
  reportStatusIds: Record<string, string>;
  volunteerStatusIds: Record<string, string>;
  progressStatusIds: Record<string, string>;
  completionStatusIds: Record<string, string>;
  flagStatusIds: Record<string, string>;
  ticketCategoryIds: Record<string, string>;
  ticketStatusIds: Record<string, string>;
  userStatusIds: Record<string, string>;
  adminRoleIds: Record<string, string>;
}

/**
 * The master data the admin surface reads.
 *
 * The audit catalogue and the RBAC catalogue are seeded from the SAME exported
 * constants the production seed uses (admin-audit-catalogue.ts, admin-rbac.ts)
 * rather than from a copy — so a spec fails if an action key is added to the
 * catalogue and the seed loop is forgotten, which is the drift those files exist
 * to prevent.
 *
 * The rest are literal rows mirroring db/seed.ts. Deliberately not an import of
 * that file: it calls process.exit() at the end, and a test suite that seeds
 * only what it declares fails honestly when a query starts depending on master
 * data nobody set up.
 */
export async function seedLookups(db: typeof Db): Promise<SeededLookups> {
  const idsFor = <T extends { key: string }>(rows: readonly T[]) =>
    Object.fromEntries(rows.map((r) => [r.key, uuidv7()]));

  const categories = [
    { key: 'medicalHelp', label: 'Medical Help', emoji: '❤️', defaultExpiryMinutes: 360, citizenSelectable: true },
    { key: 'animalRescue', label: 'Animal Rescue', emoji: '🐶', defaultExpiryMinutes: 720, citizenSelectable: true },
    { key: 'disasterRelief', label: 'Disaster Relief', emoji: '🚨', defaultExpiryMinutes: 1440, citizenSelectable: false },
  ] as const;
  const reportStatusRows = [
    { key: 'open', label: 'Open' },
    { key: 'closed', label: 'Closed' },
    { key: 'expired', label: 'Expired' },
    { key: 'completed', label: 'Completed' },
  ] as const;
  const volunteerStatusRows = [
    { key: 'joined', label: 'Joined' },
    { key: 'active', label: 'Active' },
    { key: 'released', label: 'Released' },
  ] as const;
  const progressStatusRows = [
    { key: 'on_the_way', label: 'On the Way' },
    { key: 'reached_location', label: 'Reached Location' },
    { key: 'helping_now', label: 'Helping Now' },
  ] as const;
  const completionStatusRows = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'waiting_verification', label: 'Waiting Verification' },
    { key: 'verified', label: 'Verified' },
  ] as const;
  const flagStatusRows = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'action_taken', label: 'Action Taken' },
    { key: 'dismissed', label: 'Dismissed' },
  ] as const;
  const ticketCategoryRows = [
    { key: 'bug_report', label: 'Bug Report' },
    { key: 'complaint', label: 'Complaint' },
  ] as const;
  const ticketStatusRows = [
    { key: 'new', label: 'New' },
    { key: 'in_review', label: 'In Review' },
    { key: 'resolved', label: 'Resolved' },
  ] as const;
  const userStatusRows = [
    { key: 'active', label: 'Active', sortOrder: 10 },
    { key: 'suspended', label: 'Suspended', sortOrder: 20 },
  ] as const;

  const categoryIds = idsFor(categories);
  const reportStatusIds = idsFor(reportStatusRows);
  const volunteerStatusIds = idsFor(volunteerStatusRows);
  const progressStatusIds = idsFor(progressStatusRows);
  const completionStatusIds = idsFor(completionStatusRows);
  const flagStatusIds = idsFor(flagStatusRows);
  const ticketCategoryIds = idsFor(ticketCategoryRows);
  const ticketStatusIds = idsFor(ticketStatusRows);
  const userStatusIds = idsFor(userStatusRows);
  const adminRoleIds = idsFor(ADMIN_ROLES);

  await db
    .insert(reportCategories)
    .values(categories.map((c) => ({ id: categoryIds[c.key], ...c })));
  await db
    .insert(reportStatuses)
    .values(reportStatusRows.map((s) => ({ id: reportStatusIds[s.key], ...s })));
  await db
    .insert(missionVolunteerStatuses)
    .values(volunteerStatusRows.map((s) => ({ id: volunteerStatusIds[s.key], ...s })));
  await db
    .insert(progressStatuses)
    .values(progressStatusRows.map((s) => ({ id: progressStatusIds[s.key], ...s })));
  await db
    .insert(missionCompletionStatuses)
    .values(completionStatusRows.map((s) => ({ id: completionStatusIds[s.key], ...s })));
  await db
    .insert(flagStatuses)
    .values(flagStatusRows.map((s) => ({ id: flagStatusIds[s.key], ...s })));
  await db
    .insert(ticketCategories)
    .values(ticketCategoryRows.map((c) => ({ id: ticketCategoryIds[c.key], ...c })));
  await db
    .insert(ticketStatuses)
    .values(ticketStatusRows.map((s) => ({ id: ticketStatusIds[s.key], ...s })));
  await db
    .insert(userStatuses)
    .values(userStatusRows.map((s) => ({ id: userStatusIds[s.key], ...s })));

  // From the shared catalogues — see the note above.
  await db
    .insert(adminAuditTargetTypes)
    .values(ADMIN_AUDIT_TARGET_TYPES.map((t) => ({ id: uuidv7(), ...t })));
  await db
    .insert(adminAuditActions)
    .values(ADMIN_AUDIT_ACTIONS.map((a) => ({ id: uuidv7(), ...a })));

  await db
    .insert(adminRoles)
    .values(ADMIN_ROLES.map((r) => ({ id: adminRoleIds[r.key], ...r })));
  const permissionIds = Object.fromEntries(
    ADMIN_PERMISSIONS.map((p) => [p.key, uuidv7()]),
  );
  await db
    .insert(adminPermissions)
    .values(ADMIN_PERMISSIONS.map((p) => ({ id: permissionIds[p.key], key: p.key, label: p.label })));
  await db.insert(adminRolePermissions).values(
    Object.entries(ADMIN_ROLE_PERMISSIONS).flatMap(([roleKey, permissionKeys]) =>
      permissionKeys.map((permissionKey) => ({
        id: uuidv7(),
        roleId: adminRoleIds[roleKey],
        permissionId: permissionIds[permissionKey],
      })),
    ),
  );

  return {
    categoryIds,
    reportStatusIds,
    volunteerStatusIds,
    progressStatusIds,
    completionStatusIds,
    flagStatusIds,
    ticketCategoryIds,
    ticketStatusIds,
    userStatusIds,
    adminRoleIds,
  };
}

/** An AdminIdentity for a spec, with whatever permissions the case needs. */
export function fakeAdmin(overrides: Partial<{
  userId: string;
  name: string;
  email: string;
  roleKey: string;
  roleLabel: string;
  permissions: string[];
}> = {}) {
  return {
    userId: overrides.userId ?? uuidv7(),
    name: overrides.name ?? 'Spec Admin',
    email: overrides.email ?? 'spec-admin@test.local',
    role: {
      key: overrides.roleKey ?? 'super_admin',
      label: overrides.roleLabel ?? 'Super Admin',
    },
    permissions:
      overrides.permissions ?? ADMIN_PERMISSIONS.map((p) => p.key as string),
  };
}
