// Admin identity + RBAC for the admin console (docs/webadmin/01-admin-login.md,
// 09-admins-and-audit.md).
//
// Four tables, and the shape of them is the whole point:
//
//   admin_roles            lookup — 'super_admin' | 'ops_admin'
//   admin_permissions      lookup — the six capability flags the design shows
//   admin_role_permissions which role holds which permission (data, not code)
//   admin_users            WHICH USERS ARE ADMINS AT ALL
//
// `admin_users` is the honest model of "most people are not admins": a citizen
// has no row here, not a row saying 'none'. There is no `role` column on
// `user`, so there is no default value that could ever mean "admin" — the
// absence of a row is the absence of access, which is the only default that
// fails closed. That is the direct answer to the prototype's
// `isSuperAdmin = roleParam !== 'ops'` (docs/webadmin/02-dashboard-shell.md §3),
// where every value except one literal string meant Super Admin.
//
// Roles and permissions are lookup tables joined by FK rather than hardcoded
// text enums (CLAUDE.md § Database), so granting Ops the analytics flag is a
// `db:seed` change, not a migration.
//
// Better Auth owns `user`/`session`/`account`/`verification` — nothing here
// renames or alters them, it only references `user.id`.
import { relations } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const adminRoles = pgTable('admin_roles', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// `key` is the `module:action` form from .claude/agents/backend-agent.md §3.2.
// `label` is the human name the Admins tab renders in its permission matrix.
export const adminPermissions = pgTable('admin_permissions', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const adminRolePermissions = pgTable(
  'admin_role_permissions',
  {
    id: uuid('id').primaryKey(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => adminRoles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => adminPermissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('admin_role_permissions_role_id_permission_id_key').on(
      table.roleId,
      table.permissionId,
    ),
    index('admin_role_permissions_role_id_idx').on(table.roleId),
  ],
);

// The admin roster. `userId` is the primary key, so one user holds at most one
// admin role — which is what docs/webadmin/09-admins-and-audit.md shows (a
// single Role column per admin, permissions derived from it), and it removes
// the "which of my three roles wins" question entirely.
//
// CASCADE on delete: if the underlying account is deleted, the admin grant goes
// with it. This is deliberately NOT the SET NULL that reports/missions use —
// those preserve community history with the identity stripped; an authorization
// grant with no subject is not history worth keeping, it is a dangling
// privilege.
export const adminUsers = pgTable(
  'admin_users',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => adminRoles.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('admin_users_role_id_idx').on(table.roleId)],
);

export const adminRoleRelations = relations(adminRoles, ({ many }) => ({
  permissions: many(adminRolePermissions),
  admins: many(adminUsers),
}));

export const adminPermissionRelations = relations(
  adminPermissions,
  ({ many }) => ({
    roles: many(adminRolePermissions),
  }),
);

export const adminRolePermissionRelations = relations(
  adminRolePermissions,
  ({ one }) => ({
    role: one(adminRoles, {
      fields: [adminRolePermissions.roleId],
      references: [adminRoles.id],
    }),
    permission: one(adminPermissions, {
      fields: [adminRolePermissions.permissionId],
      references: [adminPermissions.id],
    }),
  }),
);

export const adminUserRelations = relations(adminUsers, ({ one }) => ({
  user: one(user, { fields: [adminUsers.userId], references: [user.id] }),
  role: one(adminRoles, {
    fields: [adminUsers.roleId],
    references: [adminRoles.id],
  }),
}));
