import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_settings_enforcement_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  PLATFORM_SETTINGS_DEFAULTS,
  platformSettings,
} from '../db/schema/settings-schema';
import { AlertsService } from '../alerts/alerts.service';
import { CommentsService } from '../comments/comments.service';
import { MissionsService } from '../missions/missions.service';
import { ReportsService } from '../reports/reports.service';
import type { CreateReportDto } from '../reports/dto/create-report.dto';
import {
  createSpecDatabase,
  seedLookups,
} from '../admin/testing/admin-spec-db';

const DATABASE = 'uthavu_settings_enforcement_test';

/**
 * The point of the whole feature: every key on Platform -> App Settings changes
 * behaviour somewhere.
 *
 * docs/webadmin/07-platform-settings.md §2A is a post-mortem of a settings
 * screen with 35 keys and "every one disconnected". This suite is the standing
 * proof that this one is not that: it sets each key to a non-default value and
 * asserts the request that key is supposed to constrain is actually refused.
 *
 * It also pins the no-cache property. Every case below changes a setting and
 * then immediately makes the request it affects — if a cache were ever added
 * without invalidation, these fail rather than a kill switch silently lagging
 * in production.
 */
describe('Platform settings enforcement', () => {
  const alertsService = new AlertsService();
  const reportsService = new ReportsService(
    new MissionsService(alertsService),
    alertsService,
  );
  const commentsService = new CommentsService();

  const reporterId = uuidv7();
  const commenterId = uuidv7();

  const setSettings = (values: Partial<typeof platformSettings.$inferInsert>) =>
    db
      .update(platformSettings)
      .set(values)
      .where(eq(platformSettings.singleton, true));

  const reportInput = (
    overrides: Partial<CreateReportDto> = {},
  ): CreateReportDto => ({
    categoryKey: 'medicalHelp',
    title: 'Need help at the clinic',
    description: 'A longer description so the 20-character minimum passes.',
    lat: 13.08,
    lng: 80.27,
    anonymous: false,
    phoneVisible: false,
    neededVolunteers: 1,
    photoUrls: ['https://example.test/1.jpg'],
    ...overrides,
  });

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    await seedLookups(db);
    await db.insert(user).values([
      { id: reporterId, name: 'Reporter', email: `${reporterId}@test.local` },
      {
        id: commenterId,
        name: 'Commenter',
        email: `${commenterId}@test.local`,
      },
    ]);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(async () => {
    await db.delete(platformSettings);
    await db
      .insert(platformSettings)
      .values({ id: uuidv7(), ...PLATFORM_SETTINGS_DEFAULTS });
  });

  describe('max_photos_per_report', () => {
    it('rejects a create with more photos than configured', async () => {
      await setSettings({ maxPhotosPerReport: 2 });

      await expect(
        reportsService.create(
          reporterId,
          reportInput({
            photoUrls: [
              'https://example.test/1.jpg',
              'https://example.test/2.jpg',
              'https://example.test/3.jpg',
            ],
          }),
        ),
      ).rejects.toMatchObject({ response: { code: 'REPORT_PHOTO_LIMIT' } });
    });

    it('accepts a create exactly at the configured limit', async () => {
      await setSettings({ maxPhotosPerReport: 2 });

      const created = await reportsService.create(
        reporterId,
        reportInput({
          photoUrls: [
            'https://example.test/1.jpg',
            'https://example.test/2.jpg',
          ],
        }),
      );

      expect(created.photos).toHaveLength(2);
    });

    it('binds on addPhoto too, not only on the first save', async () => {
      // The limit used to be a hardcoded 4 here. A configured maximum that only
      // applies to create is not a maximum.
      await setSettings({ maxPhotosPerReport: 1 });

      const created = await reportsService.create(reporterId, reportInput());

      await expect(
        reportsService.addPhoto(
          created.id,
          reporterId,
          'https://example.test/2.jpg',
        ),
      ).rejects.toMatchObject({ response: { code: 'REPORT_PHOTO_LIMIT' } });
    });
  });

  describe('max_volunteers_per_report', () => {
    it('rejects neededVolunteers above the configured maximum', async () => {
      await setSettings({ maxVolunteersPerReport: 3 });

      await expect(
        reportsService.create(reporterId, reportInput({ neededVolunteers: 4 })),
      ).rejects.toMatchObject({ response: { code: 'REPORT_VOLUNTEER_LIMIT' } });
    });

    it('accepts neededVolunteers at the configured maximum', async () => {
      await setSettings({ maxVolunteersPerReport: 3 });

      const created = await reportsService.create(
        reporterId,
        reportInput({ neededVolunteers: 3 }),
      );

      expect(created.neededVolunteers).toBe(3);
    });
  });

  describe('allow_anonymous_reports', () => {
    it('rejects an anonymous report when anonymity is switched off', async () => {
      await setSettings({ allowAnonymousReports: false });

      await expect(
        reportsService.create(reporterId, reportInput({ anonymous: true })),
      ).rejects.toMatchObject({
        response: { code: 'ANONYMOUS_REPORTS_DISABLED' },
      });
    });

    it('still accepts a named report when anonymity is switched off', async () => {
      await setSettings({ allowAnonymousReports: false });

      const created = await reportsService.create(
        reporterId,
        reportInput({ anonymous: false }),
      );

      expect(created.id).toBeDefined();
    });

    it('accepts an anonymous report by default', async () => {
      const created = await reportsService.create(
        reporterId,
        reportInput({ anonymous: true }),
      );

      expect(created.id).toBeDefined();
    });
  });

  describe('comments_enabled', () => {
    it('blocks a new comment when comments are switched off', async () => {
      const report = await reportsService.create(reporterId, reportInput());
      await setSettings({ commentsEnabled: false });

      await expect(
        commentsService.create(report.id, commenterId, 'Hello'),
      ).rejects.toMatchObject({ response: { code: 'COMMENTS_DISABLED' } });
    });

    it('leaves the existing thread readable', async () => {
      // Switching comments off stops new ones; it does not retract what people
      // already said. Deleting a thread is a separate, audited admin act.
      const report = await reportsService.create(reporterId, reportInput());
      await commentsService.create(report.id, commenterId, 'Posted earlier');

      await setSettings({ commentsEnabled: false });

      const thread = await commentsService.list(report.id);
      expect(thread).toHaveLength(1);
      expect(thread[0].body).toBe('Posted earlier');
    });
  });

  describe('comment_flagging_enabled', () => {
    it('blocks a flag when flagging is switched off', async () => {
      const report = await reportsService.create(reporterId, reportInput());
      const [comment] = await commentsService.create(
        report.id,
        reporterId,
        'A comment to flag',
      );

      await setSettings({ commentFlaggingEnabled: false });

      await expect(
        commentsService.flag(comment.id, commenterId, 'spam'),
      ).rejects.toMatchObject({
        response: { code: 'COMMENT_FLAGGING_DISABLED' },
      });
    });

    it('is independent of comments_enabled', async () => {
      // Two switches because they are two decisions: an operator who stops new
      // comments still wants the existing thread flaggable.
      const report = await reportsService.create(reporterId, reportInput());
      const [comment] = await commentsService.create(
        report.id,
        reporterId,
        'A comment to flag',
      );

      await setSettings({
        commentsEnabled: false,
        commentFlaggingEnabled: true,
      });

      await expect(
        commentsService.flag(comment.id, commenterId, 'spam'),
      ).resolves.toEqual({ flagged: true });
    });
  });
});
