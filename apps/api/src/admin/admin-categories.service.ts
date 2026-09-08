import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { reportCategories, reports } from '../db/schema/reports-schema';
import { categoryDisplayOrder } from '../reports/report-category-order';
import { AdminAuditService } from './admin-audit.service';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { CreateReportCategoryDto } from './dto/create-report-category.dto';
import type { UpdateReportCategoryDto } from './dto/update-report-category.dto';

/**
 * Platform -> Categories.
 *
 * This is the admin section with the most immediate effect on the live mobile
 * app, and that is worth knowing before editing anything: `label`, `emoji`,
 * `defaultExpiryMinutes` and `citizenSelectable` are all read from this table
 * per request by ReportsService, so an edit here changes what citizens see and
 * how long their next report lives, with no deploy.
 *
 * ==================== EDITS HERE ARE NOW DURABLE ==========================
 * This block used to describe a hazard: `pnpm db:seed` upserted categories by
 * `key` and its `set` clause overwrote label, emoji, defaultExpiryMinutes and
 * citizenSelectable, so every edit made through this service to one of the nine
 * SEEDED categories was silently reverted the next time anyone seeded.
 *
 * That is resolved. Open question #7 was decided in favour of insert-only
 * seeding, and `db/seed.ts` now writes `report_categories` with
 * `onConflictDoNothing`: the seed creates a category that is missing and never
 * touches one that exists. A label an operator changes here survives every
 * subsequent `db:seed`, on every environment.
 *
 * The reasoning, because it decides what belongs in the seed from now on: these
 * nine rows are OPERATOR CONFIGURATION, not a code contract. Nothing in this
 * repo branches on a category's label or expiry — they are values the product
 * reads and renders. The seed's job is therefore to bootstrap a new database,
 * not to assert a state, and re-asserting one destroys the only copy of a
 * decision a human made through this console. Contrast `report_statuses`, whose
 * keys ARE branched on in code and which stay upserted for exactly that reason;
 * db/seed.ts states the per-table split in full.
 *
 * WHAT THIS DOES NOT PROTECT: `key`. The seed still matches on it, so a category
 * whose key collides with a seeded one is left alone rather than merged — which
 * is the correct outcome, and another reason UpdateReportCategoryDto refuses to
 * let a key change.
 * ==========================================================================
 */
@Injectable()
export class AdminCategoriesService {
  constructor(private readonly auditService: AdminAuditService) {}

  /**
   * Every category, including the ones citizens cannot select.
   *
   * That inclusion is the entire reason this endpoint exists rather than
   * reusing `GET /reports/categories`: that one filters to
   * `citizenSelectable = true` (ReportsService.listCategories()), which hides
   * `disasterRelief` — precisely the row an admin most needs to see and manage.
   *
   * Not paginated: this table holds nine rows and is master data, not user
   * content. A plain array is the honest shape, and it saves the console
   * unwrapping a pagination envelope for a dropdown's worth of data.
   */
  async list() {
    const rows = await db
      .select({
        id: reportCategories.id,
        key: reportCategories.key,
        label: reportCategories.label,
        emoji: reportCategories.emoji,
        defaultExpiryMinutes: reportCategories.defaultExpiryMinutes,
        citizenSelectable: reportCategories.citizenSelectable,
        createdAt: reportCategories.createdAt,
        updatedAt: reportCategories.updatedAt,
        // Soft-deleted reports are excluded, matching every other count in the
        // console (AdminDashboardService does the same). This number answers
        // "is this category in use", and a hidden report is not in use.
        //
        // NOTE: this is the count shown to a human, so it excludes soft-deleted
        // rows — but delete() below deliberately checks a DIFFERENT count that
        // INCLUDES them, because the foreign key does not care that a report is
        // soft-deleted. See the comment there.
        // WRITTEN OUT BY HAND, and it has to stay that way. Interpolating the
        // columns (`${reports.categoryId} = ${reportCategories.id}`) renders both
        // UNQUALIFIED inside this raw subquery, so `category_id = id` resolves
        // entirely against the inner `reports` — a self-correlating predicate
        // that is false for every row, which silently reported 0 for every
        // category. Verified live: unqualified gave 0 across the board where the
        // real counts are medicalHelp 66, animalRescue 1, roadsideHelp 1.
        //
        // Interpolating `alias(reports, 'rc')` does NOT work either: a table
        // alias renders as the bare name `rc`, producing `from rc` and a
        // 42P01 "relation rc does not exist". Hence `${reports} as rc` for the
        // inner table and `${reportCategories}.id` to pin the outer reference.
        reportCount: sql<string>`(
          select count(*) from ${reports} as rc
          where rc.category_id = ${reportCategories}.id
            and rc.deleted_at is null
        )`,
      })
      .from(reportCategories)
      // Was `asc(reportCategories.key)`. The console and the mobile app read the
      // same nine rows and disagreed about their order, so both now import ONE
      // expression — see reports/report-category-order.ts for why sharing the
      // expression matters more than the two clauses happening to match, and why
      // the sort is on `label` (what a human reads, and editable) rather than
      // `key` (hidden, and frozen for the life of the category).
      .orderBy(categoryDisplayOrder);

    return rows.map((row) => ({
      ...row,
      reportCount: Number(row.reportCount),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async create(
    admin: AdminIdentity,
    dto: CreateReportCategoryDto,
    meta: AdminRequestMeta,
  ) {
    // Checked before the insert so the caller gets a 409 with a code, not a
    // 500 from the unique constraint. The insert is still the real authority —
    // a concurrent create would hit the constraint, which is correct.
    const [existing] = await db
      .select({ id: reportCategories.id })
      .from(reportCategories)
      .where(eq(reportCategories.key, dto.key));

    if (existing) {
      throw new ConflictException({
        code: 'CATEGORY_KEY_TAKEN',
        message: `A category with key "${dto.key}" already exists.`,
      });
    }

    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(reportCategories)
        .values({ id: uuidv7(), ...dto })
        .returning();

      await this.auditService.record({
        admin,
        action: 'report_category.create',
        targetId: created.id,
        targetLabel: created.key,
        after: this.auditShape(created),
        meta,
        tx,
      });

      return this.toResponse(created, 0);
    });
  }

  async update(
    id: string,
    admin: AdminIdentity,
    dto: UpdateReportCategoryDto,
    meta: AdminRequestMeta,
  ) {
    const existing = await this.requireCategory(id);

    // Only the fields that actually differ. Without this, PATCHing a category
    // with its current values would write an audit row claiming a change that
    // did not happen — and the console's history would fill with noise.
    const changes = Object.fromEntries(
      Object.entries(dto).filter(
        ([field, value]) =>
          value !== undefined &&
          value !== existing[field as keyof typeof existing],
      ),
    );

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException({
        code: 'NO_EFFECTIVE_CHANGE',
        message:
          'Every field in this request already holds the value you sent.',
      });
    }

    return db.transaction(async (tx) => {
      // The other way to empty the citizen category list, and the quiet one:
      // un-ticking "Citizens can post to it" on the last remaining one. Same
      // invariant as DELETE, same helper, same 409 code — see
      // assertCitizenCategoryRemains for why guarding only DELETE would be a
      // locked door beside an open window.
      //
      // Guarded only when the flag is actually being turned OFF. `changes`
      // already excludes fields whose value is unchanged (see above), so a PATCH
      // that merely re-sends `citizenSelectable: true`, or that edits the label
      // and leaves the flag alone, never reaches the lock.
      if (changes.citizenSelectable === false) {
        await this.assertCitizenCategoryRemains(tx, id, 'hide');
      }

      const [updated] = await tx
        .update(reportCategories)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(reportCategories.id, id))
        .returning();

      await this.auditService.record({
        admin,
        action: 'report_category.update',
        targetId: id,
        targetLabel: updated.key,
        // Scoped to the changed fields on both sides, so the audit row reads as
        // a diff rather than two full copies of the object that a human has to
        // compare by eye.
        before: Object.fromEntries(
          Object.keys(changes).map((field) => [
            field,
            existing[field as keyof typeof existing],
          ]),
        ),
        after: changes,
        meta,
        tx,
      });

      return this.toResponse(updated, await this.reportCountFor(id));
    });
  }

  async delete(id: string, admin: AdminIdentity, meta: AdminRequestMeta) {
    const existing = await this.requireCategory(id);

    // BOTH refusals moved INSIDE the transaction, and that is not tidying.
    // `assertCitizenCategoryRemains` takes row locks, and a lock is released at
    // commit — so a check that ran in its own statement outside this block would
    // hold nothing by the time the DELETE executed, and two concurrent admins
    // could both pass it. The in-use count comes along for the ride because
    // splitting the two across transaction boundaries is how the next reader
    // ends up putting a new check in the wrong one.
    return db.transaction(async (tx) => {
      // FIRST, deliberately. When a category is BOTH the last citizen-selectable
      // one AND carries reports, CATEGORY_IN_USE's advice ("set citizenSelectable
      // to false to retire it") is advice the PATCH guard would then refuse —
      // sending the operator down a path that dead-ends. Leading with the
      // last-remaining refusal names the blocker that is true regardless of the
      // report count, and its instruction (create another category first) is one
      // they can actually carry out.
      await this.assertCitizenCategoryRemains(tx, id, 'delete');

      // Counts EVERY report in this category, soft-deleted included — unlike
      // list()'s reportCount, which is a human-facing "in use" figure. The
      // foreign key from reports.category_id does not care about deleted_at, so
      // a category whose only reports are soft-deleted is still undeletable. This
      // check exists to turn that into a 409 with an explanation instead of a
      // foreign-key violation surfacing as a 500.
      const [{ count }] = await tx
        .select({ count: sql<string>`count(*)` })
        .from(reports)
        .where(eq(reports.categoryId, id));

      if (Number(count) > 0) {
        throw new ConflictException({
          code: 'CATEGORY_IN_USE',
          message: `This category has ${count} report(s) and cannot be deleted. To retire it without losing that history, set citizenSelectable to false — citizens can no longer post to it and existing reports keep working.`,
          reportCount: Number(count),
        });
      }

      await tx.delete(reportCategories).where(eq(reportCategories.id, id));

      await this.auditService.record({
        admin,
        action: 'report_category.delete',
        targetId: id,
        targetLabel: existing.key,
        // The whole row: after a hard delete this snapshot is the only record
        // that the category ever existed, and the only way to recreate it.
        before: this.auditShape(existing),
        meta,
        tx,
      });

      return { id, deleted: true as const };
    });
  }

  /**
   * Refuse anything that would leave citizens with NO category to post under.
   *
   * ================= WHY "LAST CITIZEN-SELECTABLE", NOT "LAST ROW" ==========
   * The state to prevent is `GET /reports/categories` returning `[]`, because
   * that is the one an actual citizen experiences: they open the report flow and
   * there is nothing to choose. That endpoint filters on
   * `citizen_selectable = true`, so the count that matters is of THOSE rows, not
   * of the table.
   *
   * Guarding "the last row of any kind" would be both too weak and too strong:
   *
   *   TOO WEAK — with `disasterRelief` (citizenSelectable: false, BR-3) present,
   *   an admin could delete all eight citizen categories and the table would
   *   still hold a row. The guard would permit it, and the mobile app would be
   *   just as broken as if the table were empty. This is not hypothetical; it is
   *   the seeded shape of the database.
   *
   *   TOO STRONG — deleting `disasterRelief` while eight citizen categories
   *   remain harms nobody, and a rule phrased over rows would block it for no
   *   reason.
   *
   * So the invariant is: at least one row with `citizen_selectable = true`
   * survives. It is enforced here, in the application layer, and NOT by a
   * database CHECK — a constraint cannot express "count over the table > 0"
   * without a trigger, and docs/architecture/data.md records this the same way
   * it records every other invariant whose only guard is application code.
   *
   * ===================== WHY IT ALSO GUARDS PATCH ===========================
   * DELETE is not the only way to reach the forbidden state. Clearing
   * `citizenSelectable` on the last citizen-selectable category empties the
   * citizen list just as completely, and that is a two-click edit in the console
   * rather than a destructive action anyone hesitates over. A guard on DELETE
   * alone would be a locked front door beside an open window, so `update()`
   * calls this too.
   *
   * ============================ RACE SAFETY =================================
   * `FOR UPDATE` is what makes two admins deleting the last two categories at
   * the same time safe, and the reasoning is worth spelling out because a plain
   * `count(*)` here would look correct and be wrong.
   *
   * Both transactions lock EVERY citizen-selectable row, not just their own
   * target. So with categories {A, B} left:
   *
   *   T1 locks {A, B}, sees 2, deletes A, commits.
   *   T2 blocks on A's lock. When T1 commits, Postgres re-evaluates T2's query
   *     under READ COMMITTED (EvalPlanQual): A is gone, so T2's result is {B},
   *     it sees 1, and it refuses. Exactly one of them succeeds.
   *
   * A `count(*)` cannot do this: aggregates are not lockable (`FOR UPDATE is not
   * allowed with aggregate functions`), and an unlocked count is read at a
   * snapshot both transactions take before either writes — so both would read 2
   * and both would delete. Hence selecting the ids and counting them in
   * TypeScript, which is not a workaround but the whole mechanism.
   *
   * It must therefore run INSIDE the caller's transaction — the lock is released
   * at commit, so a check in its own transaction would protect nothing.
   */
  private async assertCitizenCategoryRemains(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    id: string,
    /** What the refusal should tell the operator they were trying to do. */
    intent: 'delete' | 'hide',
  ): Promise<void> {
    const locked = await tx
      .select({ id: reportCategories.id })
      .from(reportCategories)
      .where(eq(reportCategories.citizenSelectable, true))
      .for('update');

    // Not citizen-selectable to begin with: this change cannot reduce the count,
    // so there is nothing to protect. Deleting `disasterRelief` lands here.
    if (!locked.some((row) => row.id === id)) return;

    if (locked.length > 1) return;

    throw new ConflictException({
      code: 'CATEGORY_LAST_REMAINING',
      message:
        intent === 'delete'
          ? 'This is the only category citizens can post under, so deleting it would leave the mobile app with nothing to report. Create another citizen-selectable category first, then delete this one.'
          : 'This is the only category citizens can post under, so hiding it would leave the mobile app with nothing to report. Create or re-enable another citizen-selectable category first.',
    });
  }

  private async requireCategory(id: string) {
    const [row] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.id, id));

    if (!row) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category not found.',
      });
    }
    return row;
  }

  private async reportCountFor(categoryId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<string>`count(*)` })
      .from(reports)
      .where(
        sql`${reports.categoryId} = ${categoryId} and ${reports.deletedAt} is null`,
      );
    return Number(row?.count ?? 0);
  }

  private auditShape(row: typeof reportCategories.$inferSelect) {
    return {
      key: row.key,
      label: row.label,
      emoji: row.emoji,
      defaultExpiryMinutes: row.defaultExpiryMinutes,
      citizenSelectable: row.citizenSelectable,
    };
  }

  private toResponse(
    row: typeof reportCategories.$inferSelect,
    reportCount: number,
  ) {
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      emoji: row.emoji,
      defaultExpiryMinutes: row.defaultExpiryMinutes,
      citizenSelectable: row.citizenSelectable,
      reportCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
