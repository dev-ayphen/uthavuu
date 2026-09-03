import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  reportCommentFlags,
  reportComments,
} from '../db/schema/comments-schema';
import { CommentsService } from './comments.service';

describe('CommentsService — flagging', () => {
  const service = new CommentsService();
  let authorId: string;
  let flaggerId: string;
  let otherFlaggerId: string;
  let categoryId: string;
  let openStatusId: string;
  let reportId: string;
  let commentId: string;

  beforeAll(async () => {
    authorId = uuidv7();
    flaggerId = uuidv7();
    otherFlaggerId = uuidv7();

    await db.insert(user).values([
      {
        id: authorId,
        name: 'Comment Author',
        email: `${authorId}@test.local`,
        phoneNumber: `+91-${authorId}`,
      },
      {
        id: flaggerId,
        name: 'Flagger',
        email: `${flaggerId}@test.local`,
        phoneNumber: `+91-${flaggerId}`,
      },
      {
        id: otherFlaggerId,
        name: 'Other Flagger',
        email: `${otherFlaggerId}@test.local`,
        phoneNumber: `+91-${otherFlaggerId}`,
      },
    ]);

    const [category] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.key, 'medicalHelp'));
    const [openStatus] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.key, 'open'));
    categoryId = category.id;
    openStatusId = openStatus.id;
  });

  afterAll(async () => {
    await db.delete(reports).where(eq(reports.reporterId, authorId));
    await db.delete(user).where(eq(user.id, authorId));
    await db.delete(user).where(eq(user.id, flaggerId));
    await db.delete(user).where(eq(user.id, otherFlaggerId));
  });

  beforeEach(async () => {
    reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId: authorId,
      categoryId,
      statusId: openStatusId,
      title: 'Flag test report',
      description: 'Test',
      lat: 13.08,
      lng: 80.27,
      neededVolunteers: 1,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });
    commentId = uuidv7();
    await db
      .insert(reportComments)
      .values({ id: commentId, reportId, authorId, body: 'Test comment' });
  });

  afterEach(async () => {
    // Cascades to report_comments/report_comment_flags — each test's own
    // fixtures must not leak into the next test's listMyFlags() assertions.
    await db.delete(reports).where(eq(reports.id, reportId));
  });

  it('rejects flagging your own comment', async () => {
    await expect(service.flag(commentId, authorId, 'spam')).rejects.toThrow(
      'You cannot flag your own comment',
    );
  });

  it('is idempotent — a second flag from the same user is a no-op, first reason wins', async () => {
    await service.flag(commentId, flaggerId, 'spam');
    await service.flag(commentId, flaggerId, 'abuse');

    const rows = await db
      .select()
      .from(reportCommentFlags)
      .where(eq(reportCommentFlags.commentId, commentId));
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('spam');
  });

  it("lists only the requesting user's own flags, scoped correctly", async () => {
    await service.flag(commentId, flaggerId, 'duplicate');
    await service.flag(commentId, otherFlaggerId, 'other');

    const mine = await service.listMyFlags(flaggerId);
    expect(mine).toHaveLength(1);
    expect(mine[0].reason).toBe('duplicate');
    expect(mine[0].reportId).toBe(reportId);
    expect(mine[0].commentBody).toBe('Test comment');
    expect(mine[0].status).toBe('submitted');

    const theirs = await service.listMyFlags(otherFlaggerId);
    expect(theirs).toHaveLength(1);
    expect(theirs[0].reason).toBe('other');
  });

  it('returns an empty list for a user who has flagged nothing', async () => {
    const rows = await service.listMyFlags(otherFlaggerId);
    expect(rows).toEqual([]);
  });
});
