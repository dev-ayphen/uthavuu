import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportStatuses, reports } from '../db/schema/reports-schema';
import { flagStatuses, reportCommentFlags, reportComments } from '../db/schema/comments-schema';
import type { FLAG_REASONS } from './dto/flag-comment.dto';
import { getPlatformConfig } from '../config/platform-settings';
import { notRemoved, requireVisibleReport } from '../reports/report-visibility';

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
    // A hidden report has no public thread. This endpoint is not gated on
    // participation — anyone holding the report id could read the comment
    // bodies and their authors' names on a report a moderator had removed.
    const report = await requireVisibleReport(reportId);

    const rows = await db
      .select({ comment: reportComments, author: user })
      .from(reportComments)
      // leftJoin, not innerJoin: a comment survives its author's account
      // deletion (reportComments.authorId is SET NULL, not cascade) — the
      // body stays visible for other participants' context, only the
      // identity goes.
      .leftJoin(user, eq(reportComments.authorId, user.id))
      // A comment an admin removed is gone from the public thread — the same
      // thing a hard DELETE would have achieved, without destroying the flag
      // that led to the removal or the body the audit log has to be able to
      // show. See the deletedAt note in db/schema/comments-schema.ts.
      // Deliberately NOT applied to listMyFlags(): the flagger keeps seeing
      // their flag reach 'Action Taken' rather than watching it vanish.
      .where(and(eq(reportComments.reportId, reportId), isNull(reportComments.deletedAt)))
      .orderBy(asc(reportComments.createdAt));

    return rows.map((r) => ({
      id: r.comment.id,
      authorId: r.comment.authorId,
      authorName: r.author?.name ?? 'Deleted User',
      authorDeleted: r.comment.authorId === null,
      // A deleted reporter's report can never equal a live commenter's id,
      // so this naturally reads false once the reporter is gone too — a
      // deleted-author comment is never mislabeled as "from the reporter".
      authorIsReporter: r.comment.authorId !== null && r.comment.authorId === report.reporterId,
      body: r.comment.body,
      createdAt: r.comment.createdAt.toISOString(),
    }));
  }

  async create(reportId: string, authorId: string, body: string) {
    // Platform -> App Settings. Turning comments off stops NEW comments; the
    // existing thread stays readable, because list() is a read and the switch
    // is a moderation control, not a retraction of what people already said.
    // Deleting a thread is a separate, audited admin act.
    const config = await getPlatformConfig();
    if (!config.commentsEnabled) {
      throw new ForbiddenException({
        code: 'COMMENTS_DISABLED',
        message: 'Community comments are currently turned off for this platform.',
      });
    }

    // The write half of the same rule, and the sharper one. `commentsEnabled`
    // above is a platform-wide switch; this is the per-report moderation act,
    // and before it existed a citizen could post a *new public comment* onto a
    // report an admin had already hidden — the row landed in Postgres and the
    // moderation action was simply invisible to the write path.
    await requireVisibleReport(reportId);

    await db.insert(reportComments).values({ id: uuidv7(), reportId, authorId, body });
    return this.list(reportId);
  }

  async flag(commentId: string, flaggedById: string, reason: (typeof FLAG_REASONS)[number]) {
    // Platform -> App Settings, and independent of commentsEnabled on purpose:
    // an operator who stops new comments still wants the existing thread
    // flaggable, and one who is drowning in bad-faith flags wants to stop the
    // flags without silencing the conversation. Two switches because they are
    // two decisions.
    const config = await getPlatformConfig();
    if (!config.commentFlaggingEnabled) {
      throw new ForbiddenException({
        code: 'COMMENT_FLAGGING_DISABLED',
        message: 'Flagging comments is currently turned off for this platform.',
      });
    }

    const [comment] = await db.select().from(reportComments).where(eq(reportComments.id, commentId));
    if (!comment) throw new NotFoundException('Comment not found');
    // Flagging is also a write, and a comment on a hidden report is no longer
    // reachable through list() — a flag arriving here is either a stale client
    // holding a cached comment id or a hand-crafted call. Nothing is lost by
    // refusing it: the moderator already removed the whole report.
    await requireVisibleReport(comment.reportId);
    if (comment.authorId === flaggedById) {
      throw new ForbiddenException('You cannot flag your own comment');
    }

    // Idempotent — a second flag from the same user on the same comment is
    // a no-op, not a duplicate row (same shape as report_saves).
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
      // A flag whose report a moderator has since hidden drops out of the
      // flagger's list entirely. The row below projects reportTitle and
      // reportLandmark, so leaving it in re-serves exactly the content the
      // hide was meant to remove — and its reportId deep-links to a 404.
      // Deliberately NOT the same call as the deletedAt exemption noted on
      // list() above: that one keeps a *removed comment's* flag visible so the
      // flagger sees it reach 'Action Taken'. Here the whole report is gone,
      // so there is no outcome left to follow.
      .where(and(eq(reportCommentFlags.flaggedById, userId), notRemoved))
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
