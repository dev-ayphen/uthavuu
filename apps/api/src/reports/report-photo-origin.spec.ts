import 'dotenv/config';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { uuidv7 } from 'uuidv7';
import type { Request } from 'express';

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
import { missionCompletions } from '../db/schema/missions-schema';
import { AlertsService } from '../alerts/alerts.service';
import { MissionsService } from '../missions/missions.service';
import { UPLOADS_DIR } from '../uploads/multer.config';
import { QUARANTINE_DIR } from '../uploads/quarantine-storage';
import { createPhotoUploadFixture } from '../uploads/testing/photo-upload-fixture';
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
 * `http://evil.com/tracker.png` passed `z.string().url()`, and mobile renders
 * that column directly, so one poisoned row made every citizen who opened the
 * report fetch from a host we do not control.
 *
 * ⚠️ SCOPE NARROWED. This suite used to walk a URL in through all four doors:
 * report create, the full-replace edit, addPhoto, and mission completion. The
 * three report paths no longer accept URLs at all — they take ids of
 * verification records this API wrote — so those cases are not obsolete but
 * UNREACHABLE, and asserting them would be asserting against a DTO that cannot
 * be constructed. Their replacement, which proves a strictly stronger property,
 * is report-photo-gate.spec.ts.
 *
 * What remains here is the path that still carries a URL: mission completion.
 * The predicate lives in uploads/stored-upload.ts and its own unit cases are in
 * stored-upload.spec.ts; the point of this file is that the caller actually
 * calls it, which is exactly the thing `reports` forgot to do the first time.
 */
describe('A completion photo URL is only stored if this API served it', () => {
  const alertsService = new AlertsService({
    sendToUser: jest
      .fn()
      .mockResolvedValue({ sent: 0, failed: 0, deadTokens: [] }),
  } as unknown as ConstructorParameters<typeof AlertsService>[0]);
  const missionsService = new MissionsService(alertsService);
  const reportsService = new ReportsService(missionsService, alertsService);

  const reporterId = uuidv7();
  const volunteerId = uuidv7();

  // Real file on disk: the predicate's last step is existsSync, so a fixture URL
  // for a file that was never written is (correctly) refused.
  const REAL_FILE = 'report-photo-origin-spec.jpg';
  const genuineUrl = `${process.env.BETTER_AUTH_URL}/uploads/${REAL_FILE}`;
  const HOSTILE_URL = 'http://evil.com/tracker.png';

  const savedExpoApiUrl = process.env.EXPO_PUBLIC_API_URL;
  const quarantined: string[] = [];

  // Falls back to BETTER_AUTH_URL rather than depending on a faked Host.
  const req = { get: () => undefined } as unknown as Request;

  const reportInput = (photoUploadIds: string[]): CreateReportDto => ({
    categoryKey: 'medicalHelp',
    title: 'Need help at the clinic',
    description: 'A longer description so the 20-character minimum passes.',
    lat: 13.08,
    lng: 80.27,
    anonymous: false,
    phoneVisible: false,
    neededVolunteers: 1,
    photoUploadIds,
  });

  beforeAll(async () => {
    writeFileSync(
      join(UPLOADS_DIR, REAL_FILE),
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );

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
    unlinkSync(join(UPLOADS_DIR, REAL_FILE));
    for (const name of quarantined) {
      for (const dir of [QUARANTINE_DIR, UPLOADS_DIR]) {
        try {
          unlinkSync(join(dir, name));
        } catch {
          // Promoted out of one directory into the other; missing is expected.
        }
      }
    }
    await db.$client.end();
  });

  afterEach(() => {
    if (savedExpoApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = savedExpoApiUrl;
    delete process.env.UPLOADS_PUBLIC_URL;
  });

  // Regression guard on the path the predicate came FROM. Lifting it out of
  // MissionsService must not weaken (or break) the check it was already doing.
  const activeMission = async () => {
    const filename = `report-photo-origin-${uuidv7()}.jpg`;
    quarantined.push(filename);
    const uploadId = await createPhotoUploadFixture({
      uploaderId: reporterId,
      filename,
      decision: 'pass',
    });

    const created = await reportsService.create(
      reporterId,
      reportInput([uploadId]),
      req,
    );
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

  // Was refused before the predicate moved: a volunteer photographing the
  // completed help on their phone uploads through the LAN origin, and the
  // hard-coded prefix only ever accepted BETTER_AUTH_URL.
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
