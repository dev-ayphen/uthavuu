import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { reportStatuses, reports } from '../db/schema/reports-schema';
import {
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { AlertsService } from '../alerts/alerts.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminReportsService } from './admin-reports.service';
import { effectiveStatusOf } from './report-effective-status';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { ModerateReportDto } from './dto/moderate-report.dto';

/**
 * The four moderation actions an admin can take on a report.
 *
 *   close      -> status 'closed'. The request is over; it stays fully visible
 *                 in the reporter's own list, exactly as a self-cancel does.
 *   reopen     -> back to 'open'. Undo for a close.
 *   hide       -> soft delete. Removes it from every listing, citizen and
 *                 admin, for harmful or fraudulent content.
 *   reinstate  -> undo for a hide.
 *
 * WHY THESE ARE NOT ReportsService.close()/delete(). Both are ownership-gated
 * via requireOwnedOpenReport() — an admin is never the owner, so both 403 for
 * staff by construction. And delete() additionally refuses once any volunteer
 * has joined, which is right for a reporter (don't yank a request out from under
 * someone en route) and wrong for an admin removing harmful content: the whole
 * reason staff need the button is the cases the reporter will not fix.
 *
 * `reports.deleted_by` therefore takes on a second meaning — it used to hold
 * only the reporter. The audit log is what keeps the two distinguishable: a
 * hide always writes a `report.hide` entry naming the admin, a self-delete
 * never does.
 */
@Injectable()
export class AdminReportModerationService {
  constructor(
    private readonly auditService: AdminAuditService,
    private readonly reportsService: AdminReportsService,
    private readonly alertsService: AlertsService,
  ) {}

  async close(
    admin: AdminIdentity,
    reportId: string,
    dto: ModerateReportDto,
    meta?: AdminRequestMeta,
  ) {
    const current = await this.requireReport(reportId);

    if (current.effectiveStatus === 'deleted') {
      throw new ConflictException({
        code: 'REPORT_HIDDEN',
        message: 'Reinstate this report before changing its status.',
      });
    }
    if (current.storedStatusKey === 'closed') {
      throw new ConflictException({
        code: 'REPORT_ALREADY_CLOSED',
        message: 'This report is already closed.',
      });
    }
    if (current.storedStatusKey === 'completed') {
      throw new ConflictException({
        code: 'REPORT_ALREADY_COMPLETED',
        message: 'A completed report cannot be closed.',
      });
    }

    const closedStatusId = await this.statusIdFor('closed');
    const closedAt = new Date();

    // Read BEFORE the transaction: these are the people already on their way,
    // and they are why an admin close cannot be silent.
    const activeVolunteerIds = await this.activeVolunteerIds(reportId);

    await db.transaction(async (tx) => {
      await tx
        .update(reports)
        .set({ statusId: closedStatusId, closedAt, updatedAt: sql`now()` })
        .where(eq(reports.id, reportId));

      await this.auditService.record({
        admin,
        action: 'report.close',
        targetId: reportId,
        targetLabel: current.title,
        before: { status: current.effectiveStatus, closedAt: null },
        after: { status: 'closed', closedAt: closedAt.toISOString() },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    /**
     * Notify the volunteers, reusing the EXISTING `report_cancelled` alert type.
     *
     * Not a new alert type, deliberately. Every alert type needs an English and
     * a Tamil template (alert-templates.ts), and inventing admin-specific
     * wording would mean writing Tamil product copy this task has no mandate for
     * — that is open question 4 in docs/_audit/open-questions.md. `report_cancelled`
     * already says the true thing to the right people: ReportsService.close()
     * sends exactly this alert, to exactly these recipients, for exactly this
     * event. Applying an existing rule is not inventing copy.
     *
     * THE REPORTER IS STILL NOT NOTIFIED. The citizen path does not alert them
     * because they did it themselves; here they did not, and telling them
     * requires new wording in two languages. Left undone and flagged rather
     * than half-done in English only, which would break the i18n contract.
     *
     * Outside the transaction on purpose: a failed alert insert must not roll
     * back a completed moderation action.
     */
    await Promise.all(
      activeVolunteerIds.map((volunteerId) =>
        this.alertsService.create(
          volunteerId,
          'report_cancelled',
          { volunteerName: null, reportTitle: current.title },
          reportId,
        ),
      ),
    );

    return this.reportsService.findOne(reportId);
  }

  async reopen(
    admin: AdminIdentity,
    reportId: string,
    dto: ModerateReportDto,
    meta?: AdminRequestMeta,
  ) {
    const current = await this.requireReport(reportId);

    if (current.effectiveStatus === 'deleted') {
      throw new ConflictException({
        code: 'REPORT_HIDDEN',
        message: 'Reinstate this report before changing its status.',
      });
    }
    if (current.storedStatusKey !== 'closed') {
      throw new ConflictException({
        code: 'REPORT_NOT_CLOSED',
        message: 'Only a closed report can be reopened.',
      });
    }

    const openStatusId = await this.statusIdFor('open');

    await db.transaction(async (tx) => {
      await tx
        .update(reports)
        .set({ statusId: openStatusId, closedAt: null, updatedAt: sql`now()` })
        .where(eq(reports.id, reportId));

      await this.auditService.record({
        admin,
        action: 'report.reopen',
        targetId: reportId,
        targetLabel: current.title,
        before: { status: 'closed' },
        // Honest about the likely outcome: reopening a report whose expiry_at
        // has passed makes it 'expired', not 'open'. The derived status is
        // computed on read, so the response will say so — this records that the
        // action's intent was 'open'.
        after: { status: 'open' },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    return this.reportsService.findOne(reportId);
  }

  /**
   * Soft delete. Unlike the citizen path this is NOT blocked by volunteers
   * having joined — see the class doc comment.
   */
  async hide(
    admin: AdminIdentity,
    reportId: string,
    dto: ModerateReportDto,
    meta?: AdminRequestMeta,
  ) {
    const current = await this.requireReport(reportId);

    if (current.deletedAt !== null) {
      throw new ConflictException({
        code: 'REPORT_ALREADY_HIDDEN',
        message: 'This report is already hidden.',
      });
    }

    const deletedAt = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(reports)
        .set({ deletedAt, deletedBy: admin.userId, updatedAt: sql`now()` })
        .where(eq(reports.id, reportId));

      await this.auditService.record({
        admin,
        action: 'report.hide',
        targetId: reportId,
        targetLabel: current.title,
        // The title and description are snapshotted because hiding is the
        // action most likely to be appealed, and "what did it actually say"
        // is the first question.
        before: {
          status: current.effectiveStatus,
          deletedAt: null,
          title: current.title,
          description: current.description,
        },
        after: { status: 'deleted', deletedAt: deletedAt.toISOString() },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    // No alert. A hidden report vanishes silently for the reporter and for any
    // volunteer — the same silence the citizen delete path has today. Telling
    // them needs new wording in English and Tamil (open question 4). Flagged,
    // not quietly shipped in one language.
    return this.reportsService.findOne(reportId);
  }

  async reinstate(
    admin: AdminIdentity,
    reportId: string,
    dto: ModerateReportDto,
    meta?: AdminRequestMeta,
  ) {
    const current = await this.requireReport(reportId);

    const deletedAt = current.deletedAt;
    if (deletedAt === null) {
      throw new ConflictException({
        code: 'REPORT_NOT_HIDDEN',
        message: 'This report is not hidden.',
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(reports)
        .set({ deletedAt: null, deletedBy: null, updatedAt: sql`now()` })
        .where(eq(reports.id, reportId));

      await this.auditService.record({
        admin,
        action: 'report.reinstate',
        targetId: reportId,
        targetLabel: current.title,
        before: {
          status: 'deleted',
          deletedAt: deletedAt.toISOString(),
        },
        after: { status: current.storedStatusKey },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    return this.reportsService.findOne(reportId);
  }

  private async requireReport(reportId: string) {
    const [row] = await db
      .select({
        id: reports.id,
        title: reports.title,
        description: reports.description,
        expiryAt: reports.expiryAt,
        deletedAt: reports.deletedAt,
        storedStatusKey: reportStatuses.key,
      })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .where(eq(reports.id, reportId));

    if (!row) {
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: 'No report with that id.',
      });
    }

    return { ...row, effectiveStatus: effectiveStatusOf(row) };
  }

  private async statusIdFor(key: string): Promise<string> {
    const [status] = await db
      .select({ id: reportStatuses.id })
      .from(reportStatuses)
      .where(eq(reportStatuses.key, key));
    if (!status) {
      throw new Error(
        `report_statuses row missing for key "${key}" — did db:seed run?`,
      );
    }
    return status.id;
  }

  /**
   * Volunteers who have CONFIRMED. Queried here rather than through
   * MissionsService.listActiveVolunteerIds() to avoid importing MissionsModule
   * into AdminModule for one join — ADR 0009 accepts duplicated queries on the
   * admin surface. The rule this reimplements is not subtle (status = 'active'),
   * unlike UsersService.deleteAccount(), which an admin path must always call
   * rather than copy.
   */
  private async activeVolunteerIds(reportId: string): Promise<string[]> {
    const rows = await db
      .select({ volunteerId: missionVolunteers.volunteerId })
      .from(missionVolunteers)
      .innerJoin(missions, eq(missionVolunteers.missionId, missions.id))
      .innerJoin(
        missionVolunteerStatuses,
        eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
      )
      .where(
        and(
          eq(missions.reportId, reportId),
          eq(missionVolunteerStatuses.key, 'active'),
        ),
      );

    // A released-by-account-deletion volunteer has a null id and nobody to notify.
    return rows
      .map((r) => r.volunteerId)
      .filter((id): id is string => id !== null);
  }
}
