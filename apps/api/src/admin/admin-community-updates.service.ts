import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  communityUpdateStatuses,
  communityUpdates,
} from '../db/schema/updates-schema';
import type { CommunityUpdateStatusKey } from '../db/schema/updates-schema';
import { AdminAuditService } from './admin-audit.service';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { CreateCommunityUpdateDto } from './dto/create-community-update.dto';
import type { ListCommunityUpdatesDto } from './dto/list-community-updates.dto';
import type { UpdateCommunityUpdateDto } from './dto/update-community-update.dto';

/** The row shape every projection below is built from. */
type UpdateRow = {
  id: string;
  titleEn: string;
  titleTa: string | null;
  bodyEn: string;
  bodyTa: string | null;
  statusKey: string;
  statusLabel: string;
  publishAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string | null;
  authorName: string | null;
};

/** The fields a PATCH may touch, and the ones the audit diff is scoped to. */
const EDITABLE_FIELDS = [
  'titleEn',
  'bodyEn',
  'titleTa',
  'bodyTa',
  'publishAt',
  'expiresAt',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * Community -> Updates: the admin side of citizen-facing announcements.
 *
 * There is no citizen twin to branch on here (ADR 0009 would forbid it anyway).
 * `GET /updates` returns four fields, locale-resolved, filtered to what is live
 * right now; this projection returns both language pairs unresolved, the draft
 * and archived rows, the schedule, the author, and the soft-delete state. The
 * two have almost nothing in common but a table.
 *
 * WHY PUBLISH AND ARCHIVE ARE ENDPOINTS AND NOT A PATCHABLE `status` FIELD:
 * each is a separately audited act. `community_update.publish` is the row a
 * reviewer looks for when asking who put an announcement in front of every user
 * in the country; folding it into a general `community_update.update` would
 * make that question unanswerable without diffing JSON blobs.
 */
@Injectable()
export class AdminCommunityUpdatesService {
  constructor(private readonly auditService: AdminAuditService) {}

  /**
   * Status key -> id, memoised.
   *
   * Same contract as AdminAuditService's catalogue memo: master data changes
   * only via `db:seed`, a miss always falls through to a query, so the map can
   * be stale-empty but never stale-wrong.
   */
  private readonly statusIds = new Map<string, string>();

  async list(query: ListCommunityUpdatesDto) {
    const filters = [
      // Soft-deleted updates are excluded from every read path, including this
      // one. There is no restore endpoint, so a deleted announcement is gone as
      // far as the console is concerned — the row survives, and the
      // `community_update.delete` audit entry carries the copy that was live, so
      // "what did the notice we took down actually say" still has an answer.
      isNull(communityUpdates.deletedAt),
      // An unknown status key yields an empty page rather than a 400, matching
      // AdminSupportService.list(). The filter's options come from the lookup
      // table, so a value the console can actually select always exists.
      query.status ? eq(communityUpdateStatuses.key, query.status) : undefined,
      // All four copy columns: staff search for the wording they remember, and
      // remembering it in Tamil is the normal case for a Tamil announcement.
      // ESCAPE '\' is stated explicitly because likePattern() escapes the
      // caller's own % and _ with a backslash — see admin-pagination.ts.
      query.q
        ? sql`(${communityUpdates.titleEn} ilike ${likePattern(query.q)} escape '\\'
            or ${communityUpdates.bodyEn} ilike ${likePattern(query.q)} escape '\\'
            or ${communityUpdates.titleTa} ilike ${likePattern(query.q)} escape '\\'
            or ${communityUpdates.bodyTa} ilike ${likePattern(query.q)} escape '\\')`
        : undefined,
    ].filter((f) => f !== undefined);

    const where = and(...filters);

    const [rows, [countRow]] = await Promise.all([
      this.baseQuery()
        .where(where)
        // id is the tiebreaker so a page boundary is stable when two updates
        // share a createdAt — without it, offset paging can repeat or skip a
        // row. uuidv7 ids are time-ordered, so this is true write order.
        .orderBy(desc(communityUpdates.createdAt), desc(communityUpdates.id))
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(communityUpdates)
        .innerJoin(
          communityUpdateStatuses,
          eq(communityUpdates.statusId, communityUpdateStatuses.id),
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
    return this.toResponse(await this.requireUpdate(id));
  }

  async create(
    admin: AdminIdentity,
    dto: CreateCommunityUpdateDto,
    meta: AdminRequestMeta,
  ) {
    // Always `draft`. Creating and publishing are two acts with two audit rows;
    // an update that went live the instant someone hit Save would have no
    // `community_update.publish` entry naming who decided to publish it.
    const draftStatusId = await this.statusIdFor('draft');
    const id = uuidv7();

    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(communityUpdates)
        .values({
          id,
          titleEn: dto.titleEn,
          bodyEn: dto.bodyEn,
          titleTa: dto.titleTa ?? null,
          bodyTa: dto.bodyTa ?? null,
          statusId: draftStatusId,
          publishAt: dto.publishAt ?? null,
          expiresAt: dto.expiresAt ?? null,
          authorAdminUserId: admin.userId,
        })
        .returning();

      await this.auditService.record({
        admin,
        action: 'community_update.create',
        targetId: created.id,
        targetLabel: created.titleEn,
        after: this.auditShape(created),
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  async update(
    id: string,
    admin: AdminIdentity,
    dto: UpdateCommunityUpdateDto,
    meta: AdminRequestMeta,
  ) {
    const existing = await this.requireUpdateRow(id);

    // The merged schedule, not the payload's. The DTO's refinement can only see
    // the fields the client sent, so a PATCH carrying `expiresAt` alone sails
    // past it while still landing an expiry before the row's stored
    // `publishAt`. This is that check — see the note in
    // create-community-update.dto.ts. The database has no CHECK constraint;
    // the DTO and this are the only two guards.
    const publishAt =
      dto.publishAt !== undefined ? dto.publishAt : existing.publishAt;
    const expiresAt =
      dto.expiresAt !== undefined ? dto.expiresAt : existing.expiresAt;

    if (publishAt && expiresAt && expiresAt.getTime() <= publishAt.getTime()) {
      throw new BadRequestException({
        code: 'EXPIRES_BEFORE_PUBLISH',
        message:
          '`expiresAt` must be after `publishAt`. Check the value already stored on this update — a PATCH that changes only one of the two is still compared against the other.',
      });
    }

    // Only the fields that actually differ. Without this, PATCHing an update
    // with its current values would write an audit row claiming an edit that
    // did not happen, and the console's history would fill with noise.
    // Typed as the DTO's own partial so `.set()` keeps each column's real type
    // (titleEn is string, titleTa is string | null, publishAt is Date | null).
    // A widened `Record<EditableField, string | Date | null>` would type-error
    // against Drizzle — correctly, since it claims titleEn can be null.
    const changes: Partial<UpdateCommunityUpdateDto> = {};
    for (const field of EDITABLE_FIELDS) {
      const next = dto[field];
      if (next === undefined) continue;
      if (this.sameValue(next, existing[field])) continue;
      // The one cast: the compiler cannot follow that `dto[field]` and
      // `changes[field]` are the same key of the same type when `field` is a
      // loop variable over a union. Both sides are `EditableField`-indexed, so
      // this is sound.
      (changes as Record<string, unknown>)[field] = next;
    }

    if (Object.keys(changes).length === 0) {
      throw new ConflictException({
        code: 'NO_EFFECTIVE_CHANGE',
        message:
          'Every field in this request already holds the value you sent.',
      });
    }

    return db.transaction(async (tx) => {
      await tx
        .update(communityUpdates)
        // Set explicitly: this column has a default but no $onUpdate, so
        // nothing would move it otherwise — and the console sorts by it.
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(communityUpdates.id, id));

      await this.auditService.record({
        admin,
        action: 'community_update.update',
        targetId: id,
        targetLabel: existing.titleEn,
        // Scoped to the changed fields on both sides, so the entry reads as a
        // diff rather than two full copies a human has to compare by eye.
        before: this.serialiseFields(
          Object.fromEntries(
            Object.keys(changes).map((field) => [
              field,
              existing[field as EditableField],
            ]),
          ),
        ),
        after: this.serialiseFields(changes),
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  /**
   * Draft (or archived) -> published.
   *
   * Deliberately does NOT stamp `publish_at = now()`. An admin who scheduled an
   * announcement for tomorrow morning and then hit Publish means "approve this
   * for release", not "release it right now" — overwriting the schedule would
   * silently push a flood notice live a day early. A published row with a
   * future `publish_at` is exactly the scheduled state, and the citizen query
   * is what decides it is not visible yet (updates-schema.ts).
   */
  async publish(id: string, admin: AdminIdentity, meta: AdminRequestMeta) {
    return this.transition(
      id,
      'published',
      'community_update.publish',
      {
        code: 'UPDATE_ALREADY_PUBLISHED',
        message: 'This update is already published.',
      },
      admin,
      meta,
    );
  }

  /** Removes an update from the citizen feed without deleting it. */
  async archive(id: string, admin: AdminIdentity, meta: AdminRequestMeta) {
    return this.transition(
      id,
      'archived',
      'community_update.archive',
      {
        code: 'UPDATE_ALREADY_ARCHIVED',
        message: 'This update is already archived.',
      },
      admin,
      meta,
    );
  }

  /**
   * Soft delete. Returns nothing — the route answers 204.
   *
   * `deleted_at` rather than a DELETE statement, and updates-schema.ts explains
   * why the column exists on this table specifically: the audit entry below
   * points at a target id, and a hard delete would leave it pointing at
   * nothing. `before` carries the full copy, so the announcement's text survives
   * the deletion in the one place designed to keep it.
   */
  async delete(
    id: string,
    admin: AdminIdentity,
    meta: AdminRequestMeta,
  ): Promise<void> {
    const existing = await this.requireUpdateRow(id);

    await db.transaction(async (tx) => {
      await tx
        .update(communityUpdates)
        .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(communityUpdates.id, id));

      await this.auditService.record({
        admin,
        action: 'community_update.delete',
        targetId: id,
        targetLabel: existing.titleEn,
        before: this.auditShape(existing),
        // NOTE: `reason` is null here, and this is the one place this module
        // departs from ADR 0012's "required on destructive actions" convention.
        // The endpoint contract the console is being built against is
        // `DELETE /admin/community-updates/:id -> 204` with no request body;
        // requiring one would break a client already written against it. The
        // actor, the timestamp and the full deleted copy are all still recorded.
        meta,
        tx,
      });
    });
  }

  // ---------------------------------------------------------------- internals

  private async transition(
    id: string,
    targetStatus: CommunityUpdateStatusKey,
    action: 'community_update.publish' | 'community_update.archive',
    alreadyThere: { code: string; message: string },
    admin: AdminIdentity,
    meta: AdminRequestMeta,
  ) {
    const existing = await this.requireUpdate(id);

    // A no-op transition would otherwise write an audit row asserting a change
    // that never happened — the same guard AdminSupportService.updateStatus()
    // applies. Any OTHER starting status is allowed: publishing an archived
    // update is how it goes back into the feed, and archiving a draft is how a
    // rejected one is retired.
    if (existing.statusKey === targetStatus) {
      throw new ConflictException(alreadyThere);
    }

    const statusId = await this.statusIdFor(targetStatus);

    return db.transaction(async (tx) => {
      await tx
        .update(communityUpdates)
        .set({ statusId, updatedAt: sql`now()` })
        .where(eq(communityUpdates.id, id));

      await this.auditService.record({
        admin,
        action,
        targetId: id,
        targetLabel: existing.titleEn,
        before: { status: existing.statusKey },
        after: { status: targetStatus },
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  /**
   * Resolved against the lookup table, never a hardcoded id.
   *
   * Throws loudly when the row is absent, for the reason
   * AdminAuditService.actionIdFor() does: a seeded-status miss means `db:seed`
   * has not run, and silently writing a NULL or guessed status would be worse
   * than the request failing.
   */
  private async statusIdFor(key: CommunityUpdateStatusKey): Promise<string> {
    const memo = this.statusIds.get(key);
    if (memo) return memo;

    const [row] = await db
      .select({ id: communityUpdateStatuses.id })
      .from(communityUpdateStatuses)
      .where(eq(communityUpdateStatuses.key, key));

    if (!row) {
      throw new Error(
        `community_update_statuses row missing for key "${key}" — did db:seed run?`,
      );
    }

    this.statusIds.set(key, row.id);
    return row.id;
  }

  private baseQuery() {
    return (
      db
        .select({
          id: communityUpdates.id,
          titleEn: communityUpdates.titleEn,
          titleTa: communityUpdates.titleTa,
          bodyEn: communityUpdates.bodyEn,
          bodyTa: communityUpdates.bodyTa,
          statusKey: communityUpdateStatuses.key,
          statusLabel: communityUpdateStatuses.label,
          publishAt: communityUpdates.publishAt,
          expiresAt: communityUpdates.expiresAt,
          createdAt: communityUpdates.createdAt,
          updatedAt: communityUpdates.updatedAt,
          authorId: communityUpdates.authorAdminUserId,
          authorName: user.name,
        })
        .from(communityUpdates)
        .innerJoin(
          communityUpdateStatuses,
          eq(communityUpdates.statusId, communityUpdateStatuses.id),
        )
        // leftJoin, and it must stay one: author_admin_user_id is ON DELETE SET
        // NULL, so an announcement whose author has left the organisation has a
        // null here. An innerJoin would hide exactly those rows — the oldest
        // announcements, silently, from the list that is supposed to be complete.
        .leftJoin(user, eq(communityUpdates.authorAdminUserId, user.id))
    );
  }

  /** The projection, read back inside the caller's transaction. */
  private async findOneWithin(
    tx: Pick<typeof db, 'select'>,
    id: string,
  ): Promise<ReturnType<AdminCommunityUpdatesService['toResponse']>> {
    const [row] = await tx
      .select({
        id: communityUpdates.id,
        titleEn: communityUpdates.titleEn,
        titleTa: communityUpdates.titleTa,
        bodyEn: communityUpdates.bodyEn,
        bodyTa: communityUpdates.bodyTa,
        statusKey: communityUpdateStatuses.key,
        statusLabel: communityUpdateStatuses.label,
        publishAt: communityUpdates.publishAt,
        expiresAt: communityUpdates.expiresAt,
        createdAt: communityUpdates.createdAt,
        updatedAt: communityUpdates.updatedAt,
        authorId: communityUpdates.authorAdminUserId,
        authorName: user.name,
      })
      .from(communityUpdates)
      .innerJoin(
        communityUpdateStatuses,
        eq(communityUpdates.statusId, communityUpdateStatuses.id),
      )
      .leftJoin(user, eq(communityUpdates.authorAdminUserId, user.id))
      .where(eq(communityUpdates.id, id));

    // Read back inside the transaction that just wrote it, so this cannot miss.
    return this.toResponse(row);
  }

  private async requireUpdate(id: string): Promise<UpdateRow> {
    const [row] = await this.baseQuery().where(
      and(eq(communityUpdates.id, id), isNull(communityUpdates.deletedAt)),
    );

    if (!row) {
      throw new NotFoundException({
        code: 'UPDATE_NOT_FOUND',
        message: 'Community update not found.',
      });
    }
    return row;
  }

  /** The raw row, for the paths that diff or snapshot every column. */
  private async requireUpdateRow(id: string) {
    const [row] = await db
      .select()
      .from(communityUpdates)
      .where(
        and(eq(communityUpdates.id, id), isNull(communityUpdates.deletedAt)),
      );

    if (!row) {
      throw new NotFoundException({
        code: 'UPDATE_NOT_FOUND',
        message: 'Community update not found.',
      });
    }
    return row;
  }

  private sameValue(a: unknown, b: unknown): boolean {
    // Dates are compared by instant, not identity — two Date objects for the
    // same moment are never `===`, so without this every schedule-carrying
    // PATCH would look like a change.
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

  private auditShape(row: typeof communityUpdates.$inferSelect) {
    return this.serialiseFields({
      titleEn: row.titleEn,
      bodyEn: row.bodyEn,
      titleTa: row.titleTa,
      bodyTa: row.bodyTa,
      publishAt: row.publishAt,
      expiresAt: row.expiresAt,
    });
  }

  private toResponse(row: UpdateRow) {
    return {
      id: row.id,
      titleEn: row.titleEn,
      titleTa: row.titleTa,
      bodyEn: row.bodyEn,
      bodyTa: row.bodyTa,
      status: { key: row.statusKey, label: row.statusLabel },
      publishAt: row.publishAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      // A non-null author_admin_user_id guarantees the joined row exists (it is
      // a foreign key) and `user.name` is NOT NULL, so these two branches move
      // together. Null means one thing only: ON DELETE SET NULL fired, i.e. the
      // author's account is gone — which is what `authorDeleted` reports. The
      // announcement itself is untouched by that, deliberately.
      author:
        row.authorId !== null
          ? { id: row.authorId, name: row.authorName ?? '' }
          : null,
      authorDeleted: row.authorId === null,
    };
  }
}
