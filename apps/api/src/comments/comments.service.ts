import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import { reportCommentFlags, reportComments } from '../db/schema/comments-schema';
import type { FLAG_REASONS } from './dto/flag-comment.dto';

// docs/PRODUCT-DECISIONS.md Decision 2 — public, unlike Mission Chat: any
// authenticated user reads and posts, no hasActiveAccess gate.
@Injectable()
export class CommentsService {
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

    await db.insert(reportCommentFlags).values({ id: uuidv7(), commentId, flaggedById, reason });
    return { flagged: true };
  }
}
