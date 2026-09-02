import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_platform_settings_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminAuditActions, adminAuditLogs } from '../db/schema/audit-schema';
import {
  PLATFORM_SETTINGS_DEFAULTS,
  platformSettings,
} from '../db/schema/settings-schema';
import { AdminAuditService } from './admin-audit.service';
import { AdminSettingsService } from './admin-settings.service';
import { UpdatePlatformSettingsSchema } from './dto/update-platform-settings.dto';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_platform_settings_test';
const META = { ipAddress: null, userAgent: null };

describe('AdminSettingsService', () => {
  let service: AdminSettingsService;
  const adminId = uuidv7();
  const admin = fakeAdmin({
    userId: adminId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  const settingsRow = async () => {
    const [row] = await db.select().from(platformSettings);
    return row;
  };

  const auditRows = () =>
    db
      .select({
        actionKey: adminAuditActions.key,
        targetId: adminAuditLogs.targetId,
        targetLabel: adminAuditLogs.targetLabel,
        before: adminAuditLogs.before,
        after: adminAuditLogs.after,
        actorUserId: adminAuditLogs.actorUserId,
        actorName: adminAuditLogs.actorName,
        actorRoleKey: adminAuditLogs.actorRoleKey,
      })
      .from(adminAuditLogs)
      .innerJoin(
        adminAuditActions,
        eq(adminAuditLogs.actionId, adminAuditActions.id),
      );

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    await seedLookups(db);
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
    // A fresh instance per test: AdminAuditService memoises action-key -> id,
    // and the catalogue-failure test below removes a row a warm memo would
    // otherwise paper over.
    service = new AdminSettingsService(new AdminAuditService());

    await db.delete(adminAuditLogs);
    await db.delete(platformSettings);
    // Mirrors db/seed.ts exactly, including leaving updated_by null and letting
    // both timestamps default in one statement — which is what makes
    // `updated_at == created_at` mean "never changed".
    await db
      .insert(platformSettings)
      .values({ id: uuidv7(), ...PLATFORM_SETTINGS_DEFAULTS });
  });

  describe('get', () => {
    it('returns the seeded configuration with no updater', async () => {
      const result = await service.get();

      expect(result).toMatchObject({
        appName: 'Uthavu',
        supportEmail: null,
        supportPhone: null,
        maxPhotosPerReport: 4,
        maxVolunteersPerReport: 20,
        defaultRadiusKm: 5,
        allowAnonymousReports: true,
        commentsEnabled: true,
        commentFlaggingEnabled: true,
        maintenanceMode: false,
        readOnlyMode: false,
        updatedBy: null,
        // Never touched — distinct from "touched by somebody now deleted".
        updatedByDeleted: false,
      });
      expect(typeof result.updatedAt).toBe('string');
    });

    it('never leaks the singleton machinery to a caller', async () => {
      const result = await service.get();
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('singleton');
    });

    it('fails loudly and actionably when the row has not been seeded', async () => {
      await db.delete(platformSettings);

      await expect(service.get()).rejects.toMatchObject({
        response: { code: 'PLATFORM_SETTINGS_NOT_SEEDED' },
        status: 503,
      });
    });
  });

  describe('update', () => {
    it('persists a subset and leaves every other field alone', async () => {
      const result = await service.update(
        admin,
        { maxPhotosPerReport: 2, maintenanceMode: true },
        META,
      );

      expect(result.maxPhotosPerReport).toBe(2);
      expect(result.maintenanceMode).toBe(true);
      // Untouched.
      expect(result.appName).toBe('Uthavu');
      expect(result.maxVolunteersPerReport).toBe(20);
      expect(result.readOnlyMode).toBe(false);

      const row = await settingsRow();
      expect(row.maxPhotosPerReport).toBe(2);
      expect(row.maintenanceMode).toBe(true);
      expect(row.appName).toBe('Uthavu');
    });

    it('records the updater and moves updated_at past created_at', async () => {
      const result = await service.update(
        admin,
        { appName: 'Uthavu TN' },
        META,
      );

      expect(result.updatedBy).toEqual({ id: adminId, name: 'Super Admin' });
      expect(result.updatedByDeleted).toBe(false);

      const row = await settingsRow();
      expect(row.updatedBy).toBe(adminId);
      expect(row.updatedAt.getTime()).toBeGreaterThan(row.createdAt.getTime());
    });

    it('clears a nullable contact field', async () => {
      await service.update(admin, { supportPhone: '+914400000000' }, META);
      const cleared = await service.update(admin, { supportPhone: null }, META);

      expect(cleared.supportPhone).toBeNull();
    });

    it('refuses a PATCH whose every field already holds the value sent', async () => {
      // Without this the audit trail would fill with rows claiming changes that
      // never happened — the same rule AdminCategoriesService.update() applies.
      await expect(
        service.update(admin, { maxPhotosPerReport: 4 }, META),
      ).rejects.toMatchObject({
        response: { code: 'NO_EFFECTIVE_CHANGE' },
      });

      expect(await auditRows()).toHaveLength(0);
    });

    it('ignores unchanged fields in a mixed PATCH and audits only the diff', async () => {
      await service.update(
        admin,
        // maxPhotosPerReport is already 4; only readOnlyMode actually moves.
        { maxPhotosPerReport: 4, readOnlyMode: true },
        META,
      );

      const [entry] = await auditRows();
      expect(entry.before).toEqual({ readOnlyMode: false });
      expect(entry.after).toEqual({ readOnlyMode: true });
    });
  });

  describe('audit trail (ADR 0012)', () => {
    it('writes one platform_setting.update row with the actor snapshot and diff', async () => {
      await service.update(
        admin,
        { maintenanceMode: true, appName: 'Uthavu TN' },
        META,
      );

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actionKey: 'platform_setting.update',
        targetLabel: 'App Settings',
        actorUserId: adminId,
        // Snapshotted, not joined — so the entry survives the admin's deletion.
        actorName: 'Super Admin',
        actorRoleKey: 'super_admin',
        before: { maintenanceMode: false, appName: 'Uthavu' },
        after: { maintenanceMode: true, appName: 'Uthavu TN' },
      });
      expect(rows[0].targetId).toBe((await settingsRow()).id);
    });

    it('rolls the settings change back when the audit write fails', async () => {
      // The atomicity ADR 0012 rests on. Removing the catalogue row is the one
      // reliable way to make record() fail; if the audit write were outside the
      // transaction, maintenance mode would be ON with nothing recording who
      // turned it on.
      await db
        .delete(adminAuditActions)
        .where(eq(adminAuditActions.key, 'platform_setting.update'));

      await expect(
        service.update(admin, { maintenanceMode: true }, META),
      ).rejects.toThrow(/platform_setting\.update/);

      const row = await settingsRow();
      expect(row.maintenanceMode).toBe(false);
      expect(row.updatedBy).toBeNull();

      await db.insert(adminAuditActions).values({
        id: uuidv7(),
        key: 'platform_setting.update',
        label: 'Updated platform settings',
        targetTypeKey: 'platform_setting',
        sortOrder: 190,
      });
    });
  });

  describe('updatedByDeleted', () => {
    it('reports true once the admin who last changed the settings is deleted', async () => {
      // The frozen column set cannot store this fact, so the projection derives
      // it from `updated_at > created_at` with a null actor. This is the test
      // that keeps the derivation honest.
      const departedId = uuidv7();
      await db.insert(user).values({
        id: departedId,
        name: 'Departed Admin',
        email: `${departedId}@uthavu.org`,
      });

      await service.update(
        fakeAdmin({ userId: departedId, name: 'Departed Admin' }),
        { commentsEnabled: false },
        META,
      );
      expect((await service.get()).updatedByDeleted).toBe(false);

      await db.delete(user).where(eq(user.id, departedId));

      const after = await service.get();
      expect(after.updatedBy).toBeNull();
      expect(after.updatedByDeleted).toBe(true);
      // The setting itself is untouched by the deletion — ON DELETE SET NULL,
      // never CASCADE.
      expect(after.commentsEnabled).toBe(false);
    });
  });
});

describe('UpdatePlatformSettingsSchema', () => {
  const parse = (body: unknown) => UpdatePlatformSettingsSchema.safeParse(body);

  it('rejects an empty PATCH', () => {
    expect(parse({}).success).toBe(false);
  });

  it.each([
    ['maxPhotosPerReport', 0],
    ['maxPhotosPerReport', 11],
    ['maxVolunteersPerReport', 0],
    ['maxVolunteersPerReport', 51],
  ])('rejects %s = %s', (field, value) => {
    expect(parse({ [field]: value }).success).toBe(false);
  });

  it.each([
    ['maxPhotosPerReport', 1],
    ['maxPhotosPerReport', 10],
    ['maxVolunteersPerReport', 1],
    ['maxVolunteersPerReport', 50],
  ])('accepts %s = %s at the boundary', (field, value) => {
    expect(parse({ [field]: value }).success).toBe(true);
  });

  it.each([1, 3, 5, 10])('accepts defaultRadiusKm = %s', (value) => {
    expect(parse({ defaultRadiusKm: value }).success).toBe(true);
  });

  it.each([0, 2, 4, 7, 20])('rejects defaultRadiusKm = %s', (value) => {
    // Not a range check: 2 km is inside 1..10 and still not a chip the mobile
    // client can render, so storing it would be a setting nothing obeys.
    expect(parse({ defaultRadiusKm: value }).success).toBe(false);
  });

  it('rejects an app name outside 1..80', () => {
    expect(parse({ appName: '' }).success).toBe(false);
    expect(parse({ appName: 'x'.repeat(81) }).success).toBe(false);
    expect(parse({ appName: 'x'.repeat(80) }).success).toBe(true);
  });

  it('rejects a malformed support email', () => {
    expect(parse({ supportEmail: 'not-an-email' }).success).toBe(false);
    expect(parse({ supportEmail: 'help@uthavu.org' }).success).toBe(true);
  });

  it('treats an emptied text field as a clear, not as "unchanged"', () => {
    // A settings form sends '' when the operator empties the box. Mapping that
    // to undefined would leave the field unclearable from the console.
    expect(parse({ supportPhone: '   ' })).toMatchObject({
      success: true,
      data: { supportPhone: null },
    });
    expect(parse({ supportEmail: '' })).toMatchObject({
      success: true,
      data: { supportEmail: null },
    });
  });
});
