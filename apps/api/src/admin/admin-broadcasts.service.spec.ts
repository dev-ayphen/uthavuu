import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq, ne } from 'drizzle-orm';

// See admin-spec-db.ts: the factory is hoisted above the imports, so the
// database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_broadcasts_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { alerts } from '../db/schema/alerts-schema';
import { user } from '../db/schema/auth-schema';
import { devices } from '../db/schema/devices-schema';
import { adminAuditActions, adminAuditLogs } from '../db/schema/audit-schema';
import {
  userAccountStatus,
  userStatuses,
} from '../db/schema/user-status-schema';
import {
  broadcastAudiences,
  broadcastStatuses,
  broadcasts,
} from '../db/schema/broadcasts-schema';
import type {
  PushMessage,
  PushSendResult,
} from '../push/push-provider.interface';
import type { PushService } from '../push/push.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminBroadcastsService } from './admin-broadcasts.service';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_broadcasts_test';

/**
 * The broadcast lookup rows, seeded here rather than in admin-spec-db.ts's
 * shared `seedLookups`: nothing else in the admin surface reads them, and a
 * shared helper that seeds every table any spec might want is how that file
 * stops being reviewable. Mirrors db/seed.ts key-for-key.
 */
const STATUSES = [
  { key: 'draft', label: 'Draft', sortOrder: 10 },
  { key: 'scheduled', label: 'Scheduled', sortOrder: 20 },
  { key: 'sending', label: 'Sending', sortOrder: 30 },
  { key: 'sent', label: 'Sent', sortOrder: 40 },
  { key: 'cancelled', label: 'Cancelled', sortOrder: 50 },
] as const;

const AUDIENCES = [
  { key: 'all_users', label: 'All users', sortOrder: 10 },
  { key: 'district', label: 'A single district', sortOrder: 20 },
] as const;

const META = { ipAddress: null, userAgent: null };

/** The Tamil copy used throughout, so a failure names which field fell back. */
const TA_TITLE = 'வெள்ள எச்சரிக்கை';
const TA_BODY = 'பாதுகாப்பான இடத்திற்குச் செல்லுங்கள்.';

describe('AdminBroadcastsService', () => {
  let service: AdminBroadcastsService;

  const adminId = uuidv7();
  const admin = fakeAdmin({
    userId: adminId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  // ── The PushService double ────────────────────────────────────────────────
  //
  // A hand-rolled stub rather than a jest.mock of the module: the real
  // PushService is a class with a DI-injected provider, and what these tests
  // need to control is exactly one method's OUTCOME (including "it rejects"),
  // which a stub states more plainly than a partial module mock.
  let pushCalls: Array<{ userId: string; message: PushMessage }>;
  let pushImpl: (userId: string) => Promise<PushSendResult>;

  const pushService = {
    sendToUser: (userId: string, message: PushMessage) => {
      pushCalls.push({ userId, message });
      return pushImpl(userId);
    },
  } as unknown as PushService;

  const statusIdOf = async (key: string) => {
    const [row] = await db
      .select({ id: broadcastStatuses.id })
      .from(broadcastStatuses)
      .where(eq(broadcastStatuses.key, key));
    return row.id;
  };

  /** Creates a citizen. `locale` null models an account that never reported one. */
  const citizen = async (overrides: {
    locale?: string | null;
    district?: string | null;
    withDevice?: boolean;
  }) => {
    const id = uuidv7();
    await db.insert(user).values({
      id,
      name: `Citizen ${id.slice(-6)}`,
      email: `${id}@test.local`,
      locale: overrides.locale ?? null,
      district: overrides.district ?? null,
    });
    if (overrides.withDevice) {
      await db.insert(devices).values({
        id: uuidv7(),
        userId: id,
        pushToken: `token-${id}`,
        platform: 'android',
      });
    }
    return id;
  };

  const draft = (
    overrides: Partial<{
      titleEn: string;
      bodyEn: string;
      titleTa: string | null;
      bodyTa: string | null;
      audience: 'all_users' | 'district';
      district: string | null;
      scheduledAt: Date | null;
    }> = {},
  ) =>
    service.create(
      admin,
      {
        titleEn: 'Flood warning',
        bodyEn: 'Move to higher ground.',
        audience: 'all_users',
        ...overrides,
      },
      META,
    );

  /**
   * The district the count-sensitive tests target.
   *
   * They use `audience: 'district'` rather than `all_users` for one reason: an
   * ADMIN IS ALSO A USER. `admin_users` extends the Better Auth `user` table
   * rather than replacing it, so the console operator running these tests is a
   * legitimate `all_users` recipient and shows up in every count. That is
   * correct product behaviour — staff live in Tamil Nadu too and should get the
   * flood warning — but it makes an exact `recipientCount` assertion depend on
   * how many admins exist. Targeting a district the admin is not in makes the
   * expected number a property of the test rather than of the fixture.
   */
  const DISTRICT = 'Cuddalore';

  const alertsFor = (userId: string) =>
    db.select().from(alerts).where(eq(alerts.userId, userId));

  const auditKeys = async () => {
    const rows = await db
      .select({ key: adminAuditActions.key })
      .from(adminAuditLogs)
      .innerJoin(
        adminAuditActions,
        eq(adminAuditLogs.actionId, adminAuditActions.id),
      );
    return rows.map((r) => r.key);
  };

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    await seedLookups(db);
    await db
      .insert(broadcastStatuses)
      .values(STATUSES.map((s) => ({ id: uuidv7(), ...s })));
    await db
      .insert(broadcastAudiences)
      .values(AUDIENCES.map((a) => ({ id: uuidv7(), ...a })));
    await db.insert(user).values({
      id: adminId,
      name: 'Super Admin',
      email: 'admin@uthavu.org',
    });
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(async () => {
    await db.delete(adminAuditLogs);
    await db.delete(alerts);
    await db.delete(broadcasts);
    await db.delete(devices);
    await db.delete(userAccountStatus);
    // Everyone except the admin, so each test declares its own audience and
    // `recipientCount` is deterministic rather than "whatever previous tests
    // left behind".
    await db.delete(user).where(ne(user.id, adminId));

    pushCalls = [];
    pushImpl = () => Promise.resolve({ sent: 1, failed: 0, deadTokens: [] });

    // A fresh instance per test: the service memoises lookup-key -> id, and the
    // catalogue-failure test below removes a row a warm memo would paper over.
    service = new AdminBroadcastsService(new AdminAuditService(), pushService);
  });

  // ──────────────────────────────────────────────────────────── create / edit

  it('creates a draft that has notified nobody, and audits it', async () => {
    const created = await draft();

    expect(created.status.key).toBe('draft');
    expect(created.sentAt).toBeNull();
    // Null, not 0. "Not sent yet" and "sent to nobody" are different facts.
    expect(created.recipientCount).toBeNull();
    expect(created.deliveredCount).toBeNull();
    expect(created.createdBy).toEqual({ id: adminId, name: 'Super Admin' });
    expect(await alertsFor(adminId)).toHaveLength(0);
    expect(await auditKeys()).toEqual(['broadcast.create']);
  });

  it('creates a scheduled broadcast when a schedule is supplied', async () => {
    const created = await draft({
      scheduledAt: new Date(Date.now() + 3600_000),
    });
    expect(created.status.key).toBe('scheduled');
  });

  it('refuses a district audience with no district, in the DTO shape the service re-checks', async () => {
    // The service-level half of the rule. The DTO catches a whole payload; this
    // catches a PATCH that changes one side of the pair — see
    // create-broadcast.dto.ts.
    const created = await draft({ audience: 'district', district: 'Chennai' });

    await expect(
      service.update(created.id, admin, { district: null }, META),
    ).rejects.toMatchObject({
      response: { code: 'BROADCAST_AUDIENCE_MISMATCH' },
    });
  });

  it('refuses a PATCH that changes nothing', async () => {
    const created = await draft();
    await expect(
      service.update(created.id, admin, { titleEn: 'Flood warning' }, META),
    ).rejects.toMatchObject({ response: { code: 'NO_EFFECTIVE_CHANGE' } });
  });

  // ─────────────────────────────────────────────────────── fan-out: the alerts

  it("writes one alert per recipient, rendered in that recipient's locale", async () => {
    const english = await citizen({ locale: 'en', district: DISTRICT });
    const tamil = await citizen({ locale: 'ta', district: DISTRICT });
    const unset = await citizen({ locale: null, district: DISTRICT });

    const created = await draft({
      titleTa: TA_TITLE,
      bodyTa: TA_BODY,
      audience: 'district',
      district: DISTRICT,
    });
    const sent = await service.send(created.id, admin, META);

    expect(sent.status.key).toBe('sent');
    expect(sent.sentAt).not.toBeNull();
    expect(sent.recipientCount).toBe(3);

    const [en] = await alertsFor(english);
    expect(en.type).toBe('broadcast');
    expect(en.title).toBe('Flood warning');
    expect(en.params).toEqual({ broadcastId: created.id });
    // Broadcasts are not about one request, which is what keeps them out of
    // AlertsService.list()'s hidden-report filter.
    expect(en.reportId).toBeNull();

    const [ta] = await alertsFor(tamil);
    expect(ta.title).toBe(TA_TITLE);
    expect(ta.body).toBe(TA_BODY);

    // A null locale falls back to English rather than failing to send.
    const [none] = await alertsFor(unset);
    expect(none.title).toBe('Flood warning');
  });

  it('falls back PER FIELD, so a Tamil headline over an English body is kept', async () => {
    const tamil = await citizen({ locale: 'ta' });

    // Half-translated: title done, body not. The English body must survive
    // rather than the whole row falling back to English.
    const created = await draft({ titleTa: TA_TITLE, bodyTa: null });
    await service.send(created.id, admin, META);

    const [row] = await alertsFor(tamil);
    expect(row.title).toBe(TA_TITLE);
    expect(row.body).toBe('Move to higher ground.');
  });

  it('targets one district without touching the rest of the country', async () => {
    const inside = await citizen({ locale: 'en', district: 'Chennai' });
    const outside = await citizen({ locale: 'en', district: 'Madurai' });
    const nowhere = await citizen({ locale: 'en', district: null });

    const created = await draft({ audience: 'district', district: 'Chennai' });
    const sent = await service.send(created.id, admin, META);

    expect(sent.recipientCount).toBe(1);
    expect(await alertsFor(inside)).toHaveLength(1);
    expect(await alertsFor(outside)).toHaveLength(0);
    expect(await alertsFor(nowhere)).toHaveLength(0);
  });

  it('excludes suspended accounts, who cannot sign in to read the alert', async () => {
    const active = await citizen({ locale: 'en', district: DISTRICT });
    const suspended = await citizen({ locale: 'en', district: DISTRICT });

    const [suspendedStatus] = await db
      .select({ id: userStatuses.id })
      .from(userStatuses)
      .where(eq(userStatuses.key, 'suspended'));
    await db.insert(userAccountStatus).values({
      userId: suspended,
      statusId: suspendedStatus.id,
    });

    const created = await draft({ audience: 'district', district: DISTRICT });
    const sent = await service.send(created.id, admin, META);

    expect(sent.recipientCount).toBe(1);
    expect(await alertsFor(active)).toHaveLength(1);
    expect(await alertsFor(suspended)).toHaveLength(0);
  });

  it('pages through a recipient set larger than one batch, missing nobody', async () => {
    // Larger than FANOUT_PAGE_SIZE (500), so the keyset loop runs more than
    // once. A broadcast that silently stops at the page boundary would still
    // report success, which is why this is asserted on the real loop rather
    // than on a mocked one.
    const ids = Array.from({ length: 501 }, () => uuidv7());
    await db.insert(user).values(
      ids.map((id) => ({
        id,
        name: `Citizen ${id.slice(-6)}`,
        email: `${id}@test.local`,
        locale: 'en',
        district: DISTRICT,
      })),
    );

    const created = await draft({ audience: 'district', district: DISTRICT });
    const sent = await service.send(created.id, admin, META);

    expect(sent.recipientCount).toBe(501);
    const rows = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(eq(alerts.type, 'broadcast'));
    expect(rows).toHaveLength(501);
  });

  // ───────────────────────────────────── fan-out: push is isolated from alerts

  it('KEEPS EVERY IN-APP ALERT WHEN PUSH FAILS OUTRIGHT', async () => {
    // The rule this whole ordering exists for. FCM being unreachable must never
    // mean citizens do not learn what happened.
    const a = await citizen({
      locale: 'en',
      district: DISTRICT,
      withDevice: true,
    });
    const b = await citizen({
      locale: 'ta',
      district: DISTRICT,
      withDevice: true,
    });

    pushImpl = () => Promise.reject(new Error('FCM unreachable'));

    const created = await draft({
      titleTa: TA_TITLE,
      bodyTa: TA_BODY,
      audience: 'district',
      district: DISTRICT,
    });
    const sent = await service.send(created.id, admin, META);

    // The broadcast still completes, and the alerts are all there.
    expect(sent.status.key).toBe('sent');
    expect(sent.recipientCount).toBe(2);
    expect(await alertsFor(a)).toHaveLength(1);
    expect(await alertsFor(b)).toHaveLength(1);
    // Honest: nothing was pushed, and it says so rather than reporting reach.
    expect(sent.deliveredCount).toBe(0);
  });

  it('counts push delivery separately from in-app reach, and they differ', async () => {
    // Three recipients, one device between them. recipient_count counts PEOPLE
    // reached in-app; delivered_count counts FCM sends accepted. Rendering the
    // second as a subset of the first would report this successful broadcast as
    // a 33% failure.
    await citizen({ locale: 'en', district: DISTRICT });
    await citizen({ locale: 'en', district: DISTRICT });
    const reachable = await citizen({
      locale: 'en',
      district: DISTRICT,
      withDevice: true,
    });

    const created = await draft({ audience: 'district', district: DISTRICT });
    const sent = await service.send(created.id, admin, META);

    expect(sent.recipientCount).toBe(3);
    expect(sent.deliveredCount).toBe(1);
    // Only the user with a registered device is ever handed to PushService —
    // the other two would have been a database round trip each to learn nothing.
    expect(pushCalls.map((c) => c.userId)).toEqual([reachable]);
  });

  it("pushes the recipient's own language and a deep-linkable data payload", async () => {
    const tamil = await citizen({ locale: 'ta', withDevice: true });
    const created = await draft({ titleTa: TA_TITLE, bodyTa: TA_BODY });
    await service.send(created.id, admin, META);

    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]).toMatchObject({
      userId: tamil,
      message: {
        title: TA_TITLE,
        body: TA_BODY,
        data: { type: 'broadcast', broadcastId: created.id },
      },
    });
  });

  // ─────────────────────────────────────────────── irreversibility (rule 1)

  it('refuses to send the same broadcast twice', async () => {
    await citizen({ locale: 'en' });
    const created = await draft();
    await service.send(created.id, admin, META);

    await expect(service.send(created.id, admin, META)).rejects.toMatchObject({
      response: { code: 'BROADCAST_ALREADY_SENT' },
    });
  });

  it('refuses to edit or delete a sent broadcast', async () => {
    await citizen({ locale: 'en' });
    const created = await draft();
    await service.send(created.id, admin, META);

    await expect(
      service.update(created.id, admin, { titleEn: 'Corrected' }, META),
    ).rejects.toMatchObject({ response: { code: 'BROADCAST_ALREADY_SENT' } });

    await expect(service.delete(created.id, admin, META)).rejects.toMatchObject(
      { response: { code: 'BROADCAST_ALREADY_SENT' } },
    );
  });

  it('refuses a second send while one is in progress', async () => {
    // The conditional claim, exercised directly: a broadcast parked in
    // `sending` is what a crashed fan-out leaves behind, and a retry would
    // re-notify everyone the first pass already reached.
    const created = await draft();
    await db
      .update(broadcasts)
      .set({ statusId: await statusIdOf('sending') })
      .where(eq(broadcasts.id, created.id));

    await expect(service.send(created.id, admin, META)).rejects.toMatchObject({
      response: { code: 'BROADCAST_SEND_IN_PROGRESS' },
    });
  });

  it('refuses to send a cancelled broadcast', async () => {
    const created = await draft({
      scheduledAt: new Date(Date.now() + 3600_000),
    });
    await service.cancel(created.id, admin, META);

    await expect(service.send(created.id, admin, META)).rejects.toMatchObject({
      response: { code: 'BROADCAST_CANCELLED' },
    });
  });

  // ───────────────────────────────────────────────────────── cancel / delete

  it('cancels a scheduled broadcast, but not a draft', async () => {
    const scheduled = await draft({
      scheduledAt: new Date(Date.now() + 3600_000),
    });
    const cancelled = await service.cancel(scheduled.id, admin, META);
    expect(cancelled.status.key).toBe('cancelled');
    // The record still says what was planned and when.
    expect(cancelled.scheduledAt).not.toBeNull();

    const plain = await draft();
    await expect(service.cancel(plain.id, admin, META)).rejects.toMatchObject({
      response: { code: 'BROADCAST_NOT_SCHEDULED' },
    });
  });

  it('soft-deletes a draft and refuses a scheduled one', async () => {
    const scheduled = await draft({
      scheduledAt: new Date(Date.now() + 3600_000),
    });
    await expect(
      service.delete(scheduled.id, admin, META),
    ).rejects.toMatchObject({ response: { code: 'BROADCAST_NOT_DELETABLE' } });

    const plain = await draft();
    await service.delete(plain.id, admin, META, 'Wrong district');

    // The row survives; only the read paths stop seeing it.
    const [row] = await db
      .select()
      .from(broadcasts)
      .where(eq(broadcasts.id, plain.id));
    expect(row.deletedAt).not.toBeNull();
    await expect(service.findOne(plain.id)).rejects.toMatchObject({
      response: { code: 'BROADCAST_NOT_FOUND' },
    });

    const { items } = await service.list({ page: 1, limit: 25 });
    expect(items.map((i) => i.id)).not.toContain(plain.id);
  });

  // ──────────────────────────────────────────────────────────────── audit

  it('audits every mutation, and records the send as its own act', async () => {
    await citizen({ locale: 'en' });

    const created = await draft();
    await service.update(
      created.id,
      admin,
      { titleEn: 'Flood warning II' },
      META,
    );
    await service.send(created.id, admin, META);

    expect(await auditKeys()).toEqual([
      'broadcast.create',
      'broadcast.update',
      'broadcast.send',
    ]);

    const [sendRow] = await db
      .select({
        before: adminAuditLogs.before,
        after: adminAuditLogs.after,
        actor: adminAuditLogs.actorUserId,
        label: adminAuditLogs.targetLabel,
      })
      .from(adminAuditLogs)
      .innerJoin(
        adminAuditActions,
        eq(adminAuditLogs.actionId, adminAuditActions.id),
      )
      .where(eq(adminAuditActions.key, 'broadcast.send'));

    expect(sendRow.actor).toBe(adminId);
    expect(sendRow.label).toBe('Flood warning II');
    // Recorded at CLAIM time, so attribution survives a fan-out that dies
    // halfway — hence `sending`, and hence no counts (they are not known yet).
    expect(sendRow.after).toEqual({
      status: 'sending',
      audience: 'all_users',
      district: null,
    });
    expect(sendRow.before).toEqual({ status: 'draft' });
  });

  it('records the delete reason when one is supplied', async () => {
    const created = await draft();
    await service.delete(created.id, admin, META, 'Duplicate of yesterday');

    // Filtered to the delete: `draft()` already wrote a `broadcast.create` row,
    // and an unfiltered `[row]` picks that one — whose reason is correctly null.
    const [row] = await db
      .select({ reason: adminAuditLogs.reason, before: adminAuditLogs.before })
      .from(adminAuditLogs)
      .innerJoin(
        adminAuditActions,
        eq(adminAuditLogs.actionId, adminAuditActions.id),
      )
      .where(eq(adminAuditActions.key, 'broadcast.delete'));
    expect(row.reason).toBe('Duplicate of yesterday');
    // The full copy survives the deletion in the one place designed to keep it.
    expect(row.before).toMatchObject({
      titleEn: 'Flood warning',
      bodyEn: 'Move to higher ground.',
      audience: 'all_users',
    });
  });

  it('fails loudly, and rolls the mutation back, when the catalogue is unseeded', async () => {
    // ADR 0012's rule: writing a mutation without its audit row is the exact
    // failure the table exists to prevent, so the whole request fails.
    await db
      .delete(adminAuditActions)
      .where(eq(adminAuditActions.key, 'broadcast.create'));

    await expect(draft()).rejects.toThrow(/did db:seed run\?/);
    expect(
      await db.select({ id: broadcasts.id }).from(broadcasts),
    ).toHaveLength(0);

    // Restore it for whatever runs next.
    await db.insert(adminAuditActions).values({
      id: uuidv7(),
      key: 'broadcast.create',
      label: 'Created a broadcast',
      targetTypeKey: 'broadcast',
      sortOrder: 390,
    });
  });

  // ────────────────────────────────────────────────────────────────── list

  it('filters by status and searches all four copy columns', async () => {
    await draft({ titleEn: 'Cyclone notice', titleTa: TA_TITLE });
    await draft({
      titleEn: 'Water supply',
      scheduledAt: new Date(Date.now() + 3600_000),
    });

    const drafts = await service.list({ page: 1, limit: 25, status: 'draft' });
    expect(drafts.items.map((i) => i.titleEn)).toEqual(['Cyclone notice']);

    // Searching the Tamil column finds a row whose English does not match.
    const tamil = await service.list({ page: 1, limit: 25, q: TA_TITLE });
    expect(tamil.items.map((i) => i.titleEn)).toEqual(['Cyclone notice']);

    // An unknown status is an empty page, not a 400 — the filter's options come
    // from the lookup table, so a selectable value always exists.
    const unknown = await service.list({
      page: 1,
      limit: 25,
      status: 'not_a_status',
    });
    expect(unknown.items).toHaveLength(0);
    expect(unknown.pagination.total).toBe(0);
  });
});
