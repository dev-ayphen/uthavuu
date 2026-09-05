// Private storage for photos that have not yet earned publication.
//
// THE PROBLEM THIS SOLVES. `main.ts` mounts UPLOADS_DIR as Express static under
// `/uploads/`, deliberately outside every Nest guard, because an avatar URL has
// to be publicly fetchable. That was the right call for avatars and it is the
// wrong call for a photo awaiting moderation: the instant multer writes the
// file, its URL is world-readable, and there is no revocation — deleting the
// database row does not unpublish the bytes. Verified live: an unauthenticated
// GET of an uploaded filename returns 200 and the image.
//
// So a quarantined photo never enters UPLOADS_DIR at all. It lives in a separate
// directory that no static middleware is mounted on, and it reaches a human only
// through an authenticated controller that streams it. Promotion into the public
// directory is a deliberate act that happens once — and only once — a verdict
// allows it.

import { existsSync, mkdirSync } from 'fs';
import { copyFile, rename, rm, writeFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { randomUUID } from 'crypto';
import { UPLOADS_DIR } from './multer.config';
import {
  FORMAT_EXTENSION,
  type ReportPhotoFormat,
} from './report-photo-limits';

/**
 * Sibling of UPLOADS_DIR by default, never a child of it.
 *
 * `uploads-pending` rather than `uploads/pending` is load-bearing: anything
 * under UPLOADS_DIR is served by the static middleware, so a nested quarantine
 * directory would publish every photo it was built to hide. The assertion below
 * exists because that mistake is a one-word config change away and would be
 * completely silent.
 */
export const QUARANTINE_DIR =
  process.env.QUARANTINE_DIR ?? join(process.cwd(), 'uploads-pending');

/**
 * Refuses to boot if quarantine sits inside the publicly-served directory.
 *
 * A fatal error rather than a warning, following the precedent in
 * push-provider.factory.ts: a silently no-op safety control is worse than a
 * crash, because the crash is noticed. There is no correct behaviour for an API
 * that believes it is quarantining photos while serving them.
 */
function assertQuarantineIsPrivate(): void {
  const publicRoot = resolve(UPLOADS_DIR);
  const quarantineRoot = resolve(QUARANTINE_DIR);

  if (
    quarantineRoot === publicRoot ||
    quarantineRoot.startsWith(publicRoot + sep)
  ) {
    throw new Error(
      'QUARANTINE_DIR resolves inside UPLOADS_DIR, which is served publicly by ' +
        'static middleware. Unverified photos would be world-readable. Point ' +
        'QUARANTINE_DIR at a directory outside UPLOADS_DIR.',
    );
  }
}

assertQuarantineIsPrivate();
if (!existsSync(QUARANTINE_DIR)) {
  mkdirSync(QUARANTINE_DIR, { recursive: true });
}

/**
 * Resolves a stored filename to a path, or undefined if it tries to escape.
 *
 * Filenames in this directory are generated here and stored in the database, so
 * in the normal path they are already safe. This exists for the abnormal path:
 * the name reaches `readQuarantined` from a database column, and treating a
 * column as trusted is how the same class of bug reaches production twice. The
 * check mirrors stored-upload.ts's final belt-and-braces `resolve` test.
 */
function safePathFor(storedFilename: string): string | undefined {
  return pathWithin(QUARANTINE_DIR, storedFilename);
}

/**
 * The same check against an arbitrary root.
 *
 * `root` is a parameter for exactly one caller: the retention sweep
 * (quarantine-retention.ts), whose spec points it at a directory the test owns
 * instead of the one every Jest worker and the developer's own dev database
 * share. Keeping the guard here rather than copying it there is the point — a
 * second implementation of a path-escape check is a second one to get wrong.
 */
function pathWithin(root: string, storedFilename: string): string | undefined {
  if (
    !storedFilename ||
    storedFilename.includes('/') ||
    storedFilename.includes('\\') ||
    storedFilename.includes('..') ||
    storedFilename.includes('\0')
  ) {
    return undefined;
  }
  const rootPath = resolve(root);
  const target = resolve(rootPath, storedFilename);
  return target.startsWith(rootPath + sep) ? target : undefined;
}

/** Writes verified bytes into quarantine and returns the generated filename. */
export async function writeQuarantined(
  bytes: Buffer,
  format: ReportPhotoFormat,
): Promise<string> {
  // The extension comes from the sniffed format, never from the client's
  // filename — the same discipline multer.config.ts applies, for the same reason.
  const filename = `${randomUUID()}${FORMAT_EXTENSION[format]}`;
  await writeFile(safePathFor(filename)!, bytes);
  return filename;
}

/** Absolute path of a quarantined file, or undefined if the name is unusable. */
export function quarantinePathFor(storedFilename: string): string | undefined {
  const path = safePathFor(storedFilename);
  return path && existsSync(path) ? path : undefined;
}

/**
 * Moves a quarantined file into public storage, returning its public filename.
 *
 * `rename` rather than copy-then-delete: within one filesystem it is atomic, so
 * there is no window in which the photo exists in both places — which would mean
 * a publicly readable copy of something that might still be rejected.
 */
export async function promoteToPublic(
  storedFilename: string,
): Promise<string | undefined> {
  const source = quarantinePathFor(storedFilename);
  if (!source) return undefined;

  const destination = resolve(UPLOADS_DIR, storedFilename);
  // Same guard as above, applied to the destination: a name that escaped here
  // would write outside the public directory entirely.
  if (!destination.startsWith(resolve(UPLOADS_DIR) + sep)) return undefined;

  try {
    await rename(source, destination);
  } catch (error) {
    // EXDEV — the two directories are on DIFFERENT FILESYSTEMS, and rename()
    // cannot cross a device boundary.
    //
    // THIS IS THE NORMAL DEPLOYED CASE, not an edge case, which is why it is
    // handled rather than allowed to propagate. docker-compose.yml mounts
    // UPLOADS_DIR as a named volume (`uthavu_api_uploads`) while QUARANTINE_DIR
    // sits on the container's own writable layer, so every approval in Docker
    // hits this. Unit tests never did: on a developer's machine both paths are
    // on one disk and rename() simply works. It took an end-to-end run against
    // the real container to surface it, as a 500 on admin approve.
    //
    // Copy-then-delete instead. It is NOT atomic — briefly the bytes exist in
    // both places — and that asymmetry is acceptable in this direction only:
    // the database has already committed the decision that this photo may be
    // public, so a destination that appears slightly before the source vanishes
    // is early, not wrong. A leftover source is swept later by retention. The
    // reverse operation must never be implemented this way.
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await copyFile(source, destination);
    await rm(source, { force: true });
  }
  return storedFilename;
}

/**
 * Deletes a quarantined file. Safe to call twice.
 *
 * Idempotent because the retention policy calls it from more than one place — an
 * admin rejection and a later sweep — and a missing file is the desired end
 * state in both, not an error worth propagating.
 */
export async function discardQuarantined(
  storedFilename: string,
): Promise<void> {
  await discardQuarantinedFrom(QUARANTINE_DIR, storedFilename);
}

/**
 * Deletes from an explicit root, for the retention sweep and its spec.
 *
 * Every deletion in this codebase funnels through here so there is one place
 * where "this name came out of a database column" is turned into a path, and one
 * place that refuses a name trying to leave the directory. `force: true` makes
 * an already-absent file a success rather than an ENOENT — the sweep, an admin
 * rejection and a retry all want the same end state.
 */
export async function discardQuarantinedFrom(
  root: string,
  storedFilename: string,
): Promise<void> {
  const path = pathWithin(root, storedFilename);
  if (!path) return;
  await rm(path, { force: true });
}
