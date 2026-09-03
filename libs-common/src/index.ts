// @uthavu/libs-common — the contract constants apps/api, apps/admin and
// libs-mobile must agree on, letter for letter.
//
// HARD RULE: ZERO RUNTIME DEPENDENCIES. This package is imported by NestJS
// (CommonJS on Node), Next.js (bundler) and React Native (Metro) alike, so it
// contains plain TypeScript constants and types and nothing else — no zod, no
// drizzle, no React, no Node built-ins. Adding a dependency here breaks one of
// the three consumers, and which one is not obvious until it does.
//
// It also holds no BEHAVIOUR. Guards, messages, i18n copy and error-to-prose
// maps stay in the app that owns them; only the strings both sides compare
// against live here.

export {
  ACCOUNT_SUSPENDED,
  ADMIN_GATE_CODES,
  ADMIN_MISSING_PERMISSION,
  ADMIN_NOT_AN_ADMIN,
  ADMIN_NO_SESSION,
  MAINTENANCE_MODE,
  PLATFORM_BLOCK_CODES,
  READ_ONLY_MODE,
} from './error-codes';
export type { AdminGateCode, PlatformBlockCode } from './error-codes';

export {
  ADMIN_PERMISSION_KEYS,
  ADMIN_ROLE_KEYS,
  OPS_ADMIN_ROLE_KEY,
  SUPER_ADMIN_ROLE_KEY,
} from './admin-rbac';
export type { AdminPermissionKey, AdminRoleKey } from './admin-rbac';
