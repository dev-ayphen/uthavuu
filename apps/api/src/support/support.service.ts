import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  supportTicketMessages,
  supportTickets,
  ticketCategories,
  ticketMessageSenderTypes,
  ticketPriorities,
  ticketStatuses,
} from '../db/schema/tickets-schema';
import { requireVisibleReport } from '../reports/report-visibility';
import type { CreateTicketDto } from './dto/create-ticket.dto';
import type { CreateTicketMessageDto } from './dto/create-ticket-message.dto';
import {
  DEFAULT_TICKET_PRIORITY_KEY,
  INITIAL_TICKET_STATUS_KEY,
  acceptsMessages,
  statusAfterMessage,
} from './ticket-status';

interface TicketRow {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  relatedReportId: string | null;
  categoryId: string;
  categoryKey: string;
  categoryLabel: string;
  statusKey: string;
  statusLabel: string;
  priorityKey: string;
  priorityLabel: string;
}

interface MessageTotals {
  messageCount: number;
  lastMessageAt: string | null;
}

/**
 * Profile → Help & Support, citizen side.
 *
 * TWO BOUNDARIES LIVE IN THIS FILE, AND NOTHING ELSE IN THE PRODUCT ENFORCES
 * THEM:
 *
 * 1. OWNERSHIP. Every route here is scoped to the caller's own tickets, through
 *    `ownedTicket()` — the ownership predicate is part of the query, not a check
 *    somebody has to remember to write afterwards. A ticket belonging to someone
 *    else is a 404, identical to one that never existed, so ticket ids are not
 *    enumerable.
 *
 * 2. INTERNAL NOTES. `support_ticket_messages.is_internal_note` marks staff
 *    talking to staff on a citizen's ticket. Every projection in this file
 *    filters them out in SQL (`notInternal`), so the rows never reach a
 *    serialiser that could leak them. This is the same rule ADR 0010 applies to
 *    Mission Chat: a filter the client applies is not a filter.
 *
 * MISSION CHAT IS NOT HERE (ADR 0010). A ticket may carry `relatedReportId`, and
 * this service never reads `mission_messages`. Filing a ticket about a report
 * grants nothing on that report.
 */
@Injectable()
export class SupportService {
  /**
   * The predicate that makes the citizen projection safe. One constant, used by
   * every message read — a new listing satisfies it by importing something
   * rather than by remembering something (the reasoning report-visibility.ts's
   * `notRemoved` records, arrived at the same way).
   */
  private readonly notInternal = eq(
    supportTicketMessages.isInternalNote,
    false,
  );

  /** The `categoryId` options for POST /support/tickets. */
  async listCategories() {
    const rows = await db
      .select({
        id: ticketCategories.id,
        key: ticketCategories.key,
        label: ticketCategories.label,
      })
      .from(ticketCategories)
      .orderBy(asc(ticketCategories.label));

    return rows;
  }

  async create(userId: string, dto: CreateTicketDto) {
    const category = await this.resolveCategory(dto);

    // The citizen names neither the status nor the priority. Both are resolved
    // from the lookup tables here so adding a state stays a db:seed change.
    const statusId = await this.statusIdFor(INITIAL_TICKET_STATUS_KEY);
    const priorityId = await this.priorityIdFor(DEFAULT_TICKET_PRIORITY_KEY);

    // Checked before the insert, and checked at all: without it a ticket could
    // carry a reference to a report that never existed, or to one an admin has
    // already removed — which would make the ticket a way to probe for hidden
    // reports. requireVisibleReport() is the same gate the reports module uses,
    // and it distinguishes "removed" from "never existed" honestly.
    if (dto.relatedReportId) await requireVisibleReport(dto.relatedReportId);

    const id = uuidv7();
    await db.insert(supportTickets).values({
      id,
      userId,
      categoryId: category.id,
      statusId,
      priorityId,
      subject: dto.subject,
      description: dto.description,
      relatedReportId: dto.relatedReportId ?? null,
      // ticket_number is deliberately absent: its DEFAULT is the
      // support_ticket_number_seq sequence, so the database allocates it and two
      // simultaneous filings cannot collide. See tickets-schema.ts.
    });

    return this.findOne(id, userId);
  }

  async listMine(userId: string) {
    const rows = await this.ticketQuery()
      .where(eq(supportTickets.userId, userId))
      // Newest first, id breaking ties — the same tiebreaker the admin queue
      // uses, and with uuidv7 ids that is still true creation order. Not
      // paginated: this is one person's own tickets on a phone, which is the
      // same reason no other citizen endpoint paginates (admin-pagination.ts).
      .orderBy(desc(supportTickets.createdAt), desc(supportTickets.id));

    const counts = await this.messageCounts(rows.map((r) => r.id));

    return rows.map((row) => this.toResponse(row, counts.get(row.id)));
  }

  /** The full conversation — the citizen's own, with internal notes removed. */
  async findOne(id: string, userId: string) {
    const row = await this.requireOwnTicket(id, userId);
    const messages = await this.citizenMessages(id, userId);

    return {
      ...this.toResponse(row, {
        messageCount: messages.length,
        lastMessageAt: messages.at(-1)?.createdAt ?? null,
      }),
      messages,
    };
  }

  /**
   * A citizen reply.
   *
   * Returns the whole ticket, not just the created message: a reply can move the
   * ticket's status (a reply to a `resolved` ticket reopens it), and a client
   * that received only its own message back would have to guess what the server
   * did with it. One shape, always the server's answer.
   */
  async addMessage(id: string, userId: string, dto: CreateTicketMessageDto) {
    const ticket = await this.requireOwnTicket(id, userId);

    if (!acceptsMessages(ticket.statusKey)) {
      throw new ConflictException({
        code: 'TICKET_CLOSED',
        message:
          'This ticket is closed. Please file a new one if you still need help.',
      });
    }

    const senderTypeId = await this.senderTypeIdFor('user');
    const nextStatusKey = statusAfterMessage({
      statusKey: ticket.statusKey,
      sender: 'user',
      isInternalNote: false,
    });
    const nextStatusId = nextStatusKey
      ? await this.statusIdFor(nextStatusKey)
      : null;

    await db.transaction(async (tx) => {
      await tx.insert(supportTicketMessages).values({
        id: uuidv7(),
        ticketId: id,
        senderTypeId,
        senderUserId: userId,
        body: dto.body,
        // Hardcoded, not taken from the DTO. A citizen route cannot produce an
        // internal note, by construction rather than by validation.
        isInternalNote: false,
      });

      await tx
        .update(supportTickets)
        // updatedAt is bumped explicitly — this table's column has a default but
        // no $onUpdate, and the console's queue sorts by it. A reply that did
        // not move the ticket up the queue is a reply nobody sees.
        .set({
          updatedAt: sql`now()`,
          ...(nextStatusId ? { statusId: nextStatusId } : {}),
        })
        .where(eq(supportTickets.id, id));
    });

    return this.findOne(id, userId);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * The ownership gate. Both the id and the owner are in the WHERE clause, so
   * "somebody else's ticket" and "no such ticket" produce the same empty result
   * and therefore the same 404 — a 403 would confirm the id exists.
   */
  private async requireOwnTicket(id: string, userId: string) {
    const [row] = await this.ticketQuery().where(this.ownedTicket(id, userId));

    if (!row) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Support ticket not found.',
      });
    }
    return row;
  }

  private ownedTicket(id: string, userId: string) {
    return and(eq(supportTickets.id, id), eq(supportTickets.userId, userId));
  }

  /**
   * The citizen's view of the thread. `notInternal` is applied in the WHERE
   * clause, so an internal note is not fetched, not mapped, and not available to
   * anything downstream that might serialise it.
   *
   * The admin's name is NOT returned. Staff replies are attributed to "Support"
   * and nothing else: admins here also hide reports and suspend accounts, and a
   * citizen unhappy about a moderation decision must not learn from their own
   * support thread which member of staff to go after. Who replied is recorded in
   * admin_audit_logs, where it is available to the people who need it.
   */
  private async citizenMessages(ticketId: string, userId: string) {
    const rows = await db
      .select({
        id: supportTicketMessages.id,
        body: supportTicketMessages.body,
        createdAt: supportTicketMessages.createdAt,
        senderUserId: supportTicketMessages.senderUserId,
        senderTypeKey: ticketMessageSenderTypes.key,
        senderName: user.name,
      })
      .from(supportTicketMessages)
      .innerJoin(
        ticketMessageSenderTypes,
        eq(supportTicketMessages.senderTypeId, ticketMessageSenderTypes.id),
      )
      // leftJoin, not innerJoin: sender_user_id is SET NULL, so a message
      // outlives its author's account deletion. The body stays; the identity
      // goes.
      .leftJoin(user, eq(supportTicketMessages.senderUserId, user.id))
      .where(
        and(eq(supportTicketMessages.ticketId, ticketId), this.notInternal),
      )
      .orderBy(
        asc(supportTicketMessages.createdAt),
        asc(supportTicketMessages.id),
      );

    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      senderType: row.senderTypeKey,
      authorName: row.senderTypeKey === 'admin' ? null : row.senderName,
      isMine: row.senderUserId !== null && row.senderUserId === userId,
    }));
  }

  /** Per-ticket message totals for the list, counting only what a citizen sees. */
  private async messageCounts(ticketIds: string[]) {
    if (ticketIds.length === 0) return new Map<string, MessageTotals>();

    const rows = await db
      .select({
        ticketId: supportTicketMessages.ticketId,
        messageCount: count(),
        lastMessageAt: max(supportTicketMessages.createdAt),
      })
      .from(supportTicketMessages)
      .where(
        and(
          inArray(supportTicketMessages.ticketId, ticketIds),
          this.notInternal,
        ),
      )
      .groupBy(supportTicketMessages.ticketId);

    return new Map(
      rows.map((row) => [
        row.ticketId,
        {
          messageCount: Number(row.messageCount),
          lastMessageAt: row.lastMessageAt
            ? row.lastMessageAt.toISOString()
            : null,
        },
      ]),
    );
  }

  private ticketQuery() {
    return db
      .select({
        id: supportTickets.id,
        ticketNumber: supportTickets.ticketNumber,
        subject: supportTickets.subject,
        description: supportTickets.description,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        resolvedAt: supportTickets.resolvedAt,
        closedAt: supportTickets.closedAt,
        relatedReportId: supportTickets.relatedReportId,
        categoryId: ticketCategories.id,
        categoryKey: ticketCategories.key,
        categoryLabel: ticketCategories.label,
        statusKey: ticketStatuses.key,
        statusLabel: ticketStatuses.label,
        priorityKey: ticketPriorities.key,
        priorityLabel: ticketPriorities.label,
      })
      .from(supportTickets)
      .innerJoin(
        ticketCategories,
        eq(supportTickets.categoryId, ticketCategories.id),
      )
      .innerJoin(ticketStatuses, eq(supportTickets.statusId, ticketStatuses.id))
      .innerJoin(
        ticketPriorities,
        eq(supportTickets.priorityId, ticketPriorities.id),
      );
  }

  private toResponse(row: TicketRow, messages?: MessageTotals) {
    return {
      id: row.id,
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      // Both are "the last time the ticket entered that state", not "it is in
      // that state now" — `status.key` is the only answer to that. A reopened
      // ticket keeps its resolvedAt, because it really was resolved once.
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      // The id the citizen themselves supplied, and nothing derived from the
      // report — echoing its title back would leak the content of a report a
      // moderator has since hidden.
      relatedReportId: row.relatedReportId,
      category: {
        id: row.categoryId,
        key: row.categoryKey,
        label: row.categoryLabel,
      },
      status: { key: row.statusKey, label: row.statusLabel },
      priority: { key: row.priorityKey, label: row.priorityLabel },
      messageCount: messages?.messageCount ?? 0,
      lastMessageAt: messages?.lastMessageAt ?? null,
      /** False only when the ticket is closed. See ticket-status.ts. */
      canReply: acceptsMessages(row.statusKey),
    };
  }

  private async resolveCategory(dto: CreateTicketDto) {
    const [category] = await db
      .select({ id: ticketCategories.id })
      .from(ticketCategories)
      .where(
        dto.categoryId
          ? eq(ticketCategories.id, dto.categoryId)
          : eq(ticketCategories.key, dto.categoryKey!),
      );

    if (!category) {
      throw new BadRequestException({
        code: 'UNKNOWN_TICKET_CATEGORY',
        message: 'Unknown ticket category',
      });
    }
    return category;
  }

  private async statusIdFor(key: string): Promise<string> {
    return this.lookupId(ticketStatuses, key, 'ticket_statuses');
  }

  private async priorityIdFor(key: string): Promise<string> {
    return this.lookupId(ticketPriorities, key, 'ticket_priorities');
  }

  private async senderTypeIdFor(key: string): Promise<string> {
    return this.lookupId(
      ticketMessageSenderTypes,
      key,
      'ticket_message_sender_types',
    );
  }

  /**
   * Loud, not silent — the same failure mode AdminAuditService.record() uses. A
   * lifecycle key the code branches on but the database has never heard of means
   * db:seed has not run since the key was added, and quietly writing a ticket
   * without a status is worse than a 500 that names the cause.
   */
  private async lookupId(
    table:
      | typeof ticketStatuses
      | typeof ticketPriorities
      | typeof ticketMessageSenderTypes,
    key: string,
    tableName: string,
  ): Promise<string> {
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.key, key));

    if (!row) {
      throw new Error(
        `${tableName} row missing for key "${key}" — did db:seed run?`,
      );
    }
    return row.id;
  }
}
