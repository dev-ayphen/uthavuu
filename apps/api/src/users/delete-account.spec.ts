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
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { UsersService } from './users.service';
import { ReportsService } from '../reports/reports.service';
import { MissionsService } from '../missions/missions.service';
import { AlertsService } from '../alerts/alerts.service';
import { CommentsService } from '../comments/comments.service';
import { UPLOADS_DIR } from '../uploads/multer.config';
import {
  createPhotoUploadFixture,
  deletePhotoUploadFixtures,
} from '../uploads/testing/photo-upload-fixture';
import type { CreateReportDto } from '../reports/dto/create-report.dto';

describe('Account deletion — community mission preservation', () => {
  const usersService = new UsersService();
  const missionsService = new MissionsService(new AlertsService());
  const reportsService = new ReportsService(
    missionsService,
    new AlertsService(),
  );
  const commentsService = new CommentsService();

  const createdUserIds: string[] = [];
  // Tracked by ID, NOT by reporter. `reports.reporter_id` is ON DELETE SET
  // NULL, and deleting the reporter is the whole subject of this suite — so by
  // the time afterAll runs, every report it made has a null reporter and a
  // `where(eq(reports.reporterId, id))` cleanup matches nothing. That is how
  // this file quietly leaked a report per test into the dev database on every
  // run: 432 rows titled "Test report" and 216 titled "Need groceries
  // urgently" had accumulated there, and the admin console's Live activity fed
  // on them as "Deleted account raised a help request".
  const createdReportIds: string[] = [];
  // A real file, because create() now refuses a photo URL no upload produced
  // (docs/_audit/issues.md issue 27). Named per-suite: UPLOADS_DIR is shared by
  // every Jest worker.
  const mintedFiles: string[] = [];
  // Falls back to BETTER_AUTH_URL rather than depending on a faked Host header.
  const req = { get: () => undefined } as unknown as import('express').Request;

  beforeAll(() => {});

  afterAll(async () => {
    await deletePhotoUploadFixtures(mintedFiles);
    // Whatever's left of each test's fixtures. deleteAccount() already removed
    // the users under test; this mops up the rest — the reports it deliberately
    // leaves behind (soft-deleted, reporter nulled) and any counterpart user a
    // given scenario never deleted.
    //
    // Reports first: missions, mission_volunteers, mission_completions and
    // photo_uploads all hang off reports.id with ON DELETE CASCADE, so this one
    // delete takes the whole graph with it.
    if (createdReportIds.length > 0) {
      await db.delete(reports).where(inArray(reports.id, createdReportIds));
    }
    for (const id of createdUserIds) {
      await db.delete(user).where(eq(user.id, id));
    }
  });

  async function makeUser(name: string): Promise<string> {
    const id = uuidv7();
    await db.insert(user).values({
      id,
      name,
      email: `${id}@test.local`,
      phoneNumber: `+91-${id}`,
    });
    createdUserIds.push(id);
    return id;
  }

  /**
   * A report payload with a freshly-minted, verified photo for THIS reporter.
   *
   * Async and per-reporter because an upload id belongs to one uploader and may
   * be attached to one report — the two rules that stop a verified photo being
   * borrowed or reused. Every test here makes its own user, so a shared fixture
   * would fail the ownership check rather than the thing under test.
   */
  async function baseInput(
    reporterId: string,
    overrides: Partial<CreateReportDto> = {},
  ): Promise<CreateReportDto> {
    const filename = `delete-account-${uuidv7()}.jpg`;
    mintedFiles.push(filename);
    const uploadId = await createPhotoUploadFixture({
      uploaderId: reporterId,
      filename,
      decision: 'pass',
    });

    return {
      categoryKey: 'medicalHelp',
      title: 'Test report',
      description: 'A real description, long enough to pass validation.',
      lat: 13.08,
      lng: 80.27,
      anonymous: false,
      phoneVisible: false,
      neededVolunteers: 1,
      photoUploadIds: [uploadId],
      ...overrides,
    };
  }

  /**
   * Create a report AND record it for teardown.
   *
   * The recording is why this wrapper exists rather than calling
   * `reportsService.create` directly at each site: the id is the only handle on
   * the row that survives `deleteAccount()`, so a test that forgets to capture
   * it leaks that row forever. Route every creation in this file through here.
   */
  async function createReport(
    reporterId: string,
    overrides: Partial<CreateReportDto> = {},
  ) {
    const created = await reportsService.create(
      reporterId,
      await baseInput(reporterId, overrides),
      req,
    );
    createdReportIds.push(created.id);
    return created;
  }

  describe('Rule 1 — nobody ever volunteered', () => {
    it('soft-deletes the report via the existing Delete Report mechanism, not a hard delete', async () => {
      const reporterId = await makeUser('Unclaimed Reporter');
      const created = await createReport(reporterId);

      await usersService.deleteAccount(reporterId);

      const [row] = await db
        .select()
        .from(reports)
        .where(eq(reports.id, created.id));
      expect(row).toBeDefined(); // still a real row — soft delete, not gone
      expect(row.deletedAt).not.toBeNull();
      // The account is gone by the time this FK would matter — deletedBy
      // (SET NULL, see reports-schema.ts) must not block the user delete.
      expect(row.deletedBy).toBeNull();
      expect(row.reporterId).toBeNull();

      // The soft-deleted report no longer surfaces through the normal read
      // path — and says so honestly rather than as a bare "not found", which
      // is indistinguishable from a broken link. Same REPORT_REMOVED state an
      // admin hide produces: deleted_at is deleted_at, whoever set it.
      await expect(
        reportsService.findOne(created.id, reporterId),
      ).rejects.toMatchObject({
        response: { code: 'REPORT_REMOVED' },
      });
    });

    it('leaves a report alone if a volunteer ever joined, even after they released', async () => {
      const reporterId = await makeUser('Once-Claimed Reporter');
      const volunteerId = await makeUser('Volunteer Who Left');
      const created = await createReport(reporterId);

      await missionsService.accept(created.id, volunteerId);
      await missionsService.leave(created.id, volunteerId);

      await usersService.deleteAccount(reporterId);

      const [row] = await db
        .select()
        .from(reports)
        .where(eq(reports.id, created.id));
      expect(row.deletedAt).toBeNull(); // NOT soft-deleted — it has volunteer history
      expect(row.reporterId).toBeNull(); // but the identity is gone
    });
  });

  describe('Rules 2-4 + the named end-to-end scenario', () => {
    const fixtureFilename = `delete-account-completion-${uuidv7()}.jpg`;
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

    it(
      'reporter creates -> volunteer accepts -> volunteer starts -> reporter deletes account -> ' +
        'volunteer continues -> volunteer completes mission',
      async () => {
        const reporterId = await makeUser('Reporter Mid Mission');
        const volunteerId = await makeUser('Volunteer Mid Mission');

        // Reporter creates.
        const created = await createReport(reporterId, {
          title: 'Need groceries urgently',
        });

        // Volunteer accepts.
        const afterAccept = await missionsService.accept(
          created.id,
          volunteerId,
        );
        expect(afterAccept.myStatus).toBe('joined');

        // Volunteer starts (confirm -> active).
        const afterConfirm = await missionsService.confirm(
          created.id,
          volunteerId,
        );
        expect(afterConfirm.myStatus).toBe('active');

        // Reporter deletes account — mid-mission, volunteer already active.
        await usersService.deleteAccount(reporterId);

        const [reportRow] = await db
          .select()
          .from(reports)
          .where(eq(reports.id, created.id));
        expect(reportRow.deletedAt).toBeNull(); // real mission activity — never soft-deleted
        expect(reportRow.reporterId).toBeNull();

        // The report is still readable, by the volunteer, with the reporter
        // shown as deleted — never conflated with "posted anonymously".
        const asVolunteer = await reportsService.findOne(
          created.id,
          volunteerId,
        );
        expect(asVolunteer.reporter).toBeNull();
        expect(asVolunteer.reporterDeleted).toBe(true);
        expect(asVolunteer.anonymous).toBe(false); // this report was never posted anonymously

        // Volunteer continues: roster still shows them active, unaffected.
        const roster = await missionsService.getRoster(created.id, volunteerId);
        expect(roster.myStatus).toBe('active');
        const myRow = roster.volunteers.find(
          (v) => v.volunteerId === volunteerId,
        );
        expect(myRow?.volunteerDeleted).toBe(false);

        // Volunteer keeps making real progress updates.
        const afterProgress = await missionsService.updateProgress(
          created.id,
          volunteerId,
          'helping_now',
        );
        expect(afterProgress.myProgressStatus?.key).toBe('helping_now');

        // Volunteer completes the mission — must not throw despite the
        // reporter (who would normally get an alert) being gone.
        const completed = await missionsService.complete(
          created.id,
          volunteerId,
          fixturePhotoUrl,
          'Delivered groceries.',
        );
        expect(completed.completion).toEqual({
          photoUrl: fixturePhotoUrl,
          note: 'Delivered groceries.',
          verifiedAt: expect.any(String) as string,
        });

        const [finalReport] = await db
          .select()
          .from(reports)
          .where(eq(reports.id, created.id));
        expect(finalReport.closedAt).not.toBeNull();

        // The completion record — future Impact Story material — survives
        // with its real completedById (the volunteer, who still has an account).
        const [missionRow] = await db
          .select()
          .from(missions)
          .where(eq(missions.reportId, created.id));
        const [completionRow] = await db
          .select()
          .from(missionCompletions)
          .where(eq(missionCompletions.missionId, missionRow.id));
        expect(completionRow.completedById).toBe(volunteerId);
      },
    );
  });

  describe('Rule 5 — a volunteer (not the reporter) deletes their account', () => {
    it('anonymizes + genuinely releases their slot so a new volunteer can join, and preserves their chat/comment history', async () => {
      const reporterId = await makeUser('Reporter For Volunteer Deletion');
      const volunteerId = await makeUser('Volunteer Who Deletes');
      const thirdVolunteerId = await makeUser('Third Volunteer');

      const created = await createReport(reporterId, { neededVolunteers: 1 });

      await missionsService.accept(created.id, volunteerId);
      await missionsService.confirm(created.id, volunteerId);

      // Leaves real, preserved history behind before deleting.
      await missionsService.sendMessage(created.id, volunteerId, 'On my way!');
      await commentsService.create(
        created.id,
        volunteerId,
        'Happy to help with this.',
      );

      await usersService.deleteAccount(volunteerId);

      // The mission_volunteers row survives, anonymized and genuinely released.
      const [mission] = await db
        .select()
        .from(missions)
        .where(eq(missions.reportId, created.id));
      const [mvRow] = await db
        .select()
        .from(missionVolunteers)
        .where(eq(missionVolunteers.missionId, mission.id));
      expect(mvRow.volunteerId).toBeNull();
      expect(mvRow.releaseReason).toBe('account_deleted');
      expect(mvRow.releasedAt).not.toBeNull();

      const roster = await missionsService.getRoster(created.id, reporterId);
      expect(roster.volunteers).toHaveLength(1);
      expect(roster.volunteers[0].volunteerDeleted).toBe(true);
      expect(roster.volunteers[0].name).toBe('Deleted User');
      expect(roster.volunteers[0].status).toBe('released');

      // The slot genuinely reopened — a third volunteer can join.
      const afterThirdJoins = await missionsService.accept(
        created.id,
        thirdVolunteerId,
      );
      expect(afterThirdJoins.myStatus).toBe('joined');

      // Mission Chat message is preserved, author anonymized.
      const messages = await missionsService.listMessages(
        created.id,
        reporterId,
      );
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
