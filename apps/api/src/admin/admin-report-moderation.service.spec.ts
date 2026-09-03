import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_moderation_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportStatuses, reports } from '../db/schema/reports-schema';
import { alerts } from '../db/schema/alerts-schema';
import { adminAuditLogs } from '../db/schema/audit-schema';
import { missionVolunteers, missions } from '../db/schema/missions-schema';
import { AlertsService } from '../alerts/alerts.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminReportModerationService } from './admin-report-moderation.service';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_moderation_test';
const HOUR = 60 * 60 * 1000;

describe('AdminReportModerationService', () => {
  const auditService = new AdminAuditService();
  const reportsService = new AdminReportsService();
  const alertsService = new AlertsService();
  const service = new AdminReportModerationService(
    auditService,
    reportsService,
    alertsService,
  );

  let lookups: Awaited<ReturnType<typeof seedLookups>>;
  const reporterId = uuidv7();
  const volunteerId = uuidv7();
  const joinedOnlyId = uuidv7();
  const adminUserId = uuidv7();
  const admin = fakeAdmin({
    userId: adminUserId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  let reportId: string;

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);
    await db.insert(user).values([
      { id: reporterId, name: 'Hari S', email: 'hari@test.local' },
      { id: volunteerId, name: 'Priya K', email: 'priya@test.local' },
      {
        id: joinedOnlyId,
        name: 'Unconfirmed',
        email: 'unconfirmed@test.local',
      },
      { id: adminUserId, name: 'Super Admin', email: 'admin@uthavu.org' },
    ]);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(async () => {
    await db.delete(alerts);
    await db.delete(adminAuditLogs);
    await db.delete(reports);

    reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId: lookups.categoryIds.medicalHelp,
      statusId: lookups.reportStatusIds.open,
      title: 'Blood needed at Apollo',
      description: 'O negative urgently required.',
      lat: 13.08,
      lng: 80.27,
      expiryAt: new Date(Date.now() + HOUR),
    });
  });

  async function addVolunteers() {
    const missionId = uuidv7();
    await db.insert(missions).values({ id: missionId, reportId });
    await db.insert(missionVolunteers).values([
      {
        id: uuidv7(),
        missionId,
        volunteerId,
        statusId: lookups.volunteerStatusIds.active,
        confirmDeadline: new Date(Date.now() + 15 * 60 * 1000),
        confirmedAt: new Date(),
      },
      {
        // Still inside the confirmation window — nobody is on their way yet.
        id: uuidv7(),
        missionId,
        volunteerId: joinedOnlyId,
        statusId: lookups.volunteerStatusIds.joined,
        confirmDeadline: new Date(Date.now() + 15 * 60 * 1000),
      },
    ]);
  }

  const storedStatus = async () => {
    const [row] = await db
      .select({
        key: reportStatuses.key,
        deletedAt: reports.deletedAt,
        deletedBy: reports.deletedBy,
      })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .where(eq(reports.id, reportId));
    return row;
  };

  describe('close', () => {
    it('closes the report and returns the derived detail', async () => {
      const result = await service.close(admin, reportId, {
        reason: 'Duplicate of #98',
      });
      expect(result.status).toBe('closed');
      expect((await storedStatus()).key).toBe('closed');
      expect(result.closedAt).not.toBeNull();
    });

    it('alerts the CONFIRMED volunteers only, reusing the existing type', async () => {
      await addVolunteers();
      await service.close(admin, reportId, { reason: 'Resolved offline' });

      const rows = await db.select().from(alerts);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: volunteerId,
        type: 'report_cancelled',
        reportId,
      });
      // Existing template, so it already has an English and a Tamil rendering.
      expect(rows[0].title).toBe('Request Cancelled');
      // The 'joined' volunteer is not en route and is not told.
      expect(rows.some((r) => r.userId === joinedOnlyId)).toBe(false);
    });

    it('writes one audit entry with the reason and the before/after', async () => {
      await service.close(admin, reportId, { reason: 'Duplicate of #98' });
      const { items, pagination } = await auditService.list({
        page: 1,
        limit: 10,
      });

      expect(pagination.total).toBe(1);
      expect(items[0]).toMatchObject({
        action: { key: 'report.close' },
        actor: { userId: adminUserId },
        target: {
          type: { key: 'report' },
          id: reportId,
          label: 'Blood needed at Apollo',
        },
        before: { status: 'open' },
        after: { status: 'closed' },
        reason: 'Duplicate of #98',
      });
    });

    it('409s on a second close and on a completed report', async () => {
      await service.close(admin, reportId, { reason: 'once' });
      await expect(
        service.close(admin, reportId, { reason: 'twice' }),
      ).rejects.toMatchObject({ response: { code: 'REPORT_ALREADY_CLOSED' } });

      await db
        .update(reports)
        .set({ statusId: lookups.reportStatusIds.completed })
        .where(eq(reports.id, reportId));
      await expect(
        service.close(admin, reportId, { reason: 'nope' }),
      ).rejects.toMatchObject({
        response: { code: 'REPORT_ALREADY_COMPLETED' },
      });
    });
  });

  describe('hide and reinstate', () => {
    it('hides a report even when volunteers have already joined', async () => {
      // The citizen delete path refuses this outright. An admin removing
      // harmful content must not be blocked by that rule.
      await addVolunteers();
      const result = await service.hide(admin, reportId, {
        reason: 'Fraudulent request',
      });

      expect(result.status).toBe('deleted');
      const row = await storedStatus();
      expect(row.deletedAt).not.toBeNull();
      // deleted_by now holds an ADMIN, not the reporter — the audit entry is
      // what keeps the two cases distinguishable.
      expect(row.deletedBy).toBe(adminUserId);
    });

    it('snapshots the removed content so the decision stays reviewable', async () => {
      await service.hide(admin, reportId, { reason: 'Fraudulent request' });
      const { items } = await auditService.list({ page: 1, limit: 10 });
      expect(items[0].before).toMatchObject({
        title: 'Blood needed at Apollo',
        description: 'O negative urgently required.',
      });
    });

    it('drops the report out of the default list and back in on reinstate', async () => {
      const query = {
        page: 1,
        limit: 50,
        status: 'all' as const,
        includeDeleted: false,
        sort: 'createdAt' as const,
        order: 'desc' as const,
      };
      expect((await reportsService.list(query)).pagination.total).toBe(1);

      await service.hide(admin, reportId, { reason: 'Fraudulent request' });
      expect((await reportsService.list(query)).pagination.total).toBe(0);
      expect(
        (await reportsService.list({ ...query, includeDeleted: true }))
          .pagination.total,
      ).toBe(1);

      await service.reinstate(admin, reportId, { reason: 'Appeal upheld' });
      expect((await reportsService.list(query)).pagination.total).toBe(1);
      const row = await storedStatus();
      expect(row.deletedAt).toBeNull();
      expect(row.deletedBy).toBeNull();
    });

    it('does not notify anyone on hide — silence is flagged, not shipped in English only', async () => {
      await addVolunteers();
      await service.hide(admin, reportId, { reason: 'Fraudulent request' });
      // Open question 4: new wording would need an English AND a Tamil template.
      expect(await db.select().from(alerts)).toHaveLength(0);
    });

    it('409s on double hide, double reinstate, and status changes while hidden', async () => {
      await service.hide(admin, reportId, { reason: 'once' });
      await expect(
        service.hide(admin, reportId, { reason: 'twice' }),
      ).rejects.toMatchObject({ response: { code: 'REPORT_ALREADY_HIDDEN' } });
      await expect(
        service.close(admin, reportId, { reason: 'nope' }),
      ).rejects.toMatchObject({ response: { code: 'REPORT_HIDDEN' } });

      await service.reinstate(admin, reportId, { reason: 'ok' });
      await expect(
        service.reinstate(admin, reportId, { reason: 'again' }),
      ).rejects.toMatchObject({ response: { code: 'REPORT_NOT_HIDDEN' } });
    });
  });

  describe('reopen', () => {
    it('restores an open report and clears closedAt', async () => {
      await service.close(admin, reportId, { reason: 'mistake' });
      const result = await service.reopen(admin, reportId, {
        reason: 'Closed in error',
      });

      expect(result.status).toBe('open');
      expect(result.closedAt).toBeNull();
    });

    it('reopening a past-expiry report yields expired, and says so', async () => {
      await db
        .update(reports)
        .set({ expiryAt: new Date(Date.now() - HOUR) })
        .where(eq(reports.id, reportId));
      await service.close(admin, reportId, { reason: 'mistake' });

      const result = await service.reopen(admin, reportId, {
        reason: 'Closed in error',
      });
      // The stored status really is 'open'; the derived one is the truth the
      // console must show. Reopening does not resurrect an expired request.
      expect(result.storedStatus).toBe('open');
      expect(result.status).toBe('expired');
      expect(result.expired).toBe(true);
    });

    it('refuses to reopen something that is not closed', async () => {
      await expect(
        service.reopen(admin, reportId, { reason: 'nope' }),
      ).rejects.toMatchObject({ response: { code: 'REPORT_NOT_CLOSED' } });
    });
  });

  it('404s for an unknown report', async () => {
    await expect(
      service.close(admin, uuidv7(), { reason: 'nope' }),
    ).rejects.toMatchObject({ response: { code: 'REPORT_NOT_FOUND' } });
  });

  it('leaves no audit row when the mutation fails', async () => {
    await expect(
      service.close(admin, uuidv7(), { reason: 'nope' }),
    ).rejects.toThrow();
    expect(
      (await auditService.list({ page: 1, limit: 10 })).pagination.total,
    ).toBe(0);
  });
});
