import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin-spec-db.ts: the factory is hoisted above the imports, so the
// database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule = jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<typeof import('drizzle-orm/postgres-js')>(
    'drizzle-orm/postgres-js',
  );
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_audit_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminAuditLogs } from '../db/schema/audit-schema';
import { AdminAuditService } from './admin-audit.service';
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_TARGET_TYPES,
} from './admin-audit-catalogue';
import { createSpecDatabase, fakeAdmin, seedLookups } from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_audit_test';

describe('AdminAuditService', () => {
  const service = new AdminAuditService();
  const adminId = uuidv7();
  const admin = fakeAdmin({
    userId: adminId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  const listAll = () => service.list({ page: 1, limit: 100 });

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

  afterEach(async () => {
    await db.delete(adminAuditLogs);
  });

  it('seeds every action in the catalogue, so no action can be unwritable', async () => {
    const { actions, targetTypes } = await service.catalogue();

    expect(actions.map((a) => a.key)).toEqual(
      [...ADMIN_AUDIT_ACTIONS]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((a) => a.key),
    );
    // Derived from the catalogue, not hand-listed: this assertion is about the
    // seed and the catalogue agreeing, so hardcoding the expected list here just
    // creates a third copy to keep in sync (it drifted the first time an action
    // was added).
    expect(targetTypes.map((t) => t.key)).toEqual(
      [...ADMIN_AUDIT_TARGET_TYPES]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => t.key),
    );
  });

  it('records the actor, action, target and change', async () => {
    await service.record({
      admin,
      action: 'report.hide',
      targetId: 'report-123',
      targetLabel: 'Dog stuck in a drain',
      before: { deletedAt: null },
      after: { deletedAt: '2026-08-28T00:00:00.000Z' },
      reason: 'Duplicate of #98',
      meta: { ipAddress: '10.0.0.7', userAgent: 'Chrome/141' },
    });

    const { items, pagination } = await listAll();
    expect(pagination.total).toBe(1);
    expect(items[0]).toMatchObject({
      actor: {
        userId: adminId,
        name: 'Super Admin',
        email: 'admin@uthavu.org',
        roleKey: 'super_admin',
        accountExists: true,
      },
      action: { key: 'report.hide', label: 'Hid a report' },
      target: {
        type: { key: 'report', label: 'Report' },
        id: 'report-123',
        label: 'Dog stuck in a drain',
      },
      before: { deletedAt: null },
      after: { deletedAt: '2026-08-28T00:00:00.000Z' },
      reason: 'Duplicate of #98',
      ipAddress: '10.0.0.7',
      userAgent: 'Chrome/141',
    });
  });

  it('resolves the target type from the action, so a caller cannot mislabel one', async () => {
    await service.record({ admin, action: 'support_ticket.status_change', targetId: 't1' });
    const { items } = await listAll();
    expect(items[0].target.type.key).toBe('support_ticket');
  });

  it('survives the acting admin being deleted — the snapshot is the record', async () => {
    const departing = uuidv7();
    await db.insert(user).values({
      id: departing,
      name: 'Departed Admin',
      email: 'departed@uthavu.org',
    });

    await service.record({
      admin: fakeAdmin({
        userId: departing,
        name: 'Departed Admin',
        email: 'departed@uthavu.org',
        roleKey: 'ops_admin',
      }),
      action: 'comment.remove',
      targetId: 'comment-1',
      before: { body: 'the removed text' },
    });

    // Deleting an admin must not erase what they did. This is the property the
    // SET NULL FK exists for — a CASCADE here would make account deletion a
    // trail-shredder.
    await db.delete(user).where(eq(user.id, departing));

    const { items, pagination } = await listAll();
    expect(pagination.total).toBe(1);
    expect(items[0].actor).toEqual({
      userId: null,
      name: 'Departed Admin',
      email: 'departed@uthavu.org',
      roleKey: 'ops_admin',
      accountExists: false,
    });
    expect(items[0].before).toEqual({ body: 'the removed text' });
  });

  it('rolls the audit entry back with the mutation when the transaction aborts', async () => {
    // The property that makes `tx` worth threading through every call site: an
    // audit row for a change that never happened is as wrong as a change with
    // no audit row.
    await expect(
      db.transaction(async (tx) => {
        await service.record({ admin, action: 'report.close', targetId: 'r1', tx });
        throw new Error('mutation failed after the audit write');
      }),
    ).rejects.toThrow('mutation failed after the audit write');

    expect((await listAll()).pagination.total).toBe(0);
  });

  it('filters by actor, action, target and date range', async () => {
    const other = uuidv7();
    await db.insert(user).values({ id: other, name: 'Ops', email: 'ops2@uthavu.org' });

    await service.record({ admin, action: 'report.close', targetId: 'r1' });
    await service.record({ admin, action: 'report.hide', targetId: 'r2' });
    await service.record({
      admin: fakeAdmin({ userId: other, roleKey: 'ops_admin' }),
      action: 'report.close',
      targetId: 'r3',
    });

    expect((await service.list({ page: 1, limit: 50, actorUserId: other })).pagination.total).toBe(1);
    expect((await service.list({ page: 1, limit: 50, action: 'report.close' })).pagination.total).toBe(2);
    expect((await service.list({ page: 1, limit: 50, targetId: 'r2' })).pagination.total).toBe(1);
    expect((await service.list({ page: 1, limit: 50, targetType: 'report' })).pagination.total).toBe(3);
    expect(
      (await service.list({ page: 1, limit: 50, from: new Date(Date.now() + 60_000) })).pagination.total,
    ).toBe(0);

    await db.delete(user).where(eq(user.id, other));
  });

  it('paginates newest first', async () => {
    for (const targetId of ['a', 'b', 'c', 'd', 'e']) {
      await service.record({ admin, action: 'report.close', targetId });
    }

    const first = await service.list({ page: 1, limit: 2 });
    expect(first.items.map((i) => i.target.id)).toEqual(['e', 'd']);
    expect(first.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });

    const last = await service.list({ page: 3, limit: 2 });
    expect(last.items.map((i) => i.target.id)).toEqual(['a']);
  });

  it('reports zero pages for an empty log rather than a page that is not there', async () => {
    expect((await listAll()).pagination).toEqual({
      page: 1,
      limit: 100,
      total: 0,
      totalPages: 0,
    });
  });
});
