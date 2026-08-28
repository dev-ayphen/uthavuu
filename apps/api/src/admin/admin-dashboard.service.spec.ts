import 'dotenv/config';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { uuidv7 } from 'uuidv7';
import { eq, inArray, sql } from 'drizzle-orm';

// These counters are GLOBAL — "how many users are there", "how many reports
// today". Every other spec in this repo shares the dev database and stays
// race-free by scoping its assertions to its own ids; a global count has no id
// to scope to, so running it against the shared database means the other Jest
// workers' inserts and deletes land inside the measurement (verified: asserting
// exact deltas there failed with drift of ±1 in both directions).
//
// So this suite gets its own database, created and migrated from zero on every
// run. That is COORDINATION.md §3's rule applied literally — "verify against a
// clean state, not your evolved local one" — and it buys a second thing worth
// having: it proves the migration series actually builds these tables from
// nothing, not just that they exist on a machine where they were added by hand.
const TEST_DATABASE = 'uthavu_admin_dashboard_test';

function testDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${TEST_DATABASE}`;
  return url.toString();
}

// The service imports the `db` singleton directly, so redirecting it is the only
// way to point it at another database. The factory reads process.env itself:
// Jest hoists jest.mock() above the imports, so it cannot close over anything
// declared in this file.
jest.mock('../db', () => {
  // requireActual with an explicit generic rather than a bare require(): the
  // factory cannot close over anything in this file (Jest hoists it above the
  // imports), and this keeps it fully typed anyway.
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');

  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_dashboard_test';

  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  missionCompletionStatuses,
  missionCompletions,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import {
  flagStatuses,
  reportCommentFlags,
  reportComments,
} from '../db/schema/comments-schema';
import { adminRoles, adminUsers } from '../db/schema/admin-schema';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  const service = new AdminDashboardService();
  const query = { timeZone: 'Asia/Kolkata' };

  const ids = {
    citizen: uuidv7(),
    admin: uuidv7(),
    category: uuidv7(),
    openStatus: uuidv7(),
    joinedStatus: uuidv7(),
    activeStatus: uuidv7(),
    verifiedStatus: uuidv7(),
    submittedFlag: uuidv7(),
    actionedFlag: uuidv7(),
    superRole: uuidv7(),
    report: uuidv7(),
    mission: uuidv7(),
    volunteer: uuidv7(),
    comment: uuidv7(),
    flag: uuidv7(),
  };

  beforeAll(async () => {
    // onnotice is silenced: `drop database if exists` emits a NOTICE on the
    // first ever run, which postgres.js otherwise prints as a wall of test noise.
    const admin = postgres(process.env.DATABASE_URL!, {
      max: 1,
      onnotice: () => {},
    });
    await admin.unsafe(`drop database if exists ${TEST_DATABASE} with (force)`);
    await admin.unsafe(`create database ${TEST_DATABASE}`);
    await admin.end();

    const migrationClient = postgres(testDatabaseUrl(), { max: 1 });
    await migrate(drizzle(migrationClient), {
      migrationsFolder: path.join(__dirname, '..', '..', 'drizzle'),
    });
    await migrationClient.end();

    // Only the lookup rows these counters touch. Deliberately not the full
    // db:seed: this suite should fail if a counter starts depending on master
    // data it never declared.
    await db
      .insert(adminRoles)
      .values({ id: ids.superRole, key: 'super_admin', label: 'Super Admin' });
    await db.insert(reportCategories).values({
      id: ids.category,
      key: 'communityHelp',
      label: 'Community Help',
      emoji: '🤝',
      defaultExpiryMinutes: 4320,
    });
    await db
      .insert(reportStatuses)
      .values({ id: ids.openStatus, key: 'open', label: 'Open' });
    await db.insert(missionVolunteerStatuses).values([
      { id: ids.joinedStatus, key: 'joined', label: 'Joined' },
      { id: ids.activeStatus, key: 'active', label: 'Active' },
    ]);
    await db
      .insert(missionCompletionStatuses)
      .values({ id: ids.verifiedStatus, key: 'verified', label: 'Verified' });
    await db.insert(flagStatuses).values([
      { id: ids.submittedFlag, key: 'submitted', label: 'Submitted' },
      { id: ids.actionedFlag, key: 'action_taken', label: 'Action Taken' },
    ]);

    await db.insert(user).values([
      {
        id: ids.citizen,
        name: 'Dash Citizen',
        email: 'citizen@test.local',
        phoneNumber: '+919000000001',
      },
      {
        id: ids.admin,
        name: 'Dash Admin',
        email: 'admin@test.local',
        phoneNumber: '+919000000002',
      },
    ]);
  });

  afterAll(async () => {
    // Close the pool this suite opened. The test database itself is left in
    // place — the next run drops and recreates it, and leaving it behind makes
    // a failed run inspectable.
    await db.$client.end();
  });

  it('starts from a genuinely empty database', async () => {
    const { generatedAt, ...counters } = await service.counters(query);

    expect(counters).toEqual({
      totalUsers: 2,
      todaysReports: 0,
      activeMissions: 0,
      completedToday: 0,
      flaggedCommentsPendingReview: 0,
      flaggedReportsPendingReview: null,
      timeZone: 'Asia/Kolkata',
    });
    expect(Number.isNaN(Date.parse(generatedAt))).toBe(false);
  });

  it('excludes admin accounts from totalUsers', async () => {
    await db
      .insert(adminUsers)
      .values({ userId: ids.admin, roleId: ids.superRole });

    // Two user rows, one of them staff. "Total Platform Users" is the community,
    // so seeding console logins must not inflate it.
    expect((await service.counters(query)).totalUsers).toBe(1);
  });

  it("counts today's reports and excludes soft-deleted ones", async () => {
    await db.insert(reports).values({
      id: ids.report,
      reporterId: ids.citizen,
      categoryId: ids.category,
      statusId: ids.openStatus,
      title: 'Dashboard fixture',
      description: 'Created by admin-dashboard.service.spec.ts',
      lat: 13.0827,
      lng: 80.2707,
      expiryAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect((await service.counters(query)).todaysReports).toBe(1);

    await db
      .update(reports)
      .set({ deletedAt: new Date() })
      .where(eq(reports.id, ids.report));
    expect((await service.counters(query)).todaysReports).toBe(0);

    await db
      .update(reports)
      .set({ deletedAt: null })
      .where(eq(reports.id, ids.report));
    expect((await service.counters(query)).todaysReports).toBe(1);
  });

  it('excludes a report created yesterday', async () => {
    const older = uuidv7();
    await db.insert(reports).values({
      id: older,
      reporterId: ids.citizen,
      categoryId: ids.category,
      statusId: ids.openStatus,
      title: 'Yesterday',
      description: 'Created 26 hours ago',
      lat: 13.0827,
      lng: 80.2707,
      expiryAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
    });

    expect((await service.counters(query)).todaysReports).toBe(1);
    await db.delete(reports).where(eq(reports.id, older));
  });

  it('counts a mission as active only once a volunteer has confirmed', async () => {
    await db.insert(missions).values({ id: ids.mission, reportId: ids.report });
    await db.insert(missionVolunteers).values({
      id: ids.volunteer,
      missionId: ids.mission,
      volunteerId: ids.citizen,
      statusId: ids.joinedStatus,
      confirmDeadline: new Date(Date.now() + 15 * 60 * 1000),
    });

    // 'joined' is inside the 15-minute confirmation window — nobody is helping yet.
    expect((await service.counters(query)).activeMissions).toBe(0);

    await db
      .update(missionVolunteers)
      .set({ statusId: ids.activeStatus })
      .where(eq(missionVolunteers.id, ids.volunteer));
    expect((await service.counters(query)).activeMissions).toBe(1);
  });

  it('stops counting an active mission once its report is soft-deleted', async () => {
    await db
      .update(reports)
      .set({ deletedAt: new Date() })
      .where(eq(reports.id, ids.report));
    expect((await service.counters(query)).activeMissions).toBe(0);

    await db
      .update(reports)
      .set({ deletedAt: null })
      .where(eq(reports.id, ids.report));
    expect((await service.counters(query)).activeMissions).toBe(1);
  });

  it('counts a completion submitted today and excludes one submitted yesterday', async () => {
    const now = new Date();
    await db.insert(missionCompletions).values({
      id: uuidv7(),
      missionId: ids.mission,
      completedById: ids.citizen,
      photoUrl: '/uploads/fixture.jpg',
      note: 'Dashboard fixture completion',
      statusId: ids.verifiedStatus,
      submittedAt: now,
      verifiedAt: now,
    });
    expect((await service.counters(query)).completedToday).toBe(1);

    await db
      .update(missionCompletions)
      .set({ submittedAt: new Date(now.getTime() - 26 * 60 * 60 * 1000) })
      .where(eq(missionCompletions.missionId, ids.mission));
    expect((await service.counters(query)).completedToday).toBe(0);
  });

  it('counts comment flags awaiting review and drops them once actioned', async () => {
    await db.insert(reportComments).values({
      id: ids.comment,
      reportId: ids.report,
      authorId: ids.citizen,
      body: 'Dashboard fixture comment',
    });
    await db.insert(reportCommentFlags).values({
      id: ids.flag,
      commentId: ids.comment,
      flaggedById: ids.citizen,
      reason: 'spam',
      statusId: ids.submittedFlag,
    });
    expect((await service.counters(query)).flaggedCommentsPendingReview).toBe(
      1,
    );

    await db
      .update(reportCommentFlags)
      .set({ statusId: ids.actionedFlag })
      .where(eq(reportCommentFlags.id, ids.flag));
    expect((await service.counters(query)).flaggedCommentsPendingReview).toBe(
      0,
    );
  });

  it('never invents a number for flagged reports', async () => {
    // The design shows a "Fake Reports" tile and nothing in this schema flags a
    // report. Null, not 0 — a 0 would read as "we checked and found none".
    expect(
      (await service.counters(query)).flaggedReportsPendingReview,
    ).toBeNull();
  });

  // Time-independent by construction. Both markers are placed relative to the
  // *requested* zone's own midnight in SQL, so the assertions hold at any wall
  // clock — an earlier version of this test hard-coded 23:30 UTC and would have
  // silently passed until 18:30 UTC and failed after it.
  //
  // This is the test that catches the bug worth catching: if the counter
  // compared a timestamptz's UTC date against the requested zone's today, a row
  // at 00:30 IST (= 19:00 UTC the previous day) would be misfiled. Running it
  // for two zones proves the parameter is honoured rather than ignored.
  it.each(['Asia/Kolkata', 'UTC'])(
    'resolves "today" in %s, not in the server\'s zone',
    async (timeZone) => {
      const localMidnight = sql`date_trunc('day', now() AT TIME ZONE ${timeZone})`;
      const justAfterMidnight = uuidv7();
      const justBeforeMidnight = uuidv7();

      const baseline = (await service.counters({ timeZone })).todaysReports;

      const fixture = {
        reporterId: ids.citizen,
        categoryId: ids.category,
        statusId: ids.openStatus,
        description: `Time zone boundary marker for ${timeZone}`,
        lat: 13.0827,
        lng: 80.2707,
        expiryAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      // 00:30 today, local to `timeZone` — inside today's boundary.
      await db.insert(reports).values({
        ...fixture,
        id: justAfterMidnight,
        title: 'Just after local midnight',
        createdAt: sql`(${localMidnight} + interval '30 minutes') AT TIME ZONE ${timeZone}`,
      });
      expect((await service.counters({ timeZone })).todaysReports).toBe(
        baseline + 1,
      );

      // 23:30 yesterday, local to `timeZone` — one hour earlier in absolute terms,
      // but on the other side of the boundary.
      await db.insert(reports).values({
        ...fixture,
        id: justBeforeMidnight,
        title: 'Just before local midnight',
        createdAt: sql`(${localMidnight} - interval '30 minutes') AT TIME ZONE ${timeZone}`,
      });
      expect((await service.counters({ timeZone })).todaysReports).toBe(
        baseline + 1,
      );

      expect((await service.counters({ timeZone })).timeZone).toBe(timeZone);

      await db
        .delete(reports)
        .where(inArray(reports.id, [justAfterMidnight, justBeforeMidnight]));
    },
  );

  it('stamps generatedAt with a parseable timestamp', async () => {
    const counters = await service.counters(query);
    expect(Number.isNaN(Date.parse(counters.generatedAt))).toBe(false);
  });
});
