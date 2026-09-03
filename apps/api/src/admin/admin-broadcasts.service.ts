import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { alerts } from '../db/schema/alerts-schema';
import { user } from '../db/schema/auth-schema';
import { devices } from '../db/schema/devices-schema';
import {
  userAccountStatus,
  userStatuses,
} from '../db/schema/user-status-schema';
import {
  broadcastAudiences,
  broadcastStatuses,
  broadcasts,
} from '../db/schema/broadcasts-schema';
import type {
  BroadcastAudienceKey,
  BroadcastStatusKey,
} from '../db/schema/broadcasts-schema';
import {
  BROADCAST_ALERT_TYPE,
  DEFAULT_ALERT_LOCALE,
  isAlertLocale,
  renderBroadcastAlert,
  type AlertLocale,
  type BroadcastAlertCopy,
} from '../alerts/alert-templates';
import { PushService } from '../push/push.service';
import { AdminAuditService } from './admin-audit.service';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { CreateBroadcastDto } from './dto/create-broadcast.dto';
import type { ListBroadcastsDto } from './dto/list-broadcasts.dto';
import type { UpdateBroadcastDto } from './dto/update-broadcast.dto';

/** The row shape every projection below is built from. */
type BroadcastRow = {
  id: string;
  titleEn: string;
  titleTa: string | null;
  bodyEn: string;
  bodyTa: string | null;
  statusKey: string;
  statusLabel: string;
  audienceKey: string;
  audienceLabel: string;
  district: string | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
  recipientCount: number | null;
  deliveredCount: number | null;
  createdAt: Date;
  updatedAt: Date;
  senderId: string | null;
  senderName: string | null;
};

/** One recipient, resolved once and reused for both the alert row and the push. */
type Recipient = { id: string; locale: AlertLocale };

/** The copy fields a PATCH may touch, and the ones the audit diff is scoped to. */
const EDITABLE_COPY_FIELDS = [
  'titleEn',
  'bodyEn',
  'titleTa',
  'bodyTa',
  'scheduledAt',
] as const;

type EditableCopyField = (typeof EDITABLE_COPY_FIELDS)[number];

/**
 * How many recipients the fan-out holds in memory, inserts, and pushes at a time.
 *
 * 500 is chosen against the two things that actually bound it: a single
 * multi-row INSERT of 500 alert rows is one round trip and comfortably inside
 * Postgres' 65535-parameter limit (7 columns x 500 = 3500), and 500 ids is a
 * reasonable `IN (...)` list for the device lookup. Raising it buys fewer round
 * trips and costs a longer single statement; lowering it is always safe.
 */
const FANOUT_PAGE_SIZE = 500;

/**
 * How many `sendToUser` calls are in flight at once within a page.
 *
 * Each one is a `devices` SELECT plus an FCM round trip, so unbounded
 * `Promise.all` over a page would open 500 concurrent database operations
 * against a pool this repo shares with three other sessions. 10 keeps the
 * fan-out moving without being the reason an unrelated request cannot get a
 * connection.
 */
const PUSH_CONCURRENCY = 10;

/**
 * Community -> Broadcasts: an admin-authored notice PUSHED to citizens.
 *
 * ─── THE DESIGN, IN ONE PARAGRAPH ─────────────────────────────────────────
 *
 * A broadcast fans out to two things that already exist, and builds neither of
 * them. It writes one `alerts` row per recipient — which is the citizen's
 * existing in-app notification log, already polled at `GET /users/me/alerts`,
 * already rendered by the mobile Alerts tab — and then asks `PushService` (the
 * FCM module, with its real/dev providers and dead-token pruning) to notify the
 * subset of those people who have a registered device. There is no second
 * notification table and no second sender. Verified before any of this was
 * written, per ADR 0013's process rule.
 *
 * ─── ORDERING IS THE WHOLE CORRECTNESS ARGUMENT ───────────────────────────
 *
 * The alert rows are written and COMMITTED first; push is attempted afterwards,
 * best-effort, and its failure is swallowed. This ordering is not incidental.
 * Uthavu is an emergency product: FCM being unreachable — an expired service
 * account, a Google outage, a handset with no data — must not mean citizens
 * never learn what happened. Every recipient sees the broadcast the next time
 * they open the app regardless of whether a single push succeeded.
 *
 * The inverse ordering (push first, or both inside one transaction) fails badly
 * in both directions: a rollback after a successful push produces notifications
 * pointing at nothing, and a push failure inside a transaction would discard
 * alert rows that were perfectly good.
 *
 * ─── WHY THERE IS NO LONG TRANSACTION ─────────────────────────────────────
 *
 * The fan-out never opens a transaction spanning every user. Recipients are
 * walked in keyset-paged batches of FANOUT_PAGE_SIZE, and each batch's INSERT is
 * its own implicit transaction. A broadcast to the whole user base therefore
 * holds no lock any other request has to queue behind — which matters most
 * precisely when a broadcast is being sent, because that is when something is
 * going wrong in the real world and every other endpoint is busiest.
 */
@Injectable()
export class AdminBroadcastsService {
  constructor(
    private readonly auditService: AdminAuditService,
    private readonly pushService: PushService,
  ) {}

  /**
   * Lookup key -> id, memoised.
   *
   * Same contract as AdminAuditService's catalogue memo and
   * AdminCommunityUpdatesService's: master data changes only via `db:seed`, and
   * a miss always falls through to a query, so the map can be stale-empty but
   * never stale-wrong.
   */
  private readonly statusIds = new Map<string, string>();
  private readonly audienceIds = new Map<string, string>();

  async list(query: ListBroadcastsDto) {
    const filters = [
      // Soft-deleted broadcasts are excluded from every read path. There is no
      // restore endpoint, and delete is refused past `draft`, so a row this
      // hides never reached anybody.
      isNull(broadcasts.deletedAt),
      // An unknown status key yields an empty page rather than a 400, matching
      // AdminCommunityUpdatesService.list() and AdminSupportService.list(). The
      // filter's options come from the lookup table, so a value the console can
      // actually select always exists.
      query.status ? eq(broadcastStatuses.key, query.status) : undefined,
      // All four copy columns: staff search for the wording they remember, and
      // remembering it in Tamil is the normal case for a Tamil broadcast.
      // ESCAPE '\' is stated explicitly because likePattern() escapes the
      // caller's own % and _ with a backslash — see admin-pagination.ts.
      query.q
        ? sql`(${broadcasts.titleEn} ilike ${likePattern(query.q)} escape '\\'
            or ${broadcasts.bodyEn} ilike ${likePattern(query.q)} escape '\\'
            or ${broadcasts.titleTa} ilike ${likePattern(query.q)} escape '\\'
            or ${broadcasts.bodyTa} ilike ${likePattern(query.q)} escape '\\')`
        : undefined,
    ].filter((f) => f !== undefined);

    const where = and(...filters);

    const [rows, [countRow]] = await Promise.all([
      this.baseQuery()
        .where(where)
        // id is the tiebreaker so a page boundary is stable when two broadcasts
        // share a createdAt — without it, offset paging can repeat or skip a
        // row. uuidv7 ids are time-ordered, so this is true write order.
        .orderBy(desc(broadcasts.createdAt), desc(broadcasts.id))
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(broadcasts)
        .innerJoin(
          broadcastStatuses,
          eq(broadcasts.statusId, broadcastStatuses.id),
        )
        .innerJoin(
          broadcastAudiences,
          eq(broadcasts.audienceId, broadcastAudiences.id),
        )
        .where(where),
    ]);

    return paginate(
      rows.map((row) => this.toResponse(row)),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  async findOne(id: string) {
    return this.toResponse(await this.requireBroadcast(id));
  }

  /**
   * Creates a broadcast that has notified nobody.
   *
   * Status follows the schedule rather than being a separate input: a
   * `scheduledAt` makes it `scheduled`, its absence leaves it `draft`. There is
   * no path here that sends — creating and sending are two acts with two audit
   * rows, and an endpoint that could do both would make "who decided to notify
   * fifty thousand people" answerable only by diffing JSON.
   */
  async create(
    admin: AdminIdentity,
    dto: CreateBroadcastDto,
    meta: AdminRequestMeta,
  ) {
    const scheduledAt = dto.scheduledAt ?? null;
    const statusId = await this.statusIdFor(
      scheduledAt ? 'scheduled' : 'draft',
    );
    const audienceId = await this.audienceIdFor(dto.audience);
    const id = uuidv7();

    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(broadcasts)
        .values({
          id,
          titleEn: dto.titleEn,
          bodyEn: dto.bodyEn,
          titleTa: dto.titleTa ?? null,
          bodyTa: dto.bodyTa ?? null,
          statusId,
          audienceId,
          district: dto.audience === 'district' ? (dto.district ?? null) : null,
          scheduledAt,
          createdBy: admin.userId,
        })
        .returning();

      await this.auditService.record({
        admin,
        action: 'broadcast.create',
        targetId: created.id,
        targetLabel: created.titleEn,
        after: this.auditShape(created, dto.audience),
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  /**
   * Edits a broadcast that has not gone out yet.
   *
   * Refused on `sending`, `sent` and `cancelled`. For `sent` that is the
   * irreversibility rule (rule 1): the copy is already on people's phones and in
   * their alert lists, so editing this row would rewrite a history its readers
   * can still see. For `sending` it prevents changing the wording out from under
   * a fan-out that is mid-flight, which would deliver two different messages
   * under one broadcast.
   */
  async update(
    id: string,
    admin: AdminIdentity,
    dto: UpdateBroadcastDto,
    meta: AdminRequestMeta,
  ) {
    const existing = await this.requireBroadcast(id);
    this.assertMutable(existing, 'edited');

    // The MERGED audience/district pair, not the payload's. The DTO's refinement
    // can only see the fields the client sent, so a PATCH carrying
    // `district: null` alone — or flipping `audience` alone — sails past it while
    // still leaving a `district` audience with nothing to target, which would
    // fan out to the entire country. See create-broadcast.dto.ts.
    const audience = (dto.audience ??
      existing.audienceKey) as BroadcastAudienceKey;
    const district =
      dto.district !== undefined ? dto.district : existing.district;

    if (!this.audienceIsCoherent(audience, district)) {
      throw new BadRequestException({
        code: 'BROADCAST_AUDIENCE_MISMATCH',
        message:
          '`district` is required when audience is "district", and must be null when audience is "all_users". Check the values already stored on this broadcast — a PATCH that changes only one of the two is still compared against the other.',
      });
    }

    const row = await this.requireBroadcastRow(id);

    // Only the fields that actually differ. Without this, PATCHing a broadcast
    // with its current values would write an audit row claiming an edit that did
    // not happen, and the console's history would fill with noise.
    const changes: Partial<UpdateBroadcastDto> = {};
    for (const field of EDITABLE_COPY_FIELDS) {
      const next = dto[field];
      if (next === undefined) continue;
      if (this.sameValue(next, row[field])) continue;
      // The one cast: the compiler cannot follow that `dto[field]` and
      // `changes[field]` are the same key of the same type when `field` is a
      // loop variable over a union. Both sides are EditableCopyField-indexed.
      (changes as Record<string, unknown>)[field] = next;
    }

    const audienceChanged = audience !== existing.audienceKey;
    const districtChanged = district !== existing.district;

    if (
      Object.keys(changes).length === 0 &&
      !audienceChanged &&
      !districtChanged
    ) {
      throw new ConflictException({
        code: 'NO_EFFECTIVE_CHANGE',
        message:
          'Every field in this request already holds the value you sent.',
      });
    }

    // The schedule and the status move together — see create(). Clearing
    // `scheduledAt` returns a broadcast to `draft`; setting one makes it
    // `scheduled`. Recomputed only when the payload actually touched the
    // schedule, so an unrelated copy edit never silently changes status.
    const scheduledAt =
      dto.scheduledAt !== undefined ? dto.scheduledAt : row.scheduledAt;
    const nextStatusKey: BroadcastStatusKey = scheduledAt
      ? 'scheduled'
      : 'draft';
    const statusChanged = nextStatusKey !== existing.statusKey;

    const audienceId = audienceChanged
      ? await this.audienceIdFor(audience)
      : undefined;
    const statusId = statusChanged
      ? await this.statusIdFor(nextStatusKey)
      : undefined;

    return db.transaction(async (tx) => {
      await tx
        .update(broadcasts)
        .set({
          ...changes,
          ...(audienceChanged ? { audienceId } : {}),
          ...(districtChanged || audienceChanged ? { district } : {}),
          ...(statusChanged ? { statusId } : {}),
          // Set explicitly: this column has a default but no $onUpdate, so
          // nothing would move it otherwise — and the console sorts by it.
          updatedAt: sql`now()`,
        })
        .where(eq(broadcasts.id, id));

      // Scoped to what changed on both sides, so the entry reads as a diff
      // rather than two full copies a human has to compare by eye.
      const beforeFields: Record<string, unknown> = Object.fromEntries(
        Object.keys(changes).map((field) => [
          field,
          row[field as EditableCopyField],
        ]),
      );
      const afterFields: Record<string, unknown> = { ...changes };
      if (audienceChanged) {
        beforeFields.audience = existing.audienceKey;
        afterFields.audience = audience;
      }
      if (districtChanged || audienceChanged) {
        beforeFields.district = existing.district;
        afterFields.district = district;
      }
      if (statusChanged) {
        beforeFields.status = existing.statusKey;
        afterFields.status = nextStatusKey;
      }

      await this.auditService.record({
        admin,
        action: 'broadcast.update',
        targetId: id,
        targetLabel: row.titleEn,
        before: this.serialiseFields(beforeFields),
        after: this.serialiseFields(afterFields),
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  /**
   * Fans the broadcast out. IRREVERSIBLE.
   *
   * Five steps, in this order, and the order is the design:
   *
   *  1. Validate that this broadcast can still be sent, with a distinct error
   *     code per reason so the console can explain the refusal.
   *  2. CLAIM it — move draft/scheduled -> `sending` conditionally, in its own
   *     committed transaction, and record `broadcast.send` inside that same
   *     transaction. The condition is what makes two admins pressing Send
   *     simultaneously safe: the loser updates zero rows and is refused, rather
   *     than both fanning out and double-notifying everyone. Auditing at CLAIM
   *     time rather than at completion means "who pressed send" survives even a
   *     fan-out that crashes halfway.
   *  3. Write the `alerts` rows, keyset-paged, each page its own committed
   *     statement. This is the durable half and it is finished before any push
   *     is attempted.
   *  4. Push, best-effort, per page. Every failure is absorbed.
   *  5. Stamp `sent`, `sent_at` and the two counts.
   *
   * WHAT HAPPENS IF THE PROCESS DIES MID-FAN-OUT: the broadcast is left in
   * `sending` with alert rows already delivered for the pages that completed.
   * That is deliberately not self-healing. Automatically retrying would
   * re-notify everyone in the completed pages, and automatically reverting to
   * `draft` would invite exactly the same double-send by hand. `sending` is a
   * state a human has to look at — which is the honest outcome, and it is
   * visible in the console's status filter.
   */
  async send(id: string, admin: AdminIdentity, meta: AdminRequestMeta) {
    const existing = await this.requireBroadcast(id);
    this.assertSendable(existing);

    const audience = existing.audienceKey as BroadcastAudienceKey;

    // Defence in depth. The DTO and update() both enforce this pairing, so a row
    // reaching here incoherent means something wrote around them — and the
    // failure mode is the worst one this feature has: a broadcast meant for one
    // district going to the entire country, unrecoverably.
    if (!this.audienceIsCoherent(audience, existing.district)) {
      throw new BadRequestException({
        code: 'BROADCAST_AUDIENCE_MISMATCH',
        message:
          'This broadcast targets a district but has no district set. Refusing to send it to every user.',
      });
    }

    const copy: BroadcastAlertCopy = {
      titleEn: existing.titleEn,
      bodyEn: existing.bodyEn,
      titleTa: existing.titleTa,
      bodyTa: existing.bodyTa,
    };

    await this.claimForSending(existing, admin, meta);

    let recipientCount = 0;
    let deliveredCount = 0;
    let cursor: string | null = null;

    for (;;) {
      const page: Recipient[] = await this.recipientPage(
        audience,
        existing.district,
        cursor,
      );
      if (page.length === 0) break;

      // ── The durable half. Committed before anything is pushed. ──
      await db.insert(alerts).values(
        page.map((recipient) => {
          const rendered = renderBroadcastAlert(copy, recipient.locale);
          return {
            id: uuidv7(),
            userId: recipient.id,
            type: BROADCAST_ALERT_TYPE,
            // ⚠️ THE RECIPIENT'S LOCALE, NOT ENGLISH — and this is the one place
            // this feature departs from the convention in alerts-schema.ts, so
            // it is stated rather than left to be discovered.
            //
            // Every other alert stores the English rendering here and lets the
            // mobile app re-render from `type` + `params` in the current
            // language. That works because those alerts are TEMPLATED: the
            // client has the same catalogue the server does. A broadcast's prose
            // is authored by staff and exists nowhere but this row, so the
            // client has nothing to re-render FROM. Mobile's
            // renderAlertContent() finds no `alerts.content.broadcast.*` entry
            // and falls back to exactly these two strings verbatim
            // (apps/mobile/src/screens/tabs/AlertsScreen.tsx) — which is what
            // makes this feature need no mobile change at all, and which is also
            // why storing English here would show English to every Tamil user in
            // an emergency notice.
            //
            // THE COST, stated honestly: a recipient who later switches language
            // keeps the language they had when it was sent. That is already true
            // of the push notification sitting on their lock screen, and the
            // alternative — duplicating both language pairs into every
            // recipient's `params` — would copy ~2KB of prose across every row
            // for a reader that does not exist.
            title: rendered.title,
            body: rendered.body,
            // A pointer, not a copy. Enough for a future mobile build to deep
            // link to the broadcast, and enough to trace an alert row back to
            // what produced it, without duplicating the copy N times.
            params: { broadcastId: existing.id },
            // Broadcasts are not about a single request, so there is nothing to
            // deep-link to. This is also what keeps them out of the
            // hidden-report filter in AlertsService.list(), whose `or(isNull(
            // alerts.reportId), ...)` arm exists for exactly this case.
            reportId: null,
          };
        }),
      );
      recipientCount += page.length;

      // ── The best-effort half. Cannot undo the half above. ──
      deliveredCount += await this.pushPage(page, copy, existing.id);

      cursor = page[page.length - 1].id;
      if (page.length < FANOUT_PAGE_SIZE) break;
    }

    const sentStatusId = await this.statusIdFor('sent');
    await db
      .update(broadcasts)
      .set({
        statusId: sentStatusId,
        sentAt: sql`now()`,
        recipientCount,
        deliveredCount,
        updatedAt: sql`now()`,
      })
      .where(eq(broadcasts.id, id));

    return this.findOne(id);
  }

  /**
   * Cancels a SCHEDULED broadcast. Terminal.
   *
   * Scheduled only, per the endpoint contract — and the restriction is honest
   * rather than arbitrary: there is nothing to cancel on a draft (it was never
   * going out), and nothing cancellable about a sent one (rule 1 — it is
   * already on people's phones). A cancelled broadcast keeps its `scheduled_at`
   * so the record still says what was planned and when.
   */
  async cancel(id: string, admin: AdminIdentity, meta: AdminRequestMeta) {
    const existing = await this.requireBroadcast(id);

    if (existing.statusKey !== 'scheduled') {
      throw new ConflictException(
        existing.statusKey === 'sent'
          ? {
              code: 'BROADCAST_ALREADY_SENT',
              message:
                'This broadcast has already been sent. Sending is irreversible — it cannot be cancelled, edited, re-sent or deleted.',
            }
          : {
              code: 'BROADCAST_NOT_SCHEDULED',
              message: `Only a scheduled broadcast can be cancelled. This one is ${existing.statusKey}.`,
            },
      );
    }

    const cancelledStatusId = await this.statusIdFor('cancelled');

    return db.transaction(async (tx) => {
      await tx
        .update(broadcasts)
        .set({ statusId: cancelledStatusId, updatedAt: sql`now()` })
        .where(eq(broadcasts.id, id));

      await this.auditService.record({
        admin,
        action: 'broadcast.cancel',
        targetId: id,
        targetLabel: existing.titleEn,
        before: { status: existing.statusKey },
        after: { status: 'cancelled' },
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  /**
   * Soft-deletes a DRAFT. Returns nothing — the route answers 204.
   *
   * Draft only. A scheduled broadcast must be cancelled first (so the audit
   * trail records the decision not to send it as its own act); a sending one is
   * mid-flight; and a sent one is history that cannot be deleted, which is rule
   * 1 applied to the last operation that could pretend otherwise. Deleting a
   * sent broadcast would remove the console's record of a notification fifty
   * thousand people can still see in their own alert lists.
   */
  async delete(
    id: string,
    admin: AdminIdentity,
    meta: AdminRequestMeta,
    reason?: string,
  ): Promise<void> {
    const existing = await this.requireBroadcast(id);

    if (existing.statusKey !== 'draft') {
      throw new ConflictException(
        existing.statusKey === 'sent'
          ? {
              code: 'BROADCAST_ALREADY_SENT',
              message:
                'This broadcast has already been sent. Sending is irreversible — a sent broadcast is history and cannot be deleted.',
            }
          : {
              code: 'BROADCAST_NOT_DELETABLE',
              message: `Only a draft broadcast can be deleted. This one is ${existing.statusKey}${existing.statusKey === 'scheduled' ? ' — cancel it first.' : '.'}`,
            },
      );
    }

    const row = await this.requireBroadcastRow(id);

    await db.transaction(async (tx) => {
      await tx
        .update(broadcasts)
        .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(broadcasts.id, id));

      await this.auditService.record({
        admin,
        action: 'broadcast.delete',
        targetId: id,
        targetLabel: row.titleEn,
        before: this.auditShape(row, existing.audienceKey),
        // Optional rather than required — see DeleteBroadcastQuerySchema in
        // dto/list-broadcasts.dto.ts for why ADR 0012's "required on destructive
        // actions" lands differently on a delete that can only ever touch a
        // broadcast nobody received.
        reason: reason ?? null,
        meta,
        tx,
      });
    });
  }

  // ------------------------------------------------------------ the fan-out

  /**
   * draft|scheduled -> sending, conditionally, plus the `broadcast.send` audit
   * row in the same transaction.
   *
   * The `inArray` on the WHERE is the concurrency guard: it re-checks the status
   * AT WRITE TIME, inside the transaction, so the check-then-act gap between
   * assertSendable() and here cannot be exploited by a second request. Zero rows
   * updated means somebody else claimed it first, and the second caller is
   * refused instead of fanning out over the same recipients again.
   */
  private async claimForSending(
    existing: BroadcastRow,
    admin: AdminIdentity,
    meta: AdminRequestMeta,
  ): Promise<void> {
    const sendingStatusId = await this.statusIdFor('sending');
    const draftStatusId = await this.statusIdFor('draft');
    const scheduledStatusId = await this.statusIdFor('scheduled');

    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(broadcasts)
        .set({ statusId: sendingStatusId, updatedAt: sql`now()` })
        .where(
          and(
            eq(broadcasts.id, existing.id),
            inArray(broadcasts.statusId, [draftStatusId, scheduledStatusId]),
          ),
        )
        .returning({ id: broadcasts.id });

      if (claimed.length === 0) {
        throw new ConflictException({
          code: 'BROADCAST_SEND_IN_PROGRESS',
          message:
            'This broadcast is already being sent. Sending is irreversible, so a second send is refused rather than risking a duplicate notification to everyone who already received it.',
        });
      }

      // Recorded here rather than after the fan-out, deliberately. The auditable
      // fact is the DECISION to notify people, and it must survive a fan-out
      // that dies halfway. The counts are not known yet and are not put here:
      // they land on the broadcast row itself, so this entry never asserts a
      // number that turned out to be wrong.
      await this.auditService.record({
        admin,
        action: 'broadcast.send',
        targetId: existing.id,
        targetLabel: existing.titleEn,
        before: { status: existing.statusKey },
        after: {
          status: 'sending',
          audience: existing.audienceKey,
          district: existing.district,
        },
        meta,
        tx,
      });
    });
  }

  /**
   * One keyset page of recipients, ordered by `user.id`.
   *
   * KEYSET, NOT OFFSET. An offset walk over a table that is being written to
   * (people sign up during a flood) silently skips and repeats rows as earlier
   * pages shift; a broadcast that skips a citizen has failed at its only job,
   * and one that repeats sends them two notifications. `user.id` is the primary
   * key, so `> cursor` is exact and index-backed.
   *
   * SUSPENDED ACCOUNTS ARE EXCLUDED. ADR 0011 makes suspension "block login,
   * keep content visible" — so a suspended person cannot open the app to read an
   * alert, and pushing to their handset would notify someone who then cannot
   * sign in to see it. Excluding them keeps `recipient_count` meaning "people who
   * can actually receive this". The left joins cannot fan out a row:
   * `user_account_status` is keyed on `user_id` (one status per account), and no
   * row at all is the normal case meaning `active`.
   */
  private async recipientPage(
    audience: BroadcastAudienceKey,
    district: string | null,
    cursor: string | null,
  ): Promise<Recipient[]> {
    const rows = await db
      .select({ id: user.id, locale: user.locale })
      .from(user)
      .leftJoin(userAccountStatus, eq(userAccountStatus.userId, user.id))
      .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
      .where(
        and(
          audience === 'district' && district !== null
            ? eq(user.district, district)
            : undefined,
          or(isNull(userStatuses.key), ne(userStatuses.key, 'suspended')),
          cursor !== null ? gt(user.id, cursor) : undefined,
        ),
      )
      .orderBy(user.id)
      .limit(FANOUT_PAGE_SIZE);

    return rows.map((row) => ({
      id: row.id,
      // Falls back to English for null (never set) or a stale/unknown value —
      // the same rule renderBroadcastAlert applies, applied early so the
      // fallback is explicit rather than incidental.
      locale: isAlertLocale(row.locale) ? row.locale : DEFAULT_ALERT_LOCALE,
    }));
  }

  /**
   * Pushes one page. Returns the number of FCM sends the provider accepted.
   *
   * NEVER THROWS, and that is the point. The alert rows for this page are
   * already committed by the time this runs; nothing here may be able to undo
   * them or abort the pages that follow. `PushService.sendToUser` already
   * absorbs its own failures by contract — this second layer covers the code
   * around it (the device lookup, the concurrency loop), exactly as
   * AlertsService.push() wraps the same call for the same reason.
   *
   * WHY THE `devices` PRE-FILTER: `sendToUser` starts by querying `devices` and
   * returns an empty result when a user has none, which is the overwhelmingly
   * common case today. Calling it for every recipient would run one query per
   * citizen to learn nothing. One `select distinct` per page replaces up to 500
   * of them. It is not a second sender — every actual send still goes through
   * PushService, which owns the provider, the masking and the dead-token pruning.
   */
  private async pushPage(
    page: Recipient[],
    copy: BroadcastAlertCopy,
    broadcastId: string,
  ): Promise<number> {
    // Declared OUTSIDE the try so a failure partway through a page keeps the
    // sends that already succeeded. Zeroing it in the catch would under-report
    // `delivered_count` — claiming nothing was pushed when some of it was — and
    // this column exists to be honest about push, not tidy.
    let delivered = 0;

    try {
      const withDevices = await db
        .selectDistinct({ userId: devices.userId })
        .from(devices)
        .where(
          inArray(
            devices.userId,
            page.map((r) => r.id),
          ),
        );

      const targetIds = new Set(withDevices.map((row) => row.userId));
      const targets = page.filter((recipient) => targetIds.has(recipient.id));

      for (let i = 0; i < targets.length; i += PUSH_CONCURRENCY) {
        const slice = targets.slice(i, i + PUSH_CONCURRENCY);
        const results = await Promise.all(
          slice.map((recipient) => {
            const rendered = renderBroadcastAlert(copy, recipient.locale);
            return this.pushService.sendToUser(recipient.id, {
              title: rendered.title,
              body: rendered.body,
              // FCM data values must be strings. `type` is what the mobile
              // client switches on; `broadcastId` mirrors the alert row's
              // params so a tapped notification and the in-app row agree.
              data: { type: BROADCAST_ALERT_TYPE, broadcastId },
            });
          }),
        );
        delivered += results.reduce((sum, result) => sum + result.sent, 0);
      }
    } catch (error) {
      console.warn(
        '[broadcasts] push for one fan-out page failed — the in-app alerts for that page were already saved',
        error instanceof Error ? error.message : error,
      );
    }

    return delivered;
  }

  // ---------------------------------------------------------------- internals

  /** Refuses a PATCH on a broadcast that has started or finished going out. */
  private assertMutable(existing: BroadcastRow, verb: string): void {
    if (existing.statusKey === 'draft' || existing.statusKey === 'scheduled') {
      return;
    }

    throw new ConflictException(
      existing.statusKey === 'sent'
        ? {
            code: 'BROADCAST_ALREADY_SENT',
            message: `This broadcast has already been sent. Sending is irreversible — it cannot be ${verb}, re-sent or deleted.`,
          }
        : {
            code: 'BROADCAST_IMMUTABLE',
            message: `A ${existing.statusKey} broadcast cannot be ${verb}.`,
          },
    );
  }

  /**
   * The four ways a send is refused, each with its own code.
   *
   * Distinct codes rather than one generic conflict because the console has to
   * say something different in each case, and because "already sent" is the one
   * the product rule is about — a client must be able to tell it apart from
   * "someone else is sending it right now", which is transient.
   */
  private assertSendable(existing: BroadcastRow): void {
    switch (existing.statusKey) {
      case 'draft':
      case 'scheduled':
        return;
      case 'sent':
        throw new ConflictException({
          code: 'BROADCAST_ALREADY_SENT',
          message:
            'This broadcast has already been sent. Sending is irreversible — it cannot be re-sent, and re-sending would notify everyone who already received it a second time.',
        });
      case 'sending':
        throw new ConflictException({
          code: 'BROADCAST_SEND_IN_PROGRESS',
          message:
            'This broadcast is already being sent. If it stays in this state, its fan-out did not finish — some recipients already have it, so it needs a human decision rather than a retry.',
        });
      default:
        throw new ConflictException({
          code: 'BROADCAST_CANCELLED',
          message:
            'This broadcast was cancelled. Cancelling is terminal — create a new broadcast rather than reviving this one.',
        });
    }
  }

  /** `district` is set if and only if the audience is `district`. */
  private audienceIsCoherent(
    audience: BroadcastAudienceKey,
    district: string | null,
  ): boolean {
    return audience === 'district'
      ? typeof district === 'string' && district.length > 0
      : district === null;
  }

  /**
   * Resolved against the lookup table, never a hardcoded id.
   *
   * Throws loudly when the row is absent, for the reason
   * AdminAuditService.actionIdFor() does: a miss means `db:seed` has not run,
   * and silently guessing a status would be worse than the request failing.
   */
  private async statusIdFor(key: BroadcastStatusKey): Promise<string> {
    const cached = this.statusIds.get(key);
    if (cached) return cached;

    const [row] = await db
      .select({ id: broadcastStatuses.id })
      .from(broadcastStatuses)
      .where(eq(broadcastStatuses.key, key));

    if (!row) {
      throw new Error(
        `broadcast_statuses row missing for key "${key}" — did db:seed run?`,
      );
    }

    this.statusIds.set(key, row.id);
    return row.id;
  }

  private async audienceIdFor(key: BroadcastAudienceKey): Promise<string> {
    const cached = this.audienceIds.get(key);
    if (cached) return cached;

    const [row] = await db
      .select({ id: broadcastAudiences.id })
      .from(broadcastAudiences)
      .where(eq(broadcastAudiences.key, key));

    if (!row) {
      throw new Error(
        `broadcast_audiences row missing for key "${key}" — did db:seed run?`,
      );
    }

    this.audienceIds.set(key, row.id);
    return row.id;
  }

  private baseQuery() {
    return (
      db
        .select({
          id: broadcasts.id,
          titleEn: broadcasts.titleEn,
          titleTa: broadcasts.titleTa,
          bodyEn: broadcasts.bodyEn,
          bodyTa: broadcasts.bodyTa,
          statusKey: broadcastStatuses.key,
          statusLabel: broadcastStatuses.label,
          audienceKey: broadcastAudiences.key,
          audienceLabel: broadcastAudiences.label,
          district: broadcasts.district,
          scheduledAt: broadcasts.scheduledAt,
          sentAt: broadcasts.sentAt,
          recipientCount: broadcasts.recipientCount,
          deliveredCount: broadcasts.deliveredCount,
          createdAt: broadcasts.createdAt,
          updatedAt: broadcasts.updatedAt,
          senderId: broadcasts.createdBy,
          senderName: user.name,
        })
        .from(broadcasts)
        .innerJoin(
          broadcastStatuses,
          eq(broadcasts.statusId, broadcastStatuses.id),
        )
        .innerJoin(
          broadcastAudiences,
          eq(broadcasts.audienceId, broadcastAudiences.id),
        )
        // leftJoin, and it must stay one: created_by is ON DELETE SET NULL, so a
        // broadcast whose sender has left the organisation has a null here. An
        // innerJoin would hide exactly those rows — the oldest broadcasts,
        // silently, from a list that is supposed to be a complete record of what
        // was sent to the public.
        .leftJoin(user, eq(broadcasts.createdBy, user.id))
    );
  }

  /** The projection, read back inside the caller's transaction. */
  private async findOneWithin(
    tx: Pick<typeof db, 'select'>,
    id: string,
  ): Promise<ReturnType<AdminBroadcastsService['toResponse']>> {
    const [row] = await tx
      .select({
        id: broadcasts.id,
        titleEn: broadcasts.titleEn,
        titleTa: broadcasts.titleTa,
        bodyEn: broadcasts.bodyEn,
        bodyTa: broadcasts.bodyTa,
        statusKey: broadcastStatuses.key,
        statusLabel: broadcastStatuses.label,
        audienceKey: broadcastAudiences.key,
        audienceLabel: broadcastAudiences.label,
        district: broadcasts.district,
        scheduledAt: broadcasts.scheduledAt,
        sentAt: broadcasts.sentAt,
        recipientCount: broadcasts.recipientCount,
        deliveredCount: broadcasts.deliveredCount,
        createdAt: broadcasts.createdAt,
        updatedAt: broadcasts.updatedAt,
        senderId: broadcasts.createdBy,
        senderName: user.name,
      })
      .from(broadcasts)
      .innerJoin(
        broadcastStatuses,
        eq(broadcasts.statusId, broadcastStatuses.id),
      )
      .innerJoin(
        broadcastAudiences,
        eq(broadcasts.audienceId, broadcastAudiences.id),
      )
      .leftJoin(user, eq(broadcasts.createdBy, user.id))
      .where(eq(broadcasts.id, id));

    // Read back inside the transaction that just wrote it, so this cannot miss.
    return this.toResponse(row);
  }

  private async requireBroadcast(id: string): Promise<BroadcastRow> {
    const [row] = await this.baseQuery().where(
      and(eq(broadcasts.id, id), isNull(broadcasts.deletedAt)),
    );

    if (!row) {
      throw new NotFoundException({
        code: 'BROADCAST_NOT_FOUND',
        message: 'Broadcast not found.',
      });
    }
    return row;
  }

  /** The raw row, for the paths that diff or snapshot every column. */
  private async requireBroadcastRow(id: string) {
    const [row] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, id), isNull(broadcasts.deletedAt)));

    if (!row) {
      throw new NotFoundException({
        code: 'BROADCAST_NOT_FOUND',
        message: 'Broadcast not found.',
      });
    }
    return row;
  }

  private sameValue(a: unknown, b: unknown): boolean {
    // Dates are compared by instant, not identity — two Date objects for the
    // same moment are never `===`, so without this every schedule-carrying PATCH
    // would look like a change.
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    return a === b;
  }

  /** Dates -> ISO strings, so the jsonb audit payload is readable as written. */
  private serialiseFields(fields: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    );
  }

  private auditShape(row: typeof broadcasts.$inferSelect, audienceKey: string) {
    return this.serialiseFields({
      titleEn: row.titleEn,
      bodyEn: row.bodyEn,
      titleTa: row.titleTa,
      bodyTa: row.bodyTa,
      // The KEY, not the uuid. An audit entry has to be readable years later by
      // someone without the lookup table in front of them.
      audience: audienceKey,
      district: row.district,
      scheduledAt: row.scheduledAt,
    });
  }

  private toResponse(row: BroadcastRow) {
    return {
      id: row.id,
      titleEn: row.titleEn,
      titleTa: row.titleTa,
      bodyEn: row.bodyEn,
      bodyTa: row.bodyTa,
      status: { key: row.statusKey, label: row.statusLabel },
      audience: { key: row.audienceKey, label: row.audienceLabel },
      district: row.district,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
      // TWO DIFFERENT MEASUREMENTS — see the column comments in
      // db/schema/broadcasts-schema.ts. `recipientCount` is people reached
      // in-app (alert rows written, durable). `deliveredCount` is FCM sends
      // accepted (device-level, best-effort). The second is not a subset of the
      // first and must never be rendered as one.
      recipientCount: row.recipientCount,
      deliveredCount: row.deliveredCount,
      // A non-null created_by guarantees the joined row exists (it is a foreign
      // key) and `user.name` is NOT NULL, so these two branches move together.
      // Null means one thing only: ON DELETE SET NULL fired, i.e. the sender's
      // account is gone — which is what `createdByDeleted` reports. The record
      // of what was broadcast is untouched by that, deliberately.
      createdBy:
        row.senderId !== null
          ? { id: row.senderId, name: row.senderName ?? '' }
          : null,
      createdByDeleted: row.senderId === null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
