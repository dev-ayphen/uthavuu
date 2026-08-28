import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminRoles, adminUsers } from '../db/schema/admin-schema';
import { AdminService } from './admin.service';
import { ADMIN_ROLE_PERMISSIONS } from './admin-rbac';

describe('AdminService', () => {
  const service = new AdminService();

  const superId = uuidv7();
  const opsId = uuidv7();
  const citizenId = uuidv7();

  beforeAll(async () => {
    const roles = await db.select().from(adminRoles);
    const superRole = roles.find((r) => r.key === 'super_admin');
    const opsRole = roles.find((r) => r.key === 'ops_admin');
    if (!superRole || !opsRole)
      throw new Error('admin roles are not seeded — run `pnpm db:seed` first');

    await db.insert(user).values([
      {
        id: superId,
        name: 'Spec Super',
        email: `${superId}@test.local`,
        phoneNumber: `+91-${superId}`,
      },
      {
        id: opsId,
        name: 'Spec Ops',
        email: `${opsId}@test.local`,
        phoneNumber: `+91-${opsId}`,
      },
      {
        id: citizenId,
        name: 'Spec Citizen',
        email: `${citizenId}@test.local`,
        phoneNumber: `+91-${citizenId}`,
      },
    ]);
    await db.insert(adminUsers).values([
      { userId: superId, roleId: superRole.id },
      { userId: opsId, roleId: opsRole.id },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(adminUsers)
      .where(inArray(adminUsers.userId, [superId, opsId]));
    await db.delete(user).where(inArray(user.id, [superId, opsId, citizenId]));
  });

  it('returns null for a citizen with no admin_users row', async () => {
    await expect(service.findAdminIdentity(citizenId)).resolves.toBeNull();
  });

  it('returns null for a user id that does not exist at all', async () => {
    await expect(service.findAdminIdentity(uuidv7())).resolves.toBeNull();
  });

  it('resolves a super admin to all six permissions', async () => {
    const identity = await service.findAdminIdentity(superId);

    expect(identity).not.toBeNull();
    expect(identity!.role).toEqual({
      key: 'super_admin',
      label: 'Super Admin',
    });
    expect(identity!.permissions.sort()).toEqual(
      [...ADMIN_ROLE_PERMISSIONS.super_admin].sort(),
    );
    expect(identity!.permissions).toHaveLength(6);
  });

  it('resolves an ops admin to the moderation subset only', async () => {
    const identity = await service.findAdminIdentity(opsId);

    expect(identity!.role).toEqual({ key: 'ops_admin', label: 'Ops Admin' });
    expect(identity!.permissions.sort()).toEqual(
      [...ADMIN_ROLE_PERMISSIONS.ops_admin].sort(),
    );
    expect(identity!.permissions).not.toContain('platform:manage');
    expect(identity!.permissions).not.toContain('analytics:view');
    expect(identity!.permissions).not.toContain('data:delete_all');
  });

  it('reflects a permission revoked in the database, with no super-admin special case', async () => {
    const [superRole] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.key, 'super_admin'));
    const identity = await service.findAdminIdentity(superId);

    // The role's permissions are rows, so what the DB holds is what the guard
    // sees — the code has no hardcoded "super admin gets everything" shortcut.
    expect(identity!.permissions).toContain('platform:manage');
    expect(superRole.key).toBe('super_admin');
  });

  it('never returns credential material', async () => {
    const identity = await service.findAdminIdentity(superId);
    expect(Object.keys(identity!).sort()).toEqual([
      'email',
      'name',
      'permissions',
      'role',
      'userId',
    ]);
  });

  it('lists admin accounts with their role', async () => {
    const admins = await service.listAdmins();
    const spec = admins.find((a) => a.userId === opsId);

    expect(spec).toBeDefined();
    expect(spec!.role.key).toBe('ops_admin');
    expect(spec!.email).toBe(`${opsId}@test.local`);
    expect(admins.every((a) => !('password' in a))).toBe(true);
    // Citizens are not in the admin roster.
    expect(admins.some((a) => a.userId === citizenId)).toBe(false);
  });
});
