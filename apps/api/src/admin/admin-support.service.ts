import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  supportTickets,
  ticketCategories,
  ticketStatuses,
} from '../db/schema/tickets-schema';
import { AdminAuditService } from './admin-audit.service';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { ListSupportTicketsDto } from './dto/list-support-tickets.dto';
import type { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

/**
 * Platform -> Support.
 *
 * The citizen side of this table is `GET /users/me/tickets`, which filters on
 * `userId` (SupportService.listMine()) and is therefore useless for a queue —
 * hence a separate admin projection rather than a role branch inside that
 * method (ADR 0009).
 */
@Injectable()
export class AdminSupportService {
  constructor(private readonly auditService: AdminAuditService) {}

  async list(query: ListSupportTicketsDto) {
    const filters = [
      query.status ? eq(ticketStatuses.key, query.status) : undefined,
      query.categoryKey
        ? eq(ticketCategories.key, query.categoryKey)
        : undefined,
      query.userId ? eq(supportTickets.userId, query.userId) : undefined,
      query.from ? gte(supportTickets.createdAt, query.from) : undefined,
      query.to ? lte(supportTickets.createdAt, query.to) : undefined,
      // ESCAPE '\' is declared explicitly because likePattern() escapes the
      // caller's own % and _ with a backslash. Without the clause Postgres uses
      // its default escape character (also backslash) — stating it keeps the
      // pattern's meaning independent of that default, and makes a search for a
      // literal "50%" match "50%" rather than everything.
      query.q
        ? sql`(${supportTickets.subject} ilike ${likePattern(query.q)} escape '\\'
            or ${supportTickets.description} ilike ${likePattern(query.q)} escape '\\')`
        : undefined,
    ].filter((f) => f !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;

    const sortColumn =
      query.sort === 'updatedAt'
        ? supportTickets.updatedAt
        : supportTickets.createdAt;
    const direction = query.order === 'asc' ? asc : desc;

    const [rows, [countRow]] = await Promise.all([
      this.baseQuery()
        .where(where)
        // id is the tiebreaker so a page boundary is stable when two tickets
        // share a timestamp — without it, offset paging can show or skip a row.
        .orderBy(direction(sortColumn), desc(supportTickets.id))
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(supportTickets)
        .innerJoin(
          ticketCategories,
          eq(supportTickets.categoryId, ticketCategories.id),
        )
        .innerJoin(
          ticketStatuses,
          eq(supportTickets.statusId, ticketStatuses.id),
        )
        .innerJoin(user, eq(supportTickets.userId, user.id))
        .where(where),
    ]);

    return paginate(
      rows.map((row) => this.toResponse(row)),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  async findOne(id: string) {
    const [row] = await this.baseQuery().where(eq(supportTickets.id, id));

    if (!row) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Support ticket not found.',
      });
    }
    return this.toResponse(row);
  }

  /**
   * The first and only write path that moves a ticket past `new`.
   *
   * Before this endpoint existed, `ticket_statuses` had three seeded rows and
   * exactly one reachable value: SupportService.create() writes 'new' and
   * nothing anywhere updated `status_id` again. 'in_review' and 'resolved' were
   * master data pointing at a lifecycle no code implemented — which is why
   * tickets-schema.ts's own comment says the column exists "so an admin console
   * can update it later without a schema change". This is that later.
   */
  async updateStatus(
    id: string,
    admin: AdminIdentity,
    dto: UpdateTicketStatusDto,
    meta: AdminRequestMeta,
  ) {
    const [ticket] = await db
      .select({
        id: supportTickets.id,
        subject: supportTickets.subject,
        statusId: supportTickets.statusId,
        statusKey: ticketStatuses.key,
      })
      .from(supportTickets)
      .innerJoin(ticketStatuses, eq(supportTickets.statusId, ticketStatuses.id))
      .where(eq(supportTickets.id, id));

    if (!ticket) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Support ticket not found.',
      });
    }

    // Resolved against the lookup table, not an enum — adding a status is a
    // db:seed change, and this endpoint picks it up without a redeploy.
    const [target] = await db
      .select({ id: ticketStatuses.id, key: ticketStatuses.key })
      .from(ticketStatuses)
      .where(eq(ticketStatuses.key, dto.statusKey));

    if (!target) {
      throw new BadRequestException({
        code: 'UNKNOWN_TICKET_STATUS',
        message: `"${dto.statusKey}" is not a known ticket status.`,
      });
    }

    // A no-op status change would otherwise write an audit row asserting a
    // transition that never happened.
    if (target.id === ticket.statusId) {
      throw new ConflictException({
        code: 'TICKET_ALREADY_IN_STATUS',
        message: `This ticket is already "${target.key}".`,
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(supportTickets)
        // updatedAt is bumped explicitly: this table's column has a default but
        // no $onUpdate, so nothing would move it otherwise — and the console
        // sorts by it.
        .set({ statusId: target.id, updatedAt: sql`now()` })
        .where(eq(supportTickets.id, id));

      await this.auditService.record({
        admin,
        action: 'support_ticket.status_change',
        targetId: id,
        targetLabel: ticket.subject,
        before: { statusKey: ticket.statusKey },
        after: { statusKey: target.key },
        reason: dto.reason ?? null,
        meta,
        tx,
      });
    });

    return this.findOne(id);
  }

  private baseQuery() {
    return db
      .select({
        id: supportTickets.id,
        subject: supportTickets.subject,
        description: supportTickets.description,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        categoryKey: ticketCategories.key,
        categoryLabel: ticketCategories.label,
        statusKey: ticketStatuses.key,
        statusLabel: ticketStatuses.label,
        userId: user.id,
        userName: user.name,
        userPhoneNumber: user.phoneNumber,
        userAvatarUrl: user.avatarUrl,
      })
      .from(supportTickets)
      .innerJoin(
        ticketCategories,
        eq(supportTickets.categoryId, ticketCategories.id),
      )
      .innerJoin(ticketStatuses, eq(supportTickets.statusId, ticketStatuses.id))
      // innerJoin on `user` is correct here and must stay an innerJoin.
      // support_tickets.user_id is NOT NULL and ON DELETE CASCADE, so a ticket
      // cannot outlive its author — unlike reports and comments, which use SET
      // NULL to preserve community history and therefore need leftJoin. Someone
      // "fixing" this to a leftJoin for consistency would be adding a branch for
      // a row that cannot exist.
      .innerJoin(user, eq(supportTickets.userId, user.id));
  }

  private toResponse(row: {
    id: string;
    subject: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    categoryKey: string;
    categoryLabel: string;
    statusKey: string;
    statusLabel: string;
    userId: string;
    userName: string;
    userPhoneNumber: string | null;
    userAvatarUrl: string | null;
  }) {
    return {
      id: row.id,
      subject: row.subject,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      category: { key: row.categoryKey, label: row.categoryLabel },
      status: { key: row.statusKey, label: row.statusLabel },
      user: {
        id: row.userId,
        name: row.userName,
        // Staff need it to follow up on a ticket. This is an admin-only
        // projection behind platform:manage — it is never reachable from a
        // citizen route.
        phoneNumber: row.userPhoneNumber,
        avatarUrl: row.userAvatarUrl,
      },
    };
  }
}
