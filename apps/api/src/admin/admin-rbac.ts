// The admin RBAC catalogue: the two roles, the six permissions, and which role
// holds which. One file so `db/seed.ts` (which writes the rows), the guard
// (which reads them) and the tests (which assert them) can never drift apart.
//
// These are the *definitions*. The runtime authority is always the database —
// AdminService reads admin_users -> admin_roles -> admin_role_permissions, it
// never consults the map below. That matters: an operator who revokes a
// permission row in the DB has actually revoked it, without a redeploy.
//
// Source: docs/webadmin/09-admins-and-audit.md §2 — the console's own six
// permission flags and the Super Admin / Moderator (= Ops) split it shows.

// Route metadata key for @RequireAdminPermissions(). It lives here rather than
// next to the decorator on purpose: `admin.decorators.ts` imports
// @thallesp/nestjs-better-auth, which ships ESM only and cannot be loaded by
// this repo's CommonJS Jest transform. Keeping the key in this file — whose only
// import is @uthavu/libs-common, plain CommonJS constants — lets AdminGuard and
// its tests stay clear of that import.
export const ADMIN_PERMISSIONS_METADATA = 'ADMIN_PERMISSIONS';

// The KEYS moved to @uthavu/libs-common: apps/admin has to spell them
// identically or its fail-closed permission checks hide a section from every
// admin, and it used to hold its own copy of both lists to do that. Re-exported
// here so every existing importer in apps/api keeps its import path — this file
// is still where the API's RBAC catalogue is assembled, it just no longer owns
// the spelling.
import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_ROLE_KEYS,
  type AdminPermissionKey,
  type AdminRoleKey,
} from '@uthavu/libs-common';

export { ADMIN_PERMISSION_KEYS, ADMIN_ROLE_KEYS };
export type { AdminPermissionKey, AdminRoleKey };

// The LABELS stay here, next to the seed that writes them into admin_roles /
// admin_permissions. They are display text an operator can already edit in the
// database, so a client copy would be a second thing to forget to update — see
// apps/admin/src/lib/roles.ts, which deliberately keeps no key->label map.
export const ADMIN_ROLES: ReadonlyArray<{ key: AdminRoleKey; label: string }> =
  [
    { key: 'super_admin', label: 'Super Admin' },
    { key: 'ops_admin', label: 'Ops Admin' },
  ];

// `module:action` (backend-agent.md §3.2). The parenthetical is the flag name
// the prototype's Admins tab used, kept here so the console's permission matrix
// can be mapped onto these keys without guesswork.
//
// Built by mapping the shared key list rather than restating it, so a key added
// to @uthavu/libs-common is a compile error here until it is given a label —
// which is the only way the seed can stay complete.
const ADMIN_PERMISSION_LABELS: Readonly<Record<AdminPermissionKey, string>> = {
  'users:manage': 'Manage users', //          (design flag: users)
  'reports:manage': 'Manage reports', //      (design flag: reports)
  'comments:manage': 'Moderate comments', //  (design flag: comments)
  'analytics:view': 'View analytics', //      (design flag: analytics)
  'platform:manage': 'Manage platform settings and admins', // (design flag: settings)
  'data:delete_all': 'Bulk-delete platform data', //           (design flag: deleteAll)
};

export const ADMIN_PERMISSIONS: ReadonlyArray<{
  key: AdminPermissionKey;
  label: string;
}> = ADMIN_PERMISSION_KEYS.map((key) => ({
  key,
  label: ADMIN_PERMISSION_LABELS[key],
}));

// docs/webadmin/09-admins-and-audit.md §2: Super Admin holds all six; the Ops
// Admin (there called "Moderator") holds users/reports/comments and is denied
// analytics, settings and deleteAll.
export const ADMIN_ROLE_PERMISSIONS: Readonly<
  Record<AdminRoleKey, ReadonlyArray<AdminPermissionKey>>
> = {
  super_admin: ADMIN_PERMISSIONS.map((p) => p.key),
  ops_admin: ['users:manage', 'reports:manage', 'comments:manage'],
};

// The resolved identity the guard attaches to the request and `GET /admin/me`
// returns. `permissions` is what the DB actually granted, not what the map above
// says it should have been.
export interface AdminIdentity {
  userId: string;
  name: string;
  email: string;
  role: { key: string; label: string };
  permissions: string[];
}
