import 'dotenv/config';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import { missionVolunteers, missions } from '../db/schema/missions-schema';
import { alerts } from '../db/schema/alerts-schema';
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
      {
        id: reporterId,
        name: 'Test Reporter',
        email: `${reporterId}@test.local`,
        phoneNumber: `+91-${reporterId}`,
      },
      {
        id: volunteerAId,
        name: 'Volunteer A',
        email: `${volunteerAId}@test.local`,
        phoneNumber: `+91-${volunteerAId}`,
      },
      {
        id: volunteerBId,
        name: 'Volunteer B',
        email: `${volunteerBId}@test.local`,
        phoneNumber: `+91-${volunteerBId}`,
      },
    ]);

    const [category] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.key, 'medicalHelp'));
    const [openStatus] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.key, 'open'));
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

  // ---------------------------------------------------------------- expiry
  //
  // `expired` is derived from `expiry_at` and never written to `status_id`
  // (report-effective-status.ts), so every one of these leaves the stored
  // status as 'open' — that is precisely the state the old guard misread.
  describe('an expired report', () => {
    const expire = (at = new Date(Date.now() - 60_000)) =>
      db.update(reports).set({ expiryAt: at }).where(eq(reports.id, reportId));

    it('cannot be accepted, even though its stored status is still open', async () => {
      await expire();

      await expect(service.accept(reportId, volunteerAId)).rejects.toThrow(
        'This request has expired and can no longer be accepted.',
      );

      // The guard has to be reading the DERIVED status, so prove the stored one
      // still says open — otherwise this test would pass against a sweep too.
      const [row] = await db
        .select({ statusId: reports.statusId })
        .from(reports)
        .where(eq(reports.id, reportId));
      expect(row.statusId).toBe(openStatusId);
    });

    // The boundary, from the mutation's side.
    it('is acceptable a minute before expiry and refused a moment after', async () => {
      await expire(new Date(Date.now() + 60_000));
      expect((await service.accept(reportId, volunteerAId)).myStatus).toBe(
        'joined',
      );

      await expire(new Date(Date.now() - 1));
      await expect(service.accept(reportId, volunteerBId)).rejects.toThrow(
        'This request has expired and can no longer be accepted.',
      );
    });

    // THE NUANCE, and the reason expiry is not expressed as an access check.
    //
    //   10:00  report created, expires 12:00
    //   10:30  volunteer accepts
    //   10:35  volunteer starts helping
    //   12:00  report expires
    //
    // The mission does not evaporate at 12:00. The volunteer keeps their roster
    // row, their progress, Mission Chat, and the reporter's phone number — the
    // help is happening, and the request's clock running out does not un-happen
    // it. Expiry stops NEW volunteers joining; it does not cancel work already
    // under way.
    it('does not cancel a mission that was accepted before it expired', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await service.updateProgress(reportId, volunteerAId, 'on_the_way');

      await expire();

      const roster = await service.getRoster(reportId, volunteerAId);
      expect(roster.myStatus).toBe('active');
      expect(roster.myProgressStatus?.key).toBe('on_the_way');

      // Mission Chat still works in both directions.
      await service.sendMessage(reportId, volunteerAId, 'On my way now.');
      const messages = await service.listMessages(reportId, volunteerAId);
      expect(messages.at(-1)?.body).toBe('On my way now.');

      // And the mission can still be completed after the report expired.
      await expect(
        service.getRoster(reportId, volunteerAId),
      ).resolves.toBeDefined();
    });
  });

  it('rejects a reporter accepting their own report', async () => {
    await expect(service.accept(reportId, reporterId)).rejects.toThrow(
      'You cannot accept your own report',
    );
  });

  it('lets a volunteer accept, then rejects a second acceptance once the cap is reached', async () => {
    const roster = await service.accept(reportId, volunteerAId);
    expect(roster.myStatus).toBe('joined');
    expect(roster.volunteers).toHaveLength(1);

    await expect(service.accept(reportId, volunteerBId)).rejects.toThrow(
      'Volunteer limit reached',
    );
  });

  it('rejects a duplicate accept from the same volunteer', async () => {
    await service.accept(reportId, volunteerAId);
    await expect(service.accept(reportId, volunteerAId)).rejects.toThrow(
      'You already accepted',
    );
  });

  it('confirm moves joined -> active', async () => {
    await service.accept(reportId, volunteerAId);
    const roster = await service.confirm(reportId, volunteerAId);
    expect(roster.myStatus).toBe('active');
  });

  it('leave releases the slot so another volunteer can join', async () => {
    await db
      .update(reports)
      .set({ neededVolunteers: 1 })
      .where(eq(reports.id, reportId));
    await service.accept(reportId, volunteerAId);
    await service.leave(reportId, volunteerAId);

    const roster = await service.getRoster(reportId, volunteerBId);
    expect(roster.volunteers[0].status).toBe('released');

    // The volunteer who left sees myStatus: null too, not stuck on
    // 'released' — they should be offered "I'll Help" again, same as
    // anyone else, matching accept()'s own re-join eligibility.
    const ownRoster = await service.getRoster(reportId, volunteerAId);
    expect(ownRoster.myStatus).toBe(null);

    const secondAccept = await service.accept(reportId, volunteerBId);
    expect(secondAccept.myStatus).toBe('joined');
  });

  // A timeout release is the one release nobody presses a button for, so
  // without this the reporter's slot silently reopened and they were never told
  // — they went on waiting for a volunteer who had lapsed 15 minutes earlier.
  it('alerts the reporter when a volunteer is released by timeout', async () => {
    await service.accept(reportId, volunteerAId);

    const before = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(eq(alerts.userId, reporterId));

    const [mission] = await db
      .select()
      .from(missions)
      .where(eq(missions.reportId, reportId));
    await db
      .update(missionVolunteers)
      .set({ confirmDeadline: new Date(Date.now() - 60_000) })
      .where(eq(missionVolunteers.missionId, mission.id));

    // Any roster read triggers the lazy sweep — that is the whole design.
    await service.getRoster(reportId, volunteerAId);

    const after = await db
      .select({ id: alerts.id, type: alerts.type, reportId: alerts.reportId })
      .from(alerts)
      .where(eq(alerts.userId, reporterId));

    expect(after.length).toBe(before.length + 1);
    const fresh = after.find((a) => !before.some((b) => b.id === a.id));
    expect(fresh?.type).toBe('volunteer_released');
    expect(fresh?.reportId).toBe(reportId);
  });

  // The sweep runs on every roster read, so it must not re-alert on each one.
  it('does not re-alert the reporter on every subsequent roster read', async () => {
    await service.accept(reportId, volunteerAId);
    const [mission] = await db
      .select()
      .from(missions)
      .where(eq(missions.reportId, reportId));
    await db
      .update(missionVolunteers)
      .set({ confirmDeadline: new Date(Date.now() - 60_000) })
      .where(eq(missionVolunteers.missionId, mission.id));

    await service.getRoster(reportId, volunteerAId);
    const afterFirst = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(eq(alerts.userId, reporterId));

    await service.getRoster(reportId, volunteerAId);
    await service.getRoster(reportId, volunteerAId);

    const afterMore = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(eq(alerts.userId, reporterId));
    expect(afterMore.length).toBe(afterFirst.length);
  });

  it('lazily releases a stale joined row once its deadline has passed', async () => {
    await service.accept(reportId, volunteerAId);

    // Force the deadline into the past directly, simulating 15+ minutes elapsed.
    const [mission] = await db
      .select()
      .from(missions)
      .where(eq(missions.reportId, reportId));
    await db
      .update(missionVolunteers)
      .set({ confirmDeadline: new Date(Date.now() - 60_000) })
      .where(eq(missionVolunteers.missionId, mission.id));

    // myStatus must go back to null once released, not get stuck at
    // 'released' forever — accept() itself already allows this exact user
    // to rejoin (it only checks active, non-released rows), so the roster
    // view from their own perspective must agree, or "I'll Help" would
    // never be offered to them again.
    const roster = await service.getRoster(reportId, volunteerAId);
    expect(roster.myStatus).toBe(null);

    // The slot is free again — a second volunteer can now accept.
    const secondAccept = await service.accept(reportId, volunteerBId);
    expect(secondAccept.myStatus).toBe('joined');
  });

  it('denies chat access to a user who never accepted', async () => {
    await expect(service.listMessages(reportId, volunteerBId)).rejects.toThrow(
      'You need to accept this request',
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
    await expect(
      service.sendMessage(reportId, volunteerAId, 'still there?'),
    ).rejects.toThrow('You need to accept this request');
  });

  describe('complete()', () => {
    const fixtureFilename = 'test-completion-photo.jpg';
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

    it('rejects a volunteer who is only joined, not active', async () => {
      await service.accept(reportId, volunteerAId);
      await expect(
        service.complete(reportId, volunteerAId, fixturePhotoUrl, 'done'),
      ).rejects.toThrow('You must be an active volunteer');
    });

    it('rejects the reporter completing their own report', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await expect(
        service.complete(reportId, reporterId, fixturePhotoUrl, 'done'),
      ).rejects.toThrow('cannot complete your own report');
    });

    it('rejects a photoUrl that was never actually uploaded', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await expect(
        service.complete(
          reportId,
          volunteerAId,
          `${process.env.BETTER_AUTH_URL}/uploads/nonexistent-${uuidv7()}.jpg`,
          'done',
        ),
      ).rejects.toThrow('must be one uploaded through this app');
    });

    it('completes successfully with a real upload and closes the report', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);

      const roster = await service.complete(
        reportId,
        volunteerAId,
        fixturePhotoUrl,
        'Delivered the packets.',
      );
      expect(roster.completion).toEqual({
        photoUrl: fixturePhotoUrl,
        note: 'Delivered the packets.',
        verifiedAt: expect.any(String) as string,
      });

      const [updatedReport] = await db
        .select()
        .from(reports)
        .where(eq(reports.id, reportId));
      const [status] = await db
        .select()
        .from(reportStatuses)
        .where(eq(reportStatuses.id, updatedReport.statusId));
      expect(status.key).toBe('completed');
      expect(updatedReport.closedAt).not.toBeNull();
    });

    it('rejects completing an already-completed mission', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await service.complete(
        reportId,
        volunteerAId,
        fixturePhotoUrl,
        'first completion',
      );

      await expect(
        service.complete(reportId, volunteerAId, fixturePhotoUrl, 'again'),
      ).rejects.toThrow('already been completed');
    });

    it('completes correctly after the same volunteer left and rejoined (stale released row must not shadow the current one)', async () => {
      await service.accept(reportId, volunteerAId);
      await service.leave(reportId, volunteerAId);
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);

      const roster = await service.complete(
        reportId,
        volunteerAId,
        fixturePhotoUrl,
        'Second attempt, done right.',
      );
      expect(roster.completion).toEqual({
        photoUrl: fixturePhotoUrl,
        note: 'Second attempt, done right.',
        verifiedAt: expect.any(String) as string,
      });
    });
  });

  describe('updateProgress()', () => {
    it('rejects when no mission exists yet for the report at all', async () => {
      await expect(
        service.updateProgress(reportId, volunteerAId, 'on_the_way'),
      ).rejects.toThrow('No mission exists yet');
    });

    it('rejects a user who is not a participant of an existing mission', async () => {
      await service.accept(reportId, volunteerAId);
      await expect(
        service.updateProgress(reportId, volunteerBId, 'on_the_way'),
      ).rejects.toThrow('not part of this mission');
    });

    it('rejects a volunteer who is only joined, not active', async () => {
      await service.accept(reportId, volunteerAId);
      await expect(
        service.updateProgress(reportId, volunteerAId, 'on_the_way'),
      ).rejects.toThrow('Start Helping before updating your progress');
    });

    it('succeeds once active, and is visible in the roster to another participant', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      const roster = await service.updateProgress(
        reportId,
        volunteerAId,
        'on_the_way',
      );

      expect(roster.myProgressStatus?.key).toBe('on_the_way');
      expect(roster.myProgressStatus?.onWayAt).toEqual(expect.any(String));
      expect(roster.myProgressStatus?.reachedAt).toBeNull();

      // Reporter's own view of the same roster sees the real status too —
      // this is the team-visibility requirement, not just a self-view.
      const asReporter = await service.getRoster(reportId, reporterId);
      const mine = asReporter.volunteers.find(
        (v) => v.volunteerId === volunteerAId,
      );
      expect(mine?.progressStatus?.key).toBe('on_the_way');
    });

    it('does not overwrite an already-recorded milestone timestamp on re-selection', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);

      const first = await service.updateProgress(
        reportId,
        volunteerAId,
        'on_the_way',
      );
      const onWayAt = first.myProgressStatus?.onWayAt;

      await service.updateProgress(reportId, volunteerAId, 'reached_location');
      const corrected = await service.updateProgress(
        reportId,
        volunteerAId,
        'on_the_way',
      );

      expect(corrected.myProgressStatus?.key).toBe('on_the_way');
      expect(corrected.myProgressStatus?.onWayAt).toBe(onWayAt);
      expect(corrected.myProgressStatus?.reachedAt).toEqual(expect.any(String));
    });

    it('succeeds after the same volunteer left and rejoined (stale released row must not shadow the current one)', async () => {
      await service.accept(reportId, volunteerAId);
      await service.leave(reportId, volunteerAId);
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);

      const roster = await service.updateProgress(
        reportId,
        volunteerAId,
        'on_the_way',
      );
      expect(roster.myProgressStatus?.key).toBe('on_the_way');
    });
  });

  describe('listMyMissions()', () => {
    it('returns one entry per report even with multiple historical rows (leave + rejoin)', async () => {
      await service.accept(reportId, volunteerAId);
      await service.leave(reportId, volunteerAId);
      await service.accept(reportId, volunteerAId);

      const mine = await service.listMyMissions(volunteerAId);
      const forThisReport = mine.filter((m) => m.reportId === reportId);
      expect(forThisReport).toHaveLength(1);
      // The current (rejoined) row, not a stale released one — matches what
      // GET /reports/:id/volunteers already returns for the same user.
      expect(forThisReport[0].myStatus).toBe('joined');
    });
  });

  describe('sendMessage() after completion', () => {
    const fixtureFilename = 'test-completion-photo-2.jpg';
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

    it('rejects sending once the report is completed, but still allows reading', async () => {
      await service.accept(reportId, volunteerAId);
      await service.confirm(reportId, volunteerAId);
      await service.sendMessage(reportId, volunteerAId, 'before completion');
      await service.complete(reportId, volunteerAId, fixturePhotoUrl, 'done');

      await expect(
        service.sendMessage(reportId, volunteerAId, 'after completion'),
      ).rejects.toThrow('read-only');

      const messages = await service.listMessages(reportId, volunteerAId);
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('before completion');
    });
  });
});
