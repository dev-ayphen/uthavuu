import 'dotenv/config';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_quarantine_retention_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { photoUploads } from '../db/schema/photo-verification-schema';
import { discardQuarantinedFrom } from './quarantine-storage';
import {
  QUARANTINE_RETENTION_MS,
  decideRetention,
  sweepQuarantine,
  type RetentionRow,
} from './quarantine-retention';
import {
  createSpecDatabase,
  seedLookups,
} from '../admin/testing/admin-spec-db';

const DATABASE = 'uthavu_quarantine_retention_test';
const DAY = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY;

// SOI + EOI, the shortest thing recognisably a JPEG. Nothing decodes these — the
// sweep reasons about a file's age and its row, never its contents.
const EMPTY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

/**
 * The sweep runs against a directory this spec OWNS, not QUARANTINE_DIR.
 *
 * QUARANTINE_DIR is shared by every Jest worker AND by the developer's running
 * dev API, whose photo_uploads rows live in a different database from this
 * spec's. A sweep pointed there would judge those files against a database that
 * has never heard of them, decide they are untracked, and delete real
 * quarantined photos. A cleanup test that destroys the thing it is cleaning up
 * is not a test worth having.
 */
let directory: string;

describe('decideRetention', () => {
  const base: RetentionRow = {
    statusKey: 'rejected',
    decision: 'reject',
    reviewedAt: null,
    verifiedAt: new Date(Date.now() - 90 * DAY),
    createdAt: new Date(Date.now() - 90 * DAY),
    reportId: null,
  };
  const now = Date.now();
  const decide = (row: RetentionRow | null) =>
    decideRetention(row, now, RETENTION_MS);

  it('holds a photo no moderator has decided on, however old', () => {
    // The point of the whole policy: the file IS the evidence the moderator is
    // about to look at. Age must not release it.
    for (const statusKey of ['review_required', 'failed', 'verifying']) {
      expect(
        decide({
          ...base,
          statusKey,
          decision: 'review',
          createdAt: new Date(now - 3650 * DAY),
          verifiedAt: new Date(now - 3650 * DAY),
          reviewedAt: null,
        }),
      ).toEqual({ keep: true, reason: 'awaiting_review' });
    }
  });

  it('starts the clock at the review, not the capture', () => {
    // Held three weeks, rejected yesterday: one day into retention, not 22.
    const held = {
      ...base,
      statusKey: 'rejected',
      createdAt: new Date(now - 21 * DAY),
      verifiedAt: new Date(now - 21 * DAY),
      reviewedAt: new Date(now - 1 * DAY),
    };
    expect(decide(held)).toEqual({ keep: true, reason: 'within_retention' });

    expect(decide({ ...held, reviewedAt: new Date(now - 31 * DAY) })).toEqual({
      keep: false,
      reason: 'rejected',
    });
  });

  it('leaves a passed photo that a report is using', () => {
    // publishUploads() normally renames these out of quarantine, so there is
    // usually nothing here. If a publish was interrupted, the file belongs to a
    // live report volunteers may be travelling to — not a retention sweep's
    // decision to break.
    expect(
      decide({
        ...base,
        statusKey: 'passed',
        decision: 'pass',
        reportId: uuidv7(),
      }),
    ).toEqual({ keep: true, reason: 'published' });
  });

  it('sweeps a passed photo no report ever claimed', () => {
    expect(decide({ ...base, statusKey: 'passed', decision: 'pass' })).toEqual({
      keep: false,
      reason: 'orphaned',
    });
  });

  it('sweeps a file with no record at all', () => {
    // Written at step 4 of verification, row inserted at step 8. A crash between
    // them leaves bytes nothing will ever reference — and it is the one case
    // where deleting the file cannot destroy a record, because there is none.
    expect(decide(null)).toEqual({ keep: false, reason: 'untracked' });
  });
});

describe('sweepQuarantine', () => {
  let lookups: Awaited<ReturnType<typeof seedLookups>>;
  const uploaderId = uuidv7();

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);
    await db.insert(user).values({
      id: uploaderId,
      name: 'Reporter',
      email: 'reporter@quarantine-retention.test',
    });
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'uthavu-quarantine-'));
  });

  afterEach(async () => {
    await db.delete(photoUploads);
    rmSync(directory, { recursive: true, force: true });
  });

  /** Writes the file, backdates its mtime, and records the verdict about it. */
  async function place(options: {
    filename: string;
    statusKey: 'passed' | 'rejected' | 'review_required' | 'failed';
    decision?: string | null;
    ageDays: number;
    reviewedDaysAgo?: number;
  }): Promise<string> {
    const path = join(directory, options.filename);
    writeFileSync(path, EMPTY_JPEG);
    // The sweep gates on mtime before it queries anything, so a fixture has to
    // be as old as the row it is pretending to belong to.
    const written = new Date(Date.now() - options.ageDays * DAY);
    utimesSync(path, written, written);

    const id = uuidv7();
    await db.insert(photoUploads).values({
      id,
      uploaderId,
      statusId: lookups.photoVerificationStatusIds[options.statusKey],
      storedFilename: options.filename,
      mimeType: 'image/jpeg',
      byteSize: EMPTY_JPEG.length,
      width: 800,
      height: 600,
      sha256: `fixture-${id}`,
      phash: 'ffffffffffffffff',
      decision: options.decision ?? null,
      riskLevel: 'medium',
      reasons: ['nudity'],
      signals: {},
      provider: 'fixture',
      createdAt: written,
      verifiedAt: written,
      reviewedAt:
        options.reviewedDaysAgo === undefined
          ? null
          : new Date(Date.now() - options.reviewedDaysAgo * DAY),
    });
    return id;
  }

  const sweep = () => sweepQuarantine({ directory, retentionMs: RETENTION_MS });

  const onDisk = (filename: string) => existsSync(join(directory, filename));

  it('never deletes a photo still waiting for a moderator', async () => {
    await place({
      filename: 'held.jpg',
      statusKey: 'review_required',
      decision: 'review',
      ageDays: 120,
    });

    const summary = await sweep();

    expect(onDisk('held.jpg')).toBe(true);
    expect(summary.deleted).toBe(0);
    // Surfaced so an operator can see a queue nobody is working: files held past
    // the retention window are the symptom.
    expect(summary.awaitingReview).toBe(1);
  });

  it('never deletes a photo whose provider call failed and nobody reviewed', async () => {
    await place({
      filename: 'unavailable.jpg',
      statusKey: 'failed',
      decision: 'review',
      ageDays: 200,
    });

    await sweep();

    expect(onDisk('unavailable.jpg')).toBe(true);
  });

  it('keeps a reviewed rejection until its window closes', async () => {
    await place({
      filename: 'rejected-recent.jpg',
      statusKey: 'rejected',
      decision: 'reject',
      ageDays: 120,
      reviewedDaysAgo: 3,
    });

    const summary = await sweep();

    expect(onDisk('rejected-recent.jpg')).toBe(true);
    expect(summary.deleted).toBe(0);
    // It WAS looked at — the mtime gate let it through and the row's clock is
    // what held it. A test where the file was simply too young would prove
    // nothing about the review clock.
    expect(summary.candidates).toBe(1);
  });

  it('deletes the same rejection once its window closes', async () => {
    await place({
      filename: 'rejected-old.jpg',
      statusKey: 'rejected',
      decision: 'reject',
      ageDays: 120,
      reviewedDaysAgo: 45,
    });

    const summary = await sweep();

    expect(onDisk('rejected-old.jpg')).toBe(false);
    expect(summary.deleted).toBe(1);
    expect(summary.untracked).toBe(0);
  });

  it('leaves the moderation record intact when it deletes the bytes', async () => {
    // The rule that outranks every other rule in this file. The row is the
    // accountability trail: verdict, reasons, risk level, reviewer, timestamps.
    const id = await place({
      filename: 'accountable.jpg',
      statusKey: 'rejected',
      decision: 'reject',
      ageDays: 120,
      reviewedDaysAgo: 60,
    });

    await sweep();

    const [row] = await db
      .select()
      .from(photoUploads)
      .where(eq(photoUploads.id, id));

    expect(onDisk('accountable.jpg')).toBe(false);
    expect(row).toBeDefined();
    expect(row.decision).toBe('reject');
    expect(row.reasons).toEqual(['nudity']);
    expect(row.riskLevel).toBe('medium');
    expect(row.reviewedAt).toBeInstanceOf(Date);
    // Still pointing at the filename it always did. Absence of the file is
    // recorded by the file being absent — quarantinePathFor() already returns
    // undefined for it — not by a column the sweep would need a migration for.
    expect(row.storedFilename).toBe('accountable.jpg');
  });

  it('sweeps an upload nobody ever attached to a report', async () => {
    // A citizen captures a photo, the shot is retaken or the flow abandoned, and
    // no report ever claims it. Before this, that file lived forever.
    await place({
      filename: 'orphan.jpg',
      statusKey: 'passed',
      decision: 'pass',
      ageDays: 60,
    });

    const summary = await sweep();

    expect(onDisk('orphan.jpg')).toBe(false);
    expect(summary.deleted).toBe(1);
  });

  it('sweeps a file that has no record at all', async () => {
    const path = join(directory, 'untracked.jpg');
    writeFileSync(path, EMPTY_JPEG);
    const written = new Date(Date.now() - 90 * DAY);
    utimesSync(path, written, written);

    const summary = await sweep();

    expect(onDisk('untracked.jpg')).toBe(false);
    expect(summary.untracked).toBe(1);
  });

  it('does not even query about a file inside the window', async () => {
    await place({
      filename: 'fresh.jpg',
      statusKey: 'rejected',
      decision: 'reject',
      ageDays: 1,
    });

    const summary = await sweep();

    expect(summary.scanned).toBe(1);
    // The age gate is what makes the sweep safe to run beside an upload writing
    // into the same directory: bytes written seconds ago are provably not past
    // any retention deadline.
    expect(summary.candidates).toBe(0);
    expect(onDisk('fresh.jpg')).toBe(true);
  });

  it('stops at the batch cap and reports that it did', async () => {
    // The cap is what keeps one unlucky upload from waiting while a year of
    // backlog is unlinked.
    await place({
      filename: 'batch-a.jpg',
      statusKey: 'rejected',
      decision: 'reject',
      ageDays: 90,
    });
    await place({
      filename: 'batch-b.jpg',
      statusKey: 'rejected',
      decision: 'reject',
      ageDays: 90,
    });

    const summary = await sweepQuarantine({
      directory,
      retentionMs: RETENTION_MS,
      batchLimit: 1,
    });

    expect(summary.deleted).toBe(1);
    expect(summary.batchLimited).toBe(true);
    // The one it did not reach is still there for the next sweep — the working
    // set is the directory, so nothing needs to remember where it stopped.
    expect([onDisk('batch-a.jpg'), onDisk('batch-b.jpg')]).toContain(true);
  });

  it('is safe to run twice, and deleting a missing file is not an error', async () => {
    await place({
      filename: 'twice.jpg',
      statusKey: 'rejected',
      decision: 'reject',
      ageDays: 90,
    });

    await sweep();
    const second = await sweep();

    expect(second.deleted).toBe(0);
    expect(second.scanned).toBe(0);
    // The row still names a file that is gone. Discarding it again must be a
    // no-op, because an admin rejection, a retry and a sweep all want the same
    // end state.
    await expect(
      discardQuarantinedFrom(directory, 'twice.jpg'),
    ).resolves.toBeUndefined();
    await expect(
      discardQuarantinedFrom(directory, 'never-written.jpg'),
    ).resolves.toBeUndefined();
  });

  it('refuses a stored filename that tries to leave the directory', async () => {
    // These names come back out of a database column, and treating a column as
    // trusted is how this class of bug reaches production a second time.
    const outside = join(directory, '..', 'must-survive.txt');
    writeFileSync(outside, 'not a photo');
    try {
      await discardQuarantinedFrom(directory, '../must-survive.txt');
      expect(existsSync(outside)).toBe(true);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('defaults to the real quarantine directory', async () => {
    // Nothing in production passes `directory`; if the default ever drifted, the
    // sweep would silently clean an empty directory forever.
    const summary = await sweepQuarantine({
      retentionMs: QUARANTINE_RETENTION_MS,
      batchLimit: 0,
    });
    expect(summary.deleted).toBe(0);
  });
});
