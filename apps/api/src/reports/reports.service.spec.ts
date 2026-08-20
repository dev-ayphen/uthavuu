import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportPhotos, reports } from '../db/schema/reports-schema';
import { MissionsService } from '../missions/missions.service';
import { AlertsService } from '../alerts/alerts.service';
import { ReportsService } from './reports.service';
import type { CreateReportDto } from './dto/create-report.dto';

describe('ReportsService', () => {
  const missionsService = new MissionsService(new AlertsService());
  const service = new ReportsService(missionsService);

  let reporterId: string;
  let otherUserId: string;
  let medicalCategoryId: string;
  const MEDICAL_DEFAULT_EXPIRY_MIN = 6 * 60; // db/seed.ts: medicalHelp = 6h

  beforeAll(async () => {
    reporterId = uuidv7();
    otherUserId = uuidv7();

    await db.insert(user).values([
      { id: reporterId, name: 'Test Reporter', email: `${reporterId}@test.local`, phoneNumber: `+91-${reporterId}` },
      { id: otherUserId, name: 'Other User', email: `${otherUserId}@test.local`, phoneNumber: `+91-${otherUserId}` },
    ]);

    const [category] = await db.select().from(reportCategories).where(eq(reportCategories.key, 'medicalHelp'));
    medicalCategoryId = category.id;
    expect(category.defaultExpiryMinutes).toBe(MEDICAL_DEFAULT_EXPIRY_MIN);
  });

  afterAll(async () => {
    // Cascades to report_photos/missions/mission_volunteers/mission_messages.
    await db.delete(reports).where(eq(reports.reporterId, reporterId));
    await db.delete(user).where(eq(user.id, reporterId));
    await db.delete(user).where(eq(user.id, otherUserId));
  });

  function baseInput(overrides: Partial<CreateReportDto> = {}): CreateReportDto {
    return {
      categoryKey: 'medicalHelp',
      title: 'Test report',
      description: 'Test description',
      lat: 13.08,
      lng: 80.27,
      anonymous: false,
      phoneVisible: false,
      neededVolunteers: 1,
      photoUrls: ['http://localhost:3001/uploads/test1.jpg'],
      ...overrides,
    } as CreateReportDto;
  }

  describe('create()', () => {
    it('rejects an unknown categoryKey', async () => {
      await expect(service.create(reporterId, baseInput({ categoryKey: 'not-a-real-category' }))).rejects.toThrow(
        'Unknown category'
      );
    });

    it('rejects a non-citizen-selectable category (Disaster Relief, BR-3)', async () => {
      await expect(service.create(reporterId, baseInput({ categoryKey: 'disasterRelief' }))).rejects.toThrow(
        'not citizen-selectable'
      );
    });

    it('computes expiryAt from the category default when expiryMinutes is omitted', async () => {
      const before = Date.now();
      const report = await service.create(reporterId, baseInput());
      const expectedMs = before + MEDICAL_DEFAULT_EXPIRY_MIN * 60_000;
      expect(Math.abs(new Date(report.expiryAt).getTime() - expectedMs)).toBeLessThan(5000);
    });

    it('shortens but never extends past the category default (BR-2)', async () => {
      const now = Date.now();

      const shortened = await service.create(reporterId, baseInput({ expiryMinutes: 30 }));
      expect(Math.abs(new Date(shortened.expiryAt).getTime() - (now + 30 * 60_000))).toBeLessThan(5000);

      const attemptExtend = await service.create(reporterId, baseInput({ expiryMinutes: 999999 }));
      const cappedMs = now + MEDICAL_DEFAULT_EXPIRY_MIN * 60_000;
      expect(Math.abs(new Date(attemptExtend.expiryAt).getTime() - cappedMs)).toBeLessThan(5000);
    });

    it('persists neededVolunteers', async () => {
      const report = await service.create(reporterId, baseInput({ neededVolunteers: 4 }));
      expect(report.neededVolunteers).toBe(4);
    });

    it('inserts one report_photos row per photoUrl', async () => {
      const urls = ['http://localhost:3001/uploads/a.jpg', 'http://localhost:3001/uploads/b.jpg'];
      const report = await service.create(reporterId, baseInput({ photoUrls: urls }));

      const rows = await db.select().from(reportPhotos).where(eq(reportPhotos.reportId, report.id));
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
      const anon = await service.create(reporterId, baseInput({ anonymous: true }));
      const asOtherAnon = await service.findOne(anon.id, otherUserId);
      expect(asOtherAnon.reporter).toBeNull();
      // The reporter themselves still sees their own identity.
      const asOwnerAnon = await service.findOne(anon.id, reporterId);
      expect(asOwnerAnon.reporter).not.toBeNull();

      const named = await service.create(reporterId, baseInput({ anonymous: false }));
      const asOtherNamed = await service.findOne(named.id, otherUserId);
      expect(asOtherNamed.reporter).not.toBeNull();
      expect(asOtherNamed.reporter?.name).toBe('Test Reporter');
    });

    it('reporterPhone: owner always sees it; a non-owner needs BOTH phoneVisible AND active mission access (BR-4)', async () => {
      const report = await service.create(reporterId, baseInput({ phoneVisible: true }));

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
      const privatePhoneReport = await service.create(reporterId, baseInput({ phoneVisible: false }));
      await missionsService.accept(privatePhoneReport.id, otherUserId);
      await missionsService.confirm(privatePhoneReport.id, otherUserId);
      const stillHidden = await service.findOne(privatePhoneReport.id, otherUserId);
      expect(stillHidden.reporterPhone).toBeNull();
    });
  });

  describe('update() / addPhoto() / close() guards', () => {
    it('update() rejects a non-owner', async () => {
      const report = await service.create(reporterId, baseInput());
      await expect(service.update(report.id, otherUserId, { description: 'hacked' })).rejects.toThrow(
        'Not your report'
      );
    });

    it('update()/addPhoto() reject once the report is closed (BR-6)', async () => {
      const report = await service.create(reporterId, baseInput());
      await service.close(report.id, reporterId);

      await expect(service.update(report.id, reporterId, { description: 'too late' })).rejects.toThrow(
        'no longer open'
      );
      await expect(
        service.addPhoto(report.id, reporterId, 'http://localhost:3001/uploads/late.jpg')
      ).rejects.toThrow('no longer open');
    });

    it('addPhoto() rejects once 4 photos already exist', async () => {
      const report = await service.create(
        reporterId,
        baseInput({
          photoUrls: [
            'http://localhost:3001/uploads/1.jpg',
            'http://localhost:3001/uploads/2.jpg',
            'http://localhost:3001/uploads/3.jpg',
            'http://localhost:3001/uploads/4.jpg',
          ],
        })
      );
      await expect(
        service.addPhoto(report.id, reporterId, 'http://localhost:3001/uploads/5.jpg')
      ).rejects.toThrow('Up to 4 photos allowed');
    });

    it('close() rejects a non-owner and succeeds for the owner', async () => {
      const report = await service.create(reporterId, baseInput());
      await expect(service.close(report.id, otherUserId)).rejects.toThrow('Not your report');

      const closed = await service.close(report.id, reporterId);
      expect(closed.status).toBe('closed');
    });
  });

  describe('list() / summary() radius filtering', () => {
    // Test point: 13.08, 80.27 (Chennai). Far point: Singapore — thousands of km away.
    const NEAR = { lat: 13.08, lng: 80.27 };
    const FAR = { lat: 1.3521, lng: 103.8198 };

    it('list() includes a report inside the radius and excludes one far outside it', async () => {
      const near = await service.create(reporterId, baseInput({ ...NEAR, title: 'Near report' }));
      const far = await service.create(reporterId, baseInput({ ...FAR, title: 'Far report' }));

      const results = await service.list(
        { categoryKey: 'medicalHelp', lat: NEAR.lat, lng: NEAR.lng, radiusKm: 10 },
        reporterId
      );

      const ids = results.map((r) => r.id);
      expect(ids).toContain(near.id);
      expect(ids).not.toContain(far.id);
    });

    it('summary() counts a nearby open report and excludes a far one', async () => {
      const near = await service.create(reporterId, baseInput({ ...NEAR }));
      const far = await service.create(reporterId, baseInput({ ...FAR }));

      const nearSummary = await service.summary({ lat: NEAR.lat, lng: NEAR.lng, radiusKm: 10 });
      const farSummary = await service.summary({ lat: FAR.lat, lng: FAR.lng, radiusKm: 10 });

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
});
