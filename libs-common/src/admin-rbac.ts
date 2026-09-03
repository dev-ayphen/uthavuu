// The admin RBAC KEY STRINGS — the two role keys and the six `module:action`
// permission keys.
//
// WHAT THIS FILE IS NOT: it is not the grant map. Which permissions a role
// actually holds is decided by the DATABASE at runtime — AdminService reads
// admin_users -> admin_roles -> admin_role_permissions and never consults a
// constant. That matters: an operator who revokes a permission row has actually
// revoked it, without a redeploy. The seed-time defaults (ADMIN_ROLE_PERMISSIONS)
// and the human labels stay in apps/api/src/admin/admin-rbac.ts, next to the
// seed that writes them.
//
// What IS shared is the spelling. The console fails permission checks CLOSED, so
// a key it spells differently from the API is a section that silently vanishes
// for every admin — a bug indistinguishable from a deliberate gate. The same
// hazard already bit this project once with a role key (`moderator` in the
// console vs `ops_admin` from the API, which would have made every ops admin
// appear signed out).

/**
 * The two role keys, named individually because both sides compare against
 * `super_admin` directly — the API to protect the last super admin who can
 * still sign in, the console to decide what to render. A bare literal in either
 * place is a typo waiting to fail closed.
 */
export const SUPER_ADMIN_ROLE_KEY = 'super_admin';
export const OPS_ADMIN_ROLE_KEY = 'ops_admin';

/** Role keys. Order is the seed order and the console's display order. */
export const ADMIN_ROLE_KEYS = [
  SUPER_ADMIN_ROLE_KEY,
  OPS_ADMIN_ROLE_KEY,
] as const;

export type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];

/**
 * The six permission keys, in `module:action` form.
 *
 * Order is contract-adjacent: apps/api builds its labelled catalogue and its
 * seed rows by mapping over this array, so reordering it reorders the seeded
 * lookup table. Add to the end.
 */
export const ADMIN_PERMISSION_KEYS = [
  'users:manage',
  'reports:manage',
  'comments:manage',
  'analytics:view',
  'platform:manage',
  'data:delete_all',
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];
