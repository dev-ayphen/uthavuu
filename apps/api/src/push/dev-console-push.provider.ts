// Temporary dev-only fallback — the push equivalent of
// docs/decisions/0007-temporary-dev-otp-fallback.md's DevConsoleOtpProvider.
// Used only when FCM credentials are absent AND NODE_ENV !== 'production'
// (enforced in push-provider.factory.ts, not here): logs the notification it
// WOULD have sent, so the alert -> push path is exercised end to end before a
// Firebase project exists. The moment FCM_PROJECT_ID / FCM_SERVICE_ACCOUNT_JSON
// are set, FcmPushProvider takes over with no code change.

import { maskPushToken } from './mask-push-token';
import type {
  PushMessage,
  PushProvider,
  PushSendResult,
} from './push-provider.interface';

export class DevConsolePushProvider implements PushProvider {
  readonly name = 'dev-console';

  // Not `async`: there is nothing to await, and an async method with no await
  // trips @typescript-eslint/require-await.
  sendToTokens(tokens: string[], message: PushMessage): Promise<PushSendResult> {
    /* eslint-disable no-console */
    console.log(`\n🔔 DEV PUSH — no real FCM send (FCM not configured)`);
    console.log(`   Title:  ${message.title}`);
    console.log(`   Body:   ${message.body}`);
    if (message.data) {
      console.log(`   Data:   ${JSON.stringify(message.data)}`);
    }
    console.log(
      `   Tokens: ${tokens.length}${tokens.length > 0 ? ` [${tokens.map(maskPushToken).join(', ')}]` : ''}\n`,
    );
    /* eslint-enable no-console */

    // Reports every token as delivered and none as dead. Nothing was actually
    // sent, so inventing failures here would train the cleanup path on fiction.
    return Promise.resolve({
      sent: tokens.length,
      failed: 0,
      deadTokens: [],
    });
  }
}
