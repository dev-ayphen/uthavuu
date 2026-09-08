import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { sql } from 'drizzle-orm';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_category_order_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { reportCategories } from '../db/schema/reports-schema';
import { AdminAuditService } from '../admin/admin-audit.service';
import { AdminCategoriesService } from '../admin/admin-categories.service';
import {
  createSpecDatabase,
  seedLookups,
} from '../admin/testing/admin-spec-db';
import { AlertsService } from '../alerts/alerts.service';
import { MissionsService } from '../missions/missions.service';
import { ReportsService } from './reports.service';
import { CATEGORY_SORT_COLLATION } from './report-category-order';

const DATABASE = 'uthavu_category_order_test';

/**
 * The bug this file exists to keep fixed.
 *
 * `GET /reports/categories` (mobile) and `GET /admin/report-categories`
 * (console) read the same table and used to disagree about its order: the first
 * had no ORDER BY at all, the second sorted by `key`. So the citizen grid and the
 * admin table listed the same nine categories differently, and the citizen grid
 * additionally RESHUFFLED whenever a category was edited, because a row Postgres
 * updates is rewritten at the end of the heap.
 *
 * Both now import one expression from report-category-order.ts. This suite
 * asserts the property that actually matters — the two endpoints produce the
 * same sequence — rather than asserting each one's ORDER BY separately, which
 * two matching-but-independent clauses would also satisfy right up until
 * somebody changed one of them.
 */
describe('report category ordering', () => {
  let reportsService: ReportsService;
  let adminService: AdminCategoriesService;

  /** The citizen endpoint's keys, in the order it returns them. */
  const citizenOrder = async () =>
    (await reportsService.listCategories()).map((c) => c.key);

  /**
   * The admin endpoint's keys, narrowed to the rows the citizen endpoint can
   * see. The admin list also carries `disasterRelief` (citizenSelectable:
   * false) — that difference in MEMBERSHIP is intended and documented; the
   * ORDER of the shared rows is what must match.
   */
  const adminOrderOfCitizenRows = async () =>
    (await adminService.list())
      .filter((row) => row.citizenSelectable)
      .map((row) => row.key);

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    await seedLookups(db);

    reportsService = new ReportsService(
      new MissionsService(new AlertsService()),
      new AlertsService(),
    );
    adminService = new AdminCategoriesService(new AdminAuditService());
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it('provides the ICU collation both endpoints depend on', async () => {
    // report-category-order.ts pins an explicit collation, which is a dependency
    // on the SERVER: a Postgres built without ICU would fail both endpoints with
    // SQLSTATE 42704 rather than merely sorting them oddly. Asserting it here
    // turns "a citizen's request 500s" into "a test run fails".
    const [row] = await db.execute<{ exists: boolean }>(
      sql`select exists (
            select 1 from pg_collation where collname = ${CATEGORY_SORT_COLLATION}
          ) as exists`,
    );

    expect(row.exists).toBe(true);
  });

  it('returns the citizen categories in the same order on both endpoints', async () => {
    // Labels chosen so that several plausible orderings disagree:
    //   by key            -> aardvark, mSecond, zFirst
    //   by byte order     -> "Blood", "Zebra", "animal"  (lowercase last)
    //   by label + ICU    -> "animal", "Blood", "Zebra"
    await db.delete(reportCategories);
    await db.insert(reportCategories).values([
      {
        id: uuidv7(),
        key: 'zFirst',
        label: 'animal rescue',
        emoji: '🐶',
        defaultExpiryMinutes: 720,
        citizenSelectable: true,
      },
      {
        id: uuidv7(),
        key: 'aardvark',
        label: 'Zebra Rescue',
        emoji: '🦓',
        defaultExpiryMinutes: 720,
        citizenSelectable: true,
      },
      {
        id: uuidv7(),
        key: 'mSecond',
        label: 'Blood Donation',
        emoji: '🩸',
        defaultExpiryMinutes: 240,
        citizenSelectable: true,
      },
      {
        id: uuidv7(),
        key: 'hidden',
        label: 'Disaster Relief',
        emoji: '🚨',
        defaultExpiryMinutes: 1440,
        citizenSelectable: false,
      },
    ]);

    const citizen = await citizenOrder();

    expect(citizen).toEqual(['zFirst', 'mSecond', 'aardvark']);
    expect(await adminOrderOfCitizenRows()).toEqual(citizen);
  });

  it('still agrees after a category is edited', async () => {
    // The regression that started all of this. An UPDATE moves the row to the
    // end of the heap, so the un-ordered query used to return a different
    // sequence from this point on while the admin's stayed put.
    await db
      .update(reportCategories)
      .set({ label: 'Blood Donation (updated)', updatedAt: sql`now()` })
      .where(sql`${reportCategories.key} = 'mSecond'`);

    const citizen = await citizenOrder();

    expect(citizen).toEqual(['zFirst', 'mSecond', 'aardvark']);
    expect(await adminOrderOfCitizenRows()).toEqual(citizen);
  });

  it('agrees on Tamil labels too', async () => {
    // The mobile surface ships English + Tamil, so a Tamil label is a real
    // possibility rather than a curiosity. அ sorts before உ in Tamil, and both
    // sort after Latin under the ICU root collation.
    await db.delete(reportCategories);
    await db.insert(reportCategories).values([
      {
        id: uuidv7(),
        key: 'tamilSecond',
        label: 'உதவி',
        emoji: '🤝',
        defaultExpiryMinutes: 720,
        citizenSelectable: true,
      },
      {
        id: uuidv7(),
        key: 'tamilFirst',
        label: 'அவசரம்',
        emoji: '🚨',
        defaultExpiryMinutes: 240,
        citizenSelectable: true,
      },
      {
        id: uuidv7(),
        key: 'latin',
        label: 'Medical Help',
        emoji: '❤️',
        defaultExpiryMinutes: 360,
        citizenSelectable: true,
      },
    ]);

    const citizen = await citizenOrder();

    expect(citizen).toEqual(['latin', 'tamilFirst', 'tamilSecond']);
    expect(await adminOrderOfCitizenRows()).toEqual(citizen);
  });

  it('breaks a tie on duplicate labels the same way for both', async () => {
    // `label` carries no unique constraint, so this is reachable. Without the
    // `key` tiebreaker in the shared expression the two endpoints could each
    // pick a different order for these two rows.
    await db.delete(reportCategories);
    await db.insert(reportCategories).values([
      {
        id: uuidv7(),
        key: 'bravo',
        label: 'Medical Help',
        emoji: '❤️',
        defaultExpiryMinutes: 360,
        citizenSelectable: true,
      },
      {
        id: uuidv7(),
        key: 'alpha',
        label: 'Medical Help',
        emoji: '🩺',
        defaultExpiryMinutes: 360,
        citizenSelectable: true,
      },
    ]);

    const citizen = await citizenOrder();

    expect(citizen).toEqual(['alpha', 'bravo']);
    expect(await adminOrderOfCitizenRows()).toEqual(citizen);
  });

  it('returns an empty list rather than inventing one when nothing is selectable', async () => {
    // The state the mobile fallback bug used to hide: a SUCCESSFUL response with
    // no rows. It is a legitimate answer from this endpoint, and
    // libs-mobile/data/category-state.ts is what makes the app render it
    // honestly instead of substituting eight bundled tiles.
    await db.delete(reportCategories);
    await db.insert(reportCategories).values({
      id: uuidv7(),
      key: 'adminOnly',
      label: 'Disaster Relief',
      emoji: '🚨',
      defaultExpiryMinutes: 1440,
      citizenSelectable: false,
    });

    expect(await reportsService.listCategories()).toEqual([]);
    // The admin still sees it — that asymmetry is the reason both endpoints
    // exist.
    expect((await adminService.list()).map((r) => r.key)).toEqual([
      'adminOnly',
    ]);
  });
});
