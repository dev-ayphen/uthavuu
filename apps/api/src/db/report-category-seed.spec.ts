import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('./index', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_category_seed_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from './index';
import { reportCategories } from './schema/reports-schema';
import { createSpecDatabase } from '../admin/testing/admin-spec-db';
import {
  CATEGORIES,
  REPORT_CATEGORY_COUNT,
  seedReportCategories,
} from './seed-report-categories';

const DATABASE = 'uthavu_category_seed_test';

/**
 * Open question #7, decided: seeding `report_categories` is INSERT-ONLY.
 *
 * The behaviour under test is the one that used to lose an operator's work — not
 * the SQL, but the sequence a real person hits: edit a category in the console,
 * someone runs `pnpm db:seed` for an unrelated reason, and the edit is either
 * still there or it is not. So these cases seed, edit, and seed again.
 *
 * `seed.ts` itself cannot be imported (it ends in `process.exit(0)`), which is
 * exactly why the category block was extracted into its own module — the policy
 * that matters most is the one the test can actually run.
 */
describe('report category seeding is insert-only', () => {
  const categoryByKey = async (key: string) => {
    const [row] = await db
      .select()
      .from(reportCategories)
      .where(eq(reportCategories.key, key));
    return row;
  };

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(async () => {
    await db.delete(reportCategories);
  });

  it('creates every category on a fresh database', async () => {
    const { created } = await seedReportCategories();

    expect(created).toBe(REPORT_CATEGORY_COUNT);
    expect(await db.select().from(reportCategories)).toHaveLength(
      REPORT_CATEGORY_COUNT,
    );
  });

  it("preserves an admin's edits across a re-seed — the whole point", async () => {
    await seedReportCategories();

    // Exactly what Platform -> Categories writes: the four operator-owned
    // fields. Under the old `onConflictDoUpdate` all four were reverted here.
    await db
      .update(reportCategories)
      .set({
        label: 'Medical Assistance',
        emoji: '🩺',
        defaultExpiryMinutes: 45,
        citizenSelectable: false,
      })
      .where(eq(reportCategories.key, 'medicalHelp'));

    const { created } = await seedReportCategories();

    expect(created).toBe(0);
    expect(await categoryByKey('medicalHelp')).toMatchObject({
      label: 'Medical Assistance',
      emoji: '🩺',
      defaultExpiryMinutes: 45,
      citizenSelectable: false,
    });
  });

  it('survives many re-seeds, not just the first one', async () => {
    await seedReportCategories();
    await db
      .update(reportCategories)
      .set({ label: 'Renamed Once' })
      .where(eq(reportCategories.key, 'animalRescue'));

    for (let run = 0; run < 3; run += 1) {
      await expect(seedReportCategories()).resolves.toEqual({ created: 0 });
    }

    expect((await categoryByKey('animalRescue')).label).toBe('Renamed Once');
  });

  it('still creates a category that is genuinely missing', async () => {
    await seedReportCategories();
    await db
      .delete(reportCategories)
      .where(eq(reportCategories.key, 'lostAndFound'));

    const { created } = await seedReportCategories();

    // Insert-only is not "do nothing" — a new environment, or a category added
    // to the seed in a later release, must still arrive.
    expect(created).toBe(1);
    expect(await categoryByKey('lostAndFound')).toBeDefined();
  });

  it('never duplicates a key, however many times it runs', async () => {
    await seedReportCategories();
    await seedReportCategories();
    await seedReportCategories();

    const rows = await db.select().from(reportCategories);
    const keys = rows.map((r) => r.key);

    expect(rows).toHaveLength(REPORT_CATEGORY_COUNT);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('leaves a category an admin created entirely alone', async () => {
    await seedReportCategories();
    await db.insert(reportCategories).values({
      id: uuidv7(),
      key: 'floodRescue',
      label: 'Flood Rescue',
      emoji: '🌊',
      defaultExpiryMinutes: 90,
      citizenSelectable: true,
    });

    await seedReportCategories();

    // The seed only knows its own keys, so a console-created category was never
    // at risk from the old upsert either — asserted so that stays true.
    expect(await categoryByKey('floodRescue')).toMatchObject({
      label: 'Flood Rescue',
      defaultExpiryMinutes: 90,
    });
  });

  it('seeds expected_labels on INSERT, and only on insert', async () => {
    await seedReportCategories();

    // Populated on creation, from the seed's own data...
    expect((await categoryByKey('medicalHelp')).expectedLabels).toEqual(
      expect.arrayContaining(['Person', 'Hospital']),
    );

    // ...and NOT repaired afterwards. This is the documented cost of
    // insert-only: backfilling a column onto existing rows is a migration's job,
    // not a seed's. Asserted so the limitation is discovered here rather than by
    // someone assuming a re-seed will fix a NULL.
    await db
      .update(reportCategories)
      .set({ expectedLabels: null })
      .where(eq(reportCategories.key, 'medicalHelp'));

    await seedReportCategories();

    expect((await categoryByKey('medicalHelp')).expectedLabels).toBeNull();
  });

  it('keeps the two categories that must have no expected labels at NULL', async () => {
    await seedReportCategories();

    // communityHelp has no characteristic imagery and disasterRelief is
    // admin-only; a relevance rule on either would hold legitimate reports.
    // NULL means "skip the check" and is a real answer, not a gap.
    expect((await categoryByKey('communityHelp')).expectedLabels).toBeNull();
    expect((await categoryByKey('disasterRelief')).expectedLabels).toBeNull();
  });

  it('defines exactly one non-citizen-selectable category (BR-3)', () => {
    const adminOnly = CATEGORIES.filter((c) => !c.citizenSelectable);

    expect(adminOnly.map((c) => c.key)).toEqual(['disasterRelief']);
    // The last-remaining guard is phrased over citizen-selectable rows precisely
    // because this row exists — a table-is-empty rule would let all eight
    // citizen categories be deleted while this one kept the table non-empty.
    expect(CATEGORIES.filter((c) => c.citizenSelectable)).toHaveLength(8);
  });
});
