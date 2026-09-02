import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin-spec-db.ts: the factory is hoisted above the imports, so the
// database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_sponsors_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminAuditActions, adminAuditLogs } from '../db/schema/audit-schema';
import {
  sponsorCreativeTypes,
  sponsorPlacements,
  sponsorStatuses,
  sponsors,
} from '../db/schema/sponsors-schema';
import { AdminAuditService } from './admin-audit.service';
import { AdminSponsorsService } from './admin-sponsors.service';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_sponsors_test';
const META = { ipAddress: null, userAgent: null };
const HOUR = 60 * 60 * 1000;

/**
 * Seeded here rather than in the shared `seedLookups`: nothing else in the
 * admin surface reads these two lookups, and a shared helper that seeds every
 * table any spec might want is how that file stops being reviewable. Mirrors
 * db/seed.ts key-for-key.
 */
const STATUSES = [
  { key: 'active', label: 'Active', sortOrder: 10 },
  { key: 'scheduled', label: 'Scheduled', sortOrder: 20 },
  { key: 'paused', label: 'Paused', sortOrder: 30 },
  { key: 'expired', label: 'Expired', sortOrder: 40 },
  { key: 'draft', label: 'Draft', sortOrder: 50 },
] as const;

const CREATIVE_TYPES = [
  { key: 'video', label: 'Video', sortOrder: 10 },
  { key: 'banner', label: 'Banner', sortOrder: 20 },
  { key: 'logo_text', label: 'Logo & text', sortOrder: 30 },
] as const;

describe('AdminSponsorsService', () => {
  let service: AdminSponsorsService;
  const adminId = uuidv7();
  const admin = fakeAdmin({
    userId: adminId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  const draft = (overrides: Record<string, unknown> = {}) =>
    service.create(
      admin,
      {
        name: 'ABC Foods',
        creativeType: 'logo_text',
        placements: ['home'],
        ...overrides,
      },
      META,
    );

  const auditRows = () =>
    db
      .select({
        actionKey: adminAuditActions.key,
        targetId: adminAuditLogs.targetId,
        targetLabel: adminAuditLogs.targetLabel,
        before: adminAuditLogs.before,
        after: adminAuditLogs.after,
        actorUserId: adminAuditLogs.actorUserId,
      })
      .from(adminAuditLogs)
      .innerJoin(
        adminAuditActions,
        eq(adminAuditLogs.actionId, adminAuditActions.id),
      );

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    await seedLookups(db);
    await db
      .insert(sponsorStatuses)
      .values(STATUSES.map((s) => ({ id: uuidv7(), ...s })));
    await db
      .insert(sponsorCreativeTypes)
      .values(CREATIVE_TYPES.map((c) => ({ id: uuidv7(), ...c })));
    await db.insert(user).values({
      id: adminId,
      name: 'Super Admin',
      email: 'admin@uthavu.org',
    });
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(() => {
    // A fresh instance per test: the service memoises lookup-key -> id.
    service = new AdminSponsorsService(new AdminAuditService());
  });

  afterEach(async () => {
    await db.delete(adminAuditLogs);
    await db.delete(sponsorPlacements);
    await db.delete(sponsors);
  });

  // ------------------------------------------------------------------ create

  it('creates as a draft with its placements, and audits it', async () => {
    const created = await draft({ placements: ['home', 'impact_stories'] });

    expect(created.status.key).toBe('draft');
    expect(created.status.label).toBe('Draft');
    expect(created.creativeType).toEqual({
      key: 'logo_text',
      label: 'Logo & text',
    });
    expect(created.placements).toEqual(['home', 'impact_stories']);

    const [row] = await auditRows();
    expect(row.actionKey).toBe('sponsor.create');
    expect(row.targetId).toBe(created.id);
    expect(row.targetLabel).toBe('ABC Foods');
    expect(row.actorUserId).toBe(adminId);
    expect(row.after).toMatchObject({
      name: 'ABC Foods',
      placements: ['home', 'impact_stories'],
    });
  });

  it('never creates straight into active — activation is its own audited act', async () => {
    const created = await draft();
    expect(created.status.key).toBe('draft');
    expect((await auditRows()).map((r) => r.actionKey)).toEqual([
      'sponsor.create',
    ]);
  });

  it('de-duplicates repeated placements rather than rejecting the request', async () => {
    const created = await service.create(
      admin,
      {
        name: 'Dupes',
        creativeType: 'logo_text',
        placements: ['home', 'home'],
      },
      META,
    );
    expect(created.placements).toEqual(['home']);
  });

  // ------------------------------------------------------------------ update

  it('audits only the fields that actually changed', async () => {
    const created = await draft({ name: 'Before', category: 'Food' });
    await db.delete(adminAuditLogs);

    const updated = await service.update(
      created.id,
      admin,
      { name: 'After', category: 'Food' },
      META,
    );

    expect(updated.name).toBe('After');
    const [row] = await auditRows();
    expect(row.actionKey).toBe('sponsor.update');
    // `category` was re-sent unchanged and must not appear in the diff.
    expect(row.before).toEqual({ name: 'Before' });
    expect(row.after).toEqual({ name: 'After' });
  });

  it('rejects a PATCH that changes nothing', async () => {
    const created = await draft({ name: 'Same' });
    await expect(
      service.update(created.id, admin, { name: 'Same' }, META),
    ).rejects.toMatchObject({ response: { code: 'NO_EFFECTIVE_CHANGE' } });
  });

  it('replaces the placement set, and treats reordering as no change', async () => {
    const created = await draft({ placements: ['home', 'impact_stories'] });

    // Same set, different order -> not a change.
    await expect(
      service.update(
        created.id,
        admin,
        { placements: ['impact_stories', 'home'] },
        META,
      ),
    ).rejects.toMatchObject({ response: { code: 'NO_EFFECTIVE_CHANGE' } });

    const updated = await service.update(
      created.id,
      admin,
      { placements: ['category_list'] },
      META,
    );
    expect(updated.placements).toEqual(['category_list']);
  });

  /**
   * The merged-value check. A PATCH carrying only `endDate` sails past the
   * DTO's refinement — which can only see the payload — while still landing an
   * end before the STORED start. This is the guard that catches it.
   */
  it('compares a one-sided date PATCH against the stored value', async () => {
    const created = await draft({
      startDate: new Date(Date.now() + 48 * HOUR),
    });

    await expect(
      service.update(
        created.id,
        admin,
        { endDate: new Date(Date.now() + 24 * HOUR) },
        META,
      ),
    ).rejects.toMatchObject({ response: { code: 'END_BEFORE_START' } });
  });

  // ------------------------------------------------------- pause / activate

  it('activates a ready draft and audits the stored transition', async () => {
    const created = await draft();
    await db.delete(adminAuditLogs);

    const activated = await service.activate(created.id, admin, META);
    expect(activated.status.key).toBe('active');

    const [row] = await auditRows();
    expect(row.actionKey).toBe('sponsor.activate');
    expect(row.before).toEqual({ status: 'draft' });
    expect(row.after).toEqual({ status: 'active' });
  });

  it('refuses to activate a campaign that would appear on no surface', async () => {
    const created = await draft({ placements: [] });
    await expect(
      service.activate(created.id, admin, META),
    ).rejects.toMatchObject({
      response: { code: 'SPONSOR_NO_PLACEMENTS' },
    });
  });

  it('refuses to activate a video creative with no asset URL', async () => {
    const created = await draft({ creativeType: 'video', creativeUrl: null });
    await expect(
      service.activate(created.id, admin, META),
    ).rejects.toMatchObject({
      response: { code: 'SPONSOR_CREATIVE_URL_REQUIRED' },
    });
  });

  it('activates a video creative once it has an asset URL', async () => {
    const created = await draft({
      creativeType: 'video',
      creativeUrl: 'https://cdn.example.com/a.mp4',
    });
    expect((await service.activate(created.id, admin, META)).status.key).toBe(
      'active',
    );
  });

  it('pauses an active sponsor and refuses a second pause', async () => {
    const created = await draft();
    await service.activate(created.id, admin, META);

    expect((await service.pause(created.id, admin, META)).status.key).toBe(
      'paused',
    );
    await expect(service.pause(created.id, admin, META)).rejects.toMatchObject({
      response: { code: 'SPONSOR_ALREADY_PAUSED' },
    });
  });

  it('refuses to pause a draft, which was never running', async () => {
    const created = await draft();
    await expect(service.pause(created.id, admin, META)).rejects.toMatchObject({
      response: { code: 'SPONSOR_NOT_ACTIVE' },
    });
  });

  /**
   * A campaign showing as `scheduled` or `expired` is STORED `active`, so pause
   * must reach it — the deal falling through before the start date is exactly
   * when somebody needs that button.
   */
  it('pauses a campaign that is currently deriving as scheduled', async () => {
    const created = await draft({
      startDate: new Date(Date.now() + 48 * HOUR),
    });
    await service.activate(created.id, admin, META);

    expect((await service.findOne(created.id)).status.key).toBe('scheduled');
    expect((await service.pause(created.id, admin, META)).status.key).toBe(
      'paused',
    );
  });

  it('does not stamp a start date when activating a scheduled campaign', async () => {
    const start = new Date(Date.now() + 48 * HOUR);
    const created = await draft({ startDate: start });
    const activated = await service.activate(created.id, admin, META);
    expect(activated.startDate).toBe(start.toISOString());
  });

  // ------------------------------------------------------------------ delete

  it('soft-deletes, keeps the copy in the audit trail, and hides it afterwards', async () => {
    const created = await draft({ name: 'Retracted', placements: ['home'] });
    await db.delete(adminAuditLogs);

    await service.delete(created.id, admin, META);

    const [row] = await auditRows();
    expect(row.actionKey).toBe('sponsor.delete');
    expect(row.before).toMatchObject({
      name: 'Retracted',
      placements: ['home'],
    });

    // Gone from both read paths, and the row survives.
    await expect(service.findOne(created.id)).rejects.toMatchObject({
      response: { code: 'SPONSOR_NOT_FOUND' },
    });
    expect((await service.list({ page: 1, limit: 25 })).items).toEqual([]);
    expect(await db.select().from(sponsors)).toHaveLength(1);
  });

  // -------------------------------------------------------------------- list

  /**
   * The two filter tabs the prototype could never reach. Both are DERIVED, so a
   * filter keyed on `status_id` would return nothing forever while claiming to
   * have checked (docs/webadmin/08-monetization.md §5 gap #6).
   */
  it('filters on the derived status, reaching scheduled and expired', async () => {
    const scheduled = await draft({
      name: 'Scheduled',
      startDate: new Date(Date.now() + HOUR),
    });
    const expired = await draft({
      name: 'Expired',
      endDate: new Date(Date.now() - HOUR),
    });
    const live = await draft({ name: 'Live' });
    await draft({ name: 'Still a draft' });

    for (const id of [scheduled.id, expired.id, live.id]) {
      await service.activate(id, admin, META);
    }

    const names = async (status: string) =>
      (await service.list({ page: 1, limit: 25, status })).items.map(
        (i) => i.name,
      );

    expect(await names('scheduled')).toEqual(['Scheduled']);
    expect(await names('expired')).toEqual(['Expired']);
    expect(await names('active')).toEqual(['Live']);
    expect(await names('draft')).toEqual(['Still a draft']);
    // An unrecognised value is an empty page, not a 400.
    expect(await names('nonsense')).toEqual([]);
  });

  it('searches name, campaign, category and location', async () => {
    await draft({ name: 'Blue Cross', category: 'Animal' });
    await draft({ name: 'PetCare', campaignName: 'Feed Tamil Nadu' });
    await draft({ name: 'Other', location: 'Chennai' });

    const found = async (q: string) =>
      (await service.list({ page: 1, limit: 25, q })).items
        .map((i) => i.name)
        .sort();

    expect(await found('blue')).toEqual(['Blue Cross']);
    expect(await found('tamil')).toEqual(['PetCare']);
    expect(await found('chennai')).toEqual(['Other']);
    expect(await found('animal')).toEqual(['Blue Cross']);
  });

  it('paginates with a total and a page count', async () => {
    for (let i = 0; i < 3; i++) await draft({ name: `Sponsor ${i}` });

    const page = await service.list({ page: 1, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it('returns the full AdminSponsor shape the console is coded against', async () => {
    const created = await draft({
      name: 'ABC Foods',
      logoUrl: 'https://cdn.example.com/logo.png',
      description: 'Feeding Tamil Nadu',
      website: 'https://example.com',
      category: 'Food',
      campaignName: 'Feed TN 2026',
      location: 'Chennai',
    });

    expect(Object.keys(created).sort()).toEqual([
      'campaignName',
      'category',
      'createdAt',
      'creativeType',
      'creativeUrl',
      'description',
      'endDate',
      'id',
      'location',
      'logoUrl',
      'name',
      'placements',
      'startDate',
      'status',
      'updatedAt',
      'website',
    ]);
    // Explicitly absent: no views, clicks, CTR or revenue anywhere.
    expect(JSON.stringify(created)).not.toMatch(/views|clicks|ctr|revenue/i);
  });
});
