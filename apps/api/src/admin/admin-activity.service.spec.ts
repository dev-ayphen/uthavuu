import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq, inArray } from 'drizzle-orm';

jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_activity_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionMessages,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { reportComments } from '../db/schema/comments-schema';
import { adminUsers } from '../db/schema/admin-schema';
import {
  adminAuditActions,
  adminAuditLogs,
  adminAuditTargetTypes,
} from '../db/schema/audit-schema';
import { AdminActivityService } from './admin-activity.service';
import { ListActivitySchema } from './dto/list-activity.dto';
import type { ListActivityDto } from './dto/list-activity.dto';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_activity_test';
const MINUTE = 60 * 1000;

// The string ADR 0010 exists to keep out of every admin payload. An activity
// feed is the likeliest place for it to slip in — a private message really does
// look like an event — so it is seeded before a single assertion runs.
const PRIVATE_CHAT_BODY =
  'PRIVATE CHAT — my exact address is 12 Nungambakkam High Road';

describe('AdminActivityService', () => {
  const service = new AdminActivityService();
  let lookups: Awaited<ReturnType<typeof seedLookups>>;

  // Super admin sees admin.action rows; ops admin does not (see
  // ActivityFeed.includesAdminActions).
  const superAdmin = fakeAdmin({ permissions: ['platform:manage'] });
  const opsAdmin = fakeAdmin({
    permissions: ['users:manage', 'reports:manage', 'comments:manage'],
  });

  const base: ListActivityDto = { limit: 50 };

  const ids = {
    alice: uuidv7(),
    bob: uuidv7(),
    carol: uuidv7(),
    staff: uuidv7(),
    departed: uuidv7(),
    apolloReport: uuidv7(),
    anonReport: uuidv7(),
    departedReport: uuidv7(),
    removedReport: uuidv7(),
    apolloMission: uuidv7(),
    removedMission: uuidv7(),
    volunteer: uuidv7(),
    removedVolunteer: uuidv7(),
    completion: uuidv7(),
    removedCompletion: uuidv7(),
    visibleComment: uuidv7(),
    removedComment: uuidv7(),
    commentOnRemovedReport: uuidv7(),
    auditVisible: uuidv7(),
    auditDeparted: uuidv7(),
  };

  // A fixed clock. Every fixture is placed at an explicit offset so the expected
  // order below is a fact about the data, not about how fast the suite ran.
  const NOW = Date.now();
  const at = (minutesAgo: number) => new Date(NOW - minutesAgo * MINUTE);

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      {
        id: ids.alice,
        name: 'Alice R',
        email: 'alice@test.local',
        phoneNumber: '+919000000001',
        createdAt: at(100),
      },
      {
        id: ids.bob,
        name: 'Bob V',
        email: 'bob@test.local',
        phoneNumber: '+919000000002',
        createdAt: at(95),
      },
      {
        id: ids.carol,
        name: 'Carol C',
        email: 'carol@test.local',
        phoneNumber: '+919000000003',
        createdAt: at(90),
      },
      {
        id: ids.staff,
        name: 'Staff Person',
        email: 'staff@test.local',
        phoneNumber: '+919000000004',
        createdAt: at(85),
      },
      {
        id: ids.departed,
        name: 'Departed Reporter',
        email: 'gone@test.local',
        phoneNumber: '+919000000005',
        createdAt: at(80),
      },
    ]);
    await db.insert(adminUsers).values({
      userId: ids.staff,
      roleId: lookups.adminRoleIds['super_admin'],
    });

    const report = {
      categoryId: lookups.categoryIds['medicalHelp'],
      statusId: lookups.reportStatusIds['open'],
      description: 'Activity fixture',
      lat: 13.0827,
      lng: 80.2707,
      expiryAt: new Date(NOW + 60 * MINUTE),
    };

    await db.insert(reports).values([
      {
        ...report,
        id: ids.apolloReport,
        reporterId: ids.alice,
        title: 'Blood needed at Apollo',
        createdAt: at(70),
      },
      // US-4 privacy: the reporter is a real, existing account that asked not to
      // be named.
      {
        ...report,
        id: ids.anonReport,
        reporterId: ids.carol,
        title: 'Anonymous request',
        anonymous: true,
        createdAt: at(65),
      },
      {
        ...report,
        id: ids.departedReport,
        reporterId: ids.departed,
        title: 'Departed reporter request',
        createdAt: at(60),
      },
      {
        ...report,
        id: ids.removedReport,
        reporterId: ids.alice,
        title: 'REMOVED REQUEST',
        createdAt: at(55),
        deletedAt: new Date(),
      },
    ]);

    await db.insert(missions).values([
      { id: ids.apolloMission, reportId: ids.apolloReport, createdAt: at(51) },
      {
        id: ids.removedMission,
        reportId: ids.removedReport,
        createdAt: at(51),
      },
    ]);
    await db.insert(missionVolunteers).values([
      {
        id: ids.volunteer,
        missionId: ids.apolloMission,
        volunteerId: ids.bob,
        statusId: lookups.volunteerStatusIds['active'],
        confirmDeadline: new Date(NOW + 15 * MINUTE),
        joinedAt: at(50),
      },
      {
        id: ids.removedVolunteer,
        missionId: ids.removedMission,
        volunteerId: ids.bob,
        statusId: lookups.volunteerStatusIds['active'],
        confirmDeadline: new Date(NOW + 15 * MINUTE),
        joinedAt: at(49),
      },
    ]);

    await db.insert(reportComments).values([
      {
        id: ids.visibleComment,
        reportId: ids.apolloReport,
        authorId: ids.carol,
        body: 'On my way with water',
        createdAt: at(45),
      },
      // Taken down by a moderator. The row survives (the flag reads through it)
      // but it is gone from the public thread.
      {
        id: ids.removedComment,
        reportId: ids.apolloReport,
        authorId: ids.alice,
        body: 'REMOVED COMMENT BODY',
        createdAt: at(40),
        deletedAt: new Date(),
      },
      {
        id: ids.commentOnRemovedReport,
        reportId: ids.removedReport,
        authorId: ids.carol,
        body: 'COMMENT ON A REMOVED REPORT',
        createdAt: at(35),
      },
    ]);

    await db.insert(missionCompletions).values([
      {
        id: ids.completion,
        missionId: ids.apolloMission,
        completedById: ids.bob,
        photoUrl: '/uploads/after.jpg',
        note: 'Delivered',
        statusId: lookups.completionStatusIds['verified'],
        submittedAt: at(30),
      },
      {
        id: ids.removedCompletion,
        missionId: ids.removedMission,
        completedById: ids.bob,
        photoUrl: '/uploads/x.jpg',
        note: 'On a removed report',
        statusId: lookups.completionStatusIds['verified'],
        submittedAt: at(29),
      },
    ]);

    await db.insert(missionMessages).values({
      id: uuidv7(),
      missionId: ids.apolloMission,
      senderId: ids.bob,
      body: PRIVATE_CHAT_BODY,
      createdAt: at(25),
    });

    const [hideAction] = await db
      .select({ id: adminAuditActions.id, label: adminAuditActions.label })
      .from(adminAuditActions)
      .where(eq(adminAuditActions.key, 'report.hide'));
    const [reportTarget] = await db
      .select({ id: adminAuditTargetTypes.id })
      .from(adminAuditTargetTypes)
      .where(eq(adminAuditTargetTypes.key, 'report'));

    await db.insert(adminAuditLogs).values([
      {
        id: ids.auditVisible,
        actorUserId: ids.staff,
        actorEmail: 'staff@test.local',
        actorName: 'Staff Person',
        actorRoleKey: 'super_admin',
        actionId: hideAction.id,
        targetTypeId: reportTarget.id,
        targetId: ids.removedReport,
        targetLabel: 'REMOVED REQUEST',
        createdAt: at(20),
      },
      {
        // The post-SET-NULL state: the admin's account is gone, the snapshot
        // columns are what keep the row readable (ADR 0012).
        id: ids.auditDeparted,
        actorUserId: null,
        actorEmail: 'departed-admin@test.local',
        actorName: 'Departed Admin',
        actorRoleKey: 'ops_admin',
        actionId: hideAction.id,
        targetTypeId: reportTarget.id,
        targetId: ids.apolloReport,
        targetLabel: 'Blood needed at Apollo',
        createdAt: at(15),
      },
    ]);

    // Delete the account LAST, so the FK's SET NULL is genuinely exercised
    // rather than simulated by inserting a null. Their report survives with no
    // reporter; their own `user.joined` event ceases to exist, which is correct
    // — the row it was derived from is gone.
    await db.delete(user).where(eq(user.id, ids.departed));

    expect(hideAction.label.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it('merges six tables into one stream, newest first', async () => {
    const feed = await service.list(base, superAdmin);

    expect(feed.items.map((i) => [i.type, i.targetLabel])).toEqual([
      ['admin.action', 'Blood needed at Apollo'],
      ['admin.action', 'REMOVED REQUEST'],
      ['mission.completed', 'Blood needed at Apollo'],
      ['comment.posted', 'On my way with water'],
      ['mission.accepted', 'Blood needed at Apollo'],
      ['report.created', 'Departed reporter request'],
      ['report.created', 'Anonymous request'],
      ['report.created', 'Blood needed at Apollo'],
      ['user.joined', 'Carol C'],
      ['user.joined', 'Bob V'],
      ['user.joined', 'Alice R'],
    ]);
    expect(feed.nextCursor).toBeUndefined();
  });

  it('places a signup at the instant it happened, not the server offset', async () => {
    // `user.created_at` is the ONE source column without a time zone (Better
    // Auth owns it). If the `AT TIME ZONE 'UTC'` cast in usersJoined() were
    // wrong, this event would land hours away and the merge order above would
    // be quietly wrong rather than failing.
    const feed = await service.list(base, superAdmin);
    const alice = feed.items.find((i) => i.targetLabel === 'Alice R');

    expect(new Date(alice!.occurredAt).getTime()).toBe(at(100).getTime());
  });

  it('never surfaces a soft-deleted report, or anything hanging off one', async () => {
    const feed = await service.list(base, opsAdmin);
    const serialised = JSON.stringify(feed);

    // The report itself, its volunteer, its completion and its comment all
    // vanish together — data.md invariant 1.
    expect(serialised).not.toContain('COMMENT ON A REMOVED REPORT');
    expect(feed.items.some((i) => i.id === ids.removedVolunteer)).toBe(false);
    expect(feed.items.some((i) => i.id === ids.removedCompletion)).toBe(false);
    expect(
      feed.items.some(
        (i) => i.type === 'report.created' && i.targetId === ids.removedReport,
      ),
    ).toBe(false);
  });

  it('never surfaces a moderator-removed comment', async () => {
    const feed = await service.list(base, superAdmin);
    expect(JSON.stringify(feed)).not.toContain('REMOVED COMMENT BODY');
    expect(feed.items.some((i) => i.id === ids.removedComment)).toBe(false);
  });

  it('never includes Mission Chat (ADR 0010)', async () => {
    // Whole-payload serialisation, not a key-by-key check: the failure being
    // guarded against is a field somebody adds later.
    for (const admin of [superAdmin, opsAdmin]) {
      const feed = await service.list(base, admin);
      expect(JSON.stringify(feed)).not.toContain(PRIVATE_CHAT_BODY);
      expect(JSON.stringify(feed)).not.toContain('Nungambakkam');
    }
  });

  it('keeps "anonymous" and "deleted account" as two different facts', async () => {
    const feed = await service.list(base, superAdmin);
    const byLabel = (label: string) =>
      feed.items.find(
        (i) => i.type === 'report.created' && i.targetLabel === label,
      )!;

    // The account exists. The reporter asked not to be named, so no name is
    // selected out of the database at all.
    const anon = byLabel('Anonymous request');
    expect(anon.actor).toBeNull();
    expect(anon.actorAnonymous).toBe(true);
    expect(anon.actorDeleted).toBe(false);
    expect(JSON.stringify(anon)).not.toContain('Carol C');

    // The account is gone. Not anonymous — they never asked for that.
    const departed = byLabel('Departed reporter request');
    expect(departed.actor).toBeNull();
    expect(departed.actorAnonymous).toBe(false);
    expect(departed.actorDeleted).toBe(true);

    // And a report with neither flag names its reporter normally, which is what
    // makes the two assertions above mean something.
    const plain = byLabel('Blood needed at Apollo');
    expect(plain.actor).toEqual({ id: ids.alice, name: 'Alice R' });
    expect(plain.actorAnonymous).toBe(false);
    expect(plain.actorDeleted).toBe(false);
  });

  it('excludes staff from user.joined, matching totalUsers', async () => {
    const feed = await service.list(base, superAdmin);
    const joins = feed.items.filter((i) => i.type === 'user.joined');

    expect(joins).toHaveLength(3);
    expect(JSON.stringify(joins)).not.toContain('Staff Person');
  });

  it('hides admin actions from an admin who cannot read the audit log', async () => {
    const ops = await service.list(base, opsAdmin);
    expect(ops.includesAdminActions).toBe(false);
    expect(ops.items.some((i) => i.type === 'admin.action')).toBe(false);

    // `GET /admin/audit-logs` is platform:manage. Folding audit rows into a
    // route open to any admin would hand ops admins the trail through the side
    // door, so the feed says which version it is rather than silently differing.
    const superFeed = await service.list(base, superAdmin);
    expect(superFeed.includesAdminActions).toBe(true);
    expect(
      superFeed.items.filter((i) => i.type === 'admin.action'),
    ).toHaveLength(2);
  });

  it('names what an admin actually did, and keeps a departed admin readable', async () => {
    const feed = await service.list(base, superAdmin);
    const actions = feed.items.filter((i) => i.type === 'admin.action');

    expect(actions[0].detail?.key).toBe('report.hide');
    // The label comes from the seeded catalogue, so assert it is real rather
    // than pinning the wording an admin can see change under db:seed.
    expect(actions[0].detail?.label.length).toBeGreaterThan(0);
    // Snapshot name, null id — the shape AdminAuditService.list() also returns.
    expect(actions[0].actor).toEqual({ id: null, name: 'Departed Admin' });
    expect(actions[0].actorDeleted).toBe(true);

    expect(actions[1].actor).toEqual({ id: ids.staff, name: 'Staff Person' });
    expect(actions[1].actorDeleted).toBe(false);

    // An audit row is NOT filtered by its target's current state: this entry
    // records hiding a report that is now soft-deleted, and suppressing it would
    // thin the trail exactly where it matters.
    expect(actions[1].targetLabel).toBe('REMOVED REQUEST');
    expect(actions[1].targetType).toBe('report');

    // Everything that is not an admin action carries no detail.
    for (const item of feed.items.filter((i) => i.type !== 'admin.action')) {
      expect(item.detail).toBeNull();
    }
  });

  it('rejects a cursor it did not issue', async () => {
    await expect(
      service.list({ limit: 5, cursor: 'not-a-cursor' }, superAdmin),
    ).rejects.toMatchObject({ status: 400 });

    // Well-formed base64url, wrong contents — must not fall through to a 500 or
    // silently restart at page one.
    const bogus = Buffer.from(JSON.stringify({ nope: 1 })).toString(
      'base64url',
    );
    await expect(
      service.list({ limit: 5, cursor: bogus }, superAdmin),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('caps limit at the DTO, so one request cannot ask for everything', () => {
    expect(ListActivitySchema.parse({}).limit).toBe(20);
    expect(ListActivitySchema.parse({ limit: '5' }).limit).toBe(5);
    expect(() => ListActivitySchema.parse({ limit: 101 })).toThrow();
  });

  describe('pagination', () => {
    // Two events at the SAME instant, in two different tables. Ties are
    // ordinary once six tables are merged, and a cursor keyed on time alone
    // would drop or repeat one of these at a page boundary.
    const tieA = uuidv7();
    const tieB = uuidv7();

    beforeAll(async () => {
      const sameInstant = at(46);
      await db.insert(reportComments).values({
        id: tieA,
        reportId: ids.apolloReport,
        authorId: ids.carol,
        body: 'Tie A',
        createdAt: sameInstant,
      });
      await db.insert(reports).values({
        id: tieB,
        reporterId: ids.alice,
        categoryId: lookups.categoryIds['animalRescue'],
        statusId: lookups.reportStatusIds['open'],
        title: 'Tie B',
        description: 'Same instant as Tie A, different table',
        lat: 13.0827,
        lng: 80.2707,
        expiryAt: new Date(NOW + 60 * MINUTE),
        createdAt: sameInstant,
      });
    });

    afterAll(async () => {
      await db.delete(reportComments).where(eq(reportComments.id, tieA));
      await db.delete(reports).where(inArray(reports.id, [tieB]));
    });

    it('walks the whole stream one row at a time with no gaps and no repeats', async () => {
      const whole = await service.list({ limit: 100 }, superAdmin);
      const expected = whole.items.map((i) => `${i.type}:${i.id}`);
      expect(expected.length).toBeGreaterThan(10);

      const seen: string[] = [];
      let cursor: string | undefined;
      // limit 1 is the harshest setting: every single page boundary, including
      // the one inside the tie, has to be right.
      for (let guard = 0; guard <= expected.length + 1; guard += 1) {
        const page: ListActivityDto = {
          limit: 1,
          ...(cursor ? { cursor } : {}),
        };
        const feed = await service.list(page, superAdmin);
        seen.push(...feed.items.map((i) => `${i.type}:${i.id}`));
        cursor = feed.nextCursor;
        if (cursor === undefined) break;
      }

      expect(seen).toEqual(expected);
      expect(new Set(seen).size).toBe(seen.length);
      expect(cursor).toBeUndefined();
    });

    it('returns both sides of a same-instant tie, exactly once each', async () => {
      const whole = await service.list({ limit: 100 }, superAdmin);
      const tied = whole.items.filter((i) => i.id === tieA || i.id === tieB);

      expect(tied).toHaveLength(2);
      expect(tied[0].occurredAt).toBe(tied[1].occurredAt);
    });

    it('stops offering a cursor on the last page', async () => {
      const whole = await service.list({ limit: 100 }, superAdmin);

      // Exactly as many rows as exist: there is no next page, so there must be
      // no cursor — an endpoint that always returns one paginates forever.
      const exact = await service.list(
        { limit: whole.items.length },
        superAdmin,
      );
      expect(exact.items).toHaveLength(whole.items.length);
      expect(exact.nextCursor).toBeUndefined();

      const short = await service.list(
        { limit: whole.items.length - 1 },
        superAdmin,
      );
      expect(short.nextCursor).toBeDefined();
    });
  });
});
