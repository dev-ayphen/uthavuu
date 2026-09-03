import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notExists,
  sql,
} from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  flagStatuses,
  reportCommentFlags,
  reportComments,
} from '../db/schema/comments-schema';
import { AdminAuditService } from './admin-audit.service';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import { effectiveStatusSql } from './report-effective-status';
import type { ListAdminCommentsDto } from './dto/list-admin-comments.dto';
import type { ListFlaggedCommentsDto } from './dto/list-flagged-comments.dto';
import { PENDING_FLAG_STATUS_KEYS } from './dto/list-flagged-comments.dto';
import type { ModerateCommentDto } from './dto/moderate-comment.dto';
import type { ResolveFlagDto } from './dto/resolve-flag.dto';

/**
 * Reports -> Comments and Reports -> Flagged Comments.
 *
 * A separate surface from CommentsService rather than a role branch inside it,
 * per ADR 0009. The citizen list is one report's public thread, ascending, with
 * removed rows filtered out; this one is a cross-report moderation table with
 * pagination, search and the removed rows explicitly reachable. Those are
 * different queries, not one query with a flag.
 */
@Injectable()
export class AdminCommentsService {
  constructor(private readonly auditService: AdminAuditService) {}

  /** Enough of a body to recognise the row in an audit list, never the whole essay. */
  private static label(body: string): string {
    return body.length > 80 ? `${body.slice(0, 77)}…` : body;
  }

  async list(query: ListAdminCommentsDto) {
    // A correlated EXISTS rather than a join: joining report_comment_flags
    // multiplies a comment row by its flag count, which would corrupt both the
    // page size and the total. The count comes back as its own scalar subquery
    // for the same reason.
    const hasFlag = exists(
      db
        .select({ one: sql`1` })
        .from(reportCommentFlags)
        .where(eq(reportCommentFlags.commentId, reportComments.id)),
    );

    const filters = [
      query.includeRemoved ? undefined : isNull(reportComments.deletedAt),
      query.q
        ? sql`${reportComments.body} ilike ${likePattern(query.q)} escape '\\'`
        : undefined,
      query.reportId ? eq(reportComments.reportId, query.reportId) : undefined,
      query.authorId ? eq(reportComments.authorId, query.authorId) : undefined,
      query.from ? gte(reportComments.createdAt, query.from) : undefined,
      query.to ? lte(reportComments.createdAt, query.to) : undefined,
      query.flagged === undefined
        ? undefined
        : query.flagged
          ? hasFlag
          : notExists(
              db
                .select({ one: sql`1` })
                .from(reportCommentFlags)
                .where(eq(reportCommentFlags.commentId, reportComments.id)),
            ),
    ].filter((f) => f !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: reportComments.id,
          body: reportComments.body,
          createdAt: reportComments.createdAt,
          deletedAt: reportComments.deletedAt,
          authorId: reportComments.authorId,
          authorName: user.name,
          authorAvatarUrl: user.avatarUrl,
          reportId: reports.id,
          reportTitle: reports.title,
          reporterId: reports.reporterId,
          effectiveStatus: effectiveStatusSql,
          categoryKey: reportCategories.key,
          categoryLabel: reportCategories.label,
          categoryEmoji: reportCategories.emoji,
          flagCount: sql<string>`(
            select count(*) from ${reportCommentFlags}
            where ${reportCommentFlags.commentId} = ${reportComments.id}
          )`,
        })
        .from(reportComments)
        .innerJoin(reports, eq(reportComments.reportId, reports.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        // leftJoin: authorId is SET NULL on account deletion, and a comment
        // whose author left is exactly the kind a moderator still needs to see.
        .leftJoin(user, eq(reportComments.authorId, user.id))
        .where(where)
        .orderBy(desc(reportComments.createdAt), desc(reportComments.id))
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(reportComments)
        .innerJoin(reports, eq(reportComments.reportId, reports.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .leftJoin(user, eq(reportComments.authorId, user.id))
        .where(where),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        removed: row.deletedAt !== null,
        removedAt: row.deletedAt?.toISOString() ?? null,
        author: {
          id: row.authorId,
          // Two different reasons for one absence, kept distinguishable exactly
          // as CommentsService.list() keeps them.
          name: row.authorName ?? 'Deleted User',
          avatarUrl: row.authorAvatarUrl ?? null,
          deleted: row.authorId === null,
        },
        report: {
          id: row.reportId,
          title: row.reportTitle,
          effectiveStatus: row.effectiveStatus,
          category: {
            key: row.categoryKey,
            label: row.categoryLabel,
            emoji: row.categoryEmoji,
          },
        },
        flagCount: Number(row.flagCount),
        authorIsReporter:
          row.authorId !== null && row.authorId === row.reporterId,
      })),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  async listFlags(query: ListFlaggedCommentsDto) {
    const filters = [
      query.status
        ? eq(flagStatuses.key, query.status)
        : // No explicit status means the review queue: everything nobody has
          // finished dealing with.
          inArray(flagStatuses.key, [...PENDING_FLAG_STATUS_KEYS]),
      query.reportId ? eq(reportComments.reportId, query.reportId) : undefined,
      query.from ? gte(reportCommentFlags.createdAt, query.from) : undefined,
      query.to ? lte(reportCommentFlags.createdAt, query.to) : undefined,
    ].filter((f) => f !== undefined);

    const where = and(...filters);

    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: reportCommentFlags.id,
          reason: reportCommentFlags.reason,
          createdAt: reportCommentFlags.createdAt,
          statusKey: flagStatuses.key,
          statusLabel: flagStatuses.label,
          commentId: reportComments.id,
          commentBody: reportComments.body,
          commentCreatedAt: reportComments.createdAt,
          commentDeletedAt: reportComments.deletedAt,
          commentAuthorId: reportComments.authorId,
          reportId: reports.id,
          reportTitle: reports.title,
          flaggedById: reportCommentFlags.flaggedById,
        })
        .from(reportCommentFlags)
        .innerJoin(
          flagStatuses,
          eq(reportCommentFlags.statusId, flagStatuses.id),
        )
        .innerJoin(
          reportComments,
          eq(reportCommentFlags.commentId, reportComments.id),
        )
        .innerJoin(reports, eq(reportComments.reportId, reports.id))
        .where(where)
        .orderBy(
          desc(reportCommentFlags.createdAt),
          desc(reportCommentFlags.id),
        )
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(reportCommentFlags)
        .innerJoin(
          flagStatuses,
          eq(reportCommentFlags.statusId, flagStatuses.id),
        )
        .innerJoin(
          reportComments,
          eq(reportCommentFlags.commentId, reportComments.id),
        )
        .innerJoin(reports, eq(reportComments.reportId, reports.id))
        .where(where),
    ]);

    // Names for the two distinct people, fetched in one round trip rather than
    // as two more joins on the paginated query.
    const names = await this.namesFor([
      ...rows.map((r) => r.commentAuthorId),
      ...rows.map((r) => r.flaggedById),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        status: { key: row.statusKey, label: row.statusLabel },
        createdAt: row.createdAt.toISOString(),
        comment: {
          id: row.commentId,
          body: row.commentBody,
          removed: row.commentDeletedAt !== null,
          createdAt: row.commentCreatedAt.toISOString(),
          author: {
            id: row.commentAuthorId,
            name: row.commentAuthorId
              ? (names.get(row.commentAuthorId) ?? 'Deleted User')
              : 'Deleted User',
            deleted: row.commentAuthorId === null,
          },
        },
        report: { id: row.reportId, title: row.reportTitle },
        flaggedBy: {
          id: row.flaggedById,
          name: names.get(row.flaggedById) ?? 'Deleted User',
        },
      })),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  private async namesFor(ids: (string | null)[]): Promise<Map<string, string>> {
    const present = [...new Set(ids.filter((id): id is string => id !== null))];
    if (present.length === 0) return new Map();

    const rows = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, present));

    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async removeComment(
    admin: AdminIdentity,
    commentId: string,
    dto: ModerateCommentDto,
    meta: AdminRequestMeta,
  ) {
    const [comment] = await db
      .select()
      .from(reportComments)
      .where(eq(reportComments.id, commentId));

    if (!comment) {
      throw new NotFoundException({
        code: 'COMMENT_NOT_FOUND',
        message: 'Comment not found.',
      });
    }
    if (comment.deletedAt !== null) {
      throw new ConflictException({
        code: 'COMMENT_ALREADY_REMOVED',
        message: 'This comment has already been removed.',
      });
    }

    const deletedAt = new Date();

    // One transaction, so the change and its audit entry land together or not
    // at all — see the Executor note in admin-audit.service.ts.
    await db.transaction(async (tx) => {
      await tx
        .update(reportComments)
        .set({ deletedAt, deletedBy: admin.userId })
        // The isNull() re-check makes the write itself the race guard: two
        // moderators clicking Remove at once cannot both succeed.
        .where(
          and(
            eq(reportComments.id, commentId),
            isNull(reportComments.deletedAt),
          ),
        );

      await this.auditService.record({
        admin,
        action: 'comment.remove',
        targetId: commentId,
        targetLabel: AdminCommentsService.label(comment.body),
        // The removed body lives here. It is what makes the decision
        // reviewable once the comment is out of every listing.
        before: { body: comment.body, deletedAt: null },
        after: { deletedAt: deletedAt.toISOString(), deletedBy: admin.userId },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    return { id: commentId, removed: true, removedAt: deletedAt.toISOString() };
  }

  async restoreComment(
    admin: AdminIdentity,
    commentId: string,
    dto: ModerateCommentDto,
    meta: AdminRequestMeta,
  ) {
    const [comment] = await db
      .select()
      .from(reportComments)
      .where(eq(reportComments.id, commentId));

    if (!comment) {
      throw new NotFoundException({
        code: 'COMMENT_NOT_FOUND',
        message: 'Comment not found.',
      });
    }
    if (comment.deletedAt === null) {
      throw new ConflictException({
        code: 'COMMENT_NOT_REMOVED',
        message: 'This comment is not removed, so it cannot be restored.',
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(reportComments)
        .set({ deletedAt: null, deletedBy: null })
        .where(
          and(
            eq(reportComments.id, commentId),
            isNotNull(reportComments.deletedAt),
          ),
        );

      await this.auditService.record({
        admin,
        action: 'comment.restore',
        targetId: commentId,
        targetLabel: AdminCommentsService.label(comment.body),
        before: {
          deletedAt: comment.deletedAt?.toISOString() ?? null,
          deletedBy: comment.deletedBy,
        },
        after: { deletedAt: null, deletedBy: null },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    return { id: commentId, removed: false, removedAt: null };
  }

  async resolveFlag(
    admin: AdminIdentity,
    flagId: string,
    dto: ResolveFlagDto,
    meta: AdminRequestMeta,
  ) {
    const [flag] = await db
      .select({
        id: reportCommentFlags.id,
        commentId: reportCommentFlags.commentId,
        reason: reportCommentFlags.reason,
        statusKey: flagStatuses.key,
      })
      .from(reportCommentFlags)
      .innerJoin(flagStatuses, eq(reportCommentFlags.statusId, flagStatuses.id))
      .where(eq(reportCommentFlags.id, flagId));

    if (!flag) {
      throw new NotFoundException({
        code: 'FLAG_NOT_FOUND',
        message: 'Comment flag not found.',
      });
    }
    if (flag.statusKey === dto.statusKey) {
      throw new ConflictException({
        code: 'FLAG_ALREADY_IN_STATUS',
        message: `This flag is already "${dto.statusKey}".`,
      });
    }

    const [target] = await db
      .select({ id: flagStatuses.id, label: flagStatuses.label })
      .from(flagStatuses)
      .where(eq(flagStatuses.key, dto.statusKey));

    // Master data missing is a seed failure, not a client error — same loud
    // failure CommentsService.getFlagStatusIdByKey() raises.
    if (!target) {
      throw new Error(
        `flag_statuses row missing for key "${dto.statusKey}" — did db:seed run?`,
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(reportCommentFlags)
        .set({ statusId: target.id })
        .where(eq(reportCommentFlags.id, flagId));

      await this.auditService.record({
        admin,
        action: 'comment_flag.resolve',
        targetId: flagId,
        targetLabel: `${flag.reason} → ${dto.statusKey}`,
        before: { statusKey: flag.statusKey },
        after: { statusKey: dto.statusKey },
        reason: dto.reason ?? null,
        meta,
        tx,
      });
    });

    return {
      id: flagId,
      commentId: flag.commentId,
      status: { key: dto.statusKey, label: target.label },
    };
  }
}
