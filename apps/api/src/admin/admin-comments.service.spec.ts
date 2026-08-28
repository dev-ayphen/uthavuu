import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// Hoisted above the imports — the database name must be a literal here.
// See testing/admin-spec-db.ts.
jest.mock('../db', () => {
  const postgresModule = jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<typeof import('drizzle-orm/postgres-js')>(
    'drizzle-orm/postgres-js',
  );
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_comments_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import {
  reportCommentFlags,
  reportComments,
} from '../db/schema/comments-schema';
import { adminAuditLogs } from '../db/schema/audit-schema';
import { CommentsService } from '../comments/comments.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminCommentsService } from './admin-comments.service';
import { ListAdminCommentsSchema } from './dto/list-admin-comments.dto';
import { ListFlaggedCommentsSchema } from './dto/list-flagged-comments.dto';
import { ResolveFlagSchema } from './dto/resolve-flag.dto';
import { ModerateCommentSchema } from './dto/moderate-comment.dto';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
  type SeededLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_comments_test';

describe('AdminCommentsService', () => {
  const auditService = new AdminAuditService();
  const service = new AdminCommentsService(auditService);
  const citizenComments = new CommentsService();

  const adminId = uuidv7();
  const admin = fakeAdmin({ userId: adminId, email: 'admin@uthavu.org' });
  const meta = { ipAddress: '10.0.0.1', userAgent: 'jest' };

  const reporterId = uuidv7();
  const commenterId = uuidv7();
  const flaggerId = uuidv7();

  let lookups: SeededLookups;
  let reportId: string;
  let commentId: string;

  const auditRows = () =>
    db.select().from(adminAuditLogs).orderBy(adminAuditLogs.createdAt);

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      { id: adminId, name: 'Super Admin', email: 'admin@uthavu.org' },
      { id: reporterId, name: 'Hari', email: 'hari@test.local', phoneNumber: '+919000000101' },
      { id: commenterId, name: 'Priya', email: 'priya@test.local', phoneNumber: '+919000000102' },
      { id: flaggerId, name: 'Ravi', email: 'ravi@test.local', phoneNumber: '+919000000103' },
    ]);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(async () => {
    reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId: lookups.categoryIds.medicalHelp,
      statusId: lookups.reportStatusIds.open,
      title: 'Need help at the bus stand',
      description: 'Fixture',
      lat: 13.08,
      lng: 80.27,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });

    commentId = uuidv7();
    await db.insert(reportComments).values({
      id: commentId,
      reportId,
      authorId: commenterId,
      body: 'I am on my way now',
    });
  });

  afterEach(async () => {
    // Cascades to comments and flags.
    await db.delete(reports).where(eq(reports.id, reportId));
    await db.delete(adminAuditLogs);
  });

  describe('DTO validation', () => {
    const parse = (q: Record<string, unknown>) => ListAdminCommentsSchema.parse(q);

    it('defaults to page 1, 25 per page, live comments only', () => {
      expect(parse({})).toMatchObject({ page: 1, limit: 25, includeRemoved: false });
    });

    it('reads "false" as false — the trap z.coerce.boolean() falls into', () => {
      // Boolean("false") === true. If these were coerced, every "off" toggle the
      // console sends would silently switch the filter ON.
      expect(parse({ includeRemoved: 'false' }).includeRemoved).toBe(false);
      expect(parse({ includeRemoved: 'true' }).includeRemoved).toBe(true);
      expect(parse({ flagged: 'false' }).flagged).toBe(false);
      expect(parse({ flagged: 'true' }).flagged).toBe(true);
    });

    it('leaves `flagged` absent when unset, rather than defaulting to "unflagged only"', () => {
      expect(parse({}).flagged).toBeUndefined();
    });

    it('rejects a limit above the cap, a bad date, and an inverted range', () => {
      expect(ListAdminCommentsSchema.safeParse({ limit: '9999' }).success).toBe(false);
      expect(ListAdminCommentsSchema.safeParse({ from: 'not-a-date' }).success).toBe(false);
      // Cross-field validation lives in the DTO, not the service (CLAUDE.md).
      expect(
        ListAdminCommentsSchema.safeParse({ from: '2026-08-28', to: '2026-08-01' }).success,
      ).toBe(false);
      expect(ListAdminCommentsSchema.safeParse({ includeRemoved: 'yes' }).success).toBe(false);
    });

    it('refuses to move a flag back to "submitted"', () => {
      // 'submitted' means "no admin has looked at this yet" — a fact about
      // history, not a state a moderator may reset a reviewed flag to.
      expect(ResolveFlagSchema.safeParse({ statusKey: 'submitted' }).success).toBe(false);
      expect(ResolveFlagSchema.safeParse({ statusKey: 'dismissed' }).success).toBe(true);
    });

    it('requires a reason to remove a comment', () => {
      expect(ModerateCommentSchema.safeParse({}).success).toBe(false);
      expect(ModerateCommentSchema.safeParse({ reason: '  ' }).success).toBe(false);
      expect(ModerateCommentSchema.safeParse({ reason: 'Abusive language' }).success).toBe(true);
    });

    it('accepts only the four real flag statuses in the queue filter', () => {
      expect(ListFlaggedCommentsSchema.safeParse({ status: 'under_review' }).success).toBe(true);
      expect(ListFlaggedCommentsSchema.safeParse({ status: 'invented' }).success).toBe(false);
    });
  });

  describe('list', () => {
    it('returns a paginated envelope with the report and author joined', async () => {
      const { items, pagination } = await service.list({ page: 1, limit: 25, includeRemoved: false });

      expect(pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
      expect(items[0]).toMatchObject({
        id: commentId,
        body: 'I am on my way now',
        removed: false,
        removedAt: null,
        author: { id: commenterId, name: 'Priya', deleted: false },
        report: {
          id: reportId,
          title: 'Need help at the bus stand',
          category: { key: 'medicalHelp', label: 'Medical Help', emoji: '❤️' },
        },
        flagCount: 0,
        authorIsReporter: false,
      });
    });

    it('derives the report status rather than trusting status_id', async () => {
      // The report is stored 'open' but already past expiry — the whole point of
      // report-effective-status.ts. A console reading status_id would call this
      // a live request.
      await db
        .update(reports)
        .set({ expiryAt: new Date(Date.now() - 60_000) })
        .where(eq(reports.id, reportId));

      const { items } = await service.list({ page: 1, limit: 25, includeRemoved: false });
      expect(items[0].report.effectiveStatus).toBe('expired');
    });

    it('marks a comment written by the reporter', async () => {
      const own = uuidv7();
      await db.insert(reportComments).values({
        id: own,
        reportId,
        authorId: reporterId,
        body: 'Thank you all',
      });

      const { items } = await service.list({ page: 1, limit: 25, includeRemoved: false, q: 'Thank you' });
      expect(items[0].authorIsReporter).toBe(true);
    });

    it('searches the body case-insensitively', async () => {
      expect(
        (await service.list({ page: 1, limit: 25, includeRemoved: false, q: 'MY WAY' })).pagination.total,
      ).toBe(1);
      expect(
        (await service.list({ page: 1, limit: 25, includeRemoved: false, q: 'nothing here' })).pagination.total,
      ).toBe(0);
    });

    it('treats a literal % as text, not as "match everything"', async () => {
      // Without ESCAPE handling in likePattern(), searching "%" would return
      // every comment and the search box would silently lie.
      expect(
        (await service.list({ page: 1, limit: 25, includeRemoved: false, q: '%' })).pagination.total,
      ).toBe(0);

      const pct = uuidv7();
      await db.insert(reportComments).values({
        id: pct,
        reportId,
        authorId: commenterId,
        body: 'battery at 50% now',
      });
      expect(
        (await service.list({ page: 1, limit: 25, includeRemoved: false, q: '50%' })).pagination.total,
      ).toBe(1);
    });

    it('hides removed comments by default and reveals them on request', async () => {
      await service.removeComment(admin, commentId, { reason: 'Abusive language' }, meta);

      expect(
        (await service.list({ page: 1, limit: 25, includeRemoved: false })).pagination.total,
      ).toBe(0);

      const revealed = await service.list({ page: 1, limit: 25, includeRemoved: true });
      expect(revealed.pagination.total).toBe(1);
      expect(revealed.items[0]).toMatchObject({ removed: true });
      expect(revealed.items[0].removedAt).not.toBeNull();
    });

    it('filters by flagged / unflagged without multiplying rows per flag', async () => {
      await db.insert(reportCommentFlags).values([
        {
          id: uuidv7(),
          commentId,
          flaggedById: flaggerId,
          reason: 'spam',
          statusId: lookups.flagStatusIds.submitted,
        },
        {
          id: uuidv7(),
          commentId,
          flaggedById: reporterId,
          reason: 'abuse',
          statusId: lookups.flagStatusIds.submitted,
        },
      ]);

      const flagged = await service.list({ page: 1, limit: 25, includeRemoved: false, flagged: true });
      // Two flags on one comment is still ONE row.
      expect(flagged.pagination.total).toBe(1);
      expect(flagged.items).toHaveLength(1);
      expect(flagged.items[0].flagCount).toBe(2);

      expect(
        (await service.list({ page: 1, limit: 25, includeRemoved: false, flagged: false })).pagination.total,
      ).toBe(0);
    });

    it('keeps a comment whose author deleted their account', async () => {
      const departing = uuidv7();
      await db.insert(user).values({ id: departing, name: 'Gone', email: 'gone@test.local' });
      const orphan = uuidv7();
      await db.insert(reportComments).values({
        id: orphan,
        reportId,
        authorId: departing,
        body: 'written before leaving',
      });
      await db.delete(user).where(eq(user.id, departing));

      const { items } = await service.list({
        page: 1,
        limit: 25,
        includeRemoved: false,
        q: 'before leaving',
      });
      expect(items[0].author).toEqual({
        id: null,
        name: 'Deleted User',
        avatarUrl: null,
        deleted: true,
      });
    });
  });

  describe('listFlags', () => {
    beforeEach(async () => {
      await db.insert(reportCommentFlags).values({
        id: uuidv7(),
        commentId,
        flaggedById: flaggerId,
        reason: 'spam',
        statusId: lookups.flagStatusIds.submitted,
      });
    });

    it('defaults to the pending queue and names both people involved', async () => {
      const { items, pagination } = await service.listFlags({ page: 1, limit: 25 });

      expect(pagination.total).toBe(1);
      expect(items[0]).toMatchObject({
        reason: 'spam',
        status: { key: 'submitted', label: 'Submitted' },
        comment: {
          id: commentId,
          body: 'I am on my way now',
          removed: false,
          author: { id: commenterId, name: 'Priya', deleted: false },
        },
        report: { id: reportId, title: 'Need help at the bus stand' },
        flaggedBy: { id: flaggerId, name: 'Ravi' },
      });
    });

    it('drops a flag out of the pending queue once it is resolved', async () => {
      const [flag] = await db.select().from(reportCommentFlags);

      await service.resolveFlag(admin, flag.id, { statusKey: 'dismissed' }, meta);

      expect((await service.listFlags({ page: 1, limit: 25 })).pagination.total).toBe(0);
      expect(
        (await service.listFlags({ page: 1, limit: 25, status: 'dismissed' })).pagination.total,
      ).toBe(1);
    });

    it('keeps under_review in the pending queue — opened is not finished', async () => {
      const [flag] = await db.select().from(reportCommentFlags);
      await service.resolveFlag(admin, flag.id, { statusKey: 'under_review' }, meta);

      expect((await service.listFlags({ page: 1, limit: 25 })).pagination.total).toBe(1);
    });
  });

  describe('removeComment', () => {
    it('hides the comment from the public thread but keeps the flag visible to its flagger', async () => {
      const flagId = uuidv7();
      await db.insert(reportCommentFlags).values({
        id: flagId,
        commentId,
        flaggedById: flaggerId,
        reason: 'abuse',
        statusId: lookups.flagStatusIds.submitted,
      });

      expect(await citizenComments.list(reportId)).toHaveLength(1);

      await service.removeComment(admin, commentId, { reason: 'Abusive language' }, meta);

      // Gone from the public thread...
      expect(await citizenComments.list(reportId)).toEqual([]);
      // ...but the flagger still sees their flag, rather than it vanishing.
      // This is exactly why the column is a soft delete and not a DELETE.
      const mine = await citizenComments.listMyFlags(flaggerId);
      expect(mine).toHaveLength(1);
      expect(mine[0].commentBody).toBe('I am on my way now');
    });

    it('writes one audit row carrying the removed body and the reason', async () => {
      await service.removeComment(admin, commentId, { reason: 'Abusive language' }, meta);

      const logs = await auditRows();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorUserId: adminId,
        actorEmail: 'admin@uthavu.org',
        targetId: commentId,
        reason: 'Abusive language',
        ipAddress: '10.0.0.1',
        userAgent: 'jest',
      });
      expect(logs[0].before).toEqual({ body: 'I am on my way now', deletedAt: null });
    });

    it('404s an unknown comment and 409s a second removal', async () => {
      await expect(
        service.removeComment(admin, uuidv7(), { reason: 'x1' }, meta),
      ).rejects.toMatchObject({ status: 404 });

      await service.removeComment(admin, commentId, { reason: 'Abusive language' }, meta);
      await expect(
        service.removeComment(admin, commentId, { reason: 'again' }, meta),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'COMMENT_ALREADY_REMOVED' },
      });
    });

    it('leaves no audit row when the mutation fails', async () => {
      // A 409 must not log a removal that did not happen.
      await service.removeComment(admin, commentId, { reason: 'first' }, meta);
      await db.delete(adminAuditLogs);

      await expect(
        service.removeComment(admin, commentId, { reason: 'second' }, meta),
      ).rejects.toThrow();

      expect(await auditRows()).toHaveLength(0);
    });
  });

  describe('restoreComment', () => {
    it('round-trips a removal and audits both halves', async () => {
      await service.removeComment(admin, commentId, { reason: 'Mistaken report' }, meta);
      const restored = await service.restoreComment(
        admin,
        commentId,
        { reason: 'Reviewed — comment is fine' },
        meta,
      );

      expect(restored).toEqual({ id: commentId, removed: false, removedAt: null });
      expect(await citizenComments.list(reportId)).toHaveLength(1);

      const [row] = await db
        .select()
        .from(reportComments)
        .where(eq(reportComments.id, commentId));
      expect(row.deletedAt).toBeNull();
      expect(row.deletedBy).toBeNull();

      const logs = await auditRows();
      expect(logs).toHaveLength(2);
    });

    it('409s restoring a comment that was never removed', async () => {
      await expect(
        service.restoreComment(admin, commentId, { reason: 'nothing to undo' }, meta),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'COMMENT_NOT_REMOVED' },
      });
    });
  });

  describe('resolveFlag', () => {
    let flagId: string;

    beforeEach(async () => {
      flagId = uuidv7();
      await db.insert(reportCommentFlags).values({
        id: flagId,
        commentId,
        flaggedById: flaggerId,
        reason: 'spam',
        statusId: lookups.flagStatusIds.submitted,
      });
    });

    it('moves a flag and records the before/after status', async () => {
      const result = await service.resolveFlag(
        admin,
        flagId,
        { statusKey: 'action_taken', reason: 'Comment removed' },
        meta,
      );

      expect(result).toEqual({
        id: flagId,
        commentId,
        status: { key: 'action_taken', label: 'Action Taken' },
      });

      const logs = await auditRows();
      expect(logs).toHaveLength(1);
      expect(logs[0].before).toEqual({ statusKey: 'submitted' });
      expect(logs[0].after).toEqual({ statusKey: 'action_taken' });
    });

    it('404s an unknown flag and 409s a no-op transition', async () => {
      await expect(
        service.resolveFlag(admin, uuidv7(), { statusKey: 'dismissed' }, meta),
      ).rejects.toMatchObject({ status: 404 });

      await service.resolveFlag(admin, flagId, { statusKey: 'dismissed' }, meta);
      await expect(
        service.resolveFlag(admin, flagId, { statusKey: 'dismissed' }, meta),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'FLAG_ALREADY_IN_STATUS' },
      });
    });
  });
});
