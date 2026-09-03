import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { reportCategories, reports } from '../db/schema/reports-schema';
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
 * ============================ KNOWN HAZARD ================================
 * `pnpm db:seed` UPSERTS categories by `key` (db/seed.ts) and its `set` clause
 * overwrites label, emoji, defaultExpiryMinutes and citizenSelectable. So any
 * edit an admin makes through this service to one of the nine SEEDED categories
 * is silently reverted the next time anyone runs the seed — which the API
 * container does NOT do on boot (its CMD runs db:migrate only), but a developer
 * routinely does.
 *
 * This is unresolved product question #7 in docs/_audit/open-questions.md
 * ("accept that, or make seeding insert-only once an admin UI exists?"). It is
 * written here, in the code that will lose the edit, because the alternative is
 * someone discovering it by watching their change disappear. Categories created
 * through POST are not affected — the seed only knows its own nine keys.
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
      .orderBy(asc(reportCategories.key));

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

    // Counts EVERY report in this category, soft-deleted included — unlike
    // list()'s reportCount, which is a human-facing "in use" figure. The
    // foreign key from reports.category_id does not care about deleted_at, so
    // a category whose only reports are soft-deleted is still undeletable. This
    // check exists to turn that into a 409 with an explanation instead of a
    // foreign-key violation surfacing as a 500.
    const [{ count }] = await db
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

    return db.transaction(async (tx) => {
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
