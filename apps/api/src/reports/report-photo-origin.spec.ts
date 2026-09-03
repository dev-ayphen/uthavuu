import 'dotenv/config';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here. Its own database also keeps
// this suite off the shared dev one, where five parallel sessions currently make
// a whole-suite run unreliable.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_report_photo_origin_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportPhotos } from '../db/schema/reports-schema';
import { missionCompletions } from '../db/schema/missions-schema';
import { AlertsService } from '../alerts/alerts.service';
import { MissionsService } from '../missions/missions.service';
import { UPLOADS_DIR } from '../uploads/multer.config';
import { ReportsService } from './reports.service';
import type { CreateReportDto } from './dto/create-report.dto';
import {
  createSpecDatabase,
  seedLookups,
} from '../admin/testing/admin-spec-db';

const DATABASE = 'uthavu_report_photo_origin_test';

/**
 * docs/_audit/issues.md issue 27: any authenticated client could store an
 * arbitrary photo URL that other citizens' phones would then fetch.
 *
 * `POST /reports` validated `photoUrls` with `z.string().url()` — a syntax
 * check — and wrote the array into `report_photos.url` verbatim, on create and
 * on edit. `http://evil.com/tracker.png` passed. Mobile renders that column
 * directly (the console re-homes the path onto its own API origin and was never
 * exposed), so a single poisoned row made every citizen who opened the report
 * fetch from a host we do not control: their IP and headers leaked per viewer,
 * and that host chose the imagery shown inside an emergency feed.
 *
 * This suite walks the URL in through every door rather than testing the
 * predicate — that is stored-upload.spec.ts's job. The point here is that all
 * four writers of a photo column actually call it: create, the full-replace
 * edit, addPhoto, and mission completion. A check one path forgets is not a
 * check, and the forgetting is exactly what happened the first time: the
 * predicate already existed inside MissionsService and `reports` simply never
 * called it.
 */
describe('A photo URL is only stored if this API actually served it', () => {
  const alertsService = new AlertsService();
  const missionsService = new MissionsService(alertsService);
  const reportsService = new ReportsService(missionsService, alertsService);

  const reporterId = uuidv7();
  const volunteerId = uuidv7();

  // Real files on disk: the predicate's last step is existsSync, so a fixture
  // URL for a file that was never written is (correctly) refused.
  const REAL_FILE = 'report-photo-origin-spec.jpg';
  const SECOND_FILE = 'report-photo-origin-spec-2.jpg';
  const genuineUrl = `${process.env.BETTER_AUTH_URL}/uploads/${REAL_FILE}`;
  const secondGenuineUrl = `${process.env.BETTER_AUTH_URL}/uploads/${SECOND_FILE}`;
  const HOSTILE_URL = 'http://evil.com/tracker.png';

  const savedExpoApiUrl = process.env.EXPO_PUBLIC_API_URL;

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
    photoUrls: [genuineUrl],
    ...overrides,
  });

  beforeAll(async () => {
    for (const name of [REAL_FILE, SECOND_FILE]) {
      writeFileSync(
        join(UPLOADS_DIR, name),
        Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      );
    }

    await createSpecDatabase(DATABASE);
    await seedLookups(db);
    await db.insert(user).values([
      { id: reporterId, name: 'Reporter', email: `${reporterId}@test.local` },
      {
        id: volunteerId,
        name: 'Volunteer',
        email: `${volunteerId}@test.local`,
      },
    ]);
  });

  afterAll(async () => {
    for (const name of [REAL_FILE, SECOND_FILE])
      unlinkSync(join(UPLOADS_DIR, name));
    await db.$client.end();
  });

  afterEach(() => {
    if (savedExpoApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = savedExpoApiUrl;
    delete process.env.UPLOADS_PUBLIC_URL;
  });

  describe('POST /reports', () => {
    it('refuses an off-origin URL', async () => {
      await expect(
        reportsService.create(
          reporterId,
          reportInput({ photoUrls: [HOSTILE_URL] }),
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_UPLOAD_URL' } });
    });

    // A single hostile entry poisons the whole set, so the array is all-or-
    // nothing rather than "store the ones that check out".
    it('refuses the whole set when only one entry is off-origin', async () => {
      await expect(
        reportsService.create(
          reporterId,
          reportInput({ photoUrls: [genuineUrl, HOSTILE_URL] }),
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_UPLOAD_URL' } });
    });

    it('refuses a path traversal dressed as a filename', async () => {
      await expect(
        reportsService.create(
          reporterId,
          reportInput({
            photoUrls: [
              `${process.env.BETTER_AUTH_URL}/uploads/%2e%2e%2f%2e%2e%2fetc%2fpasswd`,
            ],
          }),
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_UPLOAD_URL' } });
    });

    // Our own origin, our own path shape, and still a fabrication — this is the
    // half of the check that a pure origin allow-list would miss.
    it('refuses a well-formed URL for a file that was never uploaded', async () => {
      await expect(
        reportsService.create(
          reporterId,
          reportInput({
            photoUrls: [
              `${process.env.BETTER_AUTH_URL}/uploads/${uuidv7()}.jpg`,
            ],
          }),
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_UPLOAD_URL' } });
    });

    // The rejection has to land before any write, or a refused create still
    // leaves a report row behind.
    it('writes no report_photos row when it refuses', async () => {
      const before = await db.select().from(reportPhotos);
      await expect(
        reportsService.create(
          reporterId,
          reportInput({ photoUrls: [HOSTILE_URL] }),
        ),
      ).rejects.toThrow();
      const after = await db.select().from(reportPhotos);
      expect(after).toHaveLength(before.length);
    });

    it('accepts a genuine upload', async () => {
      const created = await reportsService.create(reporterId, reportInput());
      expect(created.photos).toEqual([genuineUrl]);
    });

    // The LAN case. A phone uploads through EXPO_PUBLIC_API_URL, so its photos
    // carry that origin — the old hard-coded `${BETTER_AUTH_URL}/uploads/`
    // prefix refused them, which is why this is a fix and not just a lock.
    it('accepts a genuine upload whose origin is EXPO_PUBLIC_API_URL', async () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.5:3001';
      const lanUrl = `http://192.168.1.5:3001/uploads/${REAL_FILE}`;

      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUrls: [lanUrl] }),
      );
      expect(created.photos).toEqual([lanUrl]);
    });

    // The landmine .env.example warns about: setting this used to break every
    // photo check at once, because only one of the two places that resolve
    // origins had ever heard of it.
    it('accepts a genuine upload on UPLOADS_PUBLIC_URL once that is configured', async () => {
      process.env.UPLOADS_PUBLIC_URL = 'http://localhost:3001';
      const created = await reportsService.create(
        reporterId,
        reportInput({
          photoUrls: [`http://localhost:3001/uploads/${REAL_FILE}`],
        }),
      );
      expect(created.photos).toEqual([
        `http://localhost:3001/uploads/${REAL_FILE}`,
      ]);
    });
  });

  describe('PATCH /reports/:id — the full-replace edit path', () => {
    it('refuses an off-origin URL', async () => {
      const created = await reportsService.create(reporterId, reportInput());

      await expect(
        reportsService.update(created.id, reporterId, {
          photoUrls: [HOSTILE_URL],
        }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_UPLOAD_URL' } });
    });

    // update() deletes the existing rows before inserting the new set, so a
    // rejection that landed after the delete would take the real photos with it.
    it('leaves the existing photos intact when it refuses', async () => {
      const created = await reportsService.create(reporterId, reportInput());

      await expect(
        reportsService.update(created.id, reporterId, {
          title: 'Edited title',
          photoUrls: [HOSTILE_URL],
        }),
      ).rejects.toThrow();

      const rows = await db
        .select()
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, created.id));
      expect(rows.map((r) => r.url)).toEqual([genuineUrl]);
    });

    // The title rides along because `update()` has a SEPARATE, pre-existing
    // defect: a photos-only body makes its `.set({})` empty and drizzle throws
    // "No values to set", so a photos-only edit 500s today regardless of this
    // change. Left alone deliberately — it is not this fix's bug, and the
    // security assertion above still exercises the photos-only shape (the
    // rejection lands before the update runs). Reported separately.
    it('accepts a genuine replacement', async () => {
      const created = await reportsService.create(reporterId, reportInput());

      const updated = await reportsService.update(created.id, reporterId, {
        title: 'Edited title',
        photoUrls: [secondGenuineUrl],
      });
      expect(updated.photos).toEqual([secondGenuineUrl]);
    });
  });

  describe('POST /reports/:id/photos', () => {
    it('refuses an off-origin URL', async () => {
      const created = await reportsService.create(reporterId, reportInput());

      await expect(
        reportsService.addPhoto(created.id, reporterId, HOSTILE_URL),
      ).rejects.toMatchObject({ response: { code: 'INVALID_UPLOAD_URL' } });
    });

    it('accepts a genuine upload', async () => {
      const created = await reportsService.create(reporterId, reportInput());

      const updated = await reportsService.addPhoto(
        created.id,
        reporterId,
        secondGenuineUrl,
      );
      expect(updated.photos).toEqual([genuineUrl, secondGenuineUrl]);
    });
  });

  // Regression guard on the path the predicate came FROM. Lifting it out of
  // MissionsService must not weaken (or break) the check it was already doing.
  describe('mission completion, after the predicate moved out of MissionsService', () => {
    const activeMission = async () => {
      const created = await reportsService.create(reporterId, reportInput());
      await missionsService.accept(created.id, volunteerId);
      await missionsService.confirm(created.id, volunteerId);
      return created.id;
    };

    it('still accepts a genuine completion photo', async () => {
      const reportId = await activeMission();

      const roster = await missionsService.complete(
        reportId,
        volunteerId,
        genuineUrl,
        'Delivered.',
      );
      expect(roster.completion?.photoUrl).toBe(genuineUrl);
    });

    it('still refuses an off-origin completion photo, with its own wording', async () => {
      const reportId = await activeMission();

      await expect(
        missionsService.complete(reportId, volunteerId, HOSTILE_URL, 'Done.'),
      ).rejects.toThrow('must be one uploaded through this app');
    });

    it('writes no mission_completions row when it refuses', async () => {
      const reportId = await activeMission();
      const before = await db.select().from(missionCompletions);

      await expect(
        missionsService.complete(reportId, volunteerId, HOSTILE_URL, 'Done.'),
      ).rejects.toThrow();

      expect(await db.select().from(missionCompletions)).toHaveLength(
        before.length,
      );
    });

    // Was refused before this change: a volunteer photographing the completed
    // help on their phone uploads through the LAN origin, and the hard-coded
    // prefix only ever accepted BETTER_AUTH_URL.
    it('now accepts a completion photo uploaded from a phone over the LAN', async () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.5:3001';
      const lanUrl = `http://192.168.1.5:3001/uploads/${REAL_FILE}`;
      const reportId = await activeMission();

      const roster = await missionsService.complete(
        reportId,
        volunteerId,
        lanUrl,
        'Delivered.',
      );
      expect(roster.completion?.photoUrl).toBe(lanUrl);
    });
  });
});
