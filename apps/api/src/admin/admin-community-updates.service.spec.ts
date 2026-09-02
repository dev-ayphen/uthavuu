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
  url.pathname = '/uthavu_community_updates_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminAuditActions, adminAuditLogs } from '../db/schema/audit-schema';
import {
  communityUpdateStatuses,
  communityUpdates,
} from '../db/schema/updates-schema';
import { AdminAuditService } from './admin-audit.service';
import { AdminCommunityUpdatesService } from './admin-community-updates.service';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_community_updates_test';

/**
 * The three status rows.
 *
 * Seeded here rather than in admin-spec-db.ts's shared `seedLookups`: nothing
 * else in the admin surface reads this lookup, and a shared helper that seeds
 * every table any spec might want is how that file stops being reviewable.
 * Mirrors db/seed.ts's COMMUNITY_UPDATE_STATUSES key-for-key.
 */
const STATUSES = [
  { key: 'draft', label: 'Draft', sortOrder: 10 },
  { key: 'published', label: 'Published', sortOrder: 20 },
  { key: 'archived', label: 'Archived', sortOrder: 30 },
] as const;

const META = { ipAddress: null, userAgent: null };

const HOUR = 60 * 60 * 1000;

describe('AdminCommunityUpdatesService', () => {
  let service: AdminCommunityUpdatesService;
  const adminId = uuidv7();
  const admin = fakeAdmin({
    userId: adminId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  const draft = (
    overrides: Partial<{
      titleEn: string;
      bodyEn: string;
      titleTa: string | null;
      bodyTa: string | null;
      publishAt: Date | null;
      expiresAt: Date | null;
    }> = {},
  ) =>
    service.create(
      admin,
      {
        titleEn: 'Flood relief centre open',
        bodyEn: 'A relief centre is open at the community hall.',
        ...overrides,
      },
      META,
    );

  const auditRows = () =>
    db
      .select({
        actionId: adminAuditLogs.actionId,
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
      .insert(communityUpdateStatuses)
      .values(STATUSES.map((s) => ({ id: uuidv7(), ...s })));
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
    // A fresh instance per test: both this service and AdminAuditService
    // memoise lookup-key -> id, and the catalogue-failure test below removes a
    // row that a warm memo would otherwise paper over.
    service = new AdminCommunityUpdatesService(new AdminAuditService());
  });

  afterEach(async () => {
    await db.delete(adminAuditLogs);
    await db.delete(communityUpdates);
  });

  // --------------------------------------------------------------- create

  it('creates as a draft, attributes the author, and audits it', async () => {
    const created = await draft({ titleTa: 'வெள்ள நிவாரண மையம்' });

    expect(created.status).toEqual({ key: 'draft', label: 'Draft' });
    expect(created.author).toEqual({ id: adminId, name: 'Super Admin' });
    expect(created.authorDeleted).toBe(false);
    expect(created.titleTa).toBe('வெள்ள நிவாரண மையம்');
    // Not translated yet is a normal, publishable state.
    expect(created.bodyTa).toBeNull();
    expect(created.publishAt).toBeNull();
    expect(created.expiresAt).toBeNull();

    const logs = await auditRows();
    expect(logs).toHaveLength(1);
    expect(logs[0].actionKey).toBe('community_update.create');
    expect(logs[0].targetId).toBe(created.id);
    expect(logs[0].targetLabel).toBe('Flood relief centre open');
    expect(logs[0].actorUserId).toBe(adminId);
    expect(logs[0].after).toMatchObject({
      titleEn: 'Flood relief centre open',
      titleTa: 'வெள்ள நிவாரண மையம்',
    });
  });

  /**
   * ADR 0012's central guarantee, tested from the failure side: a catalogue row
   * missing from the database must fail the WHOLE request, not write the
   * mutation and skip the log. That is only true if `record()` runs inside the
   * caller's transaction — which is the property the ADR notes the type system
   * cannot enforce.
   */
  it('rolls the mutation back when its audit action is not seeded', async () => {
    const [action] = await db
      .select()
      .from(adminAuditActions)
      .where(eq(adminAuditActions.key, 'community_update.create'));
    await db
      .delete(adminAuditActions)
      .where(eq(adminAuditActions.key, 'community_update.create'));

    try {
      await expect(draft()).rejects.toThrow(/did db:seed run/);

      // The update itself must not exist. If it does, the audit write was
      // outside the transaction and the trail has a hole in it.
      const rows = await db.select().from(communityUpdates);
      expect(rows).toHaveLength(0);
    } finally {
      await db.insert(adminAuditActions).values(action);
    }
  });

  // --------------------------------------------------------------- update

  it('audits only the fields that changed', async () => {
    const created = await draft();
    await db.delete(adminAuditLogs);

    const updated = await service.update(
      created.id,
      admin,
      { bodyEn: 'The relief centre has moved to the school.' },
      META,
    );

    expect(updated.bodyEn).toBe('The relief centre has moved to the school.');
    expect(updated.titleEn).toBe('Flood relief centre open');

    const [log] = await auditRows();
    expect(log.actionKey).toBe('community_update.update');
    expect(log.before).toEqual({
      bodyEn: 'A relief centre is open at the community hall.',
    });
    expect(log.after).toEqual({
      bodyEn: 'The relief centre has moved to the school.',
    });
  });

  it('rejects a PATCH that changes nothing rather than logging a phantom edit', async () => {
    const created = await draft();
    await db.delete(adminAuditLogs);

    await expect(
      service.update(
        created.id,
        admin,
        { titleEn: 'Flood relief centre open' },
        META,
      ),
    ).rejects.toMatchObject({ response: { code: 'NO_EFFECTIVE_CHANGE' } });

    expect(await auditRows()).toHaveLength(0);
  });

  /**
   * The gap the DTO's `.refine()` cannot close. It only ever sees the payload,
   * so a PATCH carrying `expiresAt` alone reaches the service unchallenged and
   * has to be compared against the `publishAt` already on the row.
   */
  it('rejects an expiry before the ALREADY-STORED publish time', async () => {
    const publishAt = new Date(Date.now() + 48 * HOUR);
    const created = await draft({ publishAt });

    await expect(
      service.update(
        created.id,
        admin,
        { expiresAt: new Date(Date.now() + 24 * HOUR) },
        META,
      ),
    ).rejects.toMatchObject({ response: { code: 'EXPIRES_BEFORE_PUBLISH' } });
  });

  it('treats an identical timestamp as no change, not as an edit', async () => {
    const publishAt = new Date(Date.now() + HOUR);
    const created = await draft({ publishAt });

    // A different Date object for the same instant. Compared by value, two Date
    // objects are never ===, so without the instant comparison this would look
    // like a change and write a phantom audit row.
    await expect(
      service.update(
        created.id,
        admin,
        { publishAt: new Date(publishAt) },
        META,
      ),
    ).rejects.toMatchObject({ response: { code: 'NO_EFFECTIVE_CHANGE' } });
  });

  it('clears a translation when sent an explicit null', async () => {
    const created = await draft({ titleTa: 'தமிழ் தலைப்பு' });

    const updated = await service.update(
      created.id,
      admin,
      { titleTa: null },
      META,
    );
    expect(updated.titleTa).toBeNull();
  });

  // ------------------------------------------------------ publish / archive

  it('publishes without overwriting a future schedule', async () => {
    const publishAt = new Date(Date.now() + 24 * HOUR);
    const created = await draft({ publishAt });
    await db.delete(adminAuditLogs);

    const published = await service.publish(created.id, admin, META);

    expect(published.status.key).toBe('published');
    // The whole point: "approve for release" must not mean "release now", or
    // scheduling an announcement for tomorrow silently ships it today.
    expect(published.publishAt).toBe(publishAt.toISOString());

    const [log] = await auditRows();
    expect(log.actionKey).toBe('community_update.publish');
    expect(log.before).toEqual({ status: 'draft' });
    expect(log.after).toEqual({ status: 'published' });
  });

  it('refuses to re-publish, so no audit row claims a transition that did not happen', async () => {
    const created = await draft();
    await service.publish(created.id, admin, META);
    await db.delete(adminAuditLogs);

    await expect(
      service.publish(created.id, admin, META),
    ).rejects.toMatchObject({
      response: { code: 'UPDATE_ALREADY_PUBLISHED' },
    });
    expect(await auditRows()).toHaveLength(0);
  });

  it('archives a published update and lets publish put it back', async () => {
    const created = await draft();
    await service.publish(created.id, admin, META);

    const archived = await service.archive(created.id, admin, META);
    expect(archived.status.key).toBe('archived');

    await expect(
      service.archive(created.id, admin, META),
    ).rejects.toMatchObject({
      response: { code: 'UPDATE_ALREADY_ARCHIVED' },
    });

    // Archiving is reversible — that is what separates it from deletion.
    const republished = await service.publish(created.id, admin, META);
    expect(republished.status.key).toBe('published');
  });

  // --------------------------------------------------------------- delete

  it('soft-deletes, keeps the row, and records the copy that was live', async () => {
    const created = await draft();
    await db.delete(adminAuditLogs);

    await service.delete(created.id, admin, META);

    const [row] = await db
      .select()
      .from(communityUpdates)
      .where(eq(communityUpdates.id, created.id));
    expect(row.deletedAt).not.toBeNull();
    // The text survives the delete — the audit entry is the record of what the
    // announcement said when it was taken down.
    expect(row.titleEn).toBe('Flood relief centre open');

    const [log] = await auditRows();
    expect(log.actionKey).toBe('community_update.delete');
    expect(log.before).toMatchObject({
      titleEn: 'Flood relief centre open',
      bodyEn: 'A relief centre is open at the community hall.',
    });

    // Gone from every read path, and a second delete is a 404 rather than a
    // second audit row.
    await expect(service.findOne(created.id)).rejects.toMatchObject({
      response: { code: 'UPDATE_NOT_FOUND' },
    });
    const { items } = await service.list({ page: 1, limit: 50 });
    expect(items).toHaveLength(0);
  });

  // ----------------------------------------------------------------- list

  it('filters by status and searches Tamil copy as well as English', async () => {
    const published = await draft({ titleEn: 'Water tanker route' });
    await service.publish(published.id, admin, META);
    await draft({ titleEn: 'Unfinished notice', bodyTa: 'குடிநீர் லாரி' });

    const drafts = await service.list({ page: 1, limit: 50, status: 'draft' });
    expect(drafts.items.map((i) => i.titleEn)).toEqual(['Unfinished notice']);
    expect(drafts.pagination.total).toBe(1);

    // The search a Tamil-speaking moderator actually types. Matching only the
    // English columns would return nothing here.
    const tamil = await service.list({ page: 1, limit: 50, q: 'குடிநீர்' });
    expect(tamil.items.map((i) => i.titleEn)).toEqual(['Unfinished notice']);

    const english = await service.list({ page: 1, limit: 50, q: 'tanker' });
    expect(english.items.map((i) => i.titleEn)).toEqual(['Water tanker route']);
  });

  it('escapes LIKE metacharacters so a literal % is not a wildcard', async () => {
    await draft({ titleEn: '100% of shelters are open' });
    await draft({ titleEn: 'No shelters affected' });

    const hits = await service.list({ page: 1, limit: 50, q: '100%' });
    expect(hits.items.map((i) => i.titleEn)).toEqual([
      '100% of shelters are open',
    ]);
  });

  it('returns an unknown status filter as an empty page, not an error', async () => {
    await draft();
    const none = await service.list({ page: 1, limit: 50, status: 'nonsense' });
    expect(none.items).toEqual([]);
    expect(none.pagination.total).toBe(0);
  });

  // --------------------------------------------------------------- author

  it('keeps the announcement when its author is deleted, and says so', async () => {
    const departingId = uuidv7();
    await db.insert(user).values({
      id: departingId,
      name: 'Departing Admin',
      email: `${departingId}@uthavu.org`,
    });

    const created = await service.create(
      fakeAdmin({ userId: departingId, name: 'Departing Admin' }),
      { titleEn: 'Cyclone warning', bodyEn: 'Stay indoors tonight.' },
      META,
    );

    await db.delete(adminAuditLogs);
    await db.delete(user).where(eq(user.id, departingId));

    // ON DELETE SET NULL, not CASCADE: a public safety notice does not stop
    // being true because the person who typed it left.
    const after = await service.findOne(created.id);
    expect(after.titleEn).toBe('Cyclone warning');
    expect(after.author).toBeNull();
    expect(after.authorDeleted).toBe(true);
  });
});
