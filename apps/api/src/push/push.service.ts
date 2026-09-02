import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { devices } from '../db/schema/devices-schema';
import { maskPushToken } from './mask-push-token';
import { createPushProvider } from './push-provider.factory';
import {
  emptyPushResult,
  PUSH_PROVIDER,
  type PushMessage,
  type PushProvider,
  type PushSendResult,
} from './push-provider.interface';

@Injectable()
export class PushService {
  constructor(
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  /**
   * Delivers one notification to every device a user has registered.
   *
   * NEVER THROWS. This is the load-bearing property of the whole module: push
   * is a side effect of something the user actually did — reporting an
   * emergency, accepting a mission, completing one — and none of those may fail
   * because Firebase is unreachable, a credential expired, or the `devices`
   * table is locked. Every failure is caught, logged and reported in the return
   * value. Callers may ignore the result entirely and be correct.
   */
  async sendToUser(
    userId: string,
    message: PushMessage,
  ): Promise<PushSendResult> {
    let tokens: string[] = [];

    try {
      const rows = await db
        .select({ pushToken: devices.pushToken })
        .from(devices)
        .where(eq(devices.userId, userId));

      tokens = rows.map((row) => row.pushToken);
      // The overwhelmingly common case today: nothing registered, nothing to
      // do. Returning before touching the provider keeps the dev console quiet
      // instead of logging a "sent to 0 devices" line on every alert.
      if (tokens.length === 0) return emptyPushResult();

      const result = await this.provider.sendToTokens(tokens, message);
      await this.pruneDeadTokens(result.deadTokens);
      return result;
    } catch (error) {
      this.warn(
        `push send failed for user ${userId} via ${this.provider.name} (${tokens.length} token(s))`,
        error,
      );
      return emptyPushResult();
    }
  }

  /**
   * Deletes the `devices` rows FCM reported as permanently undeliverable.
   *
   * Without this the table only ever grows: every reinstall and every token
   * rotation leaves a row behind that is retried on every future alert,
   * forever. Deleting by token rather than by (user, token) is deliberate —
   * `devices.pushToken` is globally unique (devices-schema.ts), and a token FCM
   * has rejected is dead for whichever account currently claims it.
   *
   * Isolated in its own try/catch so a cleanup failure never discards a send
   * that actually succeeded.
   */
  private async pruneDeadTokens(deadTokens: string[]): Promise<void> {
    if (deadTokens.length === 0) return;

    try {
      await db.delete(devices).where(inArray(devices.pushToken, deadTokens));
      this.log(
        `pruned ${deadTokens.length} dead push token(s): ${deadTokens.map(maskPushToken).join(', ')}`,
      );
    } catch (error) {
      this.warn('failed to prune dead push tokens', error);
    }
  }

  // This codebase has no logger abstraction yet — auth/otp and db/seed both use
  // console directly — so these match the house style rather than introducing a
  // logging dependency as a side effect of a push feature.
  private log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`[push] ${message}`);
  }

  private warn(message: string, error?: unknown): void {
    // eslint-disable-next-line no-console
    console.warn(`[push] ${message}`, error instanceof Error ? error.message : error);
  }
}

// The instance used when a PushService is not supplied by Nest's DI container —
// i.e. when a service that depends on it is constructed by hand in a unit test
// (`new AlertsService()`, which several existing specs do). Memoised so those
// tests don't build a provider per construction.
//
// In the running app DI always wins: AlertsModule imports PushModule, so the
// container-built instance is the one AlertsService receives.
let fallbackInstance: PushService | null = null;

export function defaultPushService(): PushService {
  fallbackInstance ??= new PushService(createPushProvider());
  return fallbackInstance;
}
