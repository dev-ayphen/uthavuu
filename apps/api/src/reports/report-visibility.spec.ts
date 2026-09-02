import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportPhotos,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  missionCompletionStatuses,
  missionCompletions,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { reportComments } from '../db/schema/comments-schema';
import { reportSaves } from '../db/schema/saves-schema';
import { alerts } from '../db/schema/alerts-schema';
import { AlertsService } from '../alerts/alerts.service';
import { MissionsService } from '../missions/missions.service';
import { ReportsService } from './reports.service';
import { CommentsService } from '../comments/comments.service';
import { ImpactStoriesService } from '../impact-stories/impact-stories.service';
import { SavedReportsService } from '../saved-reports/saved-reports.service';
import { FlaggedCommentsService } from '../flagged-comments/flagged-comments.service';

/**
 * docs/architecture/data.md invariant 1: a report is never hard-deleted, and
 * every citizen-facing path must filter `deleted_at`.
 *
 * This is a whole-surface spec rather than one test per service on purpose. The
 * end-to-end audit found `ReportsService` filtering on all seven of its own
 * queries and *no other service filtering on any of theirs* — an invariant that
 * every module has to remember separately is one that fails module by module,
 * silently, and is only ever caught by a probe that walks all of them at once.
 * So each fixed path gets its own assertion here, and a new listing that forgets
 * the filter fails next to its siblings instead of shipping.
 *
 * Every test hides the report the way the admin console does — setting
 * `deleted_at` / `deleted_by` directly, matching
 * `AdminReportModerationService.hide()` — rather than calling the admin service,
 * so this spec stays independent of the admin module's own shape.
 */
describe('A hidden report is invisible to every citizen path', () => {
  const alertsService = new AlertsService();
  const missionsService = new MissionsService(alertsService);
  const reportsService = new ReportsService(missionsService, alertsService);
  const commentsService = new CommentsService();
  const impactStoriesService = new ImpactStoriesService(
    reportsService,
    missionsService,
  );
  const savedReportsService = new SavedReportsService(reportsService);
  const flaggedCommentsService = new FlaggedCommentsService(commentsService);

  let reporterId: string;
  let volunteerId: string;
  let bystanderId: string;
  let adminId: string;

  let categoryId: string;
  let openStatusId: string;
  let completedStatusId: string;
  let activeVolunteerStatusId: string;
  let verifiedCompletionStatusId: string;

  let reportId: string;
  let missionId: string;
  let commentId: string;

  const LANDMARK = 'Opposite the bus depot';
  const LAT = 13.0827;
  const LNG = 80.2707;

  const hideReport = () =>
    db
      .update(reports)
      .set({ deletedAt: new Date(), deletedBy: adminId })
      .where(eq(reports.id, reportId));

  /** Every direct-access path answers 404 REPORT_REMOVED, never a silent 200. */
  const expectRemoved = (p: Promise<unknown>) =>
    expect(p).rejects.toMatchObject({
      status: 404,
      response: { code: 'REPORT_REMOVED' },
    });

  beforeAll(async () => {
    reporterId = uuidv7();
    volunteerId = uuidv7();
    bystanderId = uuidv7();
    adminId = uuidv7();

    await db.insert(user).values(
      [
        { id: reporterId, name: 'Visibility Reporter' },
        { id: volunteerId, name: 'Visibility Volunteer' },
        { id: bystanderId, name: 'Visibility Bystander' },
        { id: adminId, name: 'Visibility Admin' },
      ].map((u) => ({
        ...u,
        email: `${u.id}@test.local`,
        phoneNumber: `+91-${u.id}`,
      })),
    );

    const [category] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.key, 'medicalHelp'));
    const [openStatus] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.key, 'open'));
    const [completedStatus] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.key, 'completed'));
    const [activeStatus] = await db
      .select()
      .from(missionVolunteerStatuses)
      .where(eq(missionVolunteerStatuses.key, 'active'));
    const [verifiedStatus] = await db
      .select()
      .from(missionCompletionStatuses)
      .where(eq(missionCompletionStatuses.key, 'verified'));

    categoryId = category.id;
    openStatusId = openStatus.id;
    completedStatusId = completedStatus.id;
    activeVolunteerStatusId = activeStatus.id;
    verifiedCompletionStatusId = verifiedStatus.id;
  });

  afterAll(async () => {
    // Cascades to missions / mission_volunteers / report_comments /
    // report_saves / alerts / report_photos.
    await db.delete(reports).where(eq(reports.reporterId, reporterId));
    for (const id of [reporterId, volunteerId, bystanderId, adminId]) {
      await db.delete(user).where(eq(user.id, id));
    }
  });

  /**
   * One report that has genuinely been lived in: a confirmed volunteer, a
   * public comment, a flag on that comment, a save, and an alert deep-linking
   * back to it. Anything less and a path could pass by having nothing to leak.
   */
  beforeEach(async () => {
    reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId,
      statusId: openStatusId,
      title: 'Visibility probe request',
      description: 'Body of the report an admin is about to hide.',
      lat: LAT,
      lng: LNG,
      landmark: LANDMARK,
      neededVolunteers: 2,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });
    await db.insert(reportPhotos).values({
      id: uuidv7(),
      reportId,
      url: 'https://example.test/before.jpg',
      capturedLive: true,
    });

    missionId = uuidv7();
    await db.insert(missions).values({ id: missionId, reportId });
    await db.insert(missionVolunteers).values({
      id: uuidv7(),
      missionId,
      volunteerId,
      statusId: activeVolunteerStatusId,
      confirmDeadline: new Date(Date.now() + 60 * 60_000),
      confirmedAt: new Date(),
    });

    commentId = uuidv7();
    await db.insert(reportComments).values({
      id: commentId,
      reportId,
      authorId: bystanderId,
      body: 'On my way with supplies.',
    });
    await commentsService.flag(commentId, reporterId, 'spam');

    await db
      .insert(reportSaves)
      .values({ id: uuidv7(), reportId, userId: bystanderId });
    await db.insert(alerts).values({
      id: uuidv7(),
      userId: reporterId,
      type: 'volunteer_accepted',
      title: 'Someone accepted your request',
      body: 'Visibility Volunteer accepted "Visibility probe request"',
      params: {
        volunteerName: 'Visibility Volunteer',
        reportTitle: 'Visibility probe request',
      },
      reportId,
    });
  });

  // --- Reads ---------------------------------------------------------------

  describe('reads', () => {
    it('GET /reports/:id — 404s with REPORT_REMOVED, not a bare "not found"', async () => {
      await expect(
        reportsService.findOne(reportId, volunteerId),
      ).resolves.toMatchObject({ id: reportId });

      await hideReport();

      await expectRemoved(reportsService.findOne(reportId, volunteerId));
    });

    it('GET /reports/:id/comments — stops serving the thread and its authors', async () => {
      await expect(commentsService.list(reportId)).resolves.toHaveLength(1);

      await hideReport();

      await expectRemoved(commentsService.list(reportId));
    });

    it('GET /reports/:id/volunteers — stops serving the roster', async () => {
      await expect(
        missionsService.getRoster(reportId, bystanderId),
      ).resolves.toMatchObject({
        volunteers: [{ name: 'Visibility Volunteer' }],
      });

      await hideReport();

      await expectRemoved(missionsService.getRoster(reportId, bystanderId));
    });

    it("GET /users/me/missions — the volunteer's My Helps stops leaking title, landmark and coordinates", async () => {
      const before = await missionsService.listMyMissions(volunteerId);
      // Assert the leak is real before asserting it is closed: this card
      // carried the exact fields a hide exists to remove.
      expect(before).toContainEqual(
        expect.objectContaining({
          reportId,
          landmark: LANDMARK,
          lat: LAT,
          lng: LNG,
        }),
      );

      await hideReport();

      const after = await missionsService.listMyMissions(volunteerId);
      expect(after.map((m) => m.reportId)).not.toContain(reportId);
    });

    it('GET /reports/:id/messages — Mission Chat closes for a confirmed volunteer', async () => {
      await db
        .update(reports)
        .set({ statusId: openStatusId })
        .where(eq(reports.id, reportId));
      await expect(
        missionsService.listMessages(reportId, volunteerId),
      ).resolves.toEqual([]);

      await hideReport();

      // REPORT_REMOVED, not "you need to accept this request" — the volunteer
      // did accept, and cannot act on advice to accept again.
      await expectRemoved(missionsService.listMessages(reportId, volunteerId));
    });

    it('hasActiveAccess — the phone-reveal gate closes for the reporter and the volunteer', async () => {
      await expect(
        missionsService.hasActiveAccess(reportId, reporterId),
      ).resolves.toBe(true);
      await expect(
        missionsService.hasActiveAccess(reportId, volunteerId),
      ).resolves.toBe(true);

      await hideReport();

      await expect(
        missionsService.hasActiveAccess(reportId, reporterId),
      ).resolves.toBe(false);
      await expect(
        missionsService.hasActiveAccess(reportId, volunteerId),
      ).resolves.toBe(false);
    });

    it('GET /users/me/alerts — the deep link and the quoted title go with it', async () => {
      const before = await alertsService.list(reporterId);
      expect(before.map((a) => a.reportId)).toContain(reportId);

      await hideReport();

      const after = await alertsService.list(reporterId);
      expect(after.map((a) => a.reportId)).not.toContain(reportId);
    });

    it('GET /users/me/alerts — an alert with no reportId is untouched', async () => {
      await db.insert(alerts).values({
        id: uuidv7(),
        userId: reporterId,
        type: 'broadcast',
        title: 'Platform notice',
        body: 'Unrelated to any report.',
        params: {},
        reportId: null,
      });

      await hideReport();

      const after = await alertsService.list(reporterId);
      expect(after.map((a) => a.type)).toContain('broadcast');
    });

    it('GET /users/me/saved-reports — the saver stops receiving the full report', async () => {
      const before = await savedReportsService.list(bystanderId);
      expect(before.map((r) => r.id)).toContain(reportId);

      await hideReport();

      const after = await savedReportsService.list(bystanderId);
      expect(after.map((r) => r.id)).not.toContain(reportId);
    });

    it('GET /users/me/flagged-comments — the flagger stops receiving title and landmark', async () => {
      const before = await flaggedCommentsService.list(reporterId);
      expect(before).toContainEqual(
        expect.objectContaining({ reportId, reportLandmark: LANDMARK }),
      );

      await hideReport();

      const after = await flaggedCommentsService.list(reporterId);
      expect(after.map((f) => f.reportId)).not.toContain(reportId);
    });

    it("GET /users/me/reports — the reporter's own list drops it (already correct, kept as a regression guard)", async () => {
      await hideReport();

      const after = await reportsService.listMine(reporterId);
      expect(after.map((r) => r.id)).not.toContain(reportId);
    });

    it('GET /users/me/impact-stories — the reporter and the volunteer now agree', async () => {
      // The composed list was the clearest symptom: listMine() filtered and
      // listMyMissions() did not, so one half of one list kept a report the
      // other half had dropped.
      await db
        .update(reports)
        .set({ statusId: completedStatusId })
        .where(eq(reports.id, reportId));
      await db.insert(missionCompletions).values({
        id: uuidv7(),
        missionId,
        completedById: volunteerId,
        photoUrl: 'https://example.test/after.jpg',
        note: 'Delivered.',
        statusId: verifiedCompletionStatusId,
        submittedAt: new Date(),
        verifiedAt: new Date(),
      });

      await expect(
        impactStoriesService.list(reporterId),
      ).resolves.toContainEqual(expect.objectContaining({ reportId }));
      await expect(
        impactStoriesService.list(volunteerId),
      ).resolves.toContainEqual(expect.objectContaining({ reportId }));

      await hideReport();

      const reporterStories = await impactStoriesService.list(reporterId);
      const volunteerStories = await impactStoriesService.list(volunteerId);
      expect(reporterStories.map((s) => s.reportId)).not.toContain(reportId);
      expect(volunteerStories.map((s) => s.reportId)).not.toContain(reportId);
    });
  });

  // --- Writes --------------------------------------------------------------

  describe('writes', () => {
    it('POST /reports/:id/comments — a new public comment is refused, and no row lands', async () => {
      await hideReport();

      await expectRemoved(
        commentsService.create(reportId, bystanderId, 'Posted after the hide'),
      );

      // The proof that matters: the audit found the refused-looking call had
      // actually written a row.
      const rows = await db
        .select()
        .from(reportComments)
        .where(eq(reportComments.reportId, reportId));
      expect(rows.map((c) => c.body)).not.toContain('Posted after the hide');
    });

    it('POST /reports/:id/comments/:cid/flag — flagging is refused', async () => {
      await hideReport();

      await expectRemoved(commentsService.flag(commentId, volunteerId, 'spam'));
    });

    it('POST /reports/:id/volunteers — a new volunteer cannot accept a hidden but still-open report', async () => {
      await hideReport();

      // The pre-existing status check would not have caught this: hiding does
      // not close a report, so an abusive open report stayed acceptable — and
      // accepting is what unlocks the reporter's phone number.
      await expectRemoved(missionsService.accept(reportId, bystanderId));
    });

    it('PATCH /reports/:id/volunteers/me — confirming is refused', async () => {
      await hideReport();

      await expectRemoved(missionsService.confirm(reportId, volunteerId));
    });

    it('DELETE /reports/:id/volunteers/me — leaving is refused', async () => {
      await hideReport();

      await expectRemoved(missionsService.leave(reportId, volunteerId));
    });

    it('PATCH /reports/:id/volunteers/me/progress — progress updates are refused', async () => {
      await hideReport();

      await expectRemoved(
        missionsService.updateProgress(reportId, volunteerId, 'on_the_way'),
      );
    });

    it('POST /reports/:id/complete — no Impact Story can be built out of a removed report', async () => {
      await hideReport();

      await expectRemoved(
        missionsService.complete(
          reportId,
          volunteerId,
          'https://example.test/after.jpg',
          'done',
        ),
      );
      const completions = await db
        .select()
        .from(missionCompletions)
        .where(eq(missionCompletions.missionId, missionId));
      expect(completions).toHaveLength(0);
    });

    it('POST /reports/:id/messages — Mission Chat writes are refused', async () => {
      await hideReport();

      await expectRemoved(
        missionsService.sendMessage(reportId, volunteerId, 'still there?'),
      );
    });

    it('POST /reports/:id/save — saving is refused and no report_saves row lands', async () => {
      await db
        .update(reports)
        .set({ statusId: completedStatusId })
        .where(eq(reports.id, reportId));
      await hideReport();

      await expectRemoved(reportsService.save(reportId, volunteerId));

      // save() used to insert first and 404 afterwards, on the way out of
      // findOne() — a write that half-succeeded against a moderated report.
      const saves = await db
        .select()
        .from(reportSaves)
        .where(eq(reportSaves.userId, volunteerId));
      expect(saves).toHaveLength(0);
    });
  });

  // --- The admin exception -------------------------------------------------

  it('leaves the row itself intact, so the admin reinstate path still has something to reinstate', async () => {
    await hideReport();

    // Everything above is a read/write filter, never a delete. AdminReportsService
    // reaches these rows deliberately via ?includeDeleted=true, and reinstating
    // restores the report to every path this spec just checked.
    const [row] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId));
    expect(row).toBeDefined();
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedBy).toBe(adminId);

    await db
      .update(reports)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(reports.id, reportId));

    await expect(
      reportsService.findOne(reportId, volunteerId),
    ).resolves.toMatchObject({ id: reportId });
    await expect(commentsService.list(reportId)).resolves.toHaveLength(1);
    expect(
      (await missionsService.listMyMissions(volunteerId)).map(
        (m) => m.reportId,
      ),
    ).toContain(reportId);
    expect(
      (await alertsService.list(reporterId)).map((a) => a.reportId),
    ).toContain(reportId);
    expect(
      (await savedReportsService.list(bystanderId)).map((r) => r.id),
    ).toContain(reportId);
    expect(
      (await flaggedCommentsService.list(reporterId)).map((f) => f.reportId),
    ).toContain(reportId);
  });
});
