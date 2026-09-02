/**
 * The kill switches' decision rules.
 *
 * The failure this suite exists to prevent is not "maintenance mode lets writes
 * through". It is the opposite one: maintenance mode blocking `/admin/*` or the
 * auth routes, so the operator who turned it on cannot sign in and turn it off,
 * and the product is bricked until somebody runs SQL by hand. Every exemption
 * case below is asserted on its own row rather than inferred from a mixed
 * fixture, because getting any single one of them backwards is unrecoverable
 * from inside the product.
 */
import {
  decideWriteBlock,
  isExemptPath,
  isMutatingMethod,
  needsWriteBlockCheck,
  MAINTENANCE_MODE_MESSAGE,
  READ_ONLY_MODE_MESSAGE,
} from './maintenance-mode';

const OFF = { maintenanceMode: false, readOnlyMode: false };
const MAINTENANCE = { maintenanceMode: true, readOnlyMode: false };
const READ_ONLY = { maintenanceMode: false, readOnlyMode: true };
const BOTH = { maintenanceMode: true, readOnlyMode: true };

const citizenWrite = (settings: {
  maintenanceMode: boolean;
  readOnlyMode: boolean;
}) =>
  decideWriteBlock({
    method: 'POST',
    path: '/reports',
    isAdminRoute: false,
    settings,
  });

describe('isMutatingMethod', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'patch'])(
    '%s mutates',
    (method) => {
      expect(isMutatingMethod(method)).toBe(true);
    },
  );

  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('%s does not mutate', (method) => {
    expect(isMutatingMethod(method)).toBe(false);
  });
});

describe('isExemptPath', () => {
  it.each([
    '/admin',
    '/admin/',
    '/admin/settings',
    '/admin/users/123/suspend',
    '/api/auth/sign-in/email',
    '/api/auth/phone-number/verify',
  ])('%s is exempt', (path) => {
    expect(isExemptPath(path)).toBe(true);
  });

  it.each([
    '/reports',
    '/reports/123/comments',
    '/uploads',
    '/users/me',
    '/config',
  ])('%s is not exempt', (path) => {
    expect(isExemptPath(path)).toBe(false);
  });

  it('matches at a segment boundary, so a lookalike path is not exempted', () => {
    // The bug this catches: `startsWith('/admin')` alone would silently exempt
    // any future citizen route whose name happens to begin with those letters.
    expect(isExemptPath('/administrators')).toBe(false);
    expect(isExemptPath('/admin-signup')).toBe(false);
    expect(isExemptPath('/api/authenticate')).toBe(false);
  });

  it('ignores a query string', () => {
    expect(isExemptPath('/admin/users?page=2')).toBe(true);
  });
});

describe('decideWriteBlock', () => {
  it('lets citizen writes through when both switches are off', () => {
    expect(citizenWrite(OFF)).toBeNull();
  });

  it('blocks a citizen write with MAINTENANCE_MODE', () => {
    expect(citizenWrite(MAINTENANCE)).toEqual({
      code: 'MAINTENANCE_MODE',
      message: MAINTENANCE_MODE_MESSAGE,
    });
  });

  it('blocks a citizen write with READ_ONLY_MODE', () => {
    expect(citizenWrite(READ_ONLY)).toEqual({
      code: 'READ_ONLY_MODE',
      message: READ_ONLY_MODE_MESSAGE,
    });
  });

  it('reports MAINTENANCE_MODE when both switches are on', () => {
    // They block identically, so precedence only decides which code the client
    // is told — and the more specific one is the more actionable.
    expect(citizenWrite(BOTH)?.code).toBe('MAINTENANCE_MODE');
  });

  it('never blocks a read, in either mode', () => {
    for (const settings of [MAINTENANCE, READ_ONLY, BOTH]) {
      expect(
        decideWriteBlock({
          method: 'GET',
          path: '/reports',
          isAdminRoute: false,
          settings,
        }),
      ).toBeNull();
    }
  });

  // ---- The lockout guarantees ------------------------------------------

  it('never blocks an admin route, in either mode', () => {
    for (const settings of [MAINTENANCE, READ_ONLY, BOTH]) {
      expect(
        decideWriteBlock({
          method: 'PATCH',
          path: '/admin/settings',
          isAdminRoute: true,
          settings,
        }),
      ).toBeNull();
    }
  });

  it('never blocks PATCH /admin/settings even if isAdminRoute is somehow false', () => {
    // Belt and braces: the path exemption has to hold on its own, because the
    // metadata-derived flag is the thing most likely to be got wrong by a
    // future refactor — and this is the exact request that turns the switch
    // back off.
    expect(
      decideWriteBlock({
        method: 'PATCH',
        path: '/admin/settings',
        isAdminRoute: false,
        settings: BOTH,
      }),
    ).toBeNull();
  });

  it('never blocks the auth routes, so an operator can always sign in', () => {
    for (const path of [
      '/api/auth/sign-in/email',
      '/api/auth/sign-out',
      '/api/auth/phone-number/send-otp',
      '/api/auth/phone-number/verify',
    ]) {
      expect(
        decideWriteBlock({
          method: 'POST',
          path,
          isAdminRoute: false,
          settings: BOTH,
        }),
      ).toBeNull();
    }
  });
});

describe('needsWriteBlockCheck', () => {
  // The guard uses this to skip the settings read. If it ever disagreed with
  // decideWriteBlock about who is exempt, the guard would either query on every
  // GET (harmless) or skip the check on a request that should have been blocked
  // (not harmless) — so the two are asserted against each other.
  it.each([
    ['POST', '/reports', false, true],
    ['GET', '/reports', false, false],
    ['POST', '/admin/settings', true, false],
    ['PATCH', '/admin/settings', false, false],
    ['POST', '/api/auth/sign-in/email', false, false],
  ] as const)(
    '%s %s (isAdminRoute=%s) -> %s',
    (method, path, isAdminRoute, expected) => {
      expect(needsWriteBlockCheck({ method, path, isAdminRoute })).toBe(
        expected,
      );

      // Whenever the fast path says "no check needed", the full decision must
      // agree that nothing is blocked — even with both switches on.
      if (!expected) {
        expect(
          decideWriteBlock({ method, path, isAdminRoute, settings: BOTH }),
        ).toBeNull();
      }
    },
  );
});
