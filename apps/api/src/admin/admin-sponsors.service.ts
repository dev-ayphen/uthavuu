import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import {
  sponsorCreativeTypes,
  sponsorPlacements,
  sponsorStatuses,
  sponsors,
} from '../db/schema/sponsors-schema';
import type {
  SponsorCreativeTypeKey,
  SponsorStoredStatusKey,
} from '../db/schema/sponsors-schema';
import { effectiveSponsorStatusSql } from '../sponsors/sponsor-status';
import { AdminAuditService } from './admin-audit.service';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { CreateSponsorDto } from './dto/create-sponsor.dto';
import type { ListAdminSponsorsDto } from './dto/list-admin-sponsors.dto';
import type { UpdateSponsorDto } from './dto/update-sponsor.dto';

/**
 * The stored status joined a SECOND time, on the DERIVED key.
 *
 * The first join gives the row's stored status; this one gives the label for
 * whatever the derivation resolved to, so a campaign showing as `expired`
 * renders the operator-facing text from `sponsor_statuses` rather than a
 * hardcoded string in this file. `leftJoin`, not inner — see `toResponse()`.
 */
const effectiveStatus = alias(sponsorStatuses, 'effective_status');

/** The row shape every projection below is built from. */
type SponsorRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  category: string | null;
  campaignName: string | null;
  location: string | null;
  creativeTypeKey: string;
  creativeTypeLabel: string;
  creativeUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
  effectiveStatusKey: string;
  effectiveStatusLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The plain columns a PATCH may touch, and the ones the audit diff is scoped
 * to. `creativeType` and `placements` are handled separately — one is a key
 * that resolves to an id, the other is a set in another table.
 */
const SCALAR_FIELDS = [
  'name',
  'logoUrl',
  'description',
  'website',
  'category',
  'campaignName',
  'location',
  'creativeUrl',
  'startDate',
  'endDate',
] as const;

/** Creative types that are nothing without an asset to point at. */
const CREATIVE_TYPES_NEEDING_URL: readonly string[] = ['video', 'banner'];

/**
 * The `.set()` payload an update builds up.
 *
 * Typed rather than a `Record<string, unknown>` so each column keeps its real
 * type — `name` is a string, `logoUrl` is `string | null`, `startDate` is
 * `Date | null`. A widened record would type-error against Drizzle, correctly,
 * since it claims `name` can be null.
 */
type SponsorColumnUpdates = Partial<{
  name: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  category: string | null;
  campaignName: string | null;
  location: string | null;
  creativeUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
  creativeTypeId: string;
}>;

/**
 * Monetization -> Sponsors: the admin side of the cards the mobile app renders.
 *
 * Gated on `platform:manage` (see the controller). There is no citizen twin to
 * branch on — ADR 0009 would forbid it anyway. `GET /sponsors` returns seven
 * fields for one placement, filtered to what is live this instant; this
 * projection returns every column, every status, the campaign window and the
 * placement set. The two share a table and almost nothing else.
 *
 * WHY PAUSE AND ACTIVATE ARE ENDPOINTS AND NOT A PATCHABLE `status` FIELD:
 * each is a separately audited act. `sponsor.activate` is the row a reviewer
 * looks for when asking who put a paid advertisement in front of every user in
 * the country; folding it into a general `sponsor.update` would make that
 * question answerable only by diffing JSON blobs.
 *
 * WHAT THIS SERVICE DELIBERATELY DOES NOT DO: count anything. No impressions,
 * no clicks, no CTR, no eCPM, no revenue. docs/webadmin/08-monetization.md §4.1
 * calls the prototype's figures "fictional twice over" — the app reports no
 * impressions, so any number here could only be decorative. Sponsor payment is
 * a business agreement, not something derivable from this database.
 */
@Injectable()
export class AdminSponsorsService {
  constructor(private readonly auditService: AdminAuditService) {}

  /**
   * Lookup key -> id, memoised.
   *
   * Same contract as AdminAuditService's catalogue memo: master data changes
   * only via `db:seed`, and a miss always falls through to a query, so the map
   * can be stale-empty but never stale-wrong. Labels are deliberately NOT
   * memoised — they are re-read on every request through the joins, because a
   * label IS editable by a re-seed and a cached one would go quietly wrong.
   */
  private readonly statusIds = new Map<string, string>();
  private readonly creativeTypeIds = new Map<string, string>();

  // -------------------------------------------------------------------- read

  async list(query: ListAdminSponsorsDto) {
    const filters = [
      // Soft-deleted sponsors are excluded from every read path, including this
      // one. There is no restore endpoint, so a deleted campaign is gone as far
      // as the console is concerned — the row survives, and the
      // `sponsor.delete` audit entry carries the full copy, so "what exactly
      // was the campaign we took down" still has an answer.
      isNull(sponsors.deletedAt),
      // Filtered on the DERIVED status. `scheduled` and `expired` are never
      // stored, so `eq(sponsorStatuses.key, …)` would answer "no results"
      // forever for two of the console's five tabs. See sponsor-status.ts.
      query.status
        ? sql`${effectiveSponsorStatusSql} = ${query.status}`
        : undefined,
      // The four columns an operator would remember a sponsor by. ESCAPE '\' is
      // stated explicitly because likePattern() escapes the caller's own % and
      // _ with a backslash — see admin-pagination.ts.
      query.q
        ? sql`(${sponsors.name} ilike ${likePattern(query.q)} escape '\\'
            or ${sponsors.campaignName} ilike ${likePattern(query.q)} escape '\\'
            or ${sponsors.category} ilike ${likePattern(query.q)} escape '\\'
            or ${sponsors.location} ilike ${likePattern(query.q)} escape '\\')`
        : undefined,
    ].filter((f) => f !== undefined);

    const where = and(...filters);

    const [rows, [countRow]] = await Promise.all([
      this.baseQuery()
        .where(where)
        // id is the tiebreaker so a page boundary is stable when two sponsors
        // share a createdAt — without it, offset paging can repeat or skip a
        // row. uuidv7 ids are time-ordered, so this is true write order.
        .orderBy(desc(sponsors.createdAt), desc(sponsors.id))
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(sponsors)
        // The status join is required even for a count: both the status filter
        // and the derived-status expression read `sponsor_statuses.key`.
        .innerJoin(sponsorStatuses, eq(sponsors.statusId, sponsorStatuses.id))
        .where(where),
    ]);

    const placements = await this.placementsFor(
      db,
      rows.map((row) => row.id),
    );

    return paginate(
      rows.map((row) => this.toResponse(row, placements.get(row.id) ?? [])),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  async findOne(id: string) {
    const row = await this.requireSponsor(id);
    const placements = await this.placementsFor(db, [id]);
    return this.toResponse(row, placements.get(id) ?? []);
  }

  // ------------------------------------------------------------------ writes

  async create(
    admin: AdminIdentity,
    dto: CreateSponsorDto,
    meta: AdminRequestMeta,
  ) {
    // Always `draft`. Creating and activating are two acts with two audit rows;
    // a sponsor that went live the instant somebody hit Save would have no
    // `sponsor.activate` entry naming who decided to run it — and unlike an
    // announcement, this one costs an advertiser money.
    const draftStatusId = await this.statusIdFor('draft');
    const creativeTypeId = await this.creativeTypeIdFor(dto.creativeType);
    const id = uuidv7();
    // De-duplicated HERE as well as in the DTO's transform. The transform only
    // runs when the request came through the validation pipe; a service called
    // directly (a spec, a future internal caller) would otherwise hit the
    // unique constraint and surface a 500 for what is a normalisable input.
    // The constraint stays as the last backstop, not as the first guard.
    const placements = [...new Set(dto.placements ?? [])];

    return db.transaction(async (tx) => {
      await tx.insert(sponsors).values({
        id,
        name: dto.name,
        logoUrl: dto.logoUrl ?? null,
        description: dto.description ?? null,
        website: dto.website ?? null,
        category: dto.category ?? null,
        campaignName: dto.campaignName ?? null,
        location: dto.location ?? null,
        creativeTypeId,
        creativeUrl: dto.creativeUrl ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        statusId: draftStatusId,
      });

      if (placements.length > 0) {
        await tx.insert(sponsorPlacements).values(
          placements.map((placementKey) => ({
            id: uuidv7(),
            sponsorId: id,
            placementKey,
          })),
        );
      }

      await this.auditService.record({
        admin,
        action: 'sponsor.create',
        targetId: id,
        targetLabel: dto.name,
        after: this.auditShape(dto, placements),
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  async update(
    id: string,
    admin: AdminIdentity,
    dto: UpdateSponsorDto,
    meta: AdminRequestMeta,
  ) {
    const existing = await this.requireSponsorRow(id);
    const storedPlacements = (await this.placementsFor(db, [id])).get(id) ?? [];

    // The merged window, not the payload's. The DTO's refinement can only see
    // the fields the client sent, so a PATCH carrying `endDate` alone sails
    // past it while still landing an end before the row's stored `startDate`.
    // This is that check — see the note in create-sponsor.dto.ts. The database
    // has no CHECK constraint; the DTO and this are the only two guards.
    const startDate =
      dto.startDate !== undefined ? dto.startDate : existing.startDate;
    const endDate = dto.endDate !== undefined ? dto.endDate : existing.endDate;

    if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException({
        code: 'END_BEFORE_START',
        message:
          '`endDate` must be after `startDate`. Check the value already stored on this sponsor — a PATCH that changes only one of the two is still compared against the other.',
      });
    }

    // Only the fields that actually differ. Without this, PATCHing a sponsor
    // with its current values would write an audit row claiming an edit that
    // never happened, and the console's history would fill with noise.
    const columnUpdates: SponsorColumnUpdates = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    for (const field of SCALAR_FIELDS) {
      const next = dto[field];
      if (next === undefined) continue;
      if (this.sameValue(next, existing[field])) continue;
      // The one cast: the compiler cannot follow that `dto[field]` and
      // `columnUpdates[field]` are the same key of the same type when `field`
      // is a loop variable over a union. Both sides are ScalarField-indexed, so
      // this is sound.
      (columnUpdates as Record<string, unknown>)[field] = next;
      before[field] = existing[field];
      after[field] = next;
    }

    // A key on the wire, an id in the column — so this one cannot be compared
    // by the loop above.
    if (
      dto.creativeType !== undefined &&
      dto.creativeType !== existing.creativeTypeKey
    ) {
      columnUpdates.creativeTypeId = await this.creativeTypeIdFor(
        dto.creativeType,
      );
      before.creativeType = existing.creativeTypeKey;
      after.creativeType = dto.creativeType;
    }

    // Set semantics: a supplied array replaces the stored set. Compared as
    // sets, not arrays, so re-sending the same placements in a different order
    // is correctly a no-op rather than a logged "edit".
    const nextPlacements =
      dto.placements === undefined ? undefined : [...new Set(dto.placements)];
    const placementsChanged =
      nextPlacements !== undefined &&
      !this.sameSet(nextPlacements, storedPlacements);

    if (placementsChanged) {
      before.placements = [...storedPlacements].sort();
      after.placements = [...nextPlacements].sort();
    }

    if (Object.keys(columnUpdates).length === 0 && !placementsChanged) {
      throw new ConflictException({
        code: 'NO_EFFECTIVE_CHANGE',
        message:
          'Every field in this request already holds the value you sent.',
      });
    }

    return db.transaction(async (tx) => {
      // Guarded: a placements-only edit has no columns to set, and Drizzle
      // rejects an empty `.set()`. `updated_at` still has to move, so the
      // update always runs — it is the column the console sorts by, and this
      // table has a default but no $onUpdate to move it.
      await tx
        .update(sponsors)
        .set({ ...columnUpdates, updatedAt: sql`now()` })
        .where(eq(sponsors.id, id));

      if (placementsChanged) {
        await this.replacePlacements(tx, id, storedPlacements, nextPlacements);
      }

      await this.auditService.record({
        admin,
        action: 'sponsor.update',
        targetId: id,
        targetLabel: existing.name,
        // Scoped to what changed on both sides, so the entry reads as a diff
        // rather than two full copies a human has to compare by eye.
        before: this.serialise(before),
        after: this.serialise(after),
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  /**
   * Take a running campaign off every citizen surface, immediately.
   *
   * Requires the stored status to be `active` — including when the campaign is
   * currently DERIVING as `scheduled` or `expired`, both of which are stored
   * `active`. Pausing a campaign that has not started yet is a real thing to
   * want (the deal fell through last week), and refusing it because the console
   * happens to be showing "Scheduled" would send an operator hunting for a
   * button that does not exist.
   *
   * A `draft` cannot be paused: it was never running, and storing `paused` on
   * it would produce a state — a paused draft — that means nothing and that
   * `activate` would then have to interpret.
   */
  async pause(id: string, admin: AdminIdentity, meta: AdminRequestMeta) {
    const existing = await this.requireSponsorRow(id);

    if (existing.storedStatusKey === 'paused') {
      throw new ConflictException({
        code: 'SPONSOR_ALREADY_PAUSED',
        message: 'This sponsor is already paused.',
      });
    }
    if (existing.storedStatusKey !== 'active') {
      throw new ConflictException({
        code: 'SPONSOR_NOT_ACTIVE',
        message: `Only an active sponsor can be paused. This one is a ${existing.storedStatusKey}.`,
      });
    }

    return this.transition(
      id,
      existing,
      'paused',
      'sponsor.pause',
      admin,
      meta,
    );
  }

  /**
   * Put a campaign live — or back live, from `paused` or `draft`.
   *
   * Deliberately does NOT stamp `start_date = now()`. An operator activating a
   * campaign booked for the first of next month means "approve this to run",
   * not "run it today"; overwriting the schedule would start a paid campaign
   * early and bill somebody for it. An `active` row with a future `start_date`
   * IS the scheduled state, and the citizen query is what decides it is not
   * visible yet (sponsor-status.ts).
   *
   * THE TWO READINESS GUARDS BELOW ARE THE POINT OF THIS METHOD.
   * A campaign that is live but renders nowhere is the exact failure this
   * module exists to end: it looks active in the console, the advertiser is
   * being charged, and no citizen ever sees it. Both conditions are silent —
   * neither produces an error anywhere — so this is the only place they can be
   * caught. They are checked at activation rather than at create/update on
   * purpose: a half-finished DRAFT is a legitimate state, and blocking Save
   * would stop an operator recording a sponsor they are still negotiating.
   */
  async activate(id: string, admin: AdminIdentity, meta: AdminRequestMeta) {
    const existing = await this.requireSponsorRow(id);

    if (existing.storedStatusKey === 'active') {
      throw new ConflictException({
        code: 'SPONSOR_ALREADY_ACTIVE',
        message: 'This sponsor is already active.',
      });
    }

    const placements = (await this.placementsFor(db, [id])).get(id) ?? [];
    if (placements.length === 0) {
      throw new ConflictException({
        code: 'SPONSOR_NO_PLACEMENTS',
        message:
          'This sponsor has no placements, so activating it would run a campaign that appears on no surface. Choose at least one placement first.',
      });
    }

    if (
      CREATIVE_TYPES_NEEDING_URL.includes(existing.creativeTypeKey) &&
      existing.creativeUrl === null
    ) {
      throw new ConflictException({
        code: 'SPONSOR_CREATIVE_URL_REQUIRED',
        message: `A ${existing.creativeTypeKey} creative needs a creativeUrl before it can run — without one the card renders blank. Add the asset URL, or switch the creative type to logo_text.`,
      });
    }

    return this.transition(
      id,
      existing,
      'active',
      'sponsor.activate',
      admin,
      meta,
    );
  }

  /**
   * Soft delete. Returns nothing — the route answers 204.
   *
   * `deleted_at` rather than a DELETE statement: the audit entry below points
   * at a target id, and a hard delete would leave it pointing at nothing
   * (`admin_audit_logs.target_id` is deliberately not an FK — ADR 0012).
   * `before` carries the full campaign, so the terms survive the deletion in
   * the one place designed to keep them.
   *
   * ⚠️ KNOWN DEVIATION FROM ADR 0012, recorded rather than left silent.
   * That ADR requires `reason` on destructive actions and states that the
   * identical omission in `DELETE /admin/community-updates/:id` is "a deviation,
   * not a precedent". This endpoint repeats it, for the same cause and no
   * better one: the frozen contract the admin console is already coded against
   * (apps/admin/src/features/sponsors/types.ts) specifies
   * `DELETE /admin/sponsors/:id -> 204` with no request body, and requiring one
   * would break a client written before this service existed. The actor, the
   * timestamp, the target label and the complete `before` copy are all still
   * recorded — what is lost is the stated motive, not the evidence. If the
   * contract gains a body, adopt a reason here.
   */
  async delete(
    id: string,
    admin: AdminIdentity,
    meta: AdminRequestMeta,
  ): Promise<void> {
    const existing = await this.requireSponsorRow(id);
    const placements = (await this.placementsFor(db, [id])).get(id) ?? [];

    await db.transaction(async (tx) => {
      await tx
        .update(sponsors)
        .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(sponsors.id, id));

      await this.auditService.record({
        admin,
        action: 'sponsor.delete',
        targetId: id,
        targetLabel: existing.name,
        before: this.auditShape(
          {
            name: existing.name,
            logoUrl: existing.logoUrl,
            description: existing.description,
            website: existing.website,
            category: existing.category,
            campaignName: existing.campaignName,
            location: existing.location,
            creativeType: existing.creativeTypeKey as SponsorCreativeTypeKey,
            creativeUrl: existing.creativeUrl,
            startDate: existing.startDate,
            endDate: existing.endDate,
          },
          placements,
        ),
        meta,
        tx,
      });
    });
  }

  // --------------------------------------------------------------- internals

  private async transition(
    id: string,
    existing: { name: string; storedStatusKey: string },
    target: SponsorStoredStatusKey,
    action: 'sponsor.pause' | 'sponsor.activate',
    admin: AdminIdentity,
    meta: AdminRequestMeta,
  ) {
    const statusId = await this.statusIdFor(target);

    return db.transaction(async (tx) => {
      await tx
        .update(sponsors)
        .set({ statusId, updatedAt: sql`now()` })
        .where(eq(sponsors.id, id));

      await this.auditService.record({
        admin,
        action,
        targetId: id,
        targetLabel: existing.name,
        // The STORED status on both sides, not the derived one. An audit row
        // records what a human changed, and nobody changes `expired` — it is
        // the clock's word, not an admin's. Writing the derived value here
        // would attribute the passage of time to a person.
        before: { status: existing.storedStatusKey },
        after: { status: target },
        meta,
        tx,
      });

      return this.findOneWithin(tx, id);
    });
  }

  /**
   * Add and remove only what differs, rather than deleting the set and
   * reinserting it.
   *
   * The rows carry `created_at`, so a delete-all/insert-all would reset the
   * timestamp on placements that never changed — losing the only record of when
   * a sponsor was actually added to a surface. It also keeps the write
   * proportional to the edit.
   */
  private async replacePlacements(
    tx: Pick<typeof db, 'insert' | 'delete'>,
    sponsorId: string,
    stored: readonly string[],
    next: readonly string[],
  ): Promise<void> {
    const removed = stored.filter((key) => !next.includes(key));
    const added = next.filter((key) => !stored.includes(key));

    if (removed.length > 0) {
      await tx
        .delete(sponsorPlacements)
        .where(
          and(
            eq(sponsorPlacements.sponsorId, sponsorId),
            inArray(sponsorPlacements.placementKey, removed),
          ),
        );
    }

    if (added.length > 0) {
      await tx.insert(sponsorPlacements).values(
        added.map((placementKey) => ({
          id: uuidv7(),
          sponsorId,
          placementKey,
        })),
      );
    }
  }

  /**
   * Placement keys for a page of sponsors, in one query.
   *
   * A second round trip rather than a correlated `array_agg` subquery in the
   * main select: it reads as what it is, it works identically inside a
   * transaction, and it does not depend on the driver's array parsing. One
   * extra query for a page of at most 100 rows is not the cost worth optimising
   * here — an N+1 would have been.
   */
  private async placementsFor(
    executor: Pick<typeof db, 'select'>,
    sponsorIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const grouped = new Map<string, string[]>();
    if (sponsorIds.length === 0) return grouped;

    const rows = await executor
      .select({
        sponsorId: sponsorPlacements.sponsorId,
        placementKey: sponsorPlacements.placementKey,
      })
      .from(sponsorPlacements)
      .where(inArray(sponsorPlacements.sponsorId, [...sponsorIds]))
      // Deterministic, so the console's "Placements" cell does not reorder
      // between two requests that returned the same set.
      .orderBy(sponsorPlacements.placementKey);

    for (const row of rows) {
      const existing = grouped.get(row.sponsorId);
      if (existing) existing.push(row.placementKey);
      else grouped.set(row.sponsorId, [row.placementKey]);
    }
    return grouped;
  }

  /**
   * Resolved against the lookup table, never a hardcoded id.
   *
   * Typed to `SponsorStoredStatusKey`, not `SponsorStatusKey`, so this method
   * cannot be called with 'scheduled' or 'expired'. Those two are derived and
   * must never reach `status_id` — the type is the enforcement, not a comment.
   *
   * Throws loudly when the row is absent, for the reason
   * AdminAuditService.actionIdFor() does: a miss means `db:seed` has not run,
   * and silently guessing a status would be worse than the request failing.
   */
  private async statusIdFor(key: SponsorStoredStatusKey): Promise<string> {
    return this.lookupId(
      this.statusIds,
      sponsorStatuses,
      key,
      'sponsor_statuses',
    );
  }

  private async creativeTypeIdFor(
    key: SponsorCreativeTypeKey,
  ): Promise<string> {
    return this.lookupId(
      this.creativeTypeIds,
      sponsorCreativeTypes,
      key,
      'sponsor_creative_types',
    );
  }

  private async lookupId(
    memo: Map<string, string>,
    table: typeof sponsorStatuses | typeof sponsorCreativeTypes,
    key: string,
    tableName: string,
  ): Promise<string> {
    const hit = memo.get(key);
    if (hit) return hit;

    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.key, key));

    if (!row) {
      throw new Error(
        `${tableName} row missing for key "${key}" — did db:seed run?`,
      );
    }

    memo.set(key, row.id);
    return row.id;
  }

  private baseQuery() {
    return (
      db
        .select({
          id: sponsors.id,
          name: sponsors.name,
          logoUrl: sponsors.logoUrl,
          description: sponsors.description,
          website: sponsors.website,
          category: sponsors.category,
          campaignName: sponsors.campaignName,
          location: sponsors.location,
          creativeTypeKey: sponsorCreativeTypes.key,
          creativeTypeLabel: sponsorCreativeTypes.label,
          creativeUrl: sponsors.creativeUrl,
          startDate: sponsors.startDate,
          endDate: sponsors.endDate,
          effectiveStatusKey: effectiveSponsorStatusSql,
          effectiveStatusLabel: effectiveStatus.label,
          createdAt: sponsors.createdAt,
          updatedAt: sponsors.updatedAt,
        })
        .from(sponsors)
        .innerJoin(sponsorStatuses, eq(sponsors.statusId, sponsorStatuses.id))
        .innerJoin(
          sponsorCreativeTypes,
          eq(sponsors.creativeTypeId, sponsorCreativeTypes.id),
        )
        // leftJoin, and it must stay one. An innerJoin here would silently DROP
        // every scheduled or expired sponsor from the list if the `scheduled` /
        // `expired` lookup rows were ever missing — a seeding problem presenting
        // as missing campaigns. Left-joining turns it into a visibly unlabelled
        // status instead; `toResponse()` falls back to the raw key.
        .leftJoin(
          effectiveStatus,
          sql`${effectiveStatus.key} = ${effectiveSponsorStatusSql}`,
        )
    );
  }

  /** The projection, read back inside the caller's transaction. */
  private async findOneWithin(
    tx: Pick<typeof db, 'select'>,
    id: string,
  ): Promise<ReturnType<AdminSponsorsService['toResponse']>> {
    const [row] = await tx
      .select({
        id: sponsors.id,
        name: sponsors.name,
        logoUrl: sponsors.logoUrl,
        description: sponsors.description,
        website: sponsors.website,
        category: sponsors.category,
        campaignName: sponsors.campaignName,
        location: sponsors.location,
        creativeTypeKey: sponsorCreativeTypes.key,
        creativeTypeLabel: sponsorCreativeTypes.label,
        creativeUrl: sponsors.creativeUrl,
        startDate: sponsors.startDate,
        endDate: sponsors.endDate,
        effectiveStatusKey: effectiveSponsorStatusSql,
        effectiveStatusLabel: effectiveStatus.label,
        createdAt: sponsors.createdAt,
        updatedAt: sponsors.updatedAt,
      })
      .from(sponsors)
      .innerJoin(sponsorStatuses, eq(sponsors.statusId, sponsorStatuses.id))
      .innerJoin(
        sponsorCreativeTypes,
        eq(sponsors.creativeTypeId, sponsorCreativeTypes.id),
      )
      .leftJoin(
        effectiveStatus,
        sql`${effectiveStatus.key} = ${effectiveSponsorStatusSql}`,
      )
      .where(eq(sponsors.id, id));

    const placements = await this.placementsFor(tx, [id]);
    // Read back inside the transaction that just wrote it, so this cannot miss.
    return this.toResponse(row, placements.get(id) ?? []);
  }

  private async requireSponsor(id: string): Promise<SponsorRow> {
    const [row] = await this.baseQuery().where(
      and(eq(sponsors.id, id), isNull(sponsors.deletedAt)),
    );
    if (!row) throw this.notFound();
    return row;
  }

  /**
   * The raw row plus its two lookup KEYS, for the paths that diff or snapshot.
   *
   * The keys are joined rather than resolved from the memo because a diff
   * comparing `dto.creativeType` (a key) against a column (an id) would
   * otherwise need a reverse lookup that can go stale.
   */
  private async requireSponsorRow(id: string) {
    const [row] = await db
      .select({
        name: sponsors.name,
        logoUrl: sponsors.logoUrl,
        description: sponsors.description,
        website: sponsors.website,
        category: sponsors.category,
        campaignName: sponsors.campaignName,
        location: sponsors.location,
        creativeUrl: sponsors.creativeUrl,
        startDate: sponsors.startDate,
        endDate: sponsors.endDate,
        creativeTypeKey: sponsorCreativeTypes.key,
        storedStatusKey: sponsorStatuses.key,
      })
      .from(sponsors)
      .innerJoin(sponsorStatuses, eq(sponsors.statusId, sponsorStatuses.id))
      .innerJoin(
        sponsorCreativeTypes,
        eq(sponsors.creativeTypeId, sponsorCreativeTypes.id),
      )
      .where(and(eq(sponsors.id, id), isNull(sponsors.deletedAt)));

    if (!row) throw this.notFound();
    return row;
  }

  private notFound() {
    return new NotFoundException({
      code: 'SPONSOR_NOT_FOUND',
      message: 'Sponsor not found.',
    });
  }

  private sameValue(a: unknown, b: unknown): boolean {
    // Dates are compared by instant, not identity — two Date objects for the
    // same moment are never `===`, so without this every window-carrying PATCH
    // would look like a change.
    if (a instanceof Date && b instanceof Date)
      return a.getTime() === b.getTime();
    return a === b;
  }

  private sameSet(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    const other = new Set(b);
    return a.every((value) => other.has(value));
  }

  /** Dates -> ISO strings, so the jsonb audit payload is readable as written. */
  private serialise(fields: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    );
  }

  private auditShape(
    fields: {
      name: string;
      logoUrl?: string | null;
      description?: string | null;
      website?: string | null;
      category?: string | null;
      campaignName?: string | null;
      location?: string | null;
      creativeType: SponsorCreativeTypeKey;
      creativeUrl?: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
    },
    placements: readonly string[],
  ) {
    return this.serialise({
      name: fields.name,
      logoUrl: fields.logoUrl ?? null,
      description: fields.description ?? null,
      website: fields.website ?? null,
      category: fields.category ?? null,
      campaignName: fields.campaignName ?? null,
      location: fields.location ?? null,
      creativeType: fields.creativeType,
      creativeUrl: fields.creativeUrl ?? null,
      startDate: fields.startDate ?? null,
      endDate: fields.endDate ?? null,
      placements: [...placements].sort(),
    });
  }

  private toResponse(row: SponsorRow, placements: string[]) {
    return {
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl,
      description: row.description,
      website: row.website,
      category: row.category,
      campaignName: row.campaignName,
      location: row.location,
      creativeType: { key: row.creativeTypeKey, label: row.creativeTypeLabel },
      creativeUrl: row.creativeUrl,
      placements,
      startDate: row.startDate?.toISOString() ?? null,
      endDate: row.endDate?.toISOString() ?? null,
      // The DERIVED status — what is true right now, not what somebody last
      // stored. This is the field that makes the console's `scheduled` and
      // `expired` tabs reachable at all.
      //
      // The label falls back to the key when the lookup row is missing, rather
      // than rendering an empty badge. The console does the same thing for an
      // unrecognised placement, and for the same reason: showing the raw key is
      // ugly and honest, hiding it is neither.
      status: {
        key: row.effectiveStatusKey,
        label: row.effectiveStatusLabel ?? row.effectiveStatusKey,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
