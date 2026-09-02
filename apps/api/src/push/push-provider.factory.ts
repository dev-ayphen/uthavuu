// Provider selection + the production hard-block, mirroring
// auth/auth.ts:25-35 exactly (docs/decisions/0007-temporary-dev-otp-fallback.md):
// real credentials always win, and booting with the console fallback active
// while NODE_ENV=production is a fatal error rather than a silent no-op.
//
// A silently no-op push in production is worse than a crash. Push is how a
// nearby volunteer learns an emergency request exists at all; "the API is up
// but nobody is ever notified" is the failure mode this throw exists to
// prevent.
//
// Unlike auth.ts, the environment is a PARAMETER rather than a direct
// `process.env` read at module scope. Same behaviour in the app — the default
// is process.env — but it makes the production block testable without
// jest.resetModules gymnastics, which is precisely why auth.ts's equivalent
// block has no test.

import { DevConsolePushProvider } from './dev-console-push.provider';
import { FcmPushProvider } from './fcm-push.provider';
import type { PushProvider } from './push-provider.interface';

export function hasFcmCredentials(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.FCM_PROJECT_ID && env.FCM_SERVICE_ACCOUNT_JSON);
}

export function createPushProvider(
  env: NodeJS.ProcessEnv = process.env,
): PushProvider {
  const hasCredentials = hasFcmCredentials(env);

  if (!hasCredentials && env.NODE_ENV === 'production') {
    throw new Error(
      'FCM_PROJECT_ID / FCM_SERVICE_ACCOUNT_JSON are required in production — refusing to start with the dev push fallback active.',
    );
  }

  return hasCredentials
    ? new FcmPushProvider(env.FCM_PROJECT_ID!, env.FCM_SERVICE_ACCOUNT_JSON!)
    : new DevConsolePushProvider();
}
