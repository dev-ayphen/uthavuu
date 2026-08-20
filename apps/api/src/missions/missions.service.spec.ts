import 'dotenv/config';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportStatuses, reports } from '../db/schema/reports-schema';
import { missionVolunteers, missions } from '../db/schema/missions-schema';
import { MissionsService } from './missions.service';
import { AlertsService } from '../alerts/alerts.service';
import { UPLOADS_DIR } from '../uploads/multer.config';

describe('MissionsService', () => {
  const service = new MissionsService(new AlertsService());
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

  describe('complete()', () => {
    const fixtureFilename = 'test-completion-photo.jpg';
    const fixturePhotoUrl = `${process.env.BETTER_AUTH_URL}/uploads/${fixtureFilename}`;

    beforeAll(() => {
      writeFileSync(join(UPLOADS_DIR, fixtureFilename), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    });

    afterAll(() => {
      unlinkSync(join(UPLOADS_DIR, fixtureFilename));
    });

    it('rejects a volunteer who is only joined, not active', async () => {
      await service.accept(reportId, volunteerAId);
      await expect(service.complete(reportId, volunteerAId, fixturePhotoUrl, 'done')).rejects.toThrow(
        'You must be an active volunteer'
      );
    });

    it('rejects the reporter completing their own report', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await expect(service.complete(reportId, reporterId, fixturePhotoUrl, 'done')).rejects.toThrow(
        'cannot complete your own report'
      );
    });

    it('rejects a photoUrl that was never actually uploaded', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await expect(
        service.complete(
          reportId,
          volunteerAId,
          `${process.env.BETTER_AUTH_URL}/uploads/nonexistent-${uuidv7()}.jpg`,
          'done'
        )
      ).rejects.toThrow('must be one uploaded through this app');
    });

    it('completes successfully with a real upload and closes the report', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);

      const roster = await service.complete(reportId, volunteerAId, fixturePhotoUrl, 'Delivered the packets.');
      expect(roster.completion).toEqual({
        photoUrl: fixturePhotoUrl,
        note: 'Delivered the packets.',
        verifiedAt: expect.any(String),
      });

      const [updatedReport] = await db.select().from(reports).where(eq(reports.id, reportId));
      const [status] = await db.select().from(reportStatuses).where(eq(reportStatuses.id, updatedReport.statusId));
      expect(status.key).toBe('completed');
      expect(updatedReport.closedAt).not.toBeNull();
    });

    it('rejects completing an already-completed mission', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await service.complete(reportId, volunteerAId, fixturePhotoUrl, 'first completion');

      await expect(service.complete(reportId, volunteerAId, fixturePhotoUrl, 'again')).rejects.toThrow(
        'already been completed'
      );
    });
  });

  describe('sendMessage() after completion', () => {
    const fixtureFilename = 'test-completion-photo-2.jpg';
    const fixturePhotoUrl = `${process.env.BETTER_AUTH_URL}/uploads/${fixtureFilename}`;

    beforeAll(() => {
      writeFileSync(join(UPLOADS_DIR, fixtureFilename), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    });

    afterAll(() => {
      unlinkSync(join(UPLOADS_DIR, fixtureFilename));
    });

    it('rejects sending once the report is completed, but still allows reading', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await service.sendMessage(reportId, volunteerAId, 'before completion');
      await service.complete(reportId, volunteerAId, fixturePhotoUrl, 'done');

      await expect(service.sendMessage(reportId, volunteerAId, 'after completion')).rejects.toThrow('read-only');

      const messages = await service.listMessages(reportId, volunteerAId);
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('before completion');
    });
  });
});
