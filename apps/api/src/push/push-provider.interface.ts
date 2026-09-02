// The delivery seam for FCM push notifications.
//
// Two implementations sit behind it — FcmPushProvider (real) and
// DevConsolePushProvider (logs what it would have sent) — chosen by credential
// presence in push-provider.factory.ts. That is the pattern ADR 0007
// established for OTP and ADR 0008 for photo storage: build the real thing,
// keep a dev fallback for the credentials that don't exist yet, and hard-block
// the fallback in production so it can never silently reach a real user.

/**
 * Notification copy, ALREADY RENDERED in the recipient's locale. Nothing below
 * this interface knows about alert types, templates or languages — a provider
 * only ships strings. Rendering happens at the alerts seam
 * (alerts/alerts.service.ts -> alert-templates.ts), which is what keeps push
 * copy and in-app copy from drifting apart.
 */
export type PushMessage = {
  title: string;
  body: string;
  /**
   * FCM's data payload. Values must be strings — the FCM v1 API rejects
   * numbers, booleans and nulls outright, so callers stringify before they get
   * here rather than discovering it as a 400 at send time.
   */
  data?: Record<string, string>;
};

export type PushSendResult = {
  sent: number;
  failed: number;
  /**
   * Tokens FCM reported as PERMANENTLY undeliverable — the app was uninstalled,
   * or the token was rotated. Their `devices` rows get deleted (PushService).
   * A transient failure (server-unavailable, rate limit) must never appear
   * here: retrying later is the correct response to those, and deleting the row
   * would silently unsubscribe a live handset.
   */
  deadTokens: string[];
};

export function emptyPushResult(): PushSendResult {
  return { sent: 0, failed: 0, deadTokens: [] };
}

export interface PushProvider {
  /** Identifies which implementation is live, for logs and tests. */
  readonly name: string;

  /**
   * Best-effort by contract. Implementations report per-token outcomes in the
   * result rather than throwing on partial failure; they may still throw on a
   * total failure (network down, credentials rejected), which PushService
   * absorbs.
   */
  sendToTokens(tokens: string[], message: PushMessage): Promise<PushSendResult>;
}

/** DI token — see push.module.ts. */
export const PUSH_PROVIDER = 'PUSH_PROVIDER';
