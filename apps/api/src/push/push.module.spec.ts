// Proves the DI graph, not just that it type-checks: PushModule builds a
// provider through the factory, and AlertsService actually receives that
// container-built instance rather than silently falling through to its
// `@Optional()` default.
//
// AlertsService is registered directly instead of importing AlertsModule.
// AlertsModule pulls in AlertsController, which imports the ESM-only
// @thallesp/nestjs-better-auth and therefore cannot be loaded under this
// package's CommonJS Jest transform — the same constraint auth.ts documents,
// and the reason its own production hard-block has no test. Everything this
// test is about (the PushModule -> AlertsService edge) is below that line.

import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { AlertsService } from '../alerts/alerts.service';
import { PushModule } from './push.module';
import { PushService } from './push.service';

describe('PushModule wiring', () => {
  it('injects the container-built PushService into AlertsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PushModule],
      providers: [AlertsService],
    }).compile();

    const alertsService = moduleRef.get(AlertsService);
    const pushService = moduleRef.get(PushService);

    // If this were falling back to defaultPushService(), it would be a
    // different object — and a change to the container's provider selection
    // would silently not apply to alerts.
    expect(
      (alertsService as unknown as { pushService: PushService }).pushService,
    ).toBe(pushService);

    await moduleRef.close();
  });

  // The hard-block lives in the factory that this useFactory calls, so a
  // provider existing here is what makes that block a STARTUP failure in
  // production rather than a first-send failure.
  it('selects a provider through the factory at module init', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PushModule],
    }).compile();

    const pushService = moduleRef.get(PushService);
    const provider = (pushService as unknown as { provider: { name: string } })
      .provider;

    // No FCM credentials in the test environment, so this is the documented
    // ADR-0007-shaped fallback. Asserting the set rather than the value keeps
    // the test honest if someone runs the suite with real credentials set.
    expect(['fcm', 'dev-console']).toContain(provider.name);

    await moduleRef.close();
  });
});
