// Which passwords the admin seed is allowed to use, and when it must refuse.
//
// Split out of seed-admins.ts so it can be tested: seed-admins.ts imports the
// live Better Auth instance (for password hashing), and `better-auth` ships
// ESM only, which this repo's CommonJS Jest transform cannot load. This file
// imports nothing, so the rule that stops `Admin@123` reaching production is
// actually covered by tests rather than merely written down.
import type { AdminRoleKey } from '../admin/admin-rbac';

// The credentials docs/webadmin/01-admin-login.md prints on its preset buttons.
// Convenient in dev, disqualifying in production.
export const DEV_DEFAULT_SUPER_PASSWORD = 'Admin@123';
export const DEV_DEFAULT_OPS_PASSWORD = 'Ops@123';

export const PRODUCTION_MIN_PASSWORD_LENGTH = 12;

export interface SeedAdminSpec {
  email: string;
  name: string;
  roleKey: AdminRoleKey;
  password: string;
  usingDevDefault: boolean;
  envVar: string;
}

export function resolveAdminSpecs(
  env: NodeJS.ProcessEnv = process.env,
): SeedAdminSpec[] {
  const superPassword = env.SEED_ADMIN_PASSWORD?.trim();
  const opsPassword = env.SEED_OPS_PASSWORD?.trim();

  return [
    {
      email: 'admin@uthavu.org',
      name: 'Super Admin',
      roleKey: 'super_admin',
      password: superPassword || DEV_DEFAULT_SUPER_PASSWORD,
      usingDevDefault: !superPassword,
      envVar: 'SEED_ADMIN_PASSWORD',
    },
    {
      email: 'ops@uthavu.org',
      name: 'Ops Admin',
      roleKey: 'ops_admin',
      password: opsPassword || DEV_DEFAULT_OPS_PASSWORD,
      usingDevDefault: !opsPassword,
      envVar: 'SEED_OPS_PASSWORD',
    },
  ];
}

/**
 * Refuse to seed a production database with a password that is printed in a
 * public design document, or with one short enough to be worth guessing.
 *
 * Same shape of hard block auth.ts already applies to the dev OTP fallback: a
 * development convenience must be unable to reach production through inaction.
 * Seeding `Admin@123` into a live console is precisely the failure the
 * prototype shipped — and there the credentials were in the browser bundle too.
 *
 * Note this checks whether the env var was SET, not whether the value happens
 * to equal the default string. Someone who deliberately sets
 * SEED_ADMIN_PASSWORD='Admin@123' is caught by the length rule instead, and an
 * operator who sets a strong password that happens to start with 'Admin@' is
 * not falsely blocked.
 */
export function assertProductionSafe(
  specs: SeedAdminSpec[],
  nodeEnv = process.env.NODE_ENV,
): void {
  if (nodeEnv !== 'production') return;

  const unsafe = specs.filter((spec) => spec.usingDevDefault);
  if (unsafe.length > 0) {
    throw new Error(
      `Refusing to seed admin accounts in production with development default passwords. ` +
        `Set ${unsafe.map((s) => s.envVar).join(' and ')} to real secrets and re-run.`,
    );
  }

  const tooShort = specs.filter(
    (spec) => spec.password.length < PRODUCTION_MIN_PASSWORD_LENGTH,
  );
  if (tooShort.length > 0) {
    throw new Error(
      `Refusing to seed admin accounts in production with a password shorter than ` +
        `${PRODUCTION_MIN_PASSWORD_LENGTH} characters: ${tooShort.map((s) => s.envVar).join(', ')}.`,
    );
  }
}
