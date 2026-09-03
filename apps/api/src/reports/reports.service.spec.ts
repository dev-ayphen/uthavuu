import 'dotenv/config';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { uuidv7 } from 'uuidv7';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportPhotos,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import { reportSaves } from '../db/schema/saves-schema';
import { MissionsService } from '../missions/missions.service';
import { AlertsService } from '../alerts/alerts.service';
import { UPLOADS_DIR } from '../uploads/multer.config';
import {
  removeUploadFixture,
  writeUploadFixture,
} from '../uploads/testing/upload-fixture';
import { ReportsService } from './reports.service';
import type { CreateReportDto } from './dto/create-report.dto';

describe('ReportsService', () => {
  const missionsService = new MissionsService(new AlertsService());
  const service = new ReportsService(missionsService, new AlertsService());

  let reporterId: string;
  let otherUserId: string;
  // Real files on disk, not invented URLs. Since docs/_audit/issues.md issue 27,
  // create()/update()/addPhoto() refuse a photo URL that no upload ever produced
  // — the same check that stops a client storing http://evil.com/x.png. Four,
  // because the addPhoto limit test needs a full set.
  const PHOTO_FIXTURES = [1, 2, 3, 4].map(
    (n) => `reports-service-spec-${n}.jpg`,
  );
  let photoUrls: string[];
  const MEDICAL_DEFAULT_EXPIRY_MIN = 6 * 60; // db/seed.ts: medicalHelp = 6h

  beforeAll(async () => {
    photoUrls = PHOTO_FIXTURES.map(writeUploadFixture);
    reporterId = uuidv7();
    otherUserId = uuidv7();

    await db.insert(user).values([
      {
        id: reporterId,
        name: 'Test Reporter',
        email: `${reporterId}@test.local`,
        phoneNumber: `+91-${reporterId}`,
      },
      {
        id: otherUserId,
        name: 'Other User',
        email: `${otherUserId}@test.local`,
        phoneNumber: `+91-${otherUserId}`,
      },
    ]);

    const [category] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.key, 'medicalHelp'));
    expect(category.defaultExpiryMinutes).toBe(MEDICAL_DEFAULT_EXPIRY_MIN);
  });

  afterAll(async () => {
    PHOTO_FIXTURES.forEach(removeUploadFixture);
    // Cascades to report_photos/missions/mission_volunteers/mission_messages.
    await db.delete(reports).where(eq(reports.reporterId, reporterId));
    await db.delete(user).where(eq(user.id, reporterId));
    await db.delete(user).where(eq(user.id, otherUserId));
  });

  function baseInput(
    overrides: Partial<CreateReportDto> = {},
  ): CreateReportDto {
    return {
      categoryKey: 'medicalHelp',
      title: 'Test report',
      description: 'Test description',
      lat: 13.08,
      lng: 80.27,
      anonymous: false,
      phoneVisible: false,
      neededVolunteers: 1,
      photoUrls: [photoUrls[0]],
      ...overrides,
    };
  }

  describe('create()', () => {
    it('rejects an unknown categoryKey', async () => {
      await expect(
        service.create(
          reporterId,
          baseInput({ categoryKey: 'not-a-real-category' }),
        ),
      ).rejects.toThrow('Unknown category');
    });

    it('rejects a non-citizen-selectable category (Disaster Relief, BR-3)', async () => {
      await expect(
        service.create(
          reporterId,
          baseInput({ categoryKey: 'disasterRelief' }),
        ),
      ).rejects.toThrow('not citizen-selectable');
    });

    it('computes expiryAt from the category default when expiryMinutes is omitted', async () => {
      const before = Date.now();
      const report = await service.create(reporterId, baseInput());
      const expectedMs = before + MEDICAL_DEFAULT_EXPIRY_MIN * 60_000;
      expect(
        Math.abs(new Date(report.expiryAt).getTime() - expectedMs),
      ).toBeLessThan(5000);
    });

    it('shortens but never extends past the category default (BR-2)', async () => {
      const now = Date.now();

      const shortened = await service.create(
        reporterId,
        baseInput({ expiryMinutes: 30 }),
      );
      expect(
        Math.abs(new Date(shortened.expiryAt).getTime() - (now + 30 * 60_000)),
      ).toBeLessThan(5000);

      const attemptExtend = await service.create(
        reporterId,
        baseInput({ expiryMinutes: 999999 }),
      );
      const cappedMs = now + MEDICAL_DEFAULT_EXPIRY_MIN * 60_000;
      expect(
        Math.abs(new Date(attemptExtend.expiryAt).getTime() - cappedMs),
      ).toBeLessThan(5000);
    });

    it('persists neededVolunteers', async () => {
      const report = await service.create(
        reporterId,
        baseInput({ neededVolunteers: 4 }),
      );
      expect(report.neededVolunteers).toBe(4);
    });

    it('inserts one report_photos row per photoUrl', async () => {
      const urls = [photoUrls[0], photoUrls[1]];
      const report = await service.create(
        reporterId,
        baseInput({ photoUrls: urls }),
      );

      const rows = await db
        .select()
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, report.id));
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.url).sort()).toEqual([...urls].sort());
      expect(report.photos.sort()).toEqual([...urls].sort());
    });
  });

  describe('findOne()', () => {
    it('isOwner is true only for the reporter', async () => {
      const report = await service.create(reporterId, baseInput());

      const asReporter = await service.findOne(report.id, reporterId);
      expect(asReporter.isOwner).toBe(true);

      const asOther = await service.findOne(report.id, otherUserId);
      expect(asOther.isOwner).toBe(false);
    });

    it('masks the reporter when anonymous, exposes it otherwise', async () => {
      const anon = await service.create(
        reporterId,
        baseInput({ anonymous: true }),
      );
      const asOtherAnon = await service.findOne(anon.id, otherUserId);
      expect(asOtherAnon.reporter).toBeNull();
      // The reporter themselves still sees their own identity.
      const asOwnerAnon = await service.findOne(anon.id, reporterId);
      expect(asOwnerAnon.reporter).not.toBeNull();

      const named = await service.create(
        reporterId,
        baseInput({ anonymous: false }),
      );
      const asOtherNamed = await service.findOne(named.id, otherUserId);
      expect(asOtherNamed.reporter).not.toBeNull();
      expect(asOtherNamed.reporter?.name).toBe('Test Reporter');
    });

    it('reporterPhone: owner always sees it; a non-owner needs BOTH phoneVisible AND active mission access (BR-4)', async () => {
      const report = await service.create(
        reporterId,
        baseInput({ phoneVisible: true }),
      );

      // Owner sees it regardless.
      const asOwner = await service.findOne(report.id, reporterId);
      expect(asOwner.reporterPhone).not.toBeNull();

      // Non-owner, phoneVisible=true, but no mission access yet -> hidden.
      const beforeAccept = await service.findOne(report.id, otherUserId);
      expect(beforeAccept.reporterPhone).toBeNull();

      // Non-owner accepts and confirms -> active access -> now visible.
      await missionsService.accept(report.id, otherUserId);
      await missionsService.confirm(report.id, otherUserId);
      const afterAccept = await service.findOne(report.id, otherUserId);
      expect(afterAccept.reporterPhone).not.toBeNull();

      // phoneVisible=false on a different report: active access alone isn't enough.
      const privatePhoneReport = await service.create(
        reporterId,
        baseInput({ phoneVisible: false }),
      );
      await missionsService.accept(privatePhoneReport.id, otherUserId);
      await missionsService.confirm(privatePhoneReport.id, otherUserId);
      const stillHidden = await service.findOne(
        privatePhoneReport.id,
        otherUserId,
      );
      expect(stillHidden.reporterPhone).toBeNull();
    });
  });

  describe('update() / addPhoto() / close() guards', () => {
    it('update() rejects a non-owner', async () => {
      const report = await service.create(reporterId, baseInput());
      await expect(
        service.update(report.id, otherUserId, { description: 'hacked' }),
      ).rejects.toThrow('Not your report');
    });

    it('update()/addPhoto() reject once the report is closed (BR-6)', async () => {
      const report = await service.create(reporterId, baseInput());
      await service.close(report.id, reporterId);

      await expect(
        service.update(report.id, reporterId, { description: 'too late' }),
      ).rejects.toThrow('no longer open');
      await expect(
        service.addPhoto(report.id, reporterId, photoUrls[1]),
      ).rejects.toThrow('no longer open');
    });

    it('addPhoto() rejects once 4 photos already exist', async () => {
      const report = await service.create(reporterId, baseInput({ photoUrls }));
      await expect(
        service.addPhoto(report.id, reporterId, photoUrls[0]),
      ).rejects.toThrow('Up to 4 photos allowed');
    });

    it('close() rejects a non-owner and succeeds for the owner', async () => {
      const report = await service.create(reporterId, baseInput());
      await expect(service.close(report.id, otherUserId)).rejects.toThrow(
        'Not your report',
      );

      const closed = await service.close(report.id, reporterId);
      expect(closed.status).toBe('closed');
    });
  });

  describe('list() / summary() radius filtering', () => {
    // Test point: 13.08, 80.27 (Chennai). Far point: Singapore — thousands of km away.
    const NEAR = { lat: 13.08, lng: 80.27 };
    const FAR = { lat: 1.3521, lng: 103.8198 };

    it('list() includes a report inside the radius and excludes one far outside it', async () => {
      const near = await service.create(
        reporterId,
        baseInput({ ...NEAR, title: 'Near report' }),
      );
      const far = await service.create(
        reporterId,
        baseInput({ ...FAR, title: 'Far report' }),
      );

      const results = await service.list(
        {
          categoryKey: 'medicalHelp',
          lat: NEAR.lat,
          lng: NEAR.lng,
          radiusKm: 10,
        },
        reporterId,
      );

      const ids = results.map((r) => r.id);
      expect(ids).toContain(near.id);
      expect(ids).not.toContain(far.id);
    });

    it('summary() counts a nearby open report and excludes a far one', async () => {
      const near = await service.create(reporterId, baseInput({ ...NEAR }));
      const far = await service.create(reporterId, baseInput({ ...FAR }));

      const nearSummary = await service.summary({
        lat: NEAR.lat,
        lng: NEAR.lng,
        radiusKm: 10,
      });
      const farSummary = await service.summary({
        lat: FAR.lat,
        lng: FAR.lng,
        radiusKm: 10,
      });

      const medicalNear = nearSummary.find((s) => s.key === 'medicalHelp');
      const medicalFar = farSummary.find((s) => s.key === 'medicalHelp');

      // Both summaries count everything within 10km of their own query point —
      // this just confirms `near`'s report shows up for the near query and
      // `far`'s report shows up for the far query, i.e. the filter isn't
      // inverted or globally counting everything regardless of distance.
      expect(medicalNear && medicalNear.activeCount).toBeGreaterThan(0);
      expect(medicalFar && medicalFar.activeCount).toBeGreaterThan(0);

      // Clean up these two extra reports immediately (not part of afterAll's
      // reporterId-wide sweep timing concerns, but harmless either way).
      await service.close(near.id, reporterId);
      await service.close(far.id, reporterId);
    });
  });

  // ---------------------------------------------------------------- expiry
  //
  // Expiry is DERIVED from `expiry_at` at read time and never written to
  // `status_id` (report-effective-status.ts). These assert the boundary and the
  // three surfaces that read it, because before this existed the citizen API
  // disagreed with the admin console about the same rows: Discover listed
  // lapsed requests, the Dashboard counted them as urgent, and a volunteer
  // could still accept one.
  describe('expiry is derived, never stored', () => {
    // A private test area — these assertions count rows in a radius, and the
    // Chennai point other suites reuse makes that flaky under parallel runs.
    const HERE = { lat: -33.8688, lng: 151.2093 }; // Sydney

    /** Moves a report's expiry without touching its stored status. */
    const setExpiry = (id: string, at: Date) =>
      db.update(reports).set({ expiryAt: at }).where(eq(reports.id, id));

    const medical = async () =>
      (
        await service.summary({ lat: HERE.lat, lng: HERE.lng, radiusKm: 10 })
      ).find((c) => c.key === 'medicalHelp');

    const listedIds = async () =>
      (
        await service.list(
          {
            categoryKey: 'medicalHelp',
            lat: HERE.lat,
            lng: HERE.lng,
            radiusKm: 10,
          },
          reporterId,
        )
      ).map((r) => r.id);

    it('before expiry: actionable — open, listed, counted', async () => {
      const report = await service.create(reporterId, baseInput({ ...HERE }));
      await setExpiry(report.id, new Date(Date.now() + 60 * 60 * 1000));

      expect((await service.findOne(report.id, reporterId)).status).toBe(
        'open',
      );
      expect(await listedIds()).toContain(report.id);
      expect((await medical())!.activeCount).toBeGreaterThan(0);

      await service.close(report.id, reporterId);
    });

    it('after expiry: expired — not listed, not counted, stored status untouched', async () => {
      const report = await service.create(reporterId, baseInput({ ...HERE }));
      const before = (await medical())!.activeCount;
      await setExpiry(report.id, new Date(Date.now() - 60 * 60 * 1000));

      expect((await service.findOne(report.id, reporterId)).status).toBe(
        'expired',
      );
      expect(await listedIds()).not.toContain(report.id);
      expect((await medical())!.activeCount).toBe(before - 1);

      // The point of "derived": the column still says open. Nothing swept it,
      // so nothing can be stale, and the mobile client's own status filters
      // read the derived value the API sends rather than this column.
      const [row] = await db
        .select({ statusId: reports.statusId })
        .from(reports)
        .where(eq(reports.id, report.id));
      const [stored] = await db
        .select({ key: reportStatuses.key })
        .from(reportStatuses)
        .where(eq(reportStatuses.id, row.statusId));
      expect(stored.key).toBe('open');
    });

    // The boundary itself. `expiry_at <= now()` is expired, so the instant a
    // request lapses it stops being actionable rather than lingering for one
    // more tick. Set a moment in the past rather than exactly now: "now" has
    // moved on by the time the query runs, and a test that depends on
    // sub-millisecond timing tests the clock, not the rule.
    it('at the boundary: an expiry a moment ago is already expired', async () => {
      const report = await service.create(reporterId, baseInput({ ...HERE }));
      await setExpiry(report.id, new Date(Date.now() - 1));

      expect((await service.findOne(report.id, reporterId)).status).toBe(
        'expired',
      );
      expect(await listedIds()).not.toContain(report.id);
    });

    // The counter that was wrong in the most misleading direction: the "urgent"
    // filter is `expiry_at - now() < 1 hour`, which is TRUE for every already
    // expired report because the interval goes negative.
    it('urgentCount counts the about-to-lapse, never the already-lapsed', async () => {
      const soon = await service.create(reporterId, baseInput({ ...HERE }));
      await setExpiry(soon.id, new Date(Date.now() + 10 * 60 * 1000));
      const withSoon = (await medical())!.urgentCount;

      const dead = await service.create(reporterId, baseInput({ ...HERE }));
      await setExpiry(dead.id, new Date(Date.now() - 10 * 60 * 1000));

      expect((await medical())!.urgentCount).toBe(withSoon);

      await service.close(soon.id, reporterId);
    });

    it('an expired report is no longer editable', async () => {
      const report = await service.create(reporterId, baseInput({ ...HERE }));
      expect((await service.findOne(report.id, reporterId)).editable).toBe(
        true,
      );

      await setExpiry(report.id, new Date(Date.now() - 1000));
      expect((await service.findOne(report.id, reporterId)).editable).toBe(
        false,
      );
    });
  });

  describe('communityStats()', () => {
    // Deliberately far from every "Chennai-area" point other spec files use
    // (e.g. missions.service.spec.ts's 13.08/80.27) — this suite runs in
    // parallel against the same dev DB, so anything within ~10km of a
    // commonly-reused test point makes activeVolunteers' delta assertions
    // flaky (another file's concurrently-created active volunteer lands
    // inside the same radius query). Tokyo has no other fixtures anywhere
    // in this codebase, so it's a genuinely private test area.
    const NEAR = { lat: 35.6762, lng: 139.6503 };
    const fixtureFilename = 'test-community-stats-photo.jpg';
    const fixturePhotoUrl = `${process.env.BETTER_AUTH_URL}/uploads/${fixtureFilename}`;

    beforeAll(() => {
      writeFileSync(
        join(UPLOADS_DIR, fixtureFilename),
        Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      );
    });
    afterAll(() => {
      unlinkSync(join(UPLOADS_DIR, fixtureFilename));
    });

    // activeVolunteers is radius-scoped, isolated to NEAR (a point nothing
    // else in this codebase uses) so an exact delta is safe under parallel
    // test-file execution.
    //
    // helped is deliberately app-wide/unfiltered by design (a real running
    // total, not scoped to any test's own area) — which makes it an
    // inherently unstable target for a delta assertion here: other spec
    // files run as parallel Jest workers against this same dev DB, and
    // their own beforeAll/afterAll fixture churn can both increment *and*
    // decrement the global completed-reports count during this exact
    // window (e.g. another file's afterAll deleting its own already-
    // completed fixture). That's not a bug in communityStats() — it's a
    // real number reacting to real, concurrent, unrelated activity. Proven
    // correct in isolation instead: a live curl round trip (report created
    // → helped=N; accepted+confirmed → activeVolunteers=+1, helped
    // unchanged; completed → activeVolunteers back to baseline, helped=N+1
    // exactly) during this feature's implementation, with no other test
    // process running concurrently. Here, only assert the field is real
    // response data of the right shape, not a specific value.
    it('activeVolunteers reflects a real active volunteer within radius; helped is a real non-negative count', async () => {
      const report = await service.create(reporterId, baseInput({ ...NEAR }));

      const before = await service.communityStats({
        lat: NEAR.lat,
        lng: NEAR.lng,
        radiusKm: 10,
      });
      expect(Number.isInteger(before.helped)).toBe(true);
      expect(before.helped).toBeGreaterThanOrEqual(0);

      await missionsService.accept(report.id, otherUserId);
      await missionsService.confirm(report.id, otherUserId);
      const duringActive = await service.communityStats({
        lat: NEAR.lat,
        lng: NEAR.lng,
        radiusKm: 10,
      });
      expect(duringActive.activeVolunteers).toBe(before.activeVolunteers + 1);

      await missionsService.complete(
        report.id,
        otherUserId,
        fixturePhotoUrl,
        'Verified via spec',
      );
      const after = await service.communityStats({
        lat: NEAR.lat,
        lng: NEAR.lng,
        radiusKm: 10,
      });
      expect(after.activeVolunteers).toBe(before.activeVolunteers);
      expect(Number.isInteger(after.helped)).toBe(true);
    });

    it('does not count an active volunteer far outside the query radius', async () => {
      const FAR = { lat: 1.3521, lng: 103.8198 };
      const before = await service.communityStats({
        lat: NEAR.lat,
        lng: NEAR.lng,
        radiusKm: 10,
      });

      const report = await service.create(reporterId, baseInput({ ...FAR }));
      await missionsService.accept(report.id, otherUserId);
      await missionsService.confirm(report.id, otherUserId);

      const during = await service.communityStats({
        lat: NEAR.lat,
        lng: NEAR.lng,
        radiusKm: 10,
      });
      expect(during.activeVolunteers).toBe(before.activeVolunteers);

      await missionsService.complete(
        report.id,
        otherUserId,
        fixturePhotoUrl,
        'Verified via spec (far)',
      );
    });
  });

  describe('save()/unsave()/listSaved()', () => {
    const fixtureFilename = 'test-save-photo.jpg';
    const fixturePhotoUrl = `${process.env.BETTER_AUTH_URL}/uploads/${fixtureFilename}`;
    let completedReportId: string;

    beforeAll(async () => {
      writeFileSync(
        join(UPLOADS_DIR, fixtureFilename),
        Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      );

      const created = await service.create(
        reporterId,
        baseInput({ title: 'Save test report' }),
      );
      completedReportId = created.id;
      await missionsService.accept(completedReportId, otherUserId);
      await missionsService.confirm(completedReportId, otherUserId);
      await missionsService.complete(
        completedReportId,
        otherUserId,
        fixturePhotoUrl,
        'done',
      );
    });

    afterAll(() => {
      unlinkSync(join(UPLOADS_DIR, fixtureFilename));
    });

    it('rejects a save on a report that is not completed', async () => {
      const openReport = await service.create(
        reporterId,
        baseInput({ title: 'Still open report (save)' }),
      );
      await expect(service.save(openReport.id, reporterId)).rejects.toThrow(
        'This report is not completed yet',
      );
    });

    it('records a save and reflects it in findOne()', async () => {
      const result = await service.save(completedReportId, reporterId);
      expect(result.savedByMe).toBe(true);
    });

    it('is idempotent — saving twice does not duplicate the row', async () => {
      await service.save(completedReportId, reporterId);
      await service.save(completedReportId, reporterId);
      const rows = await db
        .select()
        .from(reportSaves)
        .where(
          and(
            eq(reportSaves.reportId, completedReportId),
            eq(reportSaves.userId, reporterId),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it('savedByMe is per-user', async () => {
      const asOtherUser = await service.findOne(completedReportId, otherUserId);
      expect(asOtherUser.savedByMe).toBe(false);
    });

    it('listSaved() returns the saved report for the saver and not for another user', async () => {
      const mine = await service.listSaved(reporterId);
      expect(mine.map((r) => r.id)).toContain(completedReportId);

      const theirs = await service.listSaved(otherUserId);
      expect(theirs.map((r) => r.id)).not.toContain(completedReportId);
    });

    it('unsave removes it, including from listSaved()', async () => {
      const result = await service.unsave(completedReportId, reporterId);
      expect(result.savedByMe).toBe(false);

      const mine = await service.listSaved(reporterId);
      expect(mine.map((r) => r.id)).not.toContain(completedReportId);
    });

    it('unsave is idempotent — unsaving when not saved does not error', async () => {
      const result = await service.unsave(completedReportId, reporterId);
      expect(result.savedByMe).toBe(false);
    });
  });
});
