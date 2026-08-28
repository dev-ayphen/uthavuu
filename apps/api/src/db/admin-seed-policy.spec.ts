import {
  DEV_DEFAULT_OPS_PASSWORD,
  DEV_DEFAULT_SUPER_PASSWORD,
  assertProductionSafe,
  resolveAdminSpecs,
} from './admin-seed-policy';

const STRONG = 'a-genuinely-long-secret-value';

describe('admin seed password policy', () => {
  describe('resolveAdminSpecs', () => {
    it('falls back to the documented dev defaults when nothing is configured', () => {
      const specs = resolveAdminSpecs({});

      expect(specs.map((s) => s.email)).toEqual([
        'admin@uthavu.org',
        'ops@uthavu.org',
      ]);
      expect(specs.map((s) => s.roleKey)).toEqual(['super_admin', 'ops_admin']);
      expect(specs[0].password).toBe(DEV_DEFAULT_SUPER_PASSWORD);
      expect(specs[1].password).toBe(DEV_DEFAULT_OPS_PASSWORD);
      expect(specs.every((s) => s.usingDevDefault)).toBe(true);
    });

    it('uses configured passwords and stops flagging them as defaults', () => {
      const specs = resolveAdminSpecs({
        SEED_ADMIN_PASSWORD: STRONG,
        SEED_OPS_PASSWORD: STRONG,
      });

      expect(specs.every((s) => s.password === STRONG)).toBe(true);
      expect(specs.every((s) => !s.usingDevDefault)).toBe(true);
    });

    it('treats a whitespace-only value as unset rather than as a password', () => {
      const specs = resolveAdminSpecs({ SEED_ADMIN_PASSWORD: '   ' });
      expect(specs[0].usingDevDefault).toBe(true);
      expect(specs[0].password).toBe(DEV_DEFAULT_SUPER_PASSWORD);
    });

    it('can configure one account without the other', () => {
      const specs = resolveAdminSpecs({ SEED_ADMIN_PASSWORD: STRONG });
      expect(specs[0].usingDevDefault).toBe(false);
      expect(specs[1].usingDevDefault).toBe(true);
    });
  });

  describe('assertProductionSafe', () => {
    it('allows the dev defaults outside production', () => {
      expect(() =>
        assertProductionSafe(resolveAdminSpecs({}), 'development'),
      ).not.toThrow();
      expect(() =>
        assertProductionSafe(resolveAdminSpecs({}), undefined),
      ).not.toThrow();
      expect(() =>
        assertProductionSafe(resolveAdminSpecs({}), 'test'),
      ).not.toThrow();
    });

    it('refuses to seed production with the dev defaults, naming both env vars', () => {
      expect(() =>
        assertProductionSafe(resolveAdminSpecs({}), 'production'),
      ).toThrow(/SEED_ADMIN_PASSWORD and SEED_OPS_PASSWORD/);
    });

    it('refuses production when only one account is still on a default', () => {
      const specs = resolveAdminSpecs({ SEED_ADMIN_PASSWORD: STRONG });
      expect(() => assertProductionSafe(specs, 'production')).toThrow(
        /SEED_OPS_PASSWORD/,
      );
    });

    it('refuses a configured but short production password', () => {
      const specs = resolveAdminSpecs({
        SEED_ADMIN_PASSWORD: 'short12',
        SEED_OPS_PASSWORD: STRONG,
      });
      expect(() => assertProductionSafe(specs, 'production')).toThrow(
        /shorter than 12 characters/,
      );
    });

    it('catches someone who deliberately sets the leaked default as their value', () => {
      // usingDevDefault is false here — the var WAS set. The length rule is what
      // stops it, which is why both rules exist.
      const specs = resolveAdminSpecs({
        SEED_ADMIN_PASSWORD: DEV_DEFAULT_SUPER_PASSWORD,
        SEED_OPS_PASSWORD: STRONG,
      });
      expect(specs[0].usingDevDefault).toBe(false);
      expect(() => assertProductionSafe(specs, 'production')).toThrow(
        /shorter than 12 characters/,
      );
    });

    it('permits production with two strong configured passwords', () => {
      const specs = resolveAdminSpecs({
        SEED_ADMIN_PASSWORD: STRONG,
        SEED_OPS_PASSWORD: STRONG,
      });
      expect(() => assertProductionSafe(specs, 'production')).not.toThrow();
    });
  });
});
