import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportStatuses, reports } from '../db/schema/reports-schema';
import { flagStatuses, reportCommentFlags, reportComments } from '../db/schema/comments-schema';
import type { FLAG_REASONS } from './dto/flag-comment.dto';

// docs/PRODUCT-DECISIONS.md Decision 2 — public, unlike Mission Chat: any
// authenticated user reads and posts, no hasActiveAccess gate.
@Injectable()
export class CommentsService {
  private async getFlagStatusIdByKey(key: string): Promise<string> {
    const [status] = await db.select().from(flagStatuses).where(eq(flagStatuses.key, key));
    if (!status) throw new Error(`flag_statuses row missing for key "${key}" — did db:seed run?`);
    return status.id;
  }

  async list(reportId: string) {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');

    const rows = await db
      .select({ comment: reportComments, author: user })
      .from(reportComments)
      .innerJoin(user, eq(reportComments.authorId, user.id))
      .where(eq(reportComments.reportId, reportId))
      .orderBy(asc(reportComments.createdAt));

    return rows.map((r) => ({
      id: r.comment.id,
      authorId: r.comment.authorId,
      authorName: r.author.name,
      authorIsReporter: r.comment.authorId === report.reporterId,
      body: r.comment.body,
      createdAt: r.comment.createdAt.toISOString(),
    }));
  }

  async create(reportId: string, authorId: string, body: string) {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');

    await db.insert(reportComments).values({ id: uuidv7(), reportId, authorId, body });
    return this.list(reportId);
  }

  async flag(commentId: string, flaggedById: string, reason: (typeof FLAG_REASONS)[number]) {
    const [comment] = await db.select().from(reportComments).where(eq(reportComments.id, commentId));
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId === flaggedById) {
      throw new ForbiddenException('You cannot flag your own comment');
    }

    // Idempotent — a second flag from the same user on the same comment is
    // a no-op, not a duplicate row (same shape as report_likes/report_saves).
    // A re-flag with a *different* reason still doesn't overwrite the
    // original: the first reason recorded is the one that stands, matching
    // "capture now, act on later" — there's no moderation UI yet to even
    // show a changed reason.
    const submittedStatusId = await this.getFlagStatusIdByKey('submitted');
    await db
      .insert(reportCommentFlags)
      .values({ id: uuidv7(), commentId, flaggedById, reason, statusId: submittedStatusId })
      .onConflictDoNothing({ target: [reportCommentFlags.commentId, reportCommentFlags.flaggedById] });
    return { flagged: true };
  }

  // Profile → Flagged Requests. "Requests" in the product's menu language,
  // but what's actually real is comment-level flagging (see this schema
  // file's own top-of-file comment) — this lists comments *this user* has
  // flagged, joined through to the report each comment lives on.
  async listMyFlags(userId: string) {
    const rows = await db
      .select({
        flag: reportCommentFlags,
        comment: reportComments,
        report: reports,
        category: reportCategories,
        status: reportStatuses,
        flagStatus: flagStatuses,
      })
      .from(reportCommentFlags)
      .innerJoin(reportComments, eq(reportCommentFlags.commentId, reportComments.id))
      .innerJoin(reports, eq(reportComments.reportId, reports.id))
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .innerJoin(flagStatuses, eq(reportCommentFlags.statusId, flagStatuses.id))
      .where(eq(reportCommentFlags.flaggedById, userId))
      .orderBy(desc(reportCommentFlags.createdAt));

    return rows.map((r) => ({
      id: r.flag.id,
      reason: r.flag.reason,
      status: r.flagStatus.key,
      flaggedAt: r.flag.createdAt,
      commentBody: r.comment.body,
      reportId: r.report.id,
      reportTitle: r.report.title,
      reportLandmark: r.report.landmark,
      reportStatus: r.status.key,
      category: { key: r.category.key, label: r.category.label, emoji: r.category.emoji },
    }));
  }
}
