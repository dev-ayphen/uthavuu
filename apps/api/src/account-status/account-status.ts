import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  userAccountStatus,
  userStatuses,
} from '../db/schema/user-status-schema';

/**
 * The one function that answers "is this account suspended".
 *
 * A plain exported function, not an injectable service, for a specific reason:
 * it has two callers on opposite sides of the DI boundary. `auth/auth.ts` builds
 * the Better Auth instance outside NestJS's DI graph (the
 * `@thallesp/nestjs-better-auth` pattern of a bare `export const auth`), so it
 * cannot inject anything — and the login block has to live there, because
 * session creation is the only chokepoint every sign-in path passes through.
 * `SuspendedAccountGuard` is inside the graph. One plain function keeps them
 * reading the same rule instead of two implementations that can disagree about
 * what "suspended" means. Same reasoning, and the same shape, as lib/redis.ts.
 *
 * NOT CACHED, deliberately. This is a single-row primary-key lookup against a
 * table that holds one row per suspended user — Postgres serves it from shared
 * buffers. A Redis cache would buy microseconds and cost a window in which a
 * just-suspended account keeps working, which is the wrong side of that trade
 * for a moderation control. AdminService.findAdminIdentity() made the identical
 * call for the identical reason. If this ever shows up in a profile, the fix is
 * a cache with explicit invalidation on suspend/unsuspend, not a bare TTL.
 */
export async function isUserSuspended(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: userAccountStatus.userId })
    .from(userAccountStatus)
    .innerJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
    .where(
      and(
        eq(userAccountStatus.userId, userId),
        eq(userStatuses.key, SUSPENDED_STATUS_KEY),
      ),
    );

  // No row at all is the overwhelmingly common case and means active — see the
  // "absence of a row" note in db/schema/user-status-schema.ts.
  return row !== undefined;
}

export const ACTIVE_STATUS_KEY = 'active';
export const SUSPENDED_STATUS_KEY = 'suspended';

/**
 * The error code every suspension rejection carries, on both enforcement paths.
 *
 * It exists so the mobile client can tell "your account was suspended" apart
 * from "your session expired". Those need opposite responses — the second should
 * silently re-authenticate, the first must show the user an honest message and
 * must NOT clear their token and bounce them to the login screen as though
 * nothing had happened. A bare 401 is indistinguishable from an expired session,
 * which is exactly why suspension answers 403 with this code instead.
 *
 * The string itself now lives in @uthavu/libs-common, because the client that
 * has to recognise it is the other half of the contract and used to keep its
 * own copy. Re-exported under the local `_CODE` name so it still reads as a
 * pair with ACCOUNT_SUSPENDED_MESSAGE below — the message is server-authored
 * prose and stays here; mobile renders its own localised copy.
 */
export { ACCOUNT_SUSPENDED as ACCOUNT_SUSPENDED_CODE } from '@uthavu/libs-common';

export const ACCOUNT_SUSPENDED_MESSAGE =
  'This account has been suspended. Contact support if you believe this is a mistake.';
