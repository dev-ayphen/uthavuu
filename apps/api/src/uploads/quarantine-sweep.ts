// What actually runs the retention sweep, given that nothing here can schedule.
//
// ── THE CONSTRAINT, STATED HONESTLY ────────────────────────────────────────
//
// There is no cron and no queue in this API. `@nestjs/schedule` is not a
// dependency, neither is BullMQ, and Redis is used for exactly three things
// (OTP rate limits, the dev OTP stash, and a health PING). broadcasts-schema.ts
// says the same thing in its own words — "NOTHING SWEEPS THIS YET… there is no
// cron in this API" — and documenting the gap rather than inventing
// infrastructure for it was the right call there. Installing a scheduler so that
// a few files can be unlinked would be a new moving part, a new failure mode and
// a new thing to run in every environment, in exchange for deleting some JPEGs.
//
// Fire-and-forget is also unavailable: on Vercel Functions a promise left
// floating after the response is written is killed with the invocation
// (alerts.service.ts:64-67 already carries this scar). So the sweep must be
// awaited inside a request that is happening anyway.
//
// ── WHAT THIS DOES INSTEAD ─────────────────────────────────────────────────
//
// The upload path runs on every capture, which makes it the one place guaranteed
// to be exercised in exact proportion to the mess being cleaned up: no uploads,
// no new quarantine files, nothing to sweep. So the upload path opportunistically
// triggers the sweep, throttled in Redis so that "every capture" becomes "at most
// once every few hours, across every instance".
//
// This is the codebase's existing idiom rather than a new one. Report expiry and
// the volunteer confirmation deadline are both derived lazily at read time
// specifically because a scheduled job is only correct between runs
// (report-effective-status.ts). This is the write-side variant of the same
// trade: deferred work rides on traffic that was going to happen anyway.
//
// ── THE THROTTLE ───────────────────────────────────────────────────────────
//
// One `SET key token EX interval NX`. The key IS the interval marker, so the
// lock is deliberately NEVER released: whoever sets it has both claimed the work
// and burned the interval, and the TTL expiring is what schedules the next
// sweep. That single round-trip gives mutual exclusion between concurrent
// uploads and rate limiting across instances at the same time — two properties
// that would otherwise need two mechanisms that could disagree.
//
// Crash mid-sweep and the key still expires on schedule; the next sweep picks up
// where it left off, because the working set is the directory listing and a file
// that was not unlinked is simply still there.

import { redis } from '../lib/redis';
import {
  QUARANTINE_RETENTION_DAYS,
  sweepQuarantine,
  type QuarantineSweepSummary,
} from './quarantine-retention';

/** Reads an integer env var, falling back when unset, blank or not a number. */
function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

/**
 * Minutes between sweeps. `0` disables the sweep entirely.
 *
 * Six hours is chosen against the cost, not the urgency: the sweep is bounded by
 * QUARANTINE_SWEEP_BATCH and deletes files whose deadline passed up to six hours
 * ago, and no deadline here is measured in hours — the retention window is
 * counted in days. Making it much shorter would add latency to more uploads for
 * no privacy gain; making it much longer would let a backlog build faster than
 * one capped batch can drain it.
 */
export const QUARANTINE_SWEEP_INTERVAL_MINUTES = envInt(
  'QUARANTINE_SWEEP_INTERVAL_MINUTES',
  360,
);

/** Doubles as the throttle marker — see the header. */
export const QUARANTINE_SWEEP_LOCK_KEY = 'uploads:quarantine-sweep';

/**
 * Runs the retention sweep if this instance wins the interval, otherwise not.
 *
 * NEVER THROWS AND NEVER REJECTS. It is called from the middle of a citizen
 * reporting an emergency, and there is no failure of housekeeping that justifies
 * failing that request. A Redis outage means the sweep is skipped, not that the
 * upload is; deletion is deferred, never lost, because the next successful claim
 * finds the same files still on disk.
 *
 * Returns the summary when this call did the work, or null when it did not —
 * which is what makes "concurrent uploads do not each run it" testable.
 */
export async function maybeSweepQuarantine(): Promise<QuarantineSweepSummary | null> {
  if (QUARANTINE_SWEEP_INTERVAL_MINUTES <= 0) return null;

  try {
    const claimed = await redis.set(
      QUARANTINE_SWEEP_LOCK_KEY,
      // Not read by anything — the value is a breadcrumb for an operator running
      // GET on the key while wondering why no sweep has happened.
      new Date().toISOString(),
      'EX',
      QUARANTINE_SWEEP_INTERVAL_MINUTES * 60,
      'NX',
    );
    if (claimed !== 'OK') return null;

    const summary = await sweepQuarantine();
    // One line per sweep, and a sweep happens a handful of times a day. Counts
    // only: filenames are the one identifier here that maps to a photograph.
    // `awaitingReview` is the number worth watching — files held past the
    // retention window means a moderation queue nobody is working.
    console.log(
      `[quarantine] sweep scanned=${summary.scanned} ` +
        `candidates=${summary.candidates} deleted=${summary.deleted} ` +
        `untracked=${summary.untracked} awaiting_review=${summary.awaitingReview} ` +
        `batch_limited=${summary.batchLimited} retention_days=${QUARANTINE_RETENTION_DAYS}`,
    );
    return summary;
  } catch (error) {
    // Swallowed on purpose, and loudly. Losing a sweep costs disk; failing the
    // upload costs somebody the report they were trying to file.
    console.error('[quarantine] sweep failed', error);
    return null;
  }
}
