// Cross-service integration coverage for account deletion's community-
// preservation policy (see UsersService.deleteAccount()'s own comment block
// for the full Rule 1-5 breakdown). Lives outside users.service.spec.ts
// because it genuinely spans Users/Reports/Missions/Comments — same
// real-Postgres, direct-instantiation pattern as the rest of this repo's
// specs (see missions.service.spec.ts), not mocked.
import 'dotenv/config';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reports } from '../db/schema/reports-schema';
import { missionCompletions, missionVolunteers, missions } from '../db/schema/missions-schema';
import { UsersService } from './users.service';
import { ReportsService } from '../reports/reports.service';
import { MissionsService } from '../missions/missions.service';
import { AlertsService } from '../alerts/alerts.service';
import { CommentsService } from '../comments/comments.service';
import { UPLOADS_DIR } from '../uploads/multer.config';
import type { CreateReportDto } from '../reports/dto/create-report.dto';

describe('Account deletion — community mission preservation', () => {
  const usersService = new UsersService();
  const missionsService = new MissionsService(new AlertsService());
  const reportsService = new ReportsService(missionsService, new AlertsService());
  const commentsService = new CommentsService();

  let medicalCategoryId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const [category] = await db.select().from(reportCategories).where(eq(reportCategories.key, 'medicalHelp'));
    medicalCategoryId = category.id;
  });

  afterAll(async () => {
    // Whatever's left of each test's fixtures — deleteAccount() itself
    // already removed the users under test, this just mops up the rest
    // (reports belonging to any user that survived a test, or a
    // never-deleted counterpart in a given scenario).
    for (const id of createdUserIds) {
      await db.delete(reports).where(eq(reports.reporterId, id));
      await db.delete(user).where(eq(user.id, id));
    }
  });

  async function makeUser(name: string): Promise<string> {
    const id = uuidv7();
    await db.insert(user).values({ id, name, email: `${id}@test.local`, phoneNumber: `+91-${id}` });
    createdUserIds.push(id);
    return id;
  }

  function baseInput(overrides: Partial<CreateReportDto> = {}): CreateReportDto {
    return {
      categoryKey: 'medicalHelp',
      title: 'Test report',
      description: 'A real description, long enough to pass validation.',
      lat: 13.08,
      lng: 80.27,
      anonymous: false,
      phoneVisible: false,
      neededVolunteers: 1,
      photoUrls: ['http://localhost:3001/uploads/test1.jpg'],
      ...overrides,
    } as CreateReportDto;
  }

  describe('Rule 1 — nobody ever volunteered', () => {
    it('soft-deletes the report via the existing Delete Report mechanism, not a hard delete', async () => {
      const reporterId = await makeUser('Unclaimed Reporter');
      const created = await reportsService.create(reporterId, baseInput());

      await usersService.deleteAccount(reporterId);

      const [row] = await db.select().from(reports).where(eq(reports.id, created.id));
      expect(row).toBeDefined(); // still a real row — soft delete, not gone
      expect(row.deletedAt).not.toBeNull();
      // The account is gone by the time this FK would matter — deletedBy
      // (SET NULL, see reports-schema.ts) must not block the user delete.
      expect(row.deletedBy).toBeNull();
      expect(row.reporterId).toBeNull();

      // The soft-deleted report no longer surfaces through the normal read path.
      await expect(reportsService.findOne(created.id, reporterId)).rejects.toThrow('Report not found');
    });

    it('leaves a report alone if a volunteer ever joined, even after they released', async () => {
      const reporterId = await makeUser('Once-Claimed Reporter');
      const volunteerId = await makeUser('Volunteer Who Left');
      const created = await reportsService.create(reporterId, baseInput());

      await missionsService.accept(created.id, volunteerId);
      await missionsService.leave(created.id, volunteerId);

      await usersService.deleteAccount(reporterId);

      const [row] = await db.select().from(reports).where(eq(reports.id, created.id));
      expect(row.deletedAt).toBeNull(); // NOT soft-deleted — it has volunteer history
      expect(row.reporterId).toBeNull(); // but the identity is gone
    });
  });

  describe('Rules 2-4 + the named end-to-end scenario', () => {
    const fixtureFilename = `delete-account-completion-${uuidv7()}.jpg`;
    const fixturePhotoUrl = `${process.env.BETTER_AUTH_URL}/uploads/${fixtureFilename}`;

    beforeAll(() => {
      writeFileSync(join(UPLOADS_DIR, fixtureFilename), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    });

    afterAll(() => {
      unlinkSync(join(UPLOADS_DIR, fixtureFilename));
    });

    it(
      'reporter creates -> volunteer accepts -> volunteer starts -> reporter deletes account -> ' +
        'volunteer continues -> volunteer completes mission',
      async () => {
        const reporterId = await makeUser('Reporter Mid Mission');
        const volunteerId = await makeUser('Volunteer Mid Mission');

        // Reporter creates.
        const created = await reportsService.create(reporterId, baseInput({ title: 'Need groceries urgently' }));

        // Volunteer accepts.
        const afterAccept = await missionsService.accept(created.id, volunteerId);
        expect(afterAccept.myStatus).toBe('joined');

        // Volunteer starts (confirm -> active).
        const afterConfirm = await missionsService.confirm(created.id, volunteerId);
        expect(afterConfirm.myStatus).toBe('active');

        // Reporter deletes account — mid-mission, volunteer already active.
        await usersService.deleteAccount(reporterId);

        const [reportRow] = await db.select().from(reports).where(eq(reports.id, created.id));
        expect(reportRow.deletedAt).toBeNull(); // real mission activity — never soft-deleted
        expect(reportRow.reporterId).toBeNull();

        // The report is still readable, by the volunteer, with the reporter
        // shown as deleted — never conflated with "posted anonymously".
        const asVolunteer = await reportsService.findOne(created.id, volunteerId);
        expect(asVolunteer.reporter).toBeNull();
        expect(asVolunteer.reporterDeleted).toBe(true);
        expect(asVolunteer.anonymous).toBe(false); // this report was never posted anonymously

        // Volunteer continues: roster still shows them active, unaffected.
        const roster = await missionsService.getRoster(created.id, volunteerId);
        expect(roster.myStatus).toBe('active');
        const myRow = roster.volunteers.find((v) => v.volunteerId === volunteerId);
        expect(myRow?.volunteerDeleted).toBe(false);

        // Volunteer keeps making real progress updates.
        const afterProgress = await missionsService.updateProgress(created.id, volunteerId, 'helping_now');
        expect(afterProgress.myProgressStatus?.key).toBe('helping_now');

        // Volunteer completes the mission — must not throw despite the
        // reporter (who would normally get an alert) being gone.
        const completed = await missionsService.complete(created.id, volunteerId, fixturePhotoUrl, 'Delivered groceries.');
        expect(completed.completion).toEqual({
          photoUrl: fixturePhotoUrl,
          note: 'Delivered groceries.',
          verifiedAt: expect.any(String),
        });

        const [finalReport] = await db.select().from(reports).where(eq(reports.id, created.id));
        expect(finalReport.closedAt).not.toBeNull();

        // The completion record — future Impact Story material — survives
        // with its real completedById (the volunteer, who still has an account).
        const [missionRow] = await db.select().from(missions).where(eq(missions.reportId, created.id));
        const [completionRow] = await db
          .select()
          .from(missionCompletions)
          .where(eq(missionCompletions.missionId, missionRow.id));
        expect(completionRow.completedById).toBe(volunteerId);
      }
    );
  });

  describe('Rule 5 — a volunteer (not the reporter) deletes their account', () => {
    it('anonymizes + genuinely releases their slot so a new volunteer can join, and preserves their chat/comment history', async () => {
      const reporterId = await makeUser('Reporter For Volunteer Deletion');
      const volunteerId = await makeUser('Volunteer Who Deletes');
      const thirdVolunteerId = await makeUser('Third Volunteer');

      const created = await reportsService.create(reporterId, baseInput({ neededVolunteers: 1 }));

      await missionsService.accept(created.id, volunteerId);
      await missionsService.confirm(created.id, volunteerId);

      // Leaves real, preserved history behind before deleting.
      await missionsService.sendMessage(created.id, volunteerId, 'On my way!');
      await commentsService.create(created.id, volunteerId, 'Happy to help with this.');

      await usersService.deleteAccount(volunteerId);

      // The mission_volunteers row survives, anonymized and genuinely released.
      const [mission] = await db.select().from(missions).where(eq(missions.reportId, created.id));
      const [mvRow] = await db.select().from(missionVolunteers).where(eq(missionVolunteers.missionId, mission.id));
      expect(mvRow.volunteerId).toBeNull();
      expect(mvRow.releaseReason).toBe('account_deleted');
      expect(mvRow.releasedAt).not.toBeNull();

      const roster = await missionsService.getRoster(created.id, reporterId);
      expect(roster.volunteers).toHaveLength(1);
      expect(roster.volunteers[0].volunteerDeleted).toBe(true);
      expect(roster.volunteers[0].name).toBe('Deleted User');
      expect(roster.volunteers[0].status).toBe('released');

      // The slot genuinely reopened — a third volunteer can join.
      const afterThirdJoins = await missionsService.accept(created.id, thirdVolunteerId);
      expect(afterThirdJoins.myStatus).toBe('joined');

      // Mission Chat message is preserved, author anonymized.
      const messages = await missionsService.listMessages(created.id, reporterId);
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('On my way!');
      expect(messages[0].senderDeleted).toBe(true);
      expect(messages[0].senderName).toBe('Deleted User');

      // Community comment is preserved, author anonymized.
      const comments = await commentsService.list(created.id);
      expect(comments).toHaveLength(1);
      expect(comments[0].body).toBe('Happy to help with this.');
      expect(comments[0].authorDeleted).toBe(true);
      expect(comments[0].authorName).toBe('Deleted User');
    });
  });

  describe('PII removal', () => {
    it('the user row itself is genuinely gone, not retained-but-hidden', async () => {
      const reporterId = await makeUser('Fully Deleted');
      await usersService.deleteAccount(reporterId);

      const [row] = await db.select().from(user).where(eq(user.id, reporterId));
      expect(row).toBeUndefined();
    });
  });
});
