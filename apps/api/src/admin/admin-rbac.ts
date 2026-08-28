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
// this repo's CommonJS Jest transform. Keeping the key in this dependency-free
// file lets AdminGuard — and its tests — stay clear of that import.
export const ADMIN_PERMISSIONS_METADATA = 'ADMIN_PERMISSIONS';

export const ADMIN_ROLE_KEYS = ['super_admin', 'ops_admin'] as const;
export type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];

export const ADMIN_ROLES: ReadonlyArray<{ key: AdminRoleKey; label: string }> =
  [
    { key: 'super_admin', label: 'Super Admin' },
    { key: 'ops_admin', label: 'Ops Admin' },
  ];

// `module:action` (backend-agent.md §3.2). The parenthetical is the flag name
// the prototype's Admins tab used, kept here so the console's permission matrix
// can be mapped onto these keys without guesswork.
export const ADMIN_PERMISSIONS = [
  { key: 'users:manage', label: 'Manage users' }, //          (design flag: users)
  { key: 'reports:manage', label: 'Manage reports' }, //      (design flag: reports)
  { key: 'comments:manage', label: 'Moderate comments' }, //  (design flag: comments)
  { key: 'analytics:view', label: 'View analytics' }, //      (design flag: analytics)
  { key: 'platform:manage', label: 'Manage platform settings and admins' }, // (design flag: settings)
  { key: 'data:delete_all', label: 'Bulk-delete platform data' }, //           (design flag: deleteAll)
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSIONS)[number]['key'];

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
