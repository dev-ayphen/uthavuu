import 'dotenv/config';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_report_photo_gate_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportPhotos,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  photoUploads,
  photoVerificationStatuses,
} from '../db/schema/photo-verification-schema';
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

const DATABASE = 'uthavu_report_photo_gate_test';

/**
 * The verification gate, walked in through every door.
 *
 * THIS SUITE REPLACES the report half of report-photo-origin.spec.ts. That suite
 * proved a photo URL was one this API had served — a real check, and an
 * insufficient one: it established provenance and never established that
 * anything had looked at the picture. Reports no longer accept URLs at all, so
 * those cases are not merely obsolete, they are unreachable: the DTO takes ids.
 *
 * What replaces them is a stronger guarantee, and these are the cases that prove
 * it. An id refers to a `photo_uploads` row this API wrote after inspecting and
 * moderating the image, and the verdict is re-read from the database on every
 * attach — so a client cannot forge one, cannot borrow somebody else's, cannot
 * reuse its own twice, and cannot assert its own photo passed.
 *
 * The mission-completion cases stay in report-photo-origin.spec.ts: completion
 * photos still travel as URLs and the origin predicate still guards them.
 */
describe('A report photo is only published if verification allowed it', () => {
  const alertsService = new AlertsService({
    sendToUser: jest
      .fn()
      .mockResolvedValue({ sent: 0, failed: 0, deadTokens: [] }),
  } as unknown as ConstructorParameters<typeof AlertsService>[0]);
  const missionsService = new MissionsService(alertsService);
  const reportsService = new ReportsService(missionsService, alertsService);

  const reporterId = uuidv7();
  const strangerId = uuidv7();

  // `get` returning undefined makes upload-url.ts fall back to BETTER_AUTH_URL,
  // which is deterministic — the alternative depends on whichever Host a test
  // happened to fake and on the declared-origin set.
  const req = { get: () => undefined } as unknown as Request;

  const fixtures: string[] = [];
  async function upload(
    decision: 'pass' | 'review' | 'reject' = 'pass',
    uploaderId: string = reporterId,
    categoryId?: string,
  ): Promise<string> {
    const filename = `report-photo-gate-${uuidv7()}.jpg`;
    fixtures.push(filename);
    return createPhotoUploadFixture({
      uploaderId,
      filename,
      decision,
      categoryId,
    });
  }

  async function categoryIdFor(key: string): Promise<string> {
    const [row] = await db
      .select({ id: reportCategories.id })
      .from(reportCategories)
      .where(eq(reportCategories.key, key));
    return row.id;
  }

  const reportInput = (
    overrides: Partial<CreateReportDto> = {},
  ): CreateReportDto =>
    ({
      categoryKey: 'medicalHelp',
      title: 'Need help at the clinic',
      description: 'A longer description so the 20-character minimum passes.',
      lat: 13.08,
      lng: 80.27,
      anonymous: false,
      phoneVisible: false,
      neededVolunteers: 1,
      ...overrides,
    }) as CreateReportDto;

  async function statusKeyOf(reportId: string): Promise<string> {
    const [row] = await db
      .select({ key: reportStatuses.key })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .where(eq(reports.id, reportId));
    return row.key;
  }

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    await seedLookups(db);
    await db.insert(user).values([
      { id: reporterId, name: 'Reporter', email: `${reporterId}@test.local` },
      { id: strangerId, name: 'Stranger', email: `${strangerId}@test.local` },
    ]);
  });

  afterAll(async () => {
    for (const name of fixtures) {
      for (const dir of [QUARANTINE_DIR, UPLOADS_DIR]) {
        const path = join(dir, name);
        if (existsSync(path)) unlinkSync(path);
      }
    }
    await db.$client.end();
  });

  describe('POST /reports', () => {
    it('publishes a report whose photos all passed', async () => {
      const uploadId = await upload('pass');

      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [uploadId] }),
        req,
      );

      expect(await statusKeyOf(created.id)).toBe('open');
      expect(created.photos).toHaveLength(1);
      // Promoted out of quarantine into public storage — and only after the
      // report row existed saying it was allowed to be there.
      const [photo] = await db
        .select()
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, created.id));
      expect(photo.uploadId).toBe(uploadId);
    });

    it('holds the report when a photo needs review, and publishes nothing', async () => {
      const uploadId = await upload('review');

      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [uploadId] }),
        req,
      );

      expect(await statusKeyOf(created.id)).toBe('pending_review');
      // No report_photos row at all: the picture has no public URL until a
      // moderator approves it. This is the assertion that makes the quarantine
      // real rather than nominal.
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, created.id)),
      ).toHaveLength(0);
    });

    it('holds the WHOLE report when only one of four photos needs review', async () => {
      const ids = [
        await upload('pass'),
        await upload('pass'),
        await upload('review'),
        await upload('pass'),
      ];

      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: ids }),
        req,
      );

      expect(await statusKeyOf(created.id)).toBe('pending_review');
      // Publishing the three that passed would put a partially-moderated
      // emergency in front of volunteers while a moderator decided the fourth.
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, created.id)),
      ).toHaveLength(0);
    });

    it('refuses a rejected photo outright', async () => {
      const uploadId = await upload('reject');

      await expect(
        reportsService.create(
          reporterId,
          reportInput({ photoUploadIds: [uploadId] }),
          req,
        ),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_REJECTED' } });
    });

    it("refuses another citizen's upload id", async () => {
      const stolen = await upload('pass', strangerId);

      await expect(
        reportsService.create(
          reporterId,
          reportInput({ photoUploadIds: [stolen] }),
          req,
        ),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NOT_VERIFIED' } });
    });

    it('refuses an id that does not exist', async () => {
      await expect(
        reportsService.create(
          reporterId,
          reportInput({ photoUploadIds: [uuidv7()] }),
          req,
        ),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NOT_VERIFIED' } });
    });

    it('refuses to reuse an upload already attached to a report', async () => {
      const uploadId = await upload('pass');
      await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [uploadId] }),
        req,
      );

      // Without the `report_id is null` clause a reporter could mint any number
      // of reports from one verified photo.
      await expect(
        reportsService.create(
          reporterId,
          reportInput({ photoUploadIds: [uploadId] }),
          req,
        ),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NOT_VERIFIED' } });
    });

    it('treats a missing verdict as needing review, never as a pass', async () => {
      const uploadId = await upload('pass');
      // An upload whose verification never finished writing a decision.
      await db
        .update(photoUploads)
        .set({ decision: null })
        .where(eq(photoUploads.id, uploadId));

      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [uploadId] }),
        req,
      );

      expect(await statusKeyOf(created.id)).toBe('pending_review');
    });

    it('writes no report at all when a photo is refused', async () => {
      const before = await db.select().from(reports);
      const uploadId = await upload('reject');

      await expect(
        reportsService.create(
          reporterId,
          reportInput({ photoUploadIds: [uploadId] }),
          req,
        ),
      ).rejects.toThrow();

      expect(await db.select().from(reports)).toHaveLength(before.length);
    });

    it('links every upload to its report, held or not, so the queue can find them', async () => {
      const uploadId = await upload('review');
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [uploadId] }),
        req,
      );

      const [row] = await db
        .select({ reportId: photoUploads.reportId })
        .from(photoUploads)
        .where(eq(photoUploads.id, uploadId));
      expect(row.reportId).toBe(created.id);
    });
  });

  describe('the category a photo was judged against', () => {
    // A REAL BYPASS, not a hypothetical. Category relevance is judged at capture
    // time, and `communityHelp` deliberately has no expected labels — so a photo
    // uploaded under it skips the relevance rule and passes. Without the check
    // this covers, a client could collect that pass and then file the report
    // under Animal Rescue, dodging relevance entirely with a verdict that was
    // genuine but was answering a different question.
    it('holds a report whose category changed after the photo was judged', async () => {
      // `animalRescue` stands in for the real exploit category here simply
      // because seedLookups only seeds three categories. The production case is
      // `communityHelp`, which deliberately has NO expected labels — so a photo
      // uploaded under it skips relevance and passes unconditionally. Either
      // way the mechanism under test is the same: the id the photo was judged
      // against differs from the id it is being filed under.
      const otherCategory = await categoryIdFor('animalRescue');
      const uploadId = await upload('pass', reporterId, otherCategory);

      // reportInput files under medicalHelp.
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [uploadId] }),
        req,
      );

      expect(await statusKeyOf(created.id)).toBe('pending_review');
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, created.id)),
      ).toHaveLength(0);
    });

    // ── THE ACTUAL EXPLOIT ────────────────────────────────────────────────
    // The two post-publish paths did NOT bind the category. The reasoning was
    // that they already demand an explicit `pass`, so the category would be
    // redundant — and that is wrong, because `communityHelp` has ZERO expected
    // labels, so relevance is skipped there and any safe photo earns a GENUINE
    // pass. Two requests were enough: publish with a relevant photo, then
    // replace the whole set with a Community-Help-judged one.
    //
    // A security regression pass found this live: `POST /reports/:id/photos`
    // returned 201 and the file was publicly fetchable. These two cases are the
    // permanent guard, because `create()` being covered is exactly what made it
    // look safe.
    async function livePublishedReport(): Promise<string> {
      const medicalHelp = await categoryIdFor('medicalHelp');
      const created = await reportsService.create(
        reporterId,
        reportInput({
          photoUploadIds: [await upload('pass', reporterId, medicalHelp)],
        }),
        req,
      );
      return created.id;
    }

    it('refuses to ADD a photo judged under a different category', async () => {
      const reportId = await livePublishedReport();
      const foreign = await upload(
        'pass',
        reporterId,
        await categoryIdFor('animalRescue'),
      );

      await expect(
        reportsService.addPhoto(reportId, reporterId, foreign, req),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NEEDS_REVIEW' } });

      // And nothing was written — a refusal that still attaches is not a refusal.
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, reportId)),
      ).toHaveLength(1);
      expect(await statusKeyOf(reportId)).toBe('open');
    });

    it('refuses to REPLACE the photo set with one judged under a different category', async () => {
      const reportId = await livePublishedReport();
      const foreign = await upload(
        'pass',
        reporterId,
        await categoryIdFor('animalRescue'),
      );

      await expect(
        reportsService.update(
          reportId,
          reporterId,
          { photoUploadIds: [foreign] },
          req,
        ),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NEEDS_REVIEW' } });

      // The full-replace path deletes before it inserts, so a refusal that
      // leaked through would leave the report with NO photo at all.
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, reportId)),
      ).toHaveLength(1);
    });

    it('still allows a same-category photo on both post-publish paths', async () => {
      // The control. Without it, the two refusals above would also pass if the
      // paths simply rejected everything.
      const medicalHelp = await categoryIdFor('medicalHelp');
      const reportId = await livePublishedReport();

      const added = await reportsService.addPhoto(
        reportId,
        reporterId,
        await upload('pass', reporterId, medicalHelp),
        req,
      );
      expect(added.photos).toHaveLength(2);

      const replaced = await reportsService.update(
        reportId,
        reporterId,
        {
          photoUploadIds: [await upload('pass', reporterId, medicalHelp)],
        },
        req,
      );
      expect(replaced.photos).toHaveLength(1);
    });

    it('publishes when the photo was judged against the category it is filed under', async () => {
      const medicalHelp = await categoryIdFor('medicalHelp');
      const uploadId = await upload('pass', reporterId, medicalHelp);

      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [uploadId] }),
        req,
      );

      expect(await statusKeyOf(created.id)).toBe('open');
    });
  });

  describe('a held report is not readable by other citizens', () => {
    // The failure mode this closes is the one an earlier audit found for
    // soft-deleted reports, repeating on a new status: `findOne` filtered only
    // on `deleted_at`, so any citizen holding the id could read a held report's
    // title, description, landmark and exact lat/lng. The photo has no public
    // URL — but the report around it was fully readable, which defeats the point
    // of holding it.
    it('serves a pending_review report to its own reporter', async () => {
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [await upload('review')] }),
        req,
      );

      // The reporter must be able to open it and see the pending state.
      const seen = await reportsService.findOne(created.id, reporterId);
      expect(seen.id).toBe(created.id);
      expect(seen.status).toBe('pending_review');
    });

    it('hides a pending_review report from a different citizen', async () => {
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [await upload('review')] }),
        req,
      );

      await expect(
        reportsService.findOne(created.id, strangerId),
      ).rejects.toMatchObject({ response: { code: 'REPORT_NOT_FOUND' } });
    });

    it('keeps a published report readable by anyone', async () => {
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [await upload('pass')] }),
        req,
      );

      const seen = await reportsService.findOne(created.id, strangerId);
      expect(seen.id).toBe(created.id);
      expect(seen.status).toBe('open');
    });
  });

  describe('POST /reports/:id/photos — post-publish', () => {
    async function livingReport(): Promise<string> {
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [await upload('pass')] }),
        req,
      );
      return created.id;
    }

    it('accepts a photo that already passed', async () => {
      const reportId = await livingReport();
      const uploadId = await upload('pass');

      const updated = await reportsService.addPhoto(
        reportId,
        reporterId,
        uploadId,
        req,
      );
      expect(updated.photos).toHaveLength(2);
    });

    it('refuses a held photo rather than un-publishing a live report', async () => {
      // Volunteers may already be travelling to this report; a questionable new
      // photo must not retract it, and a pending image nobody can see would be
      // worse than asking for another.
      const reportId = await livingReport();
      const uploadId = await upload('review');

      await expect(
        reportsService.addPhoto(reportId, reporterId, uploadId, req),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NEEDS_REVIEW' } });

      expect(await statusKeyOf(reportId)).toBe('open');
    });
  });

  describe('PUT /reports/:id/photos — the reporter answers "send another"', () => {
    /** What `requestNew` leaves behind: status `rejected`, and a reviewer. */
    async function moderatorAsksForAnother(uploadId: string) {
      const [rejected] = await db
        .select({ id: photoVerificationStatuses.id })
        .from(photoVerificationStatuses)
        .where(eq(photoVerificationStatuses.key, 'rejected'));
      await db
        .update(photoUploads)
        .set({
          statusId: rejected.id,
          reviewedById: reporterId,
          reviewedAt: new Date(),
          reviewReason: 'Please send a clearer photo.',
        })
        .where(eq(photoUploads.id, uploadId));
    }

    async function heldReport(): Promise<{ id: string; uploadId: string }> {
      const uploadId = await upload('review');
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [uploadId] }),
        req,
      );
      return { id: created.id, uploadId };
    }

    it('publishes the report when the replacement passes', async () => {
      // The journey that was a dead end before this path existed: the reporter
      // could be TOLD to send another photo and had no way to send one.
      const { id, uploadId } = await heldReport();
      await moderatorAsksForAnother(uploadId);

      const updated = await reportsService.replaceHeldPhotos(
        id,
        reporterId,
        [await upload('pass')],
        req,
      );

      expect(await statusKeyOf(id)).toBe('open');
      expect(updated.photos).toHaveLength(1);
    });

    it('detaches the superseded upload so it stops blocking release', async () => {
      // `requestNew` leaves the old upload `rejected`, and standingFor() counts
      // `rejected` as `refused`, which blocks publishIfReady() permanently. Left
      // attached, the reporter satisfies the request and still never publishes.
      const { id, uploadId } = await heldReport();
      await moderatorAsksForAnother(uploadId);

      await reportsService.replaceHeldPhotos(
        id,
        reporterId,
        [await upload('pass')],
        req,
      );

      const [old] = await db
        .select({
          reportId: photoUploads.reportId,
          decision: photoUploads.decision,
        })
        .from(photoUploads)
        .where(eq(photoUploads.id, uploadId));
      expect(old.reportId).toBeNull();
      // The moderation record survives the detach — it is the accountability
      // trail and the audit log points at this id.
      expect(old.decision).not.toBeNull();
    });

    it('restores an expired window when the REPORTER resolves the hold', async () => {
      // Issue 28. PV-17 was applied on the moderator's exit from
      // `pending_review` and NOT on this one — `replaceHeldPhotos` wrote `open`
      // itself and skipped it. A report the citizen resolved could therefore
      // publish already expired, which is precisely what PV-17 exists to
      // prevent. It bites hardest here: "send another photo" is the only
      // outcome that asks the citizen to go back out and take one, so it is the
      // most likely to outlast a short window.
      const { id, uploadId } = await heldReport();
      await moderatorAsksForAnother(uploadId);

      const windowMs = 2 * 60 * 60_000;
      const createdAt = new Date(Date.now() - 5 * 60 * 60_000);
      await db
        .update(reports)
        .set({ createdAt, expiryAt: new Date(createdAt.getTime() + windowMs) })
        .where(eq(reports.id, id));

      const before = Date.now();
      await reportsService.replaceHeldPhotos(
        id,
        reporterId,
        [await upload('pass')],
        req,
      );

      expect(await statusKeyOf(id)).toBe('open');
      const [row] = await db
        .select({ expiryAt: reports.expiryAt })
        .from(reports)
        .where(eq(reports.id, id));
      expect(row.expiryAt.getTime()).toBeGreaterThan(before);
      expect(
        Math.abs(row.expiryAt.getTime() - (before + windowMs)),
      ).toBeLessThan(10_000);
    });

    it('leaves a still-valid window alone on the reporter path too', async () => {
      const { id, uploadId } = await heldReport();
      await moderatorAsksForAnother(uploadId);

      const untouched = new Date(Date.now() + 3 * 60 * 60_000);
      await db
        .update(reports)
        .set({ expiryAt: untouched })
        .where(eq(reports.id, id));

      await reportsService.replaceHeldPhotos(
        id,
        reporterId,
        [await upload('pass')],
        req,
      );

      const [row] = await db
        .select({ expiryAt: reports.expiryAt })
        .from(reports)
        .where(eq(reports.id, id));
      expect(row.expiryAt.getTime()).toBe(untouched.getTime());
    });

    it('holds the report again when the replacement also needs review', async () => {
      const { id, uploadId } = await heldReport();
      await moderatorAsksForAnother(uploadId);

      await reportsService.replaceHeldPhotos(
        id,
        reporterId,
        [await upload('review')],
        req,
      );

      expect(await statusKeyOf(id)).toBe('pending_review');
    });

    it('refuses to recycle a photo a moderator already decided about', async () => {
      // Detaching leaves an unattached row whose MACHINE decision may still read
      // `review` even though a human refused it — `decision` is never
      // overwritten. Without the adjudication guard, a reporter could resubmit
      // the very image that was turned down and have it merely held again,
      // laundering a human decision into a machine one.
      const { id, uploadId } = await heldReport();
      await moderatorAsksForAnother(uploadId);
      await db
        .update(photoUploads)
        .set({ reportId: null })
        .where(eq(photoUploads.id, uploadId));

      await expect(
        reportsService.replaceHeldPhotos(id, reporterId, [uploadId], req),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NOT_VERIFIED' } });
    });

    it('refuses on a report that is not awaiting a photo', async () => {
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [await upload('pass')] }),
        req,
      );

      await expect(
        reportsService.replaceHeldPhotos(
          created.id,
          reporterId,
          [await upload('pass')],
          req,
        ),
      ).rejects.toMatchObject({
        response: { code: 'REPORT_NOT_AWAITING_PHOTO' },
      });
    });

    it("refuses on another citizen's report", async () => {
      const { id } = await heldReport();

      await expect(
        reportsService.replaceHeldPhotos(
          id,
          strangerId,
          [await upload('pass', strangerId)],
          req,
        ),
      ).rejects.toThrow(/Not your report/);
    });
  });

  describe('PATCH /reports/:id — the full-replace edit path', () => {
    it('refuses a held photo', async () => {
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [await upload('pass')] }),
        req,
      );

      await expect(
        reportsService.update(
          created.id,
          reporterId,
          { photoUploadIds: [await upload('review')] },
          req,
        ),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NEEDS_REVIEW' } });
    });

    it('leaves the existing photos intact when it refuses', async () => {
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [await upload('pass')] }),
        req,
      );
      const before = await db
        .select()
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, created.id));

      await expect(
        reportsService.update(
          created.id,
          reporterId,
          { photoUploadIds: [await upload('reject')] },
          req,
        ),
      ).rejects.toThrow();

      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, created.id)),
      ).toHaveLength(before.length);
    });

    it('accepts a passed replacement', async () => {
      const created = await reportsService.create(
        reporterId,
        reportInput({ photoUploadIds: [await upload('pass')] }),
        req,
      );

      const updated = await reportsService.update(
        created.id,
        reporterId,
        { photoUploadIds: [await upload('pass')] },
        req,
      );
      expect(updated.photos).toHaveLength(1);
    });
  });
});

// Keeps the fixture writer honest: if QUARANTINE_DIR ever resolved inside
// UPLOADS_DIR this suite would still pass while proving nothing, because the
// "quarantined" file would be publicly served.
it('keeps quarantine outside the public uploads directory', () => {
  const probe = join(QUARANTINE_DIR, 'report-photo-gate-location-probe.jpg');
  writeFileSync(probe, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  try {
    expect(
      existsSync(join(UPLOADS_DIR, 'report-photo-gate-location-probe.jpg')),
    ).toBe(false);
  } finally {
    unlinkSync(probe);
  }
});
