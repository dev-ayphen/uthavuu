import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportPhotos, reportStatuses, reports } from '../db/schema/reports-schema';
import { MissionsService } from '../missions/missions.service';
import { AlertsService } from '../alerts/alerts.service';
import { ReportsService } from '../reports/reports.service';
import { ImpactStoriesService } from './impact-stories.service';

describe('ImpactStoriesService', () => {
  const missionsService = new MissionsService(new AlertsService());
  const reportsService = new ReportsService(missionsService, new AlertsService());
  const service = new ImpactStoriesService(reportsService, missionsService);

  let reporterId: string;
  let volunteerId: string;
  let bystanderId: string;
  let categoryId: string;
  let openStatusId: string;
  let completedStatusId: string;

  beforeAll(async () => {
    reporterId = uuidv7();
    volunteerId = uuidv7();
    bystanderId = uuidv7();

    await db.insert(user).values([
      { id: reporterId, name: 'Reporter', email: `${reporterId}@test.local`, phoneNumber: `+91-${reporterId}` },
      { id: volunteerId, name: 'Volunteer', email: `${volunteerId}@test.local`, phoneNumber: `+91-${volunteerId}` },
      { id: bystanderId, name: 'Bystander', email: `${bystanderId}@test.local`, phoneNumber: `+91-${bystanderId}` },
    ]);

    const [category] = await db.select().from(reportCategories).where(eq(reportCategories.key, 'medicalHelp'));
    const [openStatus] = await db.select().from(reportStatuses).where(eq(reportStatuses.key, 'open'));
    const [completedStatus] = await db.select().from(reportStatuses).where(eq(reportStatuses.key, 'completed'));
    categoryId = category.id;
    openStatusId = openStatus.id;
    completedStatusId = completedStatus.id;
  });

  afterAll(async () => {
    await db.delete(reports).where(eq(reports.reporterId, reporterId));
    await db.delete(user).where(eq(user.id, reporterId));
    await db.delete(user).where(eq(user.id, volunteerId));
    await db.delete(user).where(eq(user.id, bystanderId));
  });

  it('shows a completed report to its reporter, not to an uninvolved user', async () => {
    const reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId,
      statusId: completedStatusId,
      title: 'Completed story',
      description: 'Test',
      lat: 13.08,
      lng: 80.27,
      neededVolunteers: 1,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });
    await db.insert(reportPhotos).values({ id: uuidv7(), reportId, url: 'https://example.test/photo.png', capturedLive: true });

    const mine = await service.list(reporterId);
    expect(mine.map((s) => s.reportId)).toContain(reportId);

    const theirs = await service.list(bystanderId);
    expect(theirs.map((s) => s.reportId)).not.toContain(reportId);
  });

  it('excludes an open (not yet completed) report the user reported', async () => {
    const reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId,
      statusId: openStatusId,
      title: 'Still open',
      description: 'Test',
      lat: 13.08,
      lng: 80.27,
      neededVolunteers: 1,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });

    const mine = await service.list(reporterId);
    expect(mine.map((s) => s.reportId)).not.toContain(reportId);
  });

  it('shows a completed mission to the volunteer who worked it, via listMyMissions', async () => {
    const reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId,
      statusId: openStatusId,
      title: 'Volunteer-side story',
      description: 'Test',
      lat: 13.08,
      lng: 80.27,
      neededVolunteers: 1,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });

    await missionsService.accept(reportId, volunteerId);
    await missionsService.confirm(reportId, volunteerId);
    await db.update(reports).set({ statusId: completedStatusId }).where(eq(reports.id, reportId));

    const volunteerStories = await service.list(volunteerId);
    expect(volunteerStories.map((s) => s.reportId)).toContain(reportId);

    const reporterStories = await service.list(reporterId);
    expect(reporterStories.map((s) => s.reportId)).toContain(reportId); // same report, reporter angle too — but only one entry
    expect(reporterStories.filter((s) => s.reportId === reportId)).toHaveLength(1);
  });
});
