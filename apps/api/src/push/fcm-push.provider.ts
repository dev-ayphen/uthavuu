// Verified against the INSTALLED firebase-admin 14.3.0 type definitions
// (lib/messaging/messaging.d.ts, lib/app/credential-factory.d.ts), not written
// from memory — per CLAUDE.md's "look it up, don't recall it" rule. Two things
// that check catches:
//
//   1. `sendMulticast()` no longer exists. It was removed in firebase-admin 13;
//      the current batch API is `sendEachForMulticast()`, which sends one HTTP
//      request per message and returns a per-message BatchResponse. That
//      per-message detail is exactly what dead-token cleanup depends on.
//   2. In 14.x the token-addressed types (`MulticastMessage.tokens`,
//      `TokenMessage.token`) are marked @deprecated in favour of Firebase
//      Installation IDs (`fids`). They are deprecated, not removed, and tokens
//      are what this product actually has: `devices.pushToken` stores an FCM
//      registration token that the mobile client registers (POST /devices).
//      Moving to FIDs is a mobile-side change, so the token path is the correct
//      one here and is deliberately not "fixed".

import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import {
  emptyPushResult,
  type PushMessage,
  type PushProvider,
  type PushSendResult,
} from './push-provider.interface';

// A named app, never the default one. Better Auth, Drizzle and anything else in
// this process are free to initialise their own Firebase app without colliding
// with ours, and re-entering this code path finds the existing app instead of
// throwing "app already exists".
const FIREBASE_APP_NAME = 'uthavu-push';

// FCM's documented ceiling for one sendEachForMulticast call.
const MAX_TOKENS_PER_BATCH = 500;

// Codes that mean "this token will never work again", so its `devices` row
// should be deleted (firebase-admin lib/messaging/error.js, prefixed with the
// service name by `codePrefix = 'messaging'`).
//
// DELIBERATELY EXCLUDED: 'messaging/invalid-argument'. FCM returns that code
// both for a malformed *token* and for a malformed *message*, and the two are
// indistinguishable in the per-token response. Treating it as a dead token
// would mean one bad payload — a template bug, a non-string data value — is
// enough to delete EVERY row in `devices`, for every user, permanently and
// unrecoverably, since a push token can only be re-obtained from the handset
// itself. The cost of the opposite mistake is one dead row that keeps failing
// harmlessly, so this errs deliberately: a malformed token is never cleaned up
// here, and that is the cheaper bug.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

function isDeadTokenError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && DEAD_TOKEN_CODES.has(code);
}

/**
 * Picks the permanently-dead tokens out of one batch response.
 *
 * Exported, and a pure function, because this is the one decision in the module
 * that can destroy data: it is what deletes rows from `devices`. It gets tested
 * directly against synthetic responses rather than only through a live Firebase
 * client, which nothing in CI has.
 *
 * `responses` is index-aligned with `tokens` — that alignment is the entire
 * mechanism, so a length mismatch is treated as "classify nothing" rather than
 * risking deleting a token that a different response was about.
 */
export function collectDeadTokens(
  responses: readonly { success: boolean; error?: unknown }[],
  tokens: readonly string[],
): string[] {
  if (responses.length !== tokens.length) return [];

  const dead: string[] = [];
  responses.forEach((response, index) => {
    if (!response.success && isDeadTokenError(response.error)) {
      dead.push(tokens[index]);
    }
  });
  return dead;
}

/**
 * Accepts either the raw service-account JSON or the same JSON base64-encoded.
 * The base64 form matters in practice: a service account's `private_key`
 * contains literal newlines, which most .env parsers and CI secret UIs mangle.
 */
export function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = raw.trim();
  const text = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');

  let parsed: { project_id?: string; client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error(
      'FCM_SERVICE_ACCOUNT_JSON is neither valid JSON nor base64-encoded JSON — cannot initialise FCM.',
    );
  }

  const missing = (
    ['project_id', 'client_email', 'private_key'] as const
  ).filter((key) => typeof parsed[key] !== 'string' || parsed[key] === '');
  if (missing.length > 0) {
    throw new Error(
      `FCM_SERVICE_ACCOUNT_JSON is missing required field(s): ${missing.join(', ')}.`,
    );
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}

export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';

  private messaging: Messaging | null = null;

  constructor(
    private readonly projectId: string,
    private readonly serviceAccountJson: string,
  ) {}

  // Lazy and memoised. Parsing credentials is cheap, but doing it on first send
  // rather than in the constructor keeps constructing a provider free of side
  // effects, which is what lets push-provider.factory.spec.ts assert selection
  // without a Firebase project existing.
  private getMessaging(): Messaging {
    if (this.messaging) return this.messaging;

    const serviceAccount = parseServiceAccount(this.serviceAccountJson);

    // A service account pasted from the wrong Firebase project is a real and
    // very confusing misconfiguration: every send fails with
    // 'messaging/mismatched-credential' at runtime, long after the mistake.
    // Both env vars are documented as required, so cross-checking them costs
    // nothing and turns that into one clear message.
    if (serviceAccount.projectId !== this.projectId) {
      throw new Error(
        `FCM_PROJECT_ID (${this.projectId}) does not match the project_id in FCM_SERVICE_ACCOUNT_JSON (${String(serviceAccount.projectId)}).`,
      );
    }

    const existing: App | undefined = getApps().find(
      (app) => app.name === FIREBASE_APP_NAME,
    );
    const app =
      existing ??
      initializeApp(
        { credential: cert(serviceAccount), projectId: this.projectId },
        FIREBASE_APP_NAME,
      );

    this.messaging = getMessaging(app);
    return this.messaging;
  }

  async sendToTokens(
    tokens: string[],
    message: PushMessage,
  ): Promise<PushSendResult> {
    if (tokens.length === 0) return emptyPushResult();

    const messaging = this.getMessaging();
    const result = emptyPushResult();

    for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_BATCH) {
      const batch = tokens.slice(i, i + MAX_TOKENS_PER_BATCH);

      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: message.title, body: message.body },
        ...(message.data ? { data: message.data } : {}),
      });

      result.sent += response.successCount;
      result.failed += response.failureCount;
      result.deadTokens.push(...collectDeadTokens(response.responses, batch));
    }

    return result;
  }
}
