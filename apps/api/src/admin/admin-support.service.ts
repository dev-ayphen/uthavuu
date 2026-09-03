import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  max,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminUsers } from '../db/schema/admin-schema';
import {
  userAccountStatus,
  userStatuses,
} from '../db/schema/user-status-schema';
import {
  supportTicketMessages,
  supportTickets,
  ticketCategories,
  ticketMessageSenderTypes,
  ticketPriorities,
  ticketStatuses,
} from '../db/schema/tickets-schema';
import { ACTIVE_STATUS_KEY } from '../account-status/account-status';
import { acceptsMessages, statusAfterMessage } from '../support/ticket-status';
import type { AdminAuditAction } from './admin-audit-catalogue';
import { AdminAuditService } from './admin-audit.service';
import type { Executor } from './admin-audit.service';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import {
  ASSIGNED_UNASSIGNED,
  type ListSupportTicketsDto,
} from './dto/list-support-tickets.dto';
import type { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import type { UpdateSupportTicketInput } from './dto/update-support-ticket.dto';
import type { CreateTicketReplyDto } from './dto/create-ticket-reply.dto';
import type { CloseSupportTicketDto } from './dto/close-support-ticket.dto';

/** The admin who owns a ticket, joined a second time from the same table. */
const assignedAdmin = alias(user, 'assigned_admin');
/** The author of a message, ditto. */
const messageSender = alias(user, 'message_sender');

const RESOLVED_STATUS_KEY = 'resolved';
const CLOSED_STATUS_KEY = 'closed';

/**
 * Platform -> Support.
 *
 * The citizen side of these tables is SupportService, which filters on `userId`
 * and strips internal notes — useless for a queue, and correctly so. Hence a
 * separate admin projection rather than a role branch inside those methods
 * (ADR 0009).
 *
 * WHAT THIS SERVICE MAY SEE THAT THE CITIZEN ONE MAY NOT: the reporter's phone
 * number, their account status, who the ticket is assigned to, and internal
 * notes. All four are legitimate here and none of them is reachable from a
 * citizen route, because the two projections share no code path — only the
 * lifecycle rules in support/ticket-status.ts, which are about the ticket rather
 * than about who is looking at it.
 *
 * WHAT IT STILL MAY NOT SEE: Mission Chat. A ticket carries `relatedReportId`
 * and this service never joins `mission_messages`. ADR 0010 holds regardless of
 * which screen the request came from.
 */
@Injectable()
export class AdminSupportService {
  constructor(private readonly auditService: AdminAuditService) {}

  /**
   * `coalesce(status, 'active')` — absence of a `user_account_status` row IS
   * active (db/schema/user-status-schema.ts), the same expression
   * AdminUsersService uses for the same reason.
   */
  private readonly userStatusKeySql = sql<string>`coalesce(${userStatuses.key}, ${ACTIVE_STATUS_KEY})`;

  async list(query: ListSupportTicketsDto) {
    // `category` is the frozen contract's spelling, `categoryKey` the one this
    // endpoint originally shipped with. See the DTO for why both are accepted.
    const categoryKey = query.category ?? query.categoryKey;

    const filters = [
      query.status ? eq(ticketStatuses.key, query.status) : undefined,
      categoryKey ? eq(ticketCategories.key, categoryKey) : undefined,
      query.priority ? eq(ticketPriorities.key, query.priority) : undefined,
      // `unassigned` is a sentinel, not a user id — see ASSIGNED_UNASSIGNED.
      query.assigned === ASSIGNED_UNASSIGNED
        ? isNull(supportTickets.assignedAdminId)
        : query.assigned
          ? eq(supportTickets.assignedAdminId, query.assigned)
          : undefined,
      query.userId ? eq(supportTickets.userId, query.userId) : undefined,
      query.from ? gte(supportTickets.createdAt, query.from) : undefined,
      query.to ? lte(supportTickets.createdAt, query.to) : undefined,
      // ESCAPE '\' is declared explicitly because likePattern() escapes the
      // caller's own % and _ with a backslash. Without the clause Postgres uses
      // its default escape character (also backslash) — stating it keeps the
      // pattern's meaning independent of that default, and makes a search for a
      // literal "50%" match "50%" rather than everything.
      //
      // ticket_number is searched too: it is the reference a citizen quotes on
      // the phone, so "find UT-1042" is the single most likely thing typed into
      // this box, and a search that could not find it would look broken.
      query.q
        ? sql`(${supportTickets.subject} ilike ${likePattern(query.q)} escape '\\'
            or ${supportTickets.description} ilike ${likePattern(query.q)} escape '\\'
            or ${supportTickets.ticketNumber} ilike ${likePattern(query.q)} escape '\\')`
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

      this.countQuery().where(where),
    ]);

    const totals = await this.messageTotals(rows.map((r) => r.id));

    return paginate(
      rows.map((row) => this.toResponse(row, totals.get(row.id))),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  /**
   * The lookup tables this section filters on, served from the database.
   *
   * This exists because the console was forced to hardcode all three
   * (`features/support-tickets/catalogue.ts` says so, and names this endpoint as
   * the fix). A hardcoded filter list drifts silently: the service matches on
   * `eq(key, ...)`, so a key that no longer exists returns 200 with an empty
   * page, which reads as "no tickets in that state" rather than as a broken
   * filter. Same argument ADR 0012 makes for the audit catalogue, and the same
   * shape of endpoint.
   */
  async catalogue() {
    const [statuses, priorities, categories] = await Promise.all([
      db
        .select({ key: ticketStatuses.key, label: ticketStatuses.label })
        .from(ticketStatuses)
        .orderBy(asc(ticketStatuses.sortOrder), asc(ticketStatuses.key)),
      db
        .select({ key: ticketPriorities.key, label: ticketPriorities.label })
        .from(ticketPriorities)
        .orderBy(asc(ticketPriorities.sortOrder), asc(ticketPriorities.key)),
      db
        .select({
          id: ticketCategories.id,
          key: ticketCategories.key,
          label: ticketCategories.label,
        })
        .from(ticketCategories)
        .orderBy(asc(ticketCategories.label)),
    ]);

    return { statuses, priorities, categories };
  }

  /** The ticket, its whole conversation (internal notes included), and context. */
  async findOne(id: string) {
    const row = await this.requireTicket(id);
    const messages = await this.messagesFor(id);

    return {
      ...this.toResponse(row, {
        messageCount: messages.length,
        lastMessageAt: messages.at(-1)?.createdAt ?? null,
      }),
      messages,
    };
  }

  /**
   * The console's edit surface: status, priority, assignee, category.
   *
   * ONE AUDIT ROW PER FIELD THAT MOVED, not one per PATCH. This diverges from
   * `platform_setting.update`, which records a whole settings object as a single
   * act — deliberately, because those keys are homogeneous configuration whose
   * before/after diff says everything. These four are different acts with
   * different consequences: assigning is a workload decision, prioritising is
   * triage, and "who has been assigning tickets to whom" is a question the
   * console's audit filter should be able to answer without reading every diff.
   *
   * All of them, and the update itself, share one transaction — so a PATCH that
   * fails halfway leaves neither the change nor a log claiming it happened.
   */
  async update(
    id: string,
    admin: AdminIdentity,
    dto: UpdateSupportTicketInput,
    meta: AdminRequestMeta,
  ) {
    const ticket = await this.requireTicket(id);

    // Every lookup and validity check happens BEFORE the transaction opens: a
    // rejected PATCH should never have held a row lock, and record()'s own
    // catalogue reads go to a second pooled connection (ADR 0012's "one
    // wrinkle"), so the less time the transaction is open the better.
    const status = dto.status ? await this.requireStatus(dto.status) : null;
    const priority = dto.priority
      ? await this.requirePriority(dto.priority)
      : null;
    const category = dto.categoryId
      ? await this.requireCategory(dto.categoryId)
      : null;
    const assignee =
      dto.assignedAdminId === undefined
        ? undefined
        : dto.assignedAdminId === null
          ? null
          : await this.requireAdminAccount(dto.assignedAdminId);

    const set: Partial<typeof supportTickets.$inferInsert> = {};

    if (status && status.id !== ticket.statusId) {
      set.statusId = status.id;
      // Keep the lifecycle timestamps honest when the status is driven straight
      // from the dropdown rather than through resolve()/close(). Without this a
      // ticket dragged to Resolved would show no resolvedAt, and the console
      // renders that column.
      if (status.key === RESOLVED_STATUS_KEY) set.resolvedAt = new Date();
      if (status.key === CLOSED_STATUS_KEY) set.closedAt = new Date();
    }
    if (priority && priority.id !== ticket.priorityId) {
      set.priorityId = priority.id;
    }
    if (category && category.id !== ticket.categoryId) {
      set.categoryId = category.id;
    }
    if (assignee !== undefined) {
      const nextId = assignee === null ? null : assignee.id;
      if (nextId !== ticket.assignedAdminId) set.assignedAdminId = nextId;
    }

    if (Object.keys(set).length === 0) {
      // Nothing actually moved. Refused rather than accepted-as-a-no-op for the
      // reason updateStatus() gives: writing audit rows for a transition that
      // did not happen is worse than a 409.
      throw new ConflictException({
        code: 'TICKET_UNCHANGED',
        message: 'That change would leave the ticket exactly as it is.',
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(supportTickets)
        .set({ ...set, updatedAt: sql`now()` })
        .where(eq(supportTickets.id, id));

      const record = (
        action: AdminAuditAction,
        before: unknown,
        after: unknown,
      ) =>
        this.auditService.record({
          admin,
          action,
          targetId: id,
          targetLabel: ticket.ticketNumber,
          before,
          after,
          reason: dto.reason ?? null,
          meta,
          tx,
        });

      if (set.statusId && status) {
        await record(
          'support_ticket.status_change',
          { statusKey: ticket.statusKey },
          { statusKey: status.key },
        );
      }
      if (set.priorityId && priority) {
        await record(
          'support_ticket.priority_change',
          { priorityKey: ticket.priorityKey },
          { priorityKey: priority.key },
        );
      }
      if (set.categoryId && category) {
        await record(
          'support_ticket.category_change',
          { categoryKey: ticket.categoryKey },
          { categoryKey: category.key },
        );
      }
      if (set.assignedAdminId !== undefined) {
        await record(
          'support_ticket.assign',
          {
            assignedAdminId: ticket.assignedAdminId,
            assignedAdminName: ticket.assignedAdminName,
          },
          {
            assignedAdminId: set.assignedAdminId,
            assignedAdminName: assignee ? assignee.name : null,
          },
        );
      }
    });

    return this.findOne(id);
  }

  /**
   * The narrow status-only route this controller shipped with, kept because a
   * console is already calling it and ADR 0012 records it by name.
   *
   * It is a thin wrapper over update() rather than a second implementation —
   * two code paths that move a ticket's status is exactly how the two of them
   * end up disagreeing about resolvedAt.
   */
  async updateStatus(
    id: string,
    admin: AdminIdentity,
    dto: UpdateTicketStatusDto,
    meta: AdminRequestMeta,
  ) {
    // The old route's 409 named the status; update()'s names the whole ticket.
    // Preserved here because the console branches on the code, not the prose.
    const ticket = await this.requireTicket(id);
    const target = await this.requireStatus(dto.statusKey);
    if (target.id === ticket.statusId) {
      throw new ConflictException({
        code: 'TICKET_ALREADY_IN_STATUS',
        message: `This ticket is already "${target.key}".`,
      });
    }

    return this.update(
      id,
      admin,
      { status: dto.statusKey, reason: dto.reason },
      meta,
    );
  }

  /**
   * A staff reply, or an internal note.
   *
   * The status move is computed by the SAME function the citizen path uses
   * (statusAfterMessage), which is the whole reason that function exists in
   * support/ticket-status.ts rather than in either service.
   *
   * An internal note never moves the ticket — a note is staff talking to staff,
   * and treating it as an answer would tell the queue a citizen has been replied
   * to when nobody has replied to them.
   */
  async addMessage(
    id: string,
    admin: AdminIdentity,
    dto: CreateTicketReplyDto,
    meta: AdminRequestMeta,
  ) {
    const ticket = await this.requireTicket(id);
    this.requireOpenForMessages(ticket.statusKey);

    const nextStatusKey = statusAfterMessage({
      statusKey: ticket.statusKey,
      sender: 'admin',
      isInternalNote: dto.isInternalNote,
    });
    const nextStatus = nextStatusKey
      ? await this.requireStatus(nextStatusKey)
      : null;
    const senderTypeId = await this.senderTypeIdFor('admin');

    await db.transaction(async (tx) => {
      await this.insertMessage(tx, {
        ticketId: id,
        senderTypeId,
        senderUserId: admin.userId,
        body: dto.body,
        isInternalNote: dto.isInternalNote,
      });

      await tx
        .update(supportTickets)
        .set({
          updatedAt: sql`now()`,
          ...(nextStatus ? { statusId: nextStatus.id } : {}),
        })
        .where(eq(supportTickets.id, id));

      await this.auditService.record({
        admin,
        // Two keys, not one flag: see admin-audit-catalogue.ts. A note is a
        // claim about the citizen they will never see and cannot contest.
        action: dto.isInternalNote
          ? 'support_ticket.note'
          : 'support_ticket.reply',
        targetId: id,
        targetLabel: ticket.ticketNumber,
        // The BODY IS NOT RECORDED. It already lives, permanently and
        // unedited, in support_ticket_messages — copying it here would
        // duplicate a citizen's personal data into a table with different
        // retention for no answer it does not already give. The auto-transition
        // is recorded instead, because that is the part the message row does
        // not show.
        before: { statusKey: ticket.statusKey },
        after: {
          statusKey: nextStatus ? nextStatus.key : ticket.statusKey,
          isInternalNote: dto.isInternalNote,
        },
        reason: null,
        meta,
        tx,
      });
    });

    return this.findOne(id);
  }

  /**
   * "We believe this is fixed." The citizen may still reply, and a reply
   * reopens the ticket (statusAfterMessage) — which is the entire difference
   * between this and close().
   */
  async resolve(
    id: string,
    admin: AdminIdentity,
    dto: CloseSupportTicketDto,
    meta: AdminRequestMeta,
  ) {
    return this.finish(id, admin, dto, meta, {
      statusKey: RESOLVED_STATUS_KEY,
      action: 'support_ticket.resolve',
      timestamp: 'resolvedAt',
    });
  }

  /**
   * "This conversation is over." New messages are refused from both sides after
   * this — see requireOpenForMessages. Reopening is a deliberate PATCH, not a
   * side effect of somebody typing.
   */
  async close(
    id: string,
    admin: AdminIdentity,
    dto: CloseSupportTicketDto,
    meta: AdminRequestMeta,
  ) {
    return this.finish(id, admin, dto, meta, {
      statusKey: CLOSED_STATUS_KEY,
      action: 'support_ticket.close',
      timestamp: 'closedAt',
    });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * resolve() and close() are the same act with a different terminal status, so
   * they are the same method with a different terminal status. The optional
   * `message` is posted as a normal, citizen-visible reply inside the SAME
   * transaction: a resolution that arrives without a word of explanation is how
   * tickets get resolved in silence, and making staff post it as a separate
   * request first leaves a window where the status moved and the explanation did
   * not.
   */
  private async finish(
    id: string,
    admin: AdminIdentity,
    dto: CloseSupportTicketDto,
    meta: AdminRequestMeta,
    target: {
      statusKey: typeof RESOLVED_STATUS_KEY | typeof CLOSED_STATUS_KEY;
      action: 'support_ticket.resolve' | 'support_ticket.close';
      timestamp: 'resolvedAt' | 'closedAt';
    },
  ) {
    const ticket = await this.requireTicket(id);
    const status = await this.requireStatus(target.statusKey);

    if (status.id === ticket.statusId) {
      throw new ConflictException({
        code: 'TICKET_ALREADY_IN_STATUS',
        message: `This ticket is already "${status.key}".`,
      });
    }

    // After the guard, so a refused resolve/close costs no extra query — and
    // before the transaction, for the reason insertMessage() documents.
    const senderTypeId = dto.message
      ? await this.senderTypeIdFor('admin')
      : null;

    await db.transaction(async (tx) => {
      if (dto.message && senderTypeId) {
        await this.insertMessage(tx, {
          ticketId: id,
          senderTypeId,
          senderUserId: admin.userId,
          body: dto.message,
          // A closing message is part of the closing act and goes to the
          // citizen. An internal note here would be a private farewell, which is
          // not a thing.
          isInternalNote: false,
        });
      }

      await tx
        .update(supportTickets)
        .set({
          statusId: status.id,
          // Built by branch rather than by computed key: a computed key here
          // widens the object's type until Drizzle stops checking which columns
          // are being written, which is the one thing this .set() is for.
          ...(target.timestamp === 'resolvedAt'
            ? { resolvedAt: new Date() }
            : { closedAt: new Date() }),
          updatedAt: sql`now()`,
        })
        .where(eq(supportTickets.id, id));

      await this.auditService.record({
        admin,
        action: target.action,
        targetId: id,
        targetLabel: ticket.ticketNumber,
        before: { statusKey: ticket.statusKey },
        after: { statusKey: status.key, notified: Boolean(dto.message) },
        reason: dto.reason ?? null,
        meta,
        tx,
      });
    });

    return this.findOne(id);
  }

  /**
   * A pure write — every lookup it needs is resolved by the caller BEFORE the
   * transaction opens.
   *
   * That is deliberate, not stylistic. Drizzle's `tx` holds one pooled
   * connection; a `db` query issued from inside the callback checks out a
   * SECOND one and blocks until it is free. ADR 0012 records the same wrinkle in
   * AdminAuditService.record() and notes it would deadlock at pool size 1. There
   * is no reason to add another instance of it for a lookup whose value is known
   * before the first row is touched.
   */
  private insertMessage(
    tx: Executor,
    message: {
      ticketId: string;
      senderTypeId: string;
      senderUserId: string;
      body: string;
      isInternalNote: boolean;
    },
  ) {
    return tx.insert(supportTicketMessages).values({
      id: uuidv7(),
      ticketId: message.ticketId,
      senderTypeId: message.senderTypeId,
      senderUserId: message.senderUserId,
      body: message.body,
      isInternalNote: message.isInternalNote,
    });
  }

  /**
   * A closed ticket is a stable record, not a thread that quietly grows after
   * everyone stopped reading it — so it refuses new messages from BOTH sides,
   * staff included, and internal notes included. Adding to one means reopening
   * it first, which is a visible, audited act rather than an invisible append.
   */
  private requireOpenForMessages(statusKey: string) {
    if (!acceptsMessages(statusKey)) {
      throw new ConflictException({
        code: 'TICKET_CLOSED',
        message:
          'This ticket is closed. Reopen it before adding to the conversation.',
      });
    }
  }

  /** The whole thread, internal notes included. Admin-only, by construction. */
  private async messagesFor(ticketId: string) {
    const rows = await db
      .select({
        id: supportTicketMessages.id,
        body: supportTicketMessages.body,
        isInternalNote: supportTicketMessages.isInternalNote,
        createdAt: supportTicketMessages.createdAt,
        senderTypeKey: ticketMessageSenderTypes.key,
        senderId: supportTicketMessages.senderUserId,
        senderName: messageSender.name,
      })
      .from(supportTicketMessages)
      .innerJoin(
        ticketMessageSenderTypes,
        eq(supportTicketMessages.senderTypeId, ticketMessageSenderTypes.id),
      )
      // leftJoin: sender_user_id is SET NULL, so a message outlives its author's
      // account deletion. The body stays; the identity goes.
      .leftJoin(
        messageSender,
        eq(supportTicketMessages.senderUserId, messageSender.id),
      )
      .where(eq(supportTicketMessages.ticketId, ticketId))
      .orderBy(
        asc(supportTicketMessages.createdAt),
        asc(supportTicketMessages.id),
      );

    return rows.map((row) => ({
      id: row.id,
      senderType: row.senderTypeKey,
      sender: row.senderId ? { id: row.senderId, name: row.senderName } : null,
      body: row.body,
      isInternalNote: row.isInternalNote,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async messageTotals(ticketIds: string[]) {
    if (ticketIds.length === 0) {
      return new Map<string, MessageTotals>();
    }

    const rows = await db
      .select({
        ticketId: supportTicketMessages.ticketId,
        messageCount: count(),
        lastMessageAt: max(supportTicketMessages.createdAt),
      })
      .from(supportTicketMessages)
      .where(inArray(supportTicketMessages.ticketId, ticketIds))
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

  private async requireTicket(id: string) {
    const [row] = await this.baseQuery().where(eq(supportTickets.id, id));

    if (!row) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Support ticket not found.',
      });
    }
    return row;
  }

  /**
   * Resolved against the lookup table, not an enum — adding a status is a
   * db:seed change and these endpoints pick it up without a redeploy.
   */
  private async requireStatus(key: string) {
    const [row] = await db
      .select({ id: ticketStatuses.id, key: ticketStatuses.key })
      .from(ticketStatuses)
      .where(eq(ticketStatuses.key, key));

    if (!row) {
      throw new BadRequestException({
        code: 'UNKNOWN_TICKET_STATUS',
        message: `"${key}" is not a known ticket status.`,
      });
    }
    return row;
  }

  private async requirePriority(key: string) {
    const [row] = await db
      .select({ id: ticketPriorities.id, key: ticketPriorities.key })
      .from(ticketPriorities)
      .where(eq(ticketPriorities.key, key));

    if (!row) {
      throw new BadRequestException({
        code: 'UNKNOWN_TICKET_PRIORITY',
        message: `"${key}" is not a known ticket priority.`,
      });
    }
    return row;
  }

  private async requireCategory(id: string) {
    const [row] = await db
      .select({ id: ticketCategories.id, key: ticketCategories.key })
      .from(ticketCategories)
      .where(eq(ticketCategories.id, id));

    if (!row) {
      throw new BadRequestException({
        code: 'UNKNOWN_TICKET_CATEGORY',
        message: 'Unknown ticket category',
      });
    }
    return row;
  }

  /**
   * A ticket can only be assigned to somebody who actually has console access.
   *
   * The FK is to `user.id`, not to `admin_users.user_id` — deliberately, so a
   * revoked admin's past assignment does not vanish from the record
   * (tickets-schema.ts). That leaves nothing in the database stopping a ticket
   * from being assigned to a random citizen, so the check lives here.
   */
  private async requireAdminAccount(userId: string) {
    const [row] = await db
      .select({ id: user.id, name: user.name })
      .from(adminUsers)
      .innerJoin(user, eq(adminUsers.userId, user.id))
      .where(eq(adminUsers.userId, userId));

    if (!row) {
      throw new BadRequestException({
        code: 'NOT_AN_ADMIN',
        message: 'A ticket can only be assigned to an admin account.',
      });
    }
    return row;
  }

  private async senderTypeIdFor(key: string): Promise<string> {
    const [row] = await db
      .select({ id: ticketMessageSenderTypes.id })
      .from(ticketMessageSenderTypes)
      .where(eq(ticketMessageSenderTypes.key, key));

    // Loud, not silent — the same failure AdminAuditService.record() raises for
    // a missing catalogue row, for the same reason.
    if (!row) {
      throw new Error(
        `ticket_message_sender_types row missing for key "${key}" — did db:seed run?`,
      );
    }
    return row.id;
  }

  private countQuery() {
    return db
      .select({ count: sql<string>`count(*)` })
      .from(supportTickets)
      .innerJoin(
        ticketCategories,
        eq(supportTickets.categoryId, ticketCategories.id),
      )
      .innerJoin(ticketStatuses, eq(supportTickets.statusId, ticketStatuses.id))
      .innerJoin(
        ticketPriorities,
        eq(supportTickets.priorityId, ticketPriorities.id),
      )
      .innerJoin(user, eq(supportTickets.userId, user.id))
      .leftJoin(userAccountStatus, eq(userAccountStatus.userId, user.id))
      .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
      .leftJoin(
        assignedAdmin,
        eq(supportTickets.assignedAdminId, assignedAdmin.id),
      );
  }

  private baseQuery() {
    return (
      db
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
          statusId: supportTickets.statusId,
          statusKey: ticketStatuses.key,
          statusLabel: ticketStatuses.label,
          priorityId: supportTickets.priorityId,
          priorityKey: ticketPriorities.key,
          priorityLabel: ticketPriorities.label,
          userId: user.id,
          userName: user.name,
          userPhoneNumber: user.phoneNumber,
          userAvatarUrl: user.avatarUrl,
          userStatusKey: this.userStatusKeySql,
          userStatusLabel: userStatuses.label,
          assignedAdminId: supportTickets.assignedAdminId,
          assignedAdminName: assignedAdmin.name,
        })
        .from(supportTickets)
        .innerJoin(
          ticketCategories,
          eq(supportTickets.categoryId, ticketCategories.id),
        )
        .innerJoin(
          ticketStatuses,
          eq(supportTickets.statusId, ticketStatuses.id),
        )
        .innerJoin(
          ticketPriorities,
          eq(supportTickets.priorityId, ticketPriorities.id),
        )
        // innerJoin on `user` is correct here and must stay an innerJoin.
        // support_tickets.user_id is NOT NULL and ON DELETE CASCADE, so a ticket
        // cannot outlive its author — unlike reports and comments, which use SET
        // NULL to preserve community history and therefore need leftJoin. Someone
        // "fixing" this to a leftJoin for consistency would be adding a branch for
        // a row that cannot exist.
        .innerJoin(user, eq(supportTickets.userId, user.id))
        // leftJoin, and coalesced above: no user_account_status row means active.
        .leftJoin(userAccountStatus, eq(userAccountStatus.userId, user.id))
        .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
        // leftJoin: assigned_admin_id is nullable (unassigned) and SET NULL (the
        // admin left). Both are normal states, not missing data.
        .leftJoin(
          assignedAdmin,
          eq(supportTickets.assignedAdminId, assignedAdmin.id),
        )
    );
  }

  private toResponse(row: AdminTicketRow, totals?: MessageTotals) {
    return {
      id: row.id,
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      // "The last time the ticket entered that state", not "it is in that state
      // now" — `status.key` is the only answer to that. A reopened ticket keeps
      // its resolvedAt, because it really was resolved once.
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      // A LINK AND NOTHING ELSE. No title, no excerpt, and never the report's
      // Mission Chat (ADR 0010). Rendering content "for context" would quietly
      // relocate that boundary into a support screen.
      relatedReportId: row.relatedReportId,
      category: {
        id: row.categoryId,
        key: row.categoryKey,
        label: row.categoryLabel,
      },
      status: { key: row.statusKey, label: row.statusLabel },
      priority: { key: row.priorityKey, label: row.priorityLabel },
      user: {
        id: row.userId,
        name: row.userName,
        // Staff need it to follow up on a ticket. This is an admin-only
        // projection behind platform:manage — it is never reachable from a
        // citizen route.
        //
        // BOTH SPELLINGS ON PURPOSE. `phone` is the frozen contract's name,
        // `phoneNumber` is what this endpoint originally shipped and what the
        // console still reads as a fallback. One duplicated string ends an
        // entire class of "the phone column renders blank and nobody knows why"
        // across two lanes.
        phone: row.userPhoneNumber,
        phoneNumber: row.userPhoneNumber,
        // `active` | `suspended` (ADR 0011) — staff need to know whether the
        // person they are about to reply to can even sign in.
        status: {
          key: row.userStatusKey,
          label: row.userStatusLabel ?? 'Active',
        },
        avatarUrl: row.userAvatarUrl,
      },
      assignedAdmin: row.assignedAdminId
        ? { id: row.assignedAdminId, name: row.assignedAdminName }
        : null,
      messageCount: totals?.messageCount ?? 0,
      lastMessageAt: totals?.lastMessageAt ?? null,
    };
  }
}

interface MessageTotals {
  messageCount: number;
  lastMessageAt: string | null;
}

interface AdminTicketRow {
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
  statusId: string;
  statusKey: string;
  statusLabel: string;
  priorityId: string;
  priorityKey: string;
  priorityLabel: string;
  userId: string;
  userName: string;
  userPhoneNumber: string | null;
  userAvatarUrl: string | null;
  userStatusKey: string;
  userStatusLabel: string | null;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
}
