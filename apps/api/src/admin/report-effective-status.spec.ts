import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_effective_status_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportStatuses, reports } from '../db/schema/reports-schema';
import {
  effectiveStatusOf,
  effectiveStatusSql,
} from './report-effective-status';
import { createSpecDatabase, seedLookups } from './testing/admin-spec-db';

const DATABASE = 'uthavu_effective_status_test';

/**
 * The whole point of this file: `status='expired'` is seeded and nothing ever
 * writes it, so any admin surface trusting `status_id` is wrong. These tests pin
 * the derivation, and — more importantly — pin that the SQL and the TypeScript
 * implementation of the same rule agree, since having two is the risk.
 */
describe('report effective status', () => {
  let lookups: Awaited<ReturnType<typeof seedLookups>>;
  const reporterId = uuidv7();

  const HOUR = 60 * 60 * 1000;
  const past = () => new Date(Date.now() - HOUR);
  const future = () => new Date(Date.now() + HOUR);

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);
    await db.insert(user).values({
      id: reporterId,
      name: 'Reporter',
      email: 'reporter@test.local',
    });
  });

  afterAll(async () => {
    await db.$client.end();
  });

  afterEach(async () => {
    await db.delete(reports);
  });

  async function insert(opts: {
    storedStatus: 'open' | 'closed' | 'completed' | 'expired';
    expiryAt: Date;
    deletedAt?: Date | null;
  }) {
    const id = uuidv7();
    await db.insert(reports).values({
      id,
      reporterId,
      categoryId: lookups.categoryIds.medicalHelp,
      statusId: lookups.reportStatusIds[opts.storedStatus],
      title: `fixture ${opts.storedStatus}`,
      description: 'fixture',
      lat: 13.08,
      lng: 80.27,
      expiryAt: opts.expiryAt,
      deletedAt: opts.deletedAt ?? null,
    });
    return id;
  }

  async function derivedInSql(id: string) {
    const [row] = await db
      .select({ status: effectiveStatusSql })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .where(eq(reports.id, id));
    return row.status;
  }

  const cases: Array<{
    name: string;
    stored: 'open' | 'closed' | 'completed' | 'expired';
    expiryAt: () => Date;
    deleted: boolean;
    expected: string;
  }> = [
    {
      name: 'open and still in date',
      stored: 'open',
      expiryAt: future,
      deleted: false,
      expected: 'open',
    },
    {
      name: 'open but past expiry',
      stored: 'open',
      expiryAt: past,
      deleted: false,
      expected: 'expired',
    },
    {
      name: 'closed, in date',
      stored: 'closed',
      expiryAt: future,
      deleted: false,
      expected: 'closed',
    },
    {
      name: 'closed, past expiry',
      stored: 'closed',
      expiryAt: past,
      deleted: false,
      expected: 'closed',
    },
    {
      name: 'completed, in date',
      stored: 'completed',
      expiryAt: future,
      deleted: false,
      expected: 'completed',
    },
    // The case that matters most in this database: 23 of 23 completions are
    // past expiry. Calling them "expired" would report every success as a
    // failure.
    {
      name: 'completed, past expiry',
      stored: 'completed',
      expiryAt: past,
      deleted: false,
      expected: 'completed',
    },
    {
      name: 'soft-deleted beats open',
      stored: 'open',
      expiryAt: future,
      deleted: true,
      expected: 'deleted',
    },
    {
      name: 'soft-deleted beats expired',
      stored: 'open',
      expiryAt: past,
      deleted: true,
      expected: 'deleted',
    },
    {
      name: 'soft-deleted beats completed',
      stored: 'completed',
      expiryAt: past,
      deleted: true,
      expected: 'deleted',
    },
  ];

  it.each(cases)('$name -> $expected, in SQL and in TypeScript', async (c) => {
    const expiryAt = c.expiryAt();
    const id = await insert({
      storedStatus: c.stored,
      expiryAt,
      deletedAt: c.deleted ? new Date() : null,
    });

    expect(await derivedInSql(id)).toBe(c.expected);
    expect(
      effectiveStatusOf({
        storedStatusKey: c.stored,
        expiryAt,
        deletedAt: c.deleted ? new Date() : null,
      }),
    ).toBe(c.expected);
  });

  it('never returns the stored value for a past-expiry open report', async () => {
    // Restates the measured production problem as an assertion: an admin
    // surface reading status_id would call this "open".
    const id = await insert({ storedStatus: 'open', expiryAt: past() });

    const [row] = await db
      .select({ stored: reportStatuses.key, derived: effectiveStatusSql })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .where(eq(reports.id, id));

    expect(row.stored).toBe('open');
    expect(row.derived).toBe('expired');
  });
});
