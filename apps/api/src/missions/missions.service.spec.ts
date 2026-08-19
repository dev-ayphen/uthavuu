import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportStatuses, reports } from '../db/schema/reports-schema';
import { missionVolunteers, missions } from '../db/schema/missions-schema';
import { MissionsService } from './missions.service';

describe('MissionsService', () => {
  const service = new MissionsService();
  let reporterId: string;
  let volunteerAId: string;
  let volunteerBId: string;
  let categoryId: string;
  let openStatusId: string;
  let reportId: string;

  beforeAll(async () => {
    reporterId = uuidv7();
    volunteerAId = uuidv7();
    volunteerBId = uuidv7();

    // Phone must be unique per row — uuidv7's leading chars are a shared
    // millisecond timestamp, so ids generated back-to-back collide on any
    // fixed-offset substring. Use the whole id instead of a slice.
    await db.insert(user).values([
      { id: reporterId, name: 'Test Reporter', email: `${reporterId}@test.local`, phoneNumber: `+91-${reporterId}` },
      { id: volunteerAId, name: 'Volunteer A', email: `${volunteerAId}@test.local`, phoneNumber: `+91-${volunteerAId}` },
      { id: volunteerBId, name: 'Volunteer B', email: `${volunteerBId}@test.local`, phoneNumber: `+91-${volunteerBId}` },
    ]);

    const [category] = await db.select().from(reportCategories).where(eq(reportCategories.key, 'medicalHelp'));
    const [openStatus] = await db.select().from(reportStatuses).where(eq(reportStatuses.key, 'open'));
    categoryId = category.id;
    openStatusId = openStatus.id;
  });

  afterAll(async () => {
    // Cascades to missions/mission_volunteers/mission_messages via onDelete: 'cascade'.
    await db.delete(reports).where(eq(reports.reporterId, reporterId));
    await db.delete(user).where(eq(user.id, reporterId));
    await db.delete(user).where(eq(user.id, volunteerAId));
    await db.delete(user).where(eq(user.id, volunteerBId));
  });

  beforeEach(async () => {
    reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId,
      statusId: openStatusId,
      title: 'Test report',
      description: 'Test',
      lat: 13.08,
      lng: 80.27,
      neededVolunteers: 1,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });
  });

  it('rejects a reporter accepting their own report', async () => {
    await expect(service.accept(reportId, reporterId)).rejects.toThrow('You cannot accept your own report');
  });

  it('lets a volunteer accept, then rejects a second acceptance once the cap is reached', async () => {
    const roster = await service.accept(reportId, volunteerAId);
    expect(roster.myStatus).toBe('joined');
    expect(roster.volunteers).toHaveLength(1);

    await expect(service.accept(reportId, volunteerBId)).rejects.toThrow('Volunteer limit reached');
  });

  it('rejects a duplicate accept from the same volunteer', async () => {
    await service.accept(reportId, volunteerAId);
    await expect(service.accept(reportId, volunteerAId)).rejects.toThrow('You already accepted');
  });

  it('confirm moves joined -> active', async () => {
    await service.accept(reportId, volunteerAId);
    const roster = await service.confirm(reportId, volunteerAId);
    expect(roster.myStatus).toBe('active');
  });

  it('leave releases the slot so another volunteer can join', async () => {
    await db.update(reports).set({ neededVolunteers: 1 }).where(eq(reports.id, reportId));
    await service.accept(reportId, volunteerAId);
    await service.leave(reportId, volunteerAId);

    const roster = await service.getRoster(reportId, volunteerBId);
    expect(roster.volunteers[0].status).toBe('released');

    const secondAccept = await service.accept(reportId, volunteerBId);
    expect(secondAccept.myStatus).toBe('joined');
  });

  it('lazily releases a stale joined row once its deadline has passed', async () => {
    await service.accept(reportId, volunteerAId);

    // Force the deadline into the past directly, simulating 15+ minutes elapsed.
    const [mission] = await db.select().from(missions).where(eq(missions.reportId, reportId));
    await db
      .update(missionVolunteers)
      .set({ confirmDeadline: new Date(Date.now() - 60_000) })
      .where(eq(missionVolunteers.missionId, mission.id));

    const roster = await service.getRoster(reportId, volunteerAId);
    expect(roster.myStatus).toBe('released');

    // The slot is free again — a second volunteer can now accept.
    const secondAccept = await service.accept(reportId, volunteerBId);
    expect(secondAccept.myStatus).toBe('joined');
  });

  it('denies chat access to a user who never accepted', async () => {
    await expect(service.listMessages(reportId, volunteerBId)).rejects.toThrow(
      'You need to accept this request'
    );
  });

  it('allows chat for the reporter and an active volunteer, and reflects it after leaving', async () => {
    await service.accept(reportId, volunteerAId);
    await service.confirm(reportId, volunteerAId);

    await service.sendMessage(reportId, volunteerAId, 'On my way');
    const asReporter = await service.listMessages(reportId, reporterId);
    expect(asReporter).toHaveLength(1);
    expect(asReporter[0].body).toBe('On my way');
    expect(asReporter[0].isMine).toBe(false);

    await service.leave(reportId, volunteerAId);
    await expect(service.sendMessage(reportId, volunteerAId, 'still there?')).rejects.toThrow(
      'You need to accept this request'
    );
  });
});
