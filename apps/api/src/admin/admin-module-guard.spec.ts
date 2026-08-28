/**
 * The structural guarantee ADR 0009 rests on.
 *
 * "Every admin route is gated by construction. Publishing an ungated one
 * requires creating a whole new controller and omitting the decorator, which is
 * visible in review." Review is a human, so this suite is the mechanical half:
 * it walks the controllers AdminModule actually registers and asserts each one
 * carries AdminGuard at class level. Adding a controller without @AdminOnly()
 * fails here rather than publishing an admin route to the internet.
 *
 * The library mock below is why this file can exist at all. admin.decorators.ts
 * imports @thallesp/nestjs-better-auth, which ships ESM only and cannot be
 * loaded by this repo's CommonJS Jest transform (see the note at the top of
 * admin-rbac.ts). Stubbing the one decorator this module needs keeps the import
 * chain loadable without weakening what is being asserted — AdminGuard is the
 * real one.
 */
jest.mock('@thallesp/nestjs-better-auth', () => ({
  // OptionalAuth is metadata-only; the assertion below is about AdminGuard.
  OptionalAuth: () => () => undefined,
  Session: () => () => undefined,
  AuthModule: { forRoot: () => ({ module: class {} }) },
}));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminModule } from './admin.module';
import { AdminGuard } from './admin.guard';

type Ctor = new (...args: never[]) => unknown;

function controllersOf(moduleClass: Ctor): Ctor[] {
  return (Reflect.getMetadata('controllers', moduleClass) as Ctor[]) ?? [];
}

describe('AdminModule wiring', () => {
  const controllers = controllersOf(AdminModule as unknown as Ctor);

  it('registers controllers at all (a silent empty list would pass every test below)', () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  it.each(controllers.map((c) => [c.name, c] as const))(
    '%s is gated by AdminGuard at class level',
    (_name, controller) => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, controller) ??
        []) as unknown[];
      expect(guards).toContain(AdminGuard);
    },
  );

  it('every controller lives under the /admin path prefix', () => {
    // A second, independent way to be wrong: a correctly-guarded controller
    // mounted somewhere unexpected. The guard is what protects it, but the
    // prefix is what the console builds URLs against.
    for (const controller of controllers) {
      const path = Reflect.getMetadata('path', controller) as string;
      expect(path === 'admin' || path.startsWith('admin/')).toBe(true);
    }
  });
});
