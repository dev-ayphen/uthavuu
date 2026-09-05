// How long a quarantined photo's BYTES are kept, and what deletes them.
//
// THE LEAK THIS CLOSES. `discardQuarantined()` has existed since quarantine did,
// and until now nothing in a running process ever called it. Every photo the
// verifier held or refused stayed on disk forever. That is two problems wearing
// one coat:
//
//   * storage — QUARANTINE_DIR grows monotonically, and in Docker it is a volume
//     nobody watches until it fills and writes start failing;
//   * privacy — §34 requires a minimum retention period and the deletion of
//     rejected files. A photograph refused for nudity or gore is a liability
//     with no remaining use, and keeping it indefinitely is the thing the policy
//     exists to forbid.
//
// THE RULE THAT OUTRANKS BOTH: deleting the file must never delete the record.
// `photo_uploads` is the accountability trail — the verdict, its reasons, the
// risk level, the moderator and the timestamps — and it survives the bytes by
// design (photo-verification-schema.ts says so in its header). Nothing in this
// file writes to `photo_uploads` at all. File-absence needs no marker column:
// `quarantinePathFor()` already returns undefined for a file that is not there,
// and the admin surface's "the row says the photo exists and the disk disagrees"
// branch already exists in report-photo-attachment.ts.
//
// ── WHY THE DIRECTORY DRIVES THE SWEEP, NOT THE DATABASE ────────────────────
//
// The obvious implementation is "select the deletable rows, unlink their files".
// It rots: the row outlives the file, so on the next sweep every row deleted by
// the last one is selected again. With any batch cap the batch eventually fills
// entirely with rows whose files were unlinked months ago, and newly-expired
// photos are never reached — a cleanup job that reports success while deleting
// nothing. Adding a `file_deleted_at` marker would fix it and would need a
// migration, which this change is not permitted to make (and which would be the
// wrong shape anyway: two sources of truth about whether a file exists).
//
// So the FILESYSTEM is the work queue. A quarantine directory contains exactly
// the files that still exist, so a listing is the live working set by
// construction and there is no such thing as stale work. The database is
// consulted only to answer "may this particular file go?".
//
// A file younger than the retention window is skipped before any query runs.
// That is sound rather than merely fast: every clock this policy can start from
// — created_at, verified_at, reviewed_at — is at or after the moment the bytes
// were written, so a file whose mtime is inside the window cannot possibly be
// past its retention deadline. It also makes the sweep safe to run concurrently
// with an upload that is writing into the same directory right now.

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  photoUploads,
  photoVerificationStatuses,
} from '../db/schema/photo-verification-schema';
import { QUARANTINE_DIR, discardQuarantinedFrom } from './quarantine-storage';

/** Reads an integer env var, falling back when unset, blank or not a number. */
function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  // NaN, Infinity and negatives all mean somebody mis-set this. Adopting such a
  // value would silently change how long evidence is kept, so the documented
  // default wins. Same reasoning as moderation-thresholds.ts's envInt.
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

/**
 * Days a quarantined file is kept after its retention clock starts.
 *
 * Thirty days is the shortest window that still outlasts every process that
 * might need the picture: an appeal from a citizen whose photo was refused, a
 * moderator revisiting their own decision, and a safety report that arrives days
 * after the fact. Shorter, and a legitimate dispute finds the evidence already
 * gone; much longer, and the product is holding refused imagery for no reason it
 * can name — which is precisely what §34 prohibits.
 */
export const QUARANTINE_RETENTION_DAYS = envInt(
  'QUARANTINE_RETENTION_DAYS',
  30,
);
export const QUARANTINE_RETENTION_MS =
  QUARANTINE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Ceiling on files deleted in one sweep.
 *
 * The sweep runs inside a citizen's upload request (quarantine-sweep.ts explains
 * why there is nowhere else to run it), so its worst case is somebody's latency
 * during an emergency. A cap turns "the first sweep after a year of backlog
 * unlinks fifty thousand files" into "it unlinks two hundred, and the next sweep
 * takes the next two hundred". The backlog drains over days instead of stalling
 * one request.
 */
export const QUARANTINE_SWEEP_BATCH = envInt('QUARANTINE_SWEEP_BATCH', 200);

/**
 * Statuses that mean a human has not yet looked at the photo.
 *
 * `verifying` is here for completeness — nothing writes it today
 * (PhotoVerificationService inserts the final verdict directly), but a row stuck
 * in it would be one whose verification never finished, and that is not a state
 * to resolve by destroying the evidence.
 */
const AWAITING_A_HUMAN = new Set(['verifying', 'review_required', 'failed']);

/** What the sweep knows about one file, from the row that owns it. */
export type RetentionRow = {
  statusKey: string;
  decision: string | null;
  reviewedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
  reportId: string | null;
};

export type RetentionVerdict =
  | { keep: false; reason: 'rejected' | 'reviewed' | 'orphaned' | 'untracked' }
  | {
      keep: true;
      reason: 'awaiting_review' | 'within_retention' | 'published';
    };

/**
 * Decides whether one quarantined file may be deleted. Pure; no I/O.
 *
 * `row` is null for a file with no `photo_uploads` row at all. That is not a
 * hypothetical: PhotoVerificationService writes the bytes at step 4 and inserts
 * the row at step 8, so a provider outage or a crash in between leaves a file
 * nothing will ever reference again. Past the retention window it is unambiguous
 * garbage, and it is the one case where deleting the file cannot possibly
 * destroy a record — there is none.
 *
 * Callers must only pass files already older than the window; the age of the
 * bytes is a precondition, and the clock below re-checks the row's own dates.
 */
export function decideRetention(
  row: RetentionRow | null,
  now: number,
  retentionMs: number,
): RetentionVerdict {
  if (!row) return { keep: false, reason: 'untracked' };

  // ── THE RULE THAT MATTERS MOST ──────────────────────────────────────────
  // A held photo is the evidence a moderator is about to look at. Deleting it
  // would leave them a queue entry with a verdict, a risk level and nothing to
  // look at — they would be deciding about a photograph nobody can see. No age
  // releases it: the retention clock does not START until `reviewed_at` is set.
  if (AWAITING_A_HUMAN.has(row.statusKey) && row.reviewedAt === null) {
    return { keep: true, reason: 'awaiting_review' };
  }

  // Passed and attached to a report: publishUploads() renamed these bytes into
  // the public directory, so in the normal case there is nothing here to sweep.
  // Skipping them anyway is the conservative branch — if promotion did NOT
  // happen (an interrupted publish), the file belongs to a live report that
  // volunteers may be travelling to, and a retention sweep is not the thing that
  // should decide to break it. That is a known, deliberate gap; it leaks at most
  // one file per interrupted publish and it is visible as a 404 photo, not as
  // silent data loss.
  if (row.statusKey === 'passed' && row.reportId !== null) {
    return { keep: true, reason: 'published' };
  }

  // reviewed_at first: for anything a human decided, the window runs from the
  // DECISION, not from the capture. A photo held for three weeks and rejected
  // yesterday is one day into its retention, not twenty-two.
  const clock = row.reviewedAt ?? row.verifiedAt ?? row.createdAt;
  if (now - clock.getTime() < retentionMs) {
    return { keep: true, reason: 'within_retention' };
  }

  if (row.statusKey === 'rejected' || row.decision === 'reject') {
    return { keep: false, reason: 'rejected' };
  }
  if (row.reviewedAt !== null) return { keep: false, reason: 'reviewed' };
  // Passed (or superseded) and never attached to anything: the citizen captured
  // a photo, the flow was abandoned or the shot was retaken, and no report ever
  // claimed it. Nothing will.
  return { keep: false, reason: 'orphaned' };
}

export type QuarantineSweepSummary = {
  /** Files present in the directory when the sweep started. */
  scanned: number;
  /** Of those, the ones old enough for the database to be consulted about. */
  candidates: number;
  deleted: number;
  /** Kept because no moderator has decided yet — the count worth alerting on. */
  awaitingReview: number;
  /** Deleted files that had no `photo_uploads` row (a subset of `deleted`). */
  untracked: number;
  /** True when the batch cap stopped the sweep with work still outstanding. */
  batchLimited: boolean;
};

export type SweepOptions = {
  /**
   * Which directory to sweep. Production never passes this; it exists so the
   * spec can run against a directory it owns rather than the one shared by every
   * Jest worker and by the developer's own dev database. A test that deleted
   * real quarantined photos because its spec database did not know about them
   * would be a cure worse than the disease.
   */
  directory?: string;
  retentionMs?: number;
  batchLimit?: number;
  now?: number;
};

/** `where in (...)` has a practical argument ceiling; 200 keeps it comfortable. */
const LOOKUP_CHUNK = 200;

/**
 * Deletes quarantined files whose retention window has closed.
 *
 * Never writes to `photo_uploads`. Never touches UPLOADS_DIR — deletion goes
 * through discardQuarantinedFrom(), which resolves the name inside the sweep's
 * own root and refuses anything that escapes it, so the worst a corrupted
 * filename can achieve is nothing.
 */
export async function sweepQuarantine(
  options: SweepOptions = {},
): Promise<QuarantineSweepSummary> {
  const directory = options.directory ?? QUARANTINE_DIR;
  const retentionMs = options.retentionMs ?? QUARANTINE_RETENTION_MS;
  const batchLimit = options.batchLimit ?? QUARANTINE_SWEEP_BATCH;
  const now = options.now ?? Date.now();

  const summary: QuarantineSweepSummary = {
    scanned: 0,
    candidates: 0,
    deleted: 0,
    awaitingReview: 0,
    untracked: 0,
    batchLimited: false,
  };

  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  summary.scanned = files.length;

  // Age gate before any query. See the header: mtime is at or before every clock
  // the policy can use, so a young file is provably not expired, and a file
  // being written by a concurrent upload right now is provably not a candidate.
  const candidates: string[] = [];
  for (const entry of files) {
    const stats = await stat(join(directory, entry.name)).catch(() => null);
    // Vanished between readdir and stat — another sweep or an admin rejection
    // got there first. Its absence is the desired end state either way.
    if (!stats) continue;
    if (now - stats.mtimeMs >= retentionMs) candidates.push(entry.name);
  }
  summary.candidates = candidates.length;
  if (candidates.length === 0) return summary;

  const rows = new Map<string, RetentionRow>();
  for (let i = 0; i < candidates.length; i += LOOKUP_CHUNK) {
    const chunk = candidates.slice(i, i + LOOKUP_CHUNK);
    const found = await db
      .select({
        storedFilename: photoUploads.storedFilename,
        statusKey: photoVerificationStatuses.key,
        decision: photoUploads.decision,
        reviewedAt: photoUploads.reviewedAt,
        verifiedAt: photoUploads.verifiedAt,
        createdAt: photoUploads.createdAt,
        reportId: photoUploads.reportId,
      })
      .from(photoUploads)
      .innerJoin(
        photoVerificationStatuses,
        eq(photoUploads.statusId, photoVerificationStatuses.id),
      )
      .where(inArray(photoUploads.storedFilename, chunk));

    for (const row of found) rows.set(row.storedFilename, row);
  }

  for (const filename of candidates) {
    const verdict = decideRetention(
      rows.get(filename) ?? null,
      now,
      retentionMs,
    );
    if (verdict.keep) {
      if (verdict.reason === 'awaiting_review') summary.awaitingReview += 1;
      continue;
    }

    if (summary.deleted >= batchLimit) {
      summary.batchLimited = true;
      break;
    }

    await discardQuarantinedFrom(directory, filename);
    summary.deleted += 1;
    if (verdict.reason === 'untracked') summary.untracked += 1;
  }

  return summary;
}
