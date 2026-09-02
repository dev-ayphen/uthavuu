import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_impact_stories_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportPhotos, reports } from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionMessages,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { AdminImpactStoriesService } from './admin-impact-stories.service';
import type { ListImpactStoriesDto } from './dto/list-impact-stories.dto';
import { createSpecDatabase, seedLookups } from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_impact_stories_test';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The string ADR 0010 exists to keep out of every admin payload. Seeded in the
// TOP-LEVEL beforeAll deliberately: admin-reports.service.spec.ts seeds its
// equivalent inside the `findOne` describe, which is why ADR 0010 has to record
// "list() is not covered" as an honest limit of that test. Seeding it here means
// both endpoints run against a database that really does contain private chat.
const PRIVATE_CHAT_BODY =
  'PRIVATE CHAT — my exact address is 12 Nungambakkam High Road';

describe('AdminImpactStoriesService', () => {
  const service = new AdminImpactStoriesService();
  let lookups: Awaited<ReturnType<typeof seedLookups>>;

  const reporterId = uuidv7();
  const helperId = uuidv7();
  const anonReporterId = uuidv7();
  const departedReporterId = uuidv7();
  const departedHelperId = uuidv7();
  const departedVolunteerId = uuidv7();

  // Typed against the DTO so a filter the schema does not accept is a compile
  // error here, not a silent no-op at runtime.
  const base: ListImpactStoriesDto = { page: 1, limit: 50 };

  const reportIds = {
    apollo: uuidv7(),
    anonymous: uuidv7(),
    orphaned: uuidv7(),
    removed: uuidv7(),
    noMission: uuidv7(),
    noCompletion: uuidv7(),
  };
  const storyIds = {
    apollo: uuidv7(),
    anonymous: uuidv7(),
    orphaned: uuidv7(),
    removed: uuidv7(),
  };

  const NOW = Date.now();
  const at = (offsetMs: number) => new Date(NOW + offsetMs);

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      {
        id: reporterId,
        name: 'Hari S',
        email: 'hari@test.local',
        phoneNumber: '+919000000001',
      },
      {
        id: helperId,
        name: 'Priya K',
        email: 'priya@test.local',
        phoneNumber: '+919000000002',
      },
      {
        id: anonReporterId,
        name: 'Anon Poster',
        email: 'anon@test.local',
        phoneNumber: '+919000000003',
      },
      {
        id: departedReporterId,
        name: 'Gone Reporter',
        email: 'gone-r@test.local',
        phoneNumber: '+919000000004',
      },
      {
        id: departedHelperId,
        name: 'Gone Helper',
        email: 'gone-h@test.local',
        phoneNumber: '+919000000005',
      },
      {
        id: departedVolunteerId,
        name: 'Gone Volunteer',
        email: 'gone-v@test.local',
        phoneNumber: '+919000000006',
      },
    ]);

    const reportFixture = (
      over: Partial<typeof reports.$inferInsert> & { id: string },
    ): typeof reports.$inferInsert => ({
      reporterId,
      categoryId: lookups.categoryIds.medicalHelp,
      statusId: lookups.reportStatusIds.completed,
      title: 'fixture',
      description: 'fixture description',
      lat: 13.08,
      lng: 80.27,
      expiryAt: at(-HOUR),
      ...over,
    });

    await db.insert(reports).values([
      reportFixture({
        id: reportIds.apollo,
        title: 'Blood needed at Apollo',
        description: 'O negative, two units.',
        createdAt: at(-3 * HOUR),
      }),
      reportFixture({
        id: reportIds.anonymous,
        title: 'Anonymous plea for shelter',
        // Mentions Apollo on purpose: `q` searches the TITLE only, so a hit here
        // would prove the filter had quietly widened to the description.
        description: 'Needed a van near Apollo Hospital.',
        reporterId: anonReporterId,
        anonymous: true,
        categoryId: lookups.categoryIds.animalRescue,
        createdAt: at(-10 * DAY),
      }),
      reportFixture({
        id: reportIds.orphaned,
        title: 'Author and helper both gone',
        reporterId: departedReporterId,
        createdAt: at(-5 * DAY),
      }),
      reportFixture({
        id: reportIds.removed,
        title: 'Removed by moderator',
        createdAt: at(-4 * HOUR),
        deletedAt: at(-HOUR),
        deletedBy: reporterId,
      }),
      // No mission, no completion — the case invariant 6 is about. It must not
      // appear, and must not break a query that drives from completions.
      reportFixture({
        id: reportIds.noMission,
        title: 'Still open, nobody came',
        statusId: lookups.reportStatusIds.open,
        expiryAt: at(HOUR),
        createdAt: at(-30 * MINUTE),
      }),
      // A mission with a volunteer but no completion: help was accepted and
      // never finished, so there is no story yet.
      reportFixture({
        id: reportIds.noCompletion,
        title: 'Accepted but unfinished',
        statusId: lookups.reportStatusIds.open,
        expiryAt: at(HOUR),
        createdAt: at(-45 * MINUTE),
      }),
    ]);

    await db.insert(reportPhotos).values([
      // Two photos on one report, one minute apart: `beforePhotoUrl` must be the
      // first, deterministically.
      {
        id: uuidv7(),
        reportId: reportIds.apollo,
        url: '/uploads/before-1.jpg',
        createdAt: at(-3 * HOUR),
      },
      {
        id: uuidv7(),
        reportId: reportIds.apollo,
        url: '/uploads/before-2.jpg',
        createdAt: at(-3 * HOUR + MINUTE),
      },
      {
        id: uuidv7(),
        reportId: reportIds.removed,
        url: '/uploads/before-removed.jpg',
        createdAt: at(-4 * HOUR),
      },
      // reportIds.anonymous has NO photos -> beforePhotoUrl must be null, not ''.
    ]);

    const missionIds = {
      apollo: uuidv7(),
      anonymous: uuidv7(),
      orphaned: uuidv7(),
      removed: uuidv7(),
      noCompletion: uuidv7(),
    };
    await db.insert(missions).values([
      { id: missionIds.apollo, reportId: reportIds.apollo },
      { id: missionIds.anonymous, reportId: reportIds.anonymous },
      { id: missionIds.orphaned, reportId: reportIds.orphaned },
      { id: missionIds.removed, reportId: reportIds.removed },
      { id: missionIds.noCompletion, reportId: reportIds.noCompletion },
    ]);

    await db.insert(missionVolunteers).values([
      {
        id: uuidv7(),
        missionId: missionIds.apollo,
        volunteerId: helperId,
        statusId: lookups.volunteerStatusIds.active,
        confirmDeadline: at(-3 * HOUR + 20 * MINUTE),
        joinedAt: at(-3 * HOUR + 5 * MINUTE),
        confirmedAt: at(-3 * HOUR + 6 * MINUTE),
      },
      {
        id: uuidv7(),
        missionId: missionIds.apollo,
        volunteerId: departedVolunteerId,
        statusId: lookups.volunteerStatusIds.released,
        confirmDeadline: at(-3 * HOUR + 25 * MINUTE),
        joinedAt: at(-3 * HOUR + 10 * MINUTE),
        releasedAt: at(-3 * HOUR + 25 * MINUTE),
        releaseReason: 'timeout',
      },
      {
        id: uuidv7(),
        missionId: missionIds.noCompletion,
        volunteerId: helperId,
        statusId: lookups.volunteerStatusIds.active,
        confirmDeadline: at(-30 * MINUTE),
        joinedAt: at(-40 * MINUTE),
      },
    ]);

    await db.insert(missionCompletions).values([
      {
        id: storyIds.apollo,
        missionId: missionIds.apollo,
        completedById: helperId,
        photoUrl: '/uploads/after-apollo.jpg',
        note: 'Two units donated, patient stable.',
        statusId: lookups.completionStatusIds.verified,
        // Report raised 3h ago, help landed 2h ago -> 60 minutes.
        submittedAt: at(-2 * HOUR),
        verifiedAt: at(-2 * HOUR),
      },
      {
        id: storyIds.anonymous,
        missionId: missionIds.anonymous,
        completedById: helperId,
        photoUrl: '/uploads/after-anon.jpg',
        note: 'Shelter arranged.',
        statusId: lookups.completionStatusIds.verified,
        // Raised 10 DAYS ago, completed 1 day ago. The gap between those two is
        // what makes the from/to tests below able to tell which column they hit.
        submittedAt: at(-DAY),
        verifiedAt: at(-DAY),
      },
      {
        id: storyIds.orphaned,
        missionId: missionIds.orphaned,
        completedById: departedHelperId,
        photoUrl: '/uploads/after-orphaned.jpg',
        note: 'Handled by a neighbour.',
        statusId: lookups.completionStatusIds.verified,
        submittedAt: at(-5 * DAY + 15 * MINUTE),
        // Never verified — the nullable half of the pair.
        verifiedAt: null,
      },
      {
        id: storyIds.removed,
        missionId: missionIds.removed,
        completedById: helperId,
        photoUrl: '/uploads/after-removed.jpg',
        note: 'Should not be reachable.',
        statusId: lookups.completionStatusIds.verified,
        submittedAt: at(-2 * HOUR),
        verifiedAt: at(-2 * HOUR),
      },
    ]);

    // ADR 0010. Present in the database, on a mission whose story BOTH endpoints
    // return, and it must never appear in either payload.
    await db.insert(missionMessages).values({
      id: uuidv7(),
      missionId: missionIds.apollo,
      senderId: helperId,
      body: PRIVATE_CHAT_BODY,
    });

    // Three accounts go away; SET NULL keeps the community history.
    await db.delete(user).where(eq(user.id, departedReporterId));
    await db.delete(user).where(eq(user.id, departedHelperId));
    await db.delete(user).where(eq(user.id, departedVolunteerId));
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe('ADR 0010 — Mission Chat is never projected', () => {
    // Whole-payload serialisation, not a key-by-key check: the failure mode
    // being guarded against is a field somebody adds later, and only this shape
    // of assertion survives that.
    it('list() NEVER exposes Mission Chat', async () => {
      const serialised = JSON.stringify(
        await service.list({ ...base, limit: 100 }),
      );

      expect(serialised).not.toContain('Nungambakkam');
      expect(serialised).not.toContain('PRIVATE CHAT');
      expect(serialised.toLowerCase()).not.toContain('message');
    });

    it('findOne() NEVER exposes Mission Chat', async () => {
      const serialised = JSON.stringify(await service.findOne(storyIds.apollo));

      expect(serialised).not.toContain('Nungambakkam');
      expect(serialised).not.toContain('PRIVATE CHAT');
      expect(serialised.toLowerCase()).not.toContain('message');
    });

    it('the message it is asserting the absence of really is in the database', async () => {
      // Without this the two tests above would pass against an empty table,
      // which is the way an absence assertion silently stops meaning anything.
      const rows = await db.select().from(missionMessages);
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe(PRIVATE_CHAT_BODY);
    });
  });

  describe('list', () => {
    it('returns the standard pagination envelope', async () => {
      const result = await service.list({ ...base, limit: 2 });

      expect(Object.keys(result)).toEqual(['items', 'pagination']);
      // Four completions exist; the one on the soft-deleted report is excluded.
      expect(result.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(result.items).toHaveLength(2);
    });

    it('produces exactly the agreed list-item shape', async () => {
      const { items } = await service.list({ ...base, q: 'Apollo' });

      expect(Object.keys(items[0]).sort()).toEqual(
        [
          'afterPhotoUrl',
          'beforePhotoUrl',
          'category',
          'durationMinutes',
          'helper',
          'helperDeleted',
          'id',
          'reportId',
          'reportTitle',
          'reporter',
          'reporterAnonymous',
          'reporterDeleted',
          'status',
          'submittedAt',
          'verifiedAt',
        ].sort(),
      );
      expect(items[0]).toEqual({
        id: storyIds.apollo,
        reportId: reportIds.apollo,
        reportTitle: 'Blood needed at Apollo',
        category: { key: 'medicalHelp', label: 'Medical Help' },
        status: { key: 'verified', label: 'Verified' },
        beforePhotoUrl: '/uploads/before-1.jpg',
        afterPhotoUrl: '/uploads/after-apollo.jpg',
        submittedAt: at(-2 * HOUR).toISOString(),
        verifiedAt: at(-2 * HOUR).toISOString(),
        durationMinutes: 60,
        reporter: { id: reporterId, name: 'Hari S' },
        reporterDeleted: false,
        reporterAnonymous: false,
        helper: { id: helperId, name: 'Priya K' },
        helperDeleted: false,
      });
    });

    it('excludes a report with no mission and a mission with no completion', async () => {
      const { items } = await service.list({ ...base, limit: 100 });
      const titles = items.map((i) => i.reportTitle);

      expect(titles).not.toContain('Still open, nobody came');
      expect(titles).not.toContain('Accepted but unfinished');
    });

    it('hides the story of a soft-deleted report, with no way to ask for it', async () => {
      // Invariant 1, and there is deliberately no includeDeleted flag to flip —
      // the DTO does not have one. `base` is typed, so adding one here would not
      // compile.
      const { items, pagination } = await service.list({ ...base, limit: 100 });

      expect(pagination.total).toBe(3);
      expect(items.map((i) => i.id)).not.toContain(storyIds.removed);
    });

    it('orders newest story first', async () => {
      const { items } = await service.list({ ...base, limit: 100 });

      expect(items.map((i) => i.id)).toEqual([
        storyIds.apollo, // submitted 2 hours ago
        storyIds.anonymous, // submitted 1 day ago
        storyIds.orphaned, // submitted 5 days ago
      ]);
    });

    it('filters by category', async () => {
      const result = await service.list({
        ...base,
        categoryKey: 'animalRescue',
      });

      expect(result.pagination.total).toBe(1);
      expect(result.items[0].id).toBe(storyIds.anonymous);
    });

    it('searches the report title, and only the title', async () => {
      const hits = await service.list({ ...base, q: 'Apollo' });

      // "Apollo Hospital" is in the anonymous report's DESCRIPTION. One hit, not
      // two, is what proves `q` did not widen.
      expect(hits.pagination.total).toBe(1);
      expect(hits.items[0].id).toBe(storyIds.apollo);
      // ilike, so case does not matter to someone typing into a search box.
      expect(
        (await service.list({ ...base, q: 'apollo' })).pagination.total,
      ).toBe(1);
    });

    it('treats a literal % as text, not as "match everything"', async () => {
      expect((await service.list({ ...base, q: '%' })).pagination.total).toBe(
        0,
      );
    });

    it('bounds on when the story happened, not on when the request was raised', async () => {
      // The anonymous story's report was created 10 days ago and completed 1 day
      // ago. A `from` of 2 days ago must include it — if this filtered on
      // reports.created_at it would return only the Apollo story.
      const recent = await service.list({
        ...base,
        from: at(-2 * DAY),
        limit: 100,
      });
      expect(recent.items.map((i) => i.id)).toEqual([
        storyIds.apollo,
        storyIds.anonymous,
      ]);

      const old = await service.list({ ...base, to: at(-3 * DAY), limit: 100 });
      expect(old.items.map((i) => i.id)).toEqual([storyIds.orphaned]);

      const window = await service.list({
        ...base,
        from: at(-6 * DAY),
        to: at(-2 * DAY),
        limit: 100,
      });
      expect(window.items.map((i) => i.id)).toEqual([storyIds.orphaned]);
    });

    it('reports a null before-photo rather than an empty string when there is none', async () => {
      const { items } = await service.list({
        ...base,
        categoryKey: 'animalRescue',
      });

      expect(items[0].beforePhotoUrl).toBeNull();
      expect(items[0].afterPhotoUrl).toBe('/uploads/after-anon.jpg');
    });

    it('keeps "the account is gone" and "they posted anonymously" as different facts', async () => {
      const { items } = await service.list({ ...base, limit: 100 });
      const byId = new Map(items.map((i) => [i.id, i]));

      // Anonymous, account intact: identity is still shown to staff (matching the
      // provisional call in AdminReportsService.reporterProjection, open
      // question 2) and the flag is what labels it.
      const anonymous = byId.get(storyIds.anonymous)!;
      expect(anonymous.reporterAnonymous).toBe(true);
      expect(anonymous.reporterDeleted).toBe(false);
      expect(anonymous.reporter).toEqual({
        id: anonReporterId,
        name: 'Anon Poster',
      });

      // Account gone, never anonymous: no identity exists to show anyone. If
      // these two collapsed into one field the console would label a deleted
      // user as anonymous, or worse, the reverse.
      const orphaned = byId.get(storyIds.orphaned)!;
      expect(orphaned.reporterDeleted).toBe(true);
      expect(orphaned.reporterAnonymous).toBe(false);
      expect(orphaned.reporter).toBeNull();
    });

    it('marks a helper who deleted their account, and keeps the story', async () => {
      const { items } = await service.list({ ...base, q: 'Author and helper' });

      expect(items[0].helper).toBeNull();
      expect(items[0].helperDeleted).toBe(true);
      // Invariant 2: the completion is community history and survives.
      expect(items[0].afterPhotoUrl).toBe('/uploads/after-orphaned.jpg');
      expect(items[0].verifiedAt).toBeNull();
    });

    it('computes duration from report creation to completion', async () => {
      const { items } = await service.list({ ...base, limit: 100 });
      const byId = new Map(items.map((i) => [i.id, i]));

      expect(byId.get(storyIds.apollo)!.durationMinutes).toBe(60);
      expect(byId.get(storyIds.anonymous)!.durationMinutes).toBe(9 * 24 * 60);
      expect(byId.get(storyIds.orphaned)!.durationMinutes).toBe(15);
    });

    it('pages without repeating or dropping a story', async () => {
      const first = await service.list({ ...base, page: 1, limit: 2 });
      const second = await service.list({ ...base, page: 2, limit: 2 });
      const ids = [...first.items, ...second.items].map((i) => i.id);

      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe('findOne', () => {
    it('produces exactly the agreed detail shape', async () => {
      const story = await service.findOne(storyIds.apollo);

      expect(Object.keys(story).sort()).toEqual(
        [
          'afterPhotoUrl',
          'beforePhotoUrl',
          'category',
          'durationMinutes',
          'helper',
          'helperDeleted',
          'id',
          'note',
          'photos',
          'reportDescription',
          'reportId',
          'reportTitle',
          'reporter',
          'reporterAnonymous',
          'reporterDeleted',
          'status',
          'submittedAt',
          'verifiedAt',
          'volunteers',
        ].sort(),
      );
      expect(story).toMatchObject({
        id: storyIds.apollo,
        note: 'Two units donated, patient stable.',
        reportDescription: 'O negative, two units.',
        photos: ['/uploads/before-1.jpg', '/uploads/before-2.jpg'],
        durationMinutes: 60,
      });
    });

    it('returns the volunteer roster, oldest first, with deleted volunteers kept', async () => {
      const story = await service.findOne(storyIds.apollo);

      expect(story.volunteers).toEqual([
        {
          userId: helperId,
          name: 'Priya K',
          status: { key: 'active', label: 'Active' },
        },
        // SET NULL took the identity; the participation stays. A null id must
        // never be paired with a leftover name.
        {
          userId: null,
          name: null,
          status: { key: 'released', label: 'Released' },
        },
      ]);
    });

    it('returns an empty photo list rather than null when a report had none', async () => {
      const story = await service.findOne(storyIds.anonymous);

      expect(story.photos).toEqual([]);
      expect(story.beforePhotoUrl).toBeNull();
    });

    it('404s with a code for an unknown id', async () => {
      await expect(service.findOne(uuidv7())).rejects.toMatchObject({
        response: { code: 'IMPACT_STORY_NOT_FOUND' },
      });
    });

    it('404s for the story of a soft-deleted report', async () => {
      // Same rule as the list, on purpose: the frozen response shape has no
      // field in which to say "the underlying report was removed", so rendering
      // it anyway would be a silent half-truth. Reviewing a removal is
      // GET /admin/reports/:id, which does reach deleted rows.
      await expect(service.findOne(storyIds.removed)).rejects.toMatchObject({
        response: { code: 'IMPACT_STORY_NOT_FOUND' },
      });
    });
  });
});
