/**
 * MaintenanceGuard, end to end through a NestJS execution context.
 *
 * maintenance-mode.spec.ts asserts the rules; this asserts the wiring — that
 * the guard reads the method and path off the request, derives `isAdminRoute`
 * from the controller's own `@Controller()` metadata, and turns a block into a
 * 403 carrying the machine-readable code the mobile client keys on.
 *
 * `./platform-settings` is mocked so no database is involved AND so the real
 * module — which opens a postgres client at import time — is never loaded.
 */
jest.mock('./platform-settings', () => ({
  getPlatformConfig: jest.fn(),
}));

import { Controller, ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { getPlatformConfig } from './platform-settings';
import { MaintenanceGuard } from './maintenance.guard';

const mockedGetPlatformConfig = getPlatformConfig as jest.MockedFunction<
  typeof getPlatformConfig
>;

@Controller('reports')
class FakeReportsController {}

@Controller('admin/settings')
class FakeAdminSettingsController {}

/** A controller mounted somewhere unexpected — the case the path check covers. */
@Controller('uploads')
class FakeUploadsController {}

function contextFor(options: {
  method: string;
  path: string;
  controller: unknown;
}): ExecutionContext {
  return {
    getType: () => 'http',
    getClass: () => options.controller,
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ method: options.method, path: options.path }),
    }),
  } as unknown as ExecutionContext;
}

const settings = (
  overrides: Partial<{
    maintenanceMode: boolean;
    readOnlyMode: boolean;
  }>,
) => ({
  appName: 'Uthavu',
  supportEmail: null,
  supportPhone: null,
  maxPhotosPerReport: 4,
  maxVolunteersPerReport: 20,
  defaultRadiusKm: 5,
  allowAnonymousReports: true,
  commentsEnabled: true,
  commentFlaggingEnabled: true,
  maintenanceMode: false,
  readOnlyMode: false,
  ...overrides,
});

describe('MaintenanceGuard', () => {
  let guard: MaintenanceGuard;

  beforeEach(() => {
    guard = new MaintenanceGuard();
    mockedGetPlatformConfig.mockReset();
    mockedGetPlatformConfig.mockResolvedValue(settings({}));
  });

  it('allows a citizen write when both switches are off', async () => {
    await expect(
      guard.canActivate(
        contextFor({
          method: 'POST',
          path: '/reports',
          controller: FakeReportsController,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a citizen write with 403 MAINTENANCE_MODE', async () => {
    mockedGetPlatformConfig.mockResolvedValue(
      settings({ maintenanceMode: true }),
    );

    const context = contextFor({
      method: 'POST',
      path: '/reports',
      controller: FakeReportsController,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'MAINTENANCE_MODE' },
      status: 403,
    });
  });

  it('rejects a citizen write with 403 READ_ONLY_MODE', async () => {
    mockedGetPlatformConfig.mockResolvedValue(settings({ readOnlyMode: true }));

    await expect(
      guard.canActivate(
        contextFor({
          method: 'POST',
          path: '/uploads',
          controller: FakeUploadsController,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'READ_ONLY_MODE' } });
  });

  // ---- The lockout guarantee -------------------------------------------

  it('lets PATCH /admin/settings through while maintenance mode is on', async () => {
    // The single most important assertion in this feature: this is the request
    // that turns the switch back off.
    mockedGetPlatformConfig.mockResolvedValue(
      settings({ maintenanceMode: true, readOnlyMode: true }),
    );

    await expect(
      guard.canActivate(
        contextFor({
          method: 'PATCH',
          path: '/admin/settings',
          controller: FakeAdminSettingsController,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('exempts admin routes without reading the settings at all', async () => {
    mockedGetPlatformConfig.mockResolvedValue(
      settings({ maintenanceMode: true }),
    );

    await guard.canActivate(
      contextFor({
        method: 'POST',
        path: '/admin/users/abc/suspend',
        controller: FakeAdminSettingsController,
      }),
    );

    // If an admin route ever started depending on the settings row being
    // readable, a database problem could lock the console out during exactly
    // the incident the console is needed for.
    expect(mockedGetPlatformConfig).not.toHaveBeenCalled();
  });

  it('never blocks a read, and never queries for one', async () => {
    mockedGetPlatformConfig.mockResolvedValue(
      settings({ maintenanceMode: true }),
    );

    await expect(
      guard.canActivate(
        contextFor({
          method: 'GET',
          path: '/reports',
          controller: FakeReportsController,
        }),
      ),
    ).resolves.toBe(true);

    expect(mockedGetPlatformConfig).not.toHaveBeenCalled();
  });

  it('passes non-HTTP contexts straight through', async () => {
    const wsContext = {
      getType: () => 'ws',
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(wsContext)).resolves.toBe(true);
  });
});
