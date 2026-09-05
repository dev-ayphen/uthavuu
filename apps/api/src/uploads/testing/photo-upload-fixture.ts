import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db';
import {
  photoUploads,
  photoVerificationStatuses,
} from '../../db/schema/photo-verification-schema';
import { UPLOADS_DIR } from '../multer.config';
import { QUARANTINE_DIR } from '../quarantine-storage';

// SOI + EOI, the shortest thing recognisably a JPEG. Nothing decodes these bytes
// — the fixture's job is to satisfy the attachment gate, which reads a verdict
// from the database and then moves a real file. Both need to exist; neither
// needs to be a photograph.
const EMPTY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

/**
 * Creates a verified `photo_uploads` row plus its quarantined file.
 *
 * WHY SPECS NEED THIS NOW. `POST /reports` used to take photo URLs, so a fixture
 * was a file on disk plus a string. It now takes ids of verification records
 * this API wrote, and `resolveUploads` re-reads the verdict from the database —
 * which is the entire point, and which means a test cannot fabricate a passing
 * photo any more than a client can. The fixture therefore does what the real
 * pipeline does: writes the bytes into quarantine and records a verdict.
 *
 * `decision` is a parameter because the interesting cases are the ones that do
 * not pass — a held photo must produce a `pending_review` report, and a rejected
 * one must be refused outright.
 */
export async function createPhotoUploadFixture(options: {
  uploaderId: string;
  filename: string;
  decision?: 'pass' | 'review' | 'reject';
  categoryId?: string | null;
}): Promise<string> {
  const decision = options.decision ?? 'pass';
  const statusKey =
    decision === 'pass'
      ? 'passed'
      : decision === 'review'
        ? 'review_required'
        : 'rejected';

  const [status] = await db
    .select({ id: photoVerificationStatuses.id })
    .from(photoVerificationStatuses)
    .where(eq(photoVerificationStatuses.key, statusKey));
  if (!status) {
    throw new Error(
      `photo_verification_statuses is missing "${statusKey}" — run pnpm db:seed.`,
    );
  }

  // NAME THE FILE AFTER THE SPEC THAT OWNS IT. QUARANTINE_DIR is one directory
  // shared by every Jest worker, so two suites both using `photo.jpg` would
  // delete each other's file mid-run and fail in a way that looks like the
  // attachment gate misfiring.
  writeFileSync(join(QUARANTINE_DIR, options.filename), EMPTY_JPEG);

  const id = uuidv7();
  await db.insert(photoUploads).values({
    id,
    uploaderId: options.uploaderId,
    statusId: status.id,
    categoryId: options.categoryId ?? null,
    storedFilename: options.filename,
    mimeType: 'image/jpeg',
    byteSize: EMPTY_JPEG.length,
    width: 800,
    height: 600,
    // Unique per fixture, so one spec's photo is never read as another's
    // duplicate.
    sha256: `fixture-${id}`,
    phash: 'ffffffffffffffff',
    decision,
    riskLevel: decision === 'pass' ? 'low' : 'medium',
    reasons: [],
    signals: {},
    provider: 'fixture',
    verifiedAt: new Date(),
  });

  return id;
}

/**
 * Removes a fixture's file from BOTH directories.
 *
 * A passed upload attached to a report is promoted out of quarantine into public
 * uploads, so which directory holds it depends on whether the spec got as far as
 * publishing. `force` so a suite that half-failed still tears down cleanly.
 */
export function removePhotoUploadFixture(filename: string): void {
  rmSync(join(QUARANTINE_DIR, filename), { force: true });
  rmSync(join(UPLOADS_DIR, filename), { force: true });
}
