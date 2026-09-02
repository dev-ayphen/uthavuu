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
  url.pathname = '/uthavu_sponsors_feed_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import {
  sponsorCreativeTypes,
  sponsorPlacements,
  sponsorStatuses,
  sponsors,
} from '../db/schema/sponsors-schema';
import type { SponsorPlacementKey } from '../db/schema/sponsors-schema';
import { createSpecDatabase } from '../admin/testing/admin-spec-db';
import { SponsorsService } from './sponsors.service';
import {
  effectiveSponsorStatusOf,
  effectiveSponsorStatusSql,
  sponsorIsLiveSql,
} from './sponsor-status';

const DATABASE = 'uthavu_sponsors_feed_test';
const HOUR = 60 * 60 * 1000;

/**
 * The citizen feed, which is a query with five conditions on it. Each of the
 * five hides a sponsor for a different reason, and getting any one of them
 * backwards either runs a paused campaign somebody stopped paying for or
 * silently hides one they did. So each is asserted on its own row rather than
 * inferred from a single mixed fixture.
 */
describe('SponsorsService', () => {
  const service = new SponsorsService();
  const statusIds: Record<string, string> = {};
  const creativeTypeIds: Record<string, string> = {};

  const insert = async (values: {
    name: string;
    status?: 'draft' | 'active' | 'paused';
    creativeType?: 'video' | 'banner' | 'logo_text';
    creativeUrl?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    deletedAt?: Date | null;
    placements?: SponsorPlacementKey[];
  }) => {
    const id = uuidv7();
    await db.insert(sponsors).values({
      id,
      name: values.name,
      creativeTypeId: creativeTypeIds[values.creativeType ?? 'logo_text'],
      creativeUrl: values.creativeUrl ?? null,
      statusId: statusIds[values.status ?? 'active'],
      startDate: values.startDate ?? null,
      endDate: values.endDate ?? null,
      deletedAt: values.deletedAt ?? null,
    });
    const placements = values.placements ?? ['home'];
    if (placements.length > 0) {
      await db.insert(sponsorPlacements).values(
        placements.map((placementKey) => ({
          id: uuidv7(),
          sponsorId: id,
          placementKey,
        })),
      );
    }
    return id;
  };

  const namesOn = async (placement: SponsorPlacementKey) =>
    (await service.list(placement)).items.map((i) => i.name);

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);

    for (const status of [
      { key: 'active', label: 'Active', sortOrder: 10 },
      { key: 'scheduled', label: 'Scheduled', sortOrder: 20 },
      { key: 'paused', label: 'Paused', sortOrder: 30 },
      { key: 'expired', label: 'Expired', sortOrder: 40 },
      { key: 'draft', label: 'Draft', sortOrder: 50 },
    ]) {
      const id = uuidv7();
      statusIds[status.key] = id;
      await db.insert(sponsorStatuses).values({ id, ...status });
    }
    for (const type of [
      { key: 'video', label: 'Video', sortOrder: 10 },
      { key: 'banner', label: 'Banner', sortOrder: 20 },
      { key: 'logo_text', label: 'Logo & text', sortOrder: 30 },
    ]) {
      const id = uuidv7();
      creativeTypeIds[type.key] = id;
      await db.insert(sponsorCreativeTypes).values({ id, ...type });
    }
  });

  afterAll(async () => {
    await db.$client.end();
  });

  afterEach(async () => {
    await db.delete(sponsorPlacements);
    await db.delete(sponsors);
  });

  it('returns an active sponsor with no campaign window at all', async () => {
    await insert({ name: 'Always on' });
    expect(await namesOn('home')).toEqual(['Always on']);
  });

  // §4: "Pausing changes nothing" was a prototype failure. It changes something
  // here, and this is the assertion that says so.
  it('hides a paused sponsor, and a draft', async () => {
    await insert({ name: 'Paused', status: 'paused' });
    await insert({ name: 'Draft', status: 'draft' });
    await insert({ name: 'Live' });
    expect(await namesOn('home')).toEqual(['Live']);
  });

  it('hides a soft-deleted sponsor even while its status is active', async () => {
    await insert({ name: 'Deleted', deletedAt: new Date() });
    expect(await namesOn('home')).toEqual([]);
  });

  // §4: "Campaigns can't start or expire". Both directions, on their own rows.
  it('respects the campaign window in both directions', async () => {
    await insert({
      name: 'Next month',
      startDate: new Date(Date.now() + 24 * HOUR),
    });
    await insert({
      name: 'Started yesterday',
      startDate: new Date(Date.now() - 24 * HOUR),
    });
    expect(await namesOn('home')).toEqual(['Started yesterday']);
  });

  it('respects the end date, and treats a null end as never expiring', async () => {
    await insert({ name: 'Ended', endDate: new Date(Date.now() - HOUR) });
    await insert({ name: 'Runs on', endDate: null });
    await insert({ name: 'Ends later', endDate: new Date(Date.now() + HOUR) });
    expect((await namesOn('home')).sort()).toEqual(['Ends later', 'Runs on']);
  });

  it('filters by placement, and one sponsor can hold several', async () => {
    await insert({ name: 'Home only', placements: ['home'] });
    await insert({ name: 'Stories only', placements: ['impact_stories'] });
    await insert({
      name: 'Both',
      placements: ['home', 'impact_stories', 'category_list'],
    });

    expect((await namesOn('home')).sort()).toEqual(['Both', 'Home only']);
    expect((await namesOn('impact_stories')).sort()).toEqual([
      'Both',
      'Stories only',
    ]);
    expect(await namesOn('category_list')).toEqual(['Both']);
    expect(await namesOn('community_impact')).toEqual([]);
  });

  it('returns one row per sponsor even when it holds several placements', async () => {
    await insert({ name: 'Multi', placements: ['home', 'impact_stories'] });
    expect(await namesOn('home')).toEqual(['Multi']);
  });

  it('returns exactly the seven citizen fields — no status, dates or counters', async () => {
    await insert({
      name: 'ABC Foods',
      creativeType: 'video',
      creativeUrl: 'https://cdn.example.com/a.mp4',
    });

    const [item] = (await service.list('home')).items;
    expect(Object.keys(item).sort()).toEqual([
      'creativeType',
      'creativeUrl',
      'description',
      'id',
      'logoUrl',
      'name',
      'website',
    ]);
    // A bare key, not { key, label } — the mobile card switches on it.
    expect(item.creativeType).toBe('video');
  });

  /**
   * THE INVARIANT THAT TIES THE TWO SURFACES TOGETHER.
   *
   * sponsor-status.ts claims a sponsor is on a citizen's screen exactly when
   * its effective status is 'active'. Three implementations of that one
   * sentence exist — the citizen predicate, the SQL CASE the console reads, and
   * the TypeScript twin — and drift between them is invisible in production:
   * the console would say "Active" while the app showed nothing. This asserts
   * all three agree across every combination that matters.
   */
  it('keeps the citizen filter, the SQL derivation and the TS twin in agreement', async () => {
    const past = () => new Date(Date.now() - HOUR);
    const future = () => new Date(Date.now() + HOUR);

    const cases = [
      {
        status: 'active' as const,
        startDate: null,
        endDate: null,
        expect: 'active',
      },
      {
        status: 'active' as const,
        startDate: past(),
        endDate: future(),
        expect: 'active',
      },
      {
        status: 'active' as const,
        startDate: future(),
        endDate: null,
        expect: 'scheduled',
      },
      {
        status: 'active' as const,
        startDate: null,
        endDate: past(),
        expect: 'expired',
      },
      {
        status: 'active' as const,
        startDate: past(),
        endDate: past(),
        expect: 'expired',
      },
      {
        status: 'paused' as const,
        startDate: null,
        endDate: null,
        expect: 'paused',
      },
      // A paused campaign whose end date has since gone by is PAUSED, not
      // expired — somebody stopped it, and relabelling erases that decision.
      {
        status: 'paused' as const,
        startDate: past(),
        endDate: past(),
        expect: 'paused',
      },
      {
        status: 'draft' as const,
        startDate: null,
        endDate: null,
        expect: 'draft',
      },
      {
        status: 'draft' as const,
        startDate: past(),
        endDate: past(),
        expect: 'draft',
      },
    ];

    for (const c of cases) {
      await db.delete(sponsorPlacements);
      await db.delete(sponsors);
      await insert({
        name: c.expect,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
      });

      const [row] = await db
        .select({
          derived: effectiveSponsorStatusSql,
          live: sql<boolean>`(${sponsorIsLiveSql})`,
          storedStatusKey: sponsorStatuses.key,
          startDate: sponsors.startDate,
          endDate: sponsors.endDate,
        })
        .from(sponsors)
        .innerJoin(
          sponsorStatuses,
          sql`${sponsors.statusId} = ${sponsorStatuses.id}`,
        );

      // 1. SQL derivation matches the expectation.
      expect(row.derived).toBe(c.expect);
      // 2. The TypeScript twin agrees with the SQL.
      expect(effectiveSponsorStatusOf(row)).toBe(row.derived);
      // 3. Visible to citizens  <=>  effective status is 'active'.
      expect(row.live).toBe(c.expect === 'active');
      expect((await namesOn('home')).length > 0).toBe(c.expect === 'active');
    }
  });
});
