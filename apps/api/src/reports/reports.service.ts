import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportPhotos,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import { reportSaves } from '../db/schema/saves-schema';
import {
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import type { CreateReportDto } from './dto/create-report.dto';
import type { UpdateReportDto } from './dto/update-report.dto';
import type { ListReportsDto } from './dto/list-reports.dto';
import type { ReportsSummaryDto } from './dto/reports-summary.dto';
import type { CommunityStatsDto } from './dto/community-stats.dto';
import { MissionsService } from '../missions/missions.service';
import { AlertsService } from '../alerts/alerts.service';
import {
  requireVisibleReport,
  throwForMissingReport,
} from './report-visibility';
import { getPlatformConfig } from '../config/platform-settings';
import { assertStoredUploads } from '../uploads/stored-upload';

// Great-circle distance in km via the haversine formula, expressed directly
// in SQL (no PostGIS extension on this Postgres — see docker-compose.yml).
// Fine at v0.1's scale (radius-filtered queries against one small table);
// revisit with PostGIS/a geo index if `reports` grows large enough for this
// to become a real cost.
function distanceKmExpr(lat: number, lng: number) {
  return sql<number>`
    6371 * acos(
      cos(radians(${lat})) * cos(radians(${reports.lat})) *
      cos(radians(${reports.lng}) - radians(${lng})) +
      sin(radians(${lat})) * sin(radians(${reports.lat}))
    )
  `;
}

type ReportRow = typeof reports.$inferSelect;
type CategoryRow = typeof reportCategories.$inferSelect;
type StatusRow = typeof reportStatuses.$inferSelect;

@Injectable()
export class ReportsService {
  constructor(
    private readonly missionsService: MissionsService,
    private readonly alertsService: AlertsService,
  ) {}

  // US-1 AC2 — the client needs each category's default expiry to pre-fill
  // it; served from the DB so it stays the single source (API-CONTRACT.md
  // flagged the old prototype for duplicating this client-side).
  async listCategories() {
    const rows = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.citizenSelectable, true));

    return rows.map((c) => ({
      key: c.key,
      label: c.label,
      emoji: c.emoji,
      defaultExpiryMinutes: c.defaultExpiryMinutes,
    }));
  }

  private async getStatusIdByKey(key: string): Promise<string> {
    const [status] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.key, key));
    if (!status)
      throw new Error(
        `report_statuses row missing for key "${key}" — did db:seed run?`,
      );
    return status.id;
  }

  /**
   * The three Platform -> App Settings keys that constrain a report.
   *
   * One place, called by create(), update() and addPhoto(), so a limit an
   * operator lowers applies to every path that could otherwise exceed it. A
   * configured maximum enforced on create but not on edit is not a maximum.
   *
   * Every field is optional: each caller passes only what it can change.
   */
  private async assertReportLimits(input: {
    photoCount?: number;
    neededVolunteers?: number;
    anonymous?: boolean;
  }): Promise<void> {
    const config = await getPlatformConfig();

    if (
      input.photoCount !== undefined &&
      input.photoCount > config.maxPhotosPerReport
    ) {
      throw new BadRequestException({
        code: 'REPORT_PHOTO_LIMIT',
        message: `Up to ${config.maxPhotosPerReport} ${config.maxPhotosPerReport === 1 ? 'photo' : 'photos'} allowed`,
        limit: config.maxPhotosPerReport,
      });
    }

    if (
      input.neededVolunteers !== undefined &&
      input.neededVolunteers > config.maxVolunteersPerReport
    ) {
      throw new BadRequestException({
        code: 'REPORT_VOLUNTEER_LIMIT',
        message: `Up to ${config.maxVolunteersPerReport} ${config.maxVolunteersPerReport === 1 ? 'volunteer' : 'volunteers'} can be requested`,
        limit: config.maxVolunteersPerReport,
      });
    }

    // Only ever blocks turning anonymity ON. Switching it off is always allowed,
    // and reports that were already anonymous when the setting was flipped stay
    // anonymous — retroactively unmasking a reporter who chose anonymity would
    // be a privacy breach, not a policy change.
    if (input.anonymous === true && !config.allowAnonymousReports) {
      throw new ForbiddenException({
        code: 'ANONYMOUS_REPORTS_DISABLED',
        message:
          'Anonymous requests are currently turned off for this platform.',
      });
    }
  }

  /**
   * Every photo URL that reaches `report_photos.url` has to be one this API
   * actually served — checked here, on the same three paths as
   * assertReportLimits, because those are the three ways a string reaches that
   * column (create, the full-replace edit, and addPhoto).
   *
   * The DTOs only run `z.string().url()`, which is a syntax check:
   * `http://evil.com/tracker.png` passes it. Mobile renders this column
   * directly, so a stored off-origin URL makes every citizen who opens the
   * report fetch from a host we do not control. The predicate lives in
   * ../uploads/stored-upload.ts, shared with MissionsService.complete() and
   * UsersService.completeProfile(), which write the other two photo columns.
   *
   * Deliberately AFTER the ownership/state guards and assertReportLimits in
   * each caller: those answer "may you write here at all", and a caller who is
   * refused for being a non-owner should hear that, not a photo complaint.
   */
  private assertPhotosAreOurUploads(urls: string[] | undefined): void {
    if (urls === undefined) return;
    assertStoredUploads(urls);
  }

  async create(reporterId: string, input: CreateReportDto) {
    const [category] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.key, input.categoryKey));

    if (!category) throw new BadRequestException('Unknown category');
    // BR-3: Disaster Relief exists in the table but citizens can't post to it.
    if (!category.citizenSelectable)
      throw new BadRequestException('This category is not citizen-selectable');

    // Platform -> App Settings, enforced at RUNTIME rather than in the DTO.
    // CreateReportSchema's .max(4)/.max(20) are built once at import time, so
    // they can only ever express a fixed ceiling; they stay as the hard upper
    // bound a request may not exceed under any configuration. The operator's
    // configured limit is necessarily checked here, where the current value can
    // actually be read. A setting nothing reads is the failure
    // docs/webadmin/07-platform-settings.md §2A is a post-mortem of.
    await this.assertReportLimits({
      photoCount: input.photoUrls.length,
      neededVolunteers: input.neededVolunteers,
      anonymous: input.anonymous,
    });
    this.assertPhotosAreOurUploads(input.photoUrls);

    // BR-2: the reporter may shorten the category's default expiry, never extend it.
    const expiryMinutes = Math.min(
      input.expiryMinutes ?? category.defaultExpiryMinutes,
      category.defaultExpiryMinutes,
    );
    const expiryAt = new Date(Date.now() + expiryMinutes * 60_000);
    const openStatusId = await this.getStatusIdByKey('open');

    const reportId = uuidv7();
    const [created] = await db
      .insert(reports)
      .values({
        id: reportId,
        reporterId,
        categoryId: category.id,
        statusId: openStatusId,
        title: input.title,
        description: input.description,
        lat: input.lat,
        lng: input.lng,
        landmark: input.landmark,
        anonymous: input.anonymous,
        phoneVisible: input.phoneVisible,
        neededVolunteers: input.neededVolunteers,
        expiryAt,
      })
      .returning();

    await db.insert(reportPhotos).values(
      input.photoUrls.map((url) => ({
        id: uuidv7(),
        reportId,
        url,
        capturedLive: true,
      })),
    );

    return this.findOne(created.id, reporterId);
  }

  async findOne(reportId: string, requestingUserId: string) {
    const [row] = await db
      .select({
        report: reports,
        category: reportCategories,
        status: reportStatuses,
        reporter: user,
      })
      .from(reports)
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .leftJoin(user, eq(reports.reporterId, user.id))
      .where(and(eq(reports.id, reportId), isNull(reports.deletedAt)));

    // The single most important place for the honest state: this is the
    // endpoint a volunteer's stale My Helps card, and every alert deep link,
    // taps into. A bare "Report not found" here reads as a broken link; the
    // REPORT_REMOVED branch tells them a moderator removed it. See
    // ReportRemovedException for the disclosure trade-off.
    if (!row) await throwForMissingReport(reportId);

    const photos = await db
      .select()
      .from(reportPhotos)
      .where(eq(reportPhotos.reportId, reportId));
    const hasActiveVolunteerAccess = await this.missionsService.hasActiveAccess(
      reportId,
      requestingUserId,
    );
    const hasAnyActiveVolunteer =
      await this.missionsService.hasAnyActiveVolunteer(reportId);

    const mySaveRows = await db
      .select()
      .from(reportSaves)
      .where(
        and(
          eq(reportSaves.reportId, reportId),
          eq(reportSaves.userId, requestingUserId),
        ),
      );

    return this.toResponse(
      row.report,
      row.category,
      row.status,
      photos.map((p) => p.url),
      row.reporter,
      requestingUserId,
      hasActiveVolunteerAccess,
      mySaveRows.length > 0,
      hasAnyActiveVolunteer,
    );
  }

  // Profile → Saved Stories. Mirrors list()'s shape (same joins, same
  // per-row toResponse()) but ordered by save time and scoped through
  // report_saves instead of a category/radius filter.
  async listSaved(requestingUserId: string) {
    const rows = await db
      .select({
        report: reports,
        category: reportCategories,
        status: reportStatuses,
        reporter: user,
      })
      .from(reportSaves)
      .innerJoin(reports, eq(reportSaves.reportId, reports.id))
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .leftJoin(user, eq(reports.reporterId, user.id))
      // The one query in this service that was missing the deletedAt filter,
      // and it serves SavedReportsService (GET /users/me/saved-reports) — a
      // full toResponse() per row, coordinates included. Same rule as
      // listMine() directly below: a hidden report leaves the reporter's own
      // list, so it must leave the saver's too.
      .where(
        and(
          eq(reportSaves.userId, requestingUserId),
          isNull(reports.deletedAt),
        ),
      )
      .orderBy(desc(reportSaves.createdAt));

    if (rows.length === 0) return [];

    const reportIds = rows.map((r) => r.report.id);
    const photoRows = await db
      .select()
      .from(reportPhotos)
      .where(inArray(reportPhotos.reportId, reportIds));
    const photosByReportId = new Map<string, string[]>();
    for (const photo of photoRows) {
      const existing = photosByReportId.get(photo.reportId) ?? [];
      existing.push(photo.url);
      photosByReportId.set(photo.reportId, existing);
    }

    return Promise.all(
      rows.map(async (row) => ({
        ...this.toResponse(
          row.report,
          row.category,
          row.status,
          photosByReportId.get(row.report.id) ?? [],
          row.reporter,
          requestingUserId,
          await this.missionsService.hasActiveAccess(
            row.report.id,
            requestingUserId,
          ),
          true, // every row here is, by definition, one this user saved
        ),
      })),
    );
  }

  // Profile → My Reports. Every non-deleted report this user reported,
  // across all statuses (open/closed/expired/completed) — a deleted report
  // never appears here either, matching AC4: it disappears from the
  // reporter's own view the same way it disappears from everyone else's,
  // with no separate "Deleted" tab.
  async listMine(requestingUserId: string) {
    const rows = await db
      .select({
        report: reports,
        category: reportCategories,
        status: reportStatuses,
        reporter: user,
      })
      .from(reports)
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .leftJoin(user, eq(reports.reporterId, user.id))
      .where(
        and(
          eq(reports.reporterId, requestingUserId),
          isNull(reports.deletedAt),
        ),
      )
      .orderBy(desc(reports.createdAt));

    if (rows.length === 0) return [];

    const reportIds = rows.map((r) => r.report.id);
    const photoRows = await db
      .select()
      .from(reportPhotos)
      .where(inArray(reportPhotos.reportId, reportIds));
    const photosByReportId = new Map<string, string[]>();
    for (const photo of photoRows) {
      const existing = photosByReportId.get(photo.reportId) ?? [];
      existing.push(photo.url);
      photosByReportId.set(photo.reportId, existing);
    }

    return Promise.all(
      rows.map(async (row) => {
        const activeVolunteerIds =
          await this.missionsService.listActiveVolunteerIds(row.report.id);
        return {
          ...this.toResponse(
            row.report,
            row.category,
            row.status,
            photosByReportId.get(row.report.id) ?? [],
            row.reporter,
            requestingUserId,
            true, // it's always the reporter's own report here
            false,
            activeVolunteerIds.length > 0,
          ),
          // Matches the mobile Report type's assignedVolunteersCount — how
          // many volunteers are currently joined/active on this report's
          // mission, for the "2 / 4 volunteers joined" line in My Reports.
          assignedVolunteersCount: activeVolunteerIds.length,
        };
      }),
    );
  }

  // discover-nearby-requests.md US-1 — active/urgent counts per category
  // within radius, for the Dashboard grid. "Urgent" mirrors the TONES "soon"
  // band (design-system.md §5): expiring within the hour.
  async summary(input: ReportsSummaryDto) {
    const openStatusId = await this.getStatusIdByKey('open');
    const dist = distanceKmExpr(input.lat, input.lng);

    const rows = await db
      .select({
        categoryKey: reportCategories.key,
        activeCount: sql<string>`count(*)`,
        urgentCount: sql<string>`count(*) filter (where ${reports.expiryAt} - now() < interval '1 hour')`,
      })
      .from(reports)
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .where(
        and(
          eq(reports.statusId, openStatusId),
          isNull(reports.deletedAt),
          sql`${dist} <= ${input.radiusKm}`,
        ),
      )
      .groupBy(reportCategories.key);

    const byKey = new Map(rows.map((r) => [r.categoryKey, r]));
    const categories = await this.listCategories();
    return categories.map((c) => ({
      key: c.key,
      activeCount: Number(byKey.get(c.key)?.activeCount ?? 0),
      urgentCount: Number(byKey.get(c.key)?.urgentCount ?? 0),
    }));
  }

  // Dashboard header stats block. "Active Volunteers" is radius-scoped (same
  // area the rest of the screen is looking at); "Helped" is deliberately
  // app-wide — a running total of all-time completed missions, not filtered
  // by location, matching how a cumulative community-impact number should
  // read. Two independent counts, not derived from summary() (that's
  // per-category and open-reports-only; these need a cross-report volunteer
  // join and an unfiltered completed count respectively).
  async communityStats(input: CommunityStatsDto) {
    const openStatusId = await this.getStatusIdByKey('open');
    const completedStatusId = await this.getStatusIdByKey('completed');
    const dist = distanceKmExpr(input.lat, input.lng);

    const [activeVolunteersRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(missionVolunteers)
      .innerJoin(missions, eq(missionVolunteers.missionId, missions.id))
      .innerJoin(reports, eq(missions.reportId, reports.id))
      .innerJoin(
        missionVolunteerStatuses,
        eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
      )
      .where(
        and(
          eq(missionVolunteerStatuses.key, 'active'),
          eq(reports.statusId, openStatusId),
          isNull(reports.deletedAt),
          sql`${dist} <= ${input.radiusKm}`,
        ),
      );

    const [helpedRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(reports)
      .where(
        and(eq(reports.statusId, completedStatusId), isNull(reports.deletedAt)),
      );

    return {
      activeVolunteers: Number(activeVolunteersRow?.count ?? 0),
      helped: Number(helpedRow?.count ?? 0),
    };
  }

  // discover-nearby-requests.md US-3/BR-3 — one category's open reports,
  // nearest-first, within radius.
  async list(input: ListReportsDto, requestingUserId: string) {
    const [category] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.key, input.categoryKey));
    if (!category) throw new BadRequestException('Unknown category');

    const openStatusId = await this.getStatusIdByKey('open');
    const dist = distanceKmExpr(input.lat, input.lng);

    const rows = await db
      .select({
        report: reports,
        category: reportCategories,
        status: reportStatuses,
        reporter: user,
        distanceKm: dist,
      })
      .from(reports)
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .leftJoin(user, eq(reports.reporterId, user.id))
      .where(
        and(
          eq(reports.categoryId, category.id),
          eq(reports.statusId, openStatusId),
          isNull(reports.deletedAt),
          sql`${dist} <= ${input.radiusKm}`,
        ),
      )
      .orderBy(dist);

    if (rows.length === 0) return [];

    const reportIds = rows.map((r) => r.report.id);
    const photoRows = await db
      .select()
      .from(reportPhotos)
      .where(inArray(reportPhotos.reportId, reportIds));
    const photosByReportId = new Map<string, string[]>();
    for (const photo of photoRows) {
      const existing = photosByReportId.get(photo.reportId) ?? [];
      existing.push(photo.url);
      photosByReportId.set(photo.reportId, existing);
    }

    return Promise.all(
      rows.map(async (row) => ({
        ...this.toResponse(
          row.report,
          row.category,
          row.status,
          photosByReportId.get(row.report.id) ?? [],
          row.reporter,
          requestingUserId,
          await this.missionsService.hasActiveAccess(
            row.report.id,
            requestingUserId,
          ),
          false,
          await this.missionsService.hasAnyActiveVolunteer(row.report.id),
        ),
        distanceKm: Math.round(Number(row.distanceKm) * 10) / 10,
      })),
    );
  }

  // edit-cancel-report.md: editable only while open AND before any
  // volunteer has joined — a volunteer already travelling to the reported
  // location must never have it silently move or change shape under them.
  // requireOwnedOpenReport() alone (open + owner) isn't enough here, unlike
  // close()/addPhoto(), which deliberately stay open to volunteers-joined.
  async update(
    reportId: string,
    requestingUserId: string,
    input: UpdateReportDto,
  ) {
    const existing = await this.requireOwnedOpenReport(
      reportId,
      requestingUserId,
    );
    if (await this.missionsService.hasAnyActiveVolunteer(reportId)) {
      throw new ForbiddenException(
        "This request can't be edited once a volunteer has joined — cancel it instead if you need to change something",
      );
    }

    // The same configured limits as create() — an edit is the other way to
    // exceed them.
    await this.assertReportLimits({
      photoCount: input.photoUrls?.length,
      neededVolunteers: input.neededVolunteers,
      anonymous: input.anonymous,
    });
    this.assertPhotosAreOurUploads(input.photoUrls);

    await db
      .update(reports)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.landmark !== undefined && { landmark: input.landmark }),
        ...(input.neededVolunteers !== undefined && {
          neededVolunteers: input.neededVolunteers,
        }),
        ...(input.anonymous !== undefined && { anonymous: input.anonymous }),
        ...(input.phoneVisible !== undefined && {
          phoneVisible: input.phoneVisible,
        }),
      })
      .where(eq(reports.id, existing.id));

    if (input.photoUrls !== undefined) {
      // Full replace — the mobile edit form always sends the complete set
      // it wants, not a delta.
      await db.delete(reportPhotos).where(eq(reportPhotos.reportId, reportId));
      await db.insert(reportPhotos).values(
        input.photoUrls.map((url) => ({
          id: uuidv7(),
          reportId,
          url,
          capturedLive: true,
        })),
      );
    }

    return this.findOne(reportId, requestingUserId);
  }

  async addPhoto(reportId: string, requestingUserId: string, url: string) {
    await this.requireOwnedOpenReport(reportId, requestingUserId);

    const existingPhotos = await db
      .select()
      .from(reportPhotos)
      .where(eq(reportPhotos.reportId, reportId));
    // Was a hardcoded 4. Now the configured maximum — the value an operator
    // lowers on Platform -> App Settings has to bind here too, or "max photos
    // per report" would be a setting that only applies to the first save.
    await this.assertReportLimits({ photoCount: existingPhotos.length + 1 });
    this.assertPhotosAreOurUploads([url]);

    await db
      .insert(reportPhotos)
      .values({ id: uuidv7(), reportId, url, capturedLive: true });

    return this.findOne(reportId, requestingUserId);
  }

  // edit-cancel-report.md "Cancel Report": reuses the existing 'closed'
  // status key rather than adding a 'cancelled' one — the only way a report
  // currently reaches 'closed' is this exact reporter-initiated action, so
  // a second status would be a distinction without a difference. Unlike
  // update(), this stays available with volunteers already joined — it
  // just notifies them instead of blocking the reporter.
  async close(reportId: string, requestingUserId: string) {
    const existing = await this.requireOwnedOpenReport(
      reportId,
      requestingUserId,
    );
    const activeVolunteerIds =
      await this.missionsService.listActiveVolunteerIds(reportId);
    const closedStatusId = await this.getStatusIdByKey('closed');

    await db
      .update(reports)
      .set({ statusId: closedStatusId, closedAt: new Date() })
      .where(eq(reports.id, existing.id));

    await Promise.all(
      activeVolunteerIds.map((volunteerId) =>
        this.alertsService.create(
          volunteerId,
          'report_cancelled',
          { volunteerName: null, reportTitle: existing.title },
          reportId,
        ),
      ),
    );

    return this.findOne(reportId, requestingUserId);
  }

  // edit-cancel-report.md "Delete Report": soft delete only — see
  // reports-schema.ts's deletedAt/deletedBy comment for why. Same
  // eligibility as Edit (open + zero volunteers ever joined, not just
  // currently-active ones — a report someone already responded to and then
  // left keeps its history, it doesn't become deletable again), reusing
  // requireOwnedOpenReport() + hasAnyActiveVolunteer() rather than a new
  // guard. Not idempotent on purpose (AC5): a second delete 404s, since
  // requireOwnedOpenReport() already filters out soft-deleted rows.
  async delete(
    reportId: string,
    requestingUserId: string,
  ): Promise<{ id: string; deleted: true }> {
    const existing = await this.requireOwnedOpenReport(
      reportId,
      requestingUserId,
    );
    if (await this.missionsService.hasAnyActiveVolunteer(reportId)) {
      throw new ForbiddenException(
        'Delete is unavailable because volunteers have already joined this request.',
      );
    }

    await db
      .update(reports)
      .set({ deletedAt: new Date(), deletedBy: requestingUserId })
      .where(eq(reports.id, existing.id));

    return { id: reportId, deleted: true };
  }

  // Profile → Saved Stories. A save is a plain existence/toggle fact — same
  // idempotency shape as the other toggle endpoints (ON CONFLICT DO NOTHING).
  async save(reportId: string, requestingUserId: string) {
    await this.requireCompletedReport(reportId);

    await db
      .insert(reportSaves)
      .values({ id: uuidv7(), reportId, userId: requestingUserId })
      .onConflictDoNothing({
        target: [reportSaves.reportId, reportSaves.userId],
      });

    return this.findOne(reportId, requestingUserId);
  }

  async unsave(reportId: string, requestingUserId: string) {
    await db
      .delete(reportSaves)
      .where(
        and(
          eq(reportSaves.reportId, reportId),
          eq(reportSaves.userId, requestingUserId),
        ),
      );

    return this.findOne(reportId, requestingUserId);
  }

  // Shared guard for the three write paths that only the reporter may use,
  // and only while the report is still open (BR-6).
  private async requireOwnedOpenReport(
    reportId: string,
    requestingUserId: string,
  ): Promise<ReportRow> {
    const [existing] = await db
      .select()
      .from(reports)
      .where(and(eq(reports.id, reportId), isNull(reports.deletedAt)));
    if (!existing) throw new NotFoundException('Report not found');
    if (existing.reporterId !== requestingUserId)
      throw new ForbiddenException('Not your report');

    const [status] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.id, existing.statusId));
    if (status?.key !== 'open')
      throw new BadRequestException('Report is no longer open');

    return existing;
  }

  // impact-story.md BR-6: saving only makes sense once a report is a
  // finished Impact Story — enforced here, not just hidden client-side.
  private async requireCompletedReport(reportId: string): Promise<ReportRow> {
    // Unlike requireOwnedOpenReport() above, this guard was not filtering
    // deletedAt — so save() wrote a report_saves row for a hidden report before
    // findOne() 404'd on the way out. A write that half-succeeds against a
    // moderated report is exactly the shape of bug this change exists to close.
    const existing = await requireVisibleReport(reportId);

    const [status] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.id, existing.statusId));
    if (status?.key !== 'completed')
      throw new ForbiddenException('This report is not completed yet');

    return existing;
  }

  private toResponse(
    report: ReportRow,
    category: CategoryRow,
    status: StatusRow,
    photoUrls: string[],
    // Null when the reporter's account has been deleted (reports.reporterId
    // is ON DELETE SET NULL, not cascade — see reports-schema.ts). Distinct
    // from report.anonymous, which is the reporter's own choice to hide
    // their name while their account still exists — see reporterDeleted
    // below for how the two stay distinguishable in the response.
    reporter: typeof user.$inferSelect | null,
    requestingUserId: string,
    hasActiveVolunteerAccess: boolean,
    savedByMe = false,
    hasAnyActiveVolunteer = false,
  ) {
    const isOwner = report.reporterId === requestingUserId;
    const reporterDeleted = report.reporterId === null;
    return {
      id: report.id,
      category: {
        key: category.key,
        label: category.label,
        emoji: category.emoji,
      },
      status: status.key,
      title: report.title,
      description: report.description,
      lat: report.lat,
      lng: report.lng,
      landmark: report.landmark,
      anonymous: report.anonymous,
      phoneVisible: report.phoneVisible,
      neededVolunteers: report.neededVolunteers,
      photos: photoUrls,
      expiryAt: report.expiryAt,
      closedAt: report.closedAt,
      createdAt: report.createdAt,
      isOwner,
      // US-4: the public shape of who reported this — masked when anonymous,
      // null (with reporterDeleted: true below) when the account was
      // deleted. Two different reasons for the same null — the client must
      // check reporterDeleted to render "Deleted User" vs "Posted
      // anonymously" and must never conflate the two.
      reporter:
        reporterDeleted || (report.anonymous && !isOwner)
          ? null
          : { name: reporter!.name, avatarUrl: reporter!.avatarUrl },
      reporterDeleted,
      // BR-4: reporter always sees it; an active volunteer sees it only if
      // the reporter opted in — never from phoneVisible alone. A deleted
      // reporter has no phone number left to show, regardless of who's asking.
      reporterPhone:
        reporterDeleted ||
        !(isOwner || (hasActiveVolunteerAccess && report.phoneVisible))
          ? null
          : reporter!.phoneNumber,
      savedByMe,
      // edit-cancel-report.md: same rule as update()'s server-side guard —
      // computed here, not duplicated client-side, so the two can't drift.
      editable: status.key === 'open' && !hasAnyActiveVolunteer,
    };
  }
}
