import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR } from '../multer.config';

// SOI + EOI, the shortest thing that is recognisably a JPEG. Nothing reads the
// bytes — the two properties under test are "the origin is one this deployment
// declares" and "the file is really on disk".
const EMPTY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

/**
 * Writes a real file into UPLOADS_DIR and returns the URL this API serves it at.
 *
 * Specs need this because a photo URL stopped being just a string: since
 * docs/_audit/issues.md issue 27, every path that writes one — ReportsService
 * create/update/addPhoto, MissionsService.complete, UsersService.completeProfile
 * — runs assertStoredUpload, and its last step is existsSync. A made-up
 * `http://localhost:3001/uploads/test1.jpg` is now refused with
 * INVALID_UPLOAD_URL, correctly: inventing a URL for a file nobody uploaded is
 * precisely the fabrication that check exists to catch. A fixture has to be a
 * real upload for the same reason a real client's photo does.
 *
 * NAME THE FILE AFTER THE SPEC THAT OWNS IT. UPLOADS_DIR is one directory shared
 * by every Jest worker, so two suites both using `photo.jpg` would delete each
 * other's file mid-run and fail in a way that looks like this check misfiring.
 */
export function writeUploadFixture(filename: string): string {
  writeFileSync(join(UPLOADS_DIR, filename), EMPTY_JPEG);
  return `${process.env.BETTER_AUTH_URL}/uploads/${filename}`;
}

/** `force` so a suite that half-failed still tears down without a second error. */
export function removeUploadFixture(filename: string): void {
  rmSync(join(UPLOADS_DIR, filename), { force: true });
}
