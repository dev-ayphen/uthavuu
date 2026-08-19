import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportPhotos, reportStatuses, reports } from '../db/schema/reports-schema';
import type { CreateReportDto } from './dto/create-report.dto';
import type { UpdateReportDto } from './dto/update-report.dto';
import type { ListReportsDto } from './dto/list-reports.dto';
import type { ReportsSummaryDto } from './dto/reports-summary.dto';
import { MissionsService } from '../missions/missions.service';

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
  constructor(private readonly missionsService: MissionsService) {}

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
    const [status] = await db.select().from(reportStatuses).where(eq(reportStatuses.key, key));
    if (!status) throw new Error(`report_statuses row missing for key "${key}" — did db:seed run?`);
    return status.id;
  }

  async create(reporterId: string, input: CreateReportDto) {
    const [category] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.key, input.categoryKey));

    if (!category) throw new BadRequestException('Unknown category');
    // BR-3: Disaster Relief exists in the table but citizens can't post to it.
    if (!category.citizenSelectable) throw new BadRequestException('This category is not citizen-selectable');

    // BR-2: the reporter may shorten the category's default expiry, never extend it.
    const expiryMinutes = Math.min(input.expiryMinutes ?? category.defaultExpiryMinutes, category.defaultExpiryMinutes);
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
      input.photoUrls.map((url) => ({ id: uuidv7(), reportId, url, capturedLive: true }))
    );

    return this.findOne(created.id, reporterId);
  }

  async findOne(reportId: string, requestingUserId: string) {
    const [row] = await db
      .select({ report: reports, category: reportCategories, status: reportStatuses, reporter: user })
      .from(reports)
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .innerJoin(user, eq(reports.reporterId, user.id))
      .where(eq(reports.id, reportId));

    if (!row) throw new NotFoundException('Report not found');

    const photos = await db.select().from(reportPhotos).where(eq(reportPhotos.reportId, reportId));
    const hasActiveVolunteerAccess = await this.missionsService.hasActiveAccess(reportId, requestingUserId);

    return this.toResponse(
      row.report,
      row.category,
      row.status,
      photos.map((p) => p.url),
      row.reporter,
      requestingUserId,
      hasActiveVolunteerAccess
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
      .where(and(eq(reports.statusId, openStatusId), sql`${dist} <= ${input.radiusKm}`))
      .groupBy(reportCategories.key);

    const byKey = new Map(rows.map((r) => [r.categoryKey, r]));
    const categories = await this.listCategories();
    return categories.map((c) => ({
      key: c.key,
      activeCount: Number(byKey.get(c.key)?.activeCount ?? 0),
      urgentCount: Number(byKey.get(c.key)?.urgentCount ?? 0),
    }));
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
      .innerJoin(user, eq(reports.reporterId, user.id))
      .where(
        and(
          eq(reports.categoryId, category.id),
          eq(reports.statusId, openStatusId),
          sql`${dist} <= ${input.radiusKm}`
        )
      )
      .orderBy(dist);

    if (rows.length === 0) return [];

    const reportIds = rows.map((r) => r.report.id);
    const photoRows = await db.select().from(reportPhotos).where(inArray(reportPhotos.reportId, reportIds));
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
          await this.missionsService.hasActiveAccess(row.report.id, requestingUserId)
        ),
        distanceKm: Math.round(Number(row.distanceKm) * 10) / 10,
      }))
    );
  }

  async update(reportId: string, requestingUserId: string, input: UpdateReportDto) {
    const existing = await this.requireOwnedOpenReport(reportId, requestingUserId);

    await db
      .update(reports)
      .set({
        ...(input.description !== undefined && { description: input.description }),
        ...(input.landmark !== undefined && { landmark: input.landmark }),
      })
      .where(eq(reports.id, existing.id));

    return this.findOne(reportId, requestingUserId);
  }

  async addPhoto(reportId: string, requestingUserId: string, url: string) {
    await this.requireOwnedOpenReport(reportId, requestingUserId);

    const existingPhotos = await db.select().from(reportPhotos).where(eq(reportPhotos.reportId, reportId));
    if (existingPhotos.length >= 4) throw new BadRequestException('Up to 4 photos allowed');

    await db.insert(reportPhotos).values({ id: uuidv7(), reportId, url, capturedLive: true });

    return this.findOne(reportId, requestingUserId);
  }

  async close(reportId: string, requestingUserId: string) {
    const existing = await this.requireOwnedOpenReport(reportId, requestingUserId);
    const closedStatusId = await this.getStatusIdByKey('closed');

    await db
      .update(reports)
      .set({ statusId: closedStatusId, closedAt: new Date() })
      .where(eq(reports.id, existing.id));

    return this.findOne(reportId, requestingUserId);
  }

  // Shared guard for the three write paths that only the reporter may use,
  // and only while the report is still open (BR-6).
  private async requireOwnedOpenReport(reportId: string, requestingUserId: string): Promise<ReportRow> {
    const [existing] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!existing) throw new NotFoundException('Report not found');
    if (existing.reporterId !== requestingUserId) throw new ForbiddenException('Not your report');

    const [status] = await db.select().from(reportStatuses).where(eq(reportStatuses.id, existing.statusId));
    if (status?.key !== 'open') throw new BadRequestException('Report is no longer open');

    return existing;
  }

  private toResponse(
    report: ReportRow,
    category: CategoryRow,
    status: StatusRow,
    photoUrls: string[],
    reporter: typeof user.$inferSelect,
    requestingUserId: string,
    hasActiveVolunteerAccess: boolean
  ) {
    const isOwner = report.reporterId === requestingUserId;
    return {
      id: report.id,
      category: { key: category.key, label: category.label, emoji: category.emoji },
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
      // always visible to the reporter themselves.
      reporter:
        report.anonymous && !isOwner
          ? null
          : { name: reporter.name, avatarUrl: reporter.avatarUrl },
      // BR-4: reporter always sees it; an active volunteer sees it only if
      // the reporter opted in — never from phoneVisible alone.
      reporterPhone: isOwner || (hasActiveVolunteerAccess && report.phoneVisible) ? reporter.phoneNumber : null,
    };
  }
}
