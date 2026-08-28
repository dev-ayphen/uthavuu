import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

jest.mock('../db', () => {
  const postgresModule = jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<typeof import('drizzle-orm/postgres-js')>(
    'drizzle-orm/postgres-js',
  );
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_reports_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportPhotos, reports } from '../db/schema/reports-schema';
import { reportComments } from '../db/schema/comments-schema';
import {
  missionCompletions,
  missionMessages,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { AdminReportsService } from './admin-reports.service';
import type { ListAdminReportsDto } from './dto/list-admin-reports.dto';
import { createSpecDatabase, seedLookups } from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_reports_test';
const HOUR = 60 * 60 * 1000;

describe('AdminReportsService', () => {
  const service = new AdminReportsService();
  let lookups: Awaited<ReturnType<typeof seedLookups>>;

  const reporterId = uuidv7();
  const volunteerId = uuidv7();
  const anonReporterId = uuidv7();
  const departingId = uuidv7();

  // Typed against the DTO so a filter value the schema does not accept is a
  // compile error here, not a silent no-op at runtime.
  const base: ListAdminReportsDto = {
    page: 1,
    limit: 50,
    status: 'all',
    includeDeleted: false,
    sort: 'createdAt',
    order: 'desc',
  };

  const ids = {
    open: uuidv7(),
    expired: uuidv7(),
    closed: uuidv7(),
    completed: uuidv7(),
    deleted: uuidv7(),
    anonymous: uuidv7(),
    orphaned: uuidv7(),
  };

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      { id: reporterId, name: 'Hari S', email: 'hari@test.local', phoneNumber: '+919000000001', district: 'Chennai' },
      { id: volunteerId, name: 'Priya K', email: 'priya@test.local', phoneNumber: '+919000000002' },
      { id: anonReporterId, name: 'Anon Poster', email: 'anon@test.local', phoneNumber: '+919000000003' },
      { id: departingId, name: 'Departing', email: 'departing@test.local', phoneNumber: '+919000000004' },
    ]);

    const fixture = (
      over: Partial<typeof reports.$inferInsert> & { id: string },
    ): typeof reports.$inferInsert => ({
      reporterId,
      categoryId: lookups.categoryIds.medicalHelp,
      statusId: lookups.reportStatusIds.open,
      title: 'fixture',
      description: 'fixture description',
      lat: 13.08,
      lng: 80.27,
      expiryAt: new Date(Date.now() + HOUR),
      ...over,
    });

    await db.insert(reports).values([
      fixture({ id: ids.open, title: 'Blood needed at Apollo', description: 'O negative', landmark: 'Apollo Hospital' }),
      fixture({ id: ids.expired, title: 'Stray dog injured', expiryAt: new Date(Date.now() - HOUR) }),
      fixture({ id: ids.closed, title: 'Cancelled request', statusId: lookups.reportStatusIds.closed, closedAt: new Date() }),
      fixture({ id: ids.completed, title: 'Rescued the puppy', statusId: lookups.reportStatusIds.completed, expiryAt: new Date(Date.now() - HOUR) }),
      fixture({ id: ids.deleted, title: 'Removed by moderator', deletedAt: new Date(), deletedBy: reporterId }),
      fixture({ id: ids.anonymous, title: 'Anonymous plea', reporterId: anonReporterId, anonymous: true, phoneVisible: false }),
      fixture({ id: ids.orphaned, title: 'Author left', reporterId: departingId, categoryId: lookups.categoryIds.animalRescue }),
    ]);

    // The reporter's account goes away; SET NULL keeps the report.
    await db.delete(user).where(eq(user.id, departingId));
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe('list', () => {
    it('returns the standard pagination envelope', async () => {
      const result = await service.list({ ...base, limit: 3 });
      expect(Object.keys(result)).toEqual(['items', 'pagination']);
      // 7 rows minus the soft-deleted one, which is hidden by default.
      expect(result.pagination).toEqual({ page: 1, limit: 3, total: 6, totalPages: 2 });
      expect(result.items).toHaveLength(3);
    });

    it('requires no geography at all — the citizen endpoint cannot do this', async () => {
      // ListReportsDto requires lat+lng+radiusKm+categoryKey. This is the whole
      // reason gap R-1 needed a new endpoint rather than a new parameter.
      const result = await service.list(base);
      expect(result.pagination.total).toBe(6);
    });

    it('reports derived status, and shows where the stored column disagrees', async () => {
      const { items } = await service.list({ ...base, limit: 100 });
      const byId = new Map(items.map((i) => [i.id, i]));

      expect(byId.get(ids.open)!.status).toBe('open');
      expect(byId.get(ids.expired)!.status).toBe('expired');
      // The bug this endpoint exists to avoid: the database still says 'open'.
      expect(byId.get(ids.expired)!.storedStatus).toBe('open');
      expect(byId.get(ids.closed)!.status).toBe('closed');
      expect(byId.get(ids.completed)!.status).toBe('completed');
    });

    it('filters by every effective status, including one nothing ever writes', async () => {
      const totalFor = async (status: ListAdminReportsDto['status']) =>
        (await service.list({ ...base, status })).pagination.total;

      // 3, not 4: the fourth stored-'open' row is soft-deleted, and 'deleted'
      // outranks every other derived value.
      expect(await totalFor('open')).toBe(3);
      // Would be 0 forever if this filtered on status_id.
      expect(await totalFor('expired')).toBe(1);
      expect(await totalFor('closed')).toBe(1);
      expect(await totalFor('completed')).toBe(1);
    });

    it('hides soft-deleted reports by default and reveals them on request', async () => {
      expect((await service.list(base)).pagination.total).toBe(6);
      expect((await service.list({ ...base, includeDeleted: true })).pagination.total).toBe(7);

      const onlyDeleted = await service.list({ ...base, status: 'deleted' });
      expect(onlyDeleted.pagination.total).toBe(1);
      expect(onlyDeleted.items[0].id).toBe(ids.deleted);
    });

    it('filters by category, reporter and date range', async () => {
      expect((await service.list({ ...base, categoryKey: 'animalRescue' })).pagination.total).toBe(1);
      expect((await service.list({ ...base, reporterId: anonReporterId })).pagination.total).toBe(1);
      expect((await service.list({ ...base, from: new Date(Date.now() + HOUR) })).pagination.total).toBe(0);
    });

    it('searches title, description and landmark', async () => {
      expect((await service.list({ ...base, q: 'Apollo' })).pagination.total).toBe(1);
      expect((await service.list({ ...base, q: 'O negative' })).pagination.total).toBe(1);
      expect((await service.list({ ...base, q: 'puppy' })).pagination.total).toBe(1);
    });

    it('treats a literal % as text, not as "match everything"', async () => {
      // likePattern escapes LIKE metacharacters. Without it the console's search
      // box would silently return the whole table for a single stray %.
      expect((await service.list({ ...base, q: '%' })).pagination.total).toBe(0);
    });

    it('sorts by the requested column in the requested direction', async () => {
      const asc = await service.list({ ...base, sort: 'title', order: 'asc', limit: 100 });
      const titles = asc.items.map((i) => i.title);
      expect(titles).toEqual([...titles].sort());

      const desc = await service.list({ ...base, sort: 'title', order: 'desc', limit: 100 });
      expect(desc.items.map((i) => i.title)).toEqual([...titles].reverse());
    });

    it('keeps a report whose reporter deleted their account, marked deleted not anonymous', async () => {
      const { items } = await service.list({ ...base, q: 'Author left' });
      expect(items[0].reporter).toMatchObject({
        id: null,
        deleted: true,
        anonymousToPublic: false,
        name: null,
      });
    });

    it('flags an anonymous report as anonymous-to-public rather than silently redacting', async () => {
      const { items } = await service.list({ ...base, q: 'Anonymous plea' });
      expect(items[0].anonymous).toBe(true);
      expect(items[0].reporter.anonymousToPublic).toBe(true);
      expect(items[0].reporter.deleted).toBe(false);
    });
  });

  describe('findOne', () => {
    beforeAll(async () => {
      await db.insert(reportPhotos).values([
        { id: uuidv7(), reportId: ids.completed, url: '/uploads/before.jpg' },
      ]);
      const missionId = uuidv7();
      await db.insert(missions).values({ id: missionId, reportId: ids.completed });
      await db.insert(missionVolunteers).values({
        id: uuidv7(),
        missionId,
        volunteerId,
        statusId: lookups.volunteerStatusIds.active,
        confirmDeadline: new Date(Date.now() + 15 * 60 * 1000),
        confirmedAt: new Date(),
      });
      await db.insert(missionCompletions).values({
        id: uuidv7(),
        missionId,
        completedById: volunteerId,
        photoUrl: '/uploads/after.jpg',
        note: 'Puppy is safe and with a vet.',
        statusId: lookups.completionStatusIds.verified,
        submittedAt: new Date(),
        verifiedAt: new Date(),
      });
      await db.insert(reportComments).values({
        id: uuidv7(),
        reportId: ids.completed,
        authorId: reporterId,
        body: 'Thank you!',
      });
      // Present in the database, and it must never appear in a projection.
      await db.insert(missionMessages).values({
        id: uuidv7(),
        missionId,
        senderId: volunteerId,
        body: 'PRIVATE CHAT — my exact address is 12 Nungambakkam High Road',
      });
    });

    it('returns photos, the volunteer roster and the completion', async () => {
      const report = await service.findOne(ids.completed);

      expect(report.photos).toHaveLength(1);
      expect(report.volunteers).toHaveLength(1);
      expect(report.volunteers[0]).toMatchObject({
        userId: volunteerId,
        name: 'Priya K',
        status: { key: 'active', label: 'Active' },
      });
      expect(report.completion).toMatchObject({
        note: 'Puppy is safe and with a vet.',
        photoUrl: '/uploads/after.jpg',
        status: 'verified',
        completedBy: { id: volunteerId, name: 'Priya K' },
      });
      expect(report.counts).toMatchObject({ photos: 1, comments: 1, volunteers: 1, activeVolunteers: 1 });
    });

    it('NEVER exposes Mission Chat', async () => {
      // The owner's ruling: chat stays private, no admin access, no exceptions.
      // Serialising the whole projection is the assertion that survives someone
      // later adding a field — a key-by-key check would not.
      const serialised = JSON.stringify(await service.findOne(ids.completed));

      expect(serialised).not.toContain('Nungambakkam');
      expect(serialised).not.toContain('PRIVATE CHAT');
      expect(serialised.toLowerCase()).not.toContain('message');
    });

    it('marks a past-expiry report expired and says so explicitly', async () => {
      const report = await service.findOne(ids.expired);
      expect(report.status).toBe('expired');
      expect(report.storedStatus).toBe('open');
      expect(report.expired).toBe(true);
    });

    it('404s with a code for an unknown id', async () => {
      await expect(service.findOne(uuidv7())).rejects.toMatchObject({
        response: { code: 'REPORT_NOT_FOUND' },
      });
    });

    it('reaches a soft-deleted report and names who removed it', async () => {
      // Detail is deliberately not filtered by deletedAt: reviewing a removal
      // decision requires being able to open the thing that was removed.
      const report = await service.findOne(ids.deleted);
      expect(report.status).toBe('deleted');
      expect(report.deletedAt).not.toBeNull();
      expect(report.deletedBy).toMatchObject({ id: reporterId });
    });
  });
});
