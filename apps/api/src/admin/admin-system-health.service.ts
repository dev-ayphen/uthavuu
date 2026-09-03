import fs from 'node:fs';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Platform -> System health.
 *
 * Runtime facts only. No new table, nothing persisted, nothing sampled over
 * time — this answers "is the thing up right now, and what is it running",
 * which is what the console's page needs and all this codebase can honestly
 * supply. A latency graph would need a metrics store that does not exist, and
 * inventing one from a single sample would be a fabricated fact.
 *
 * Every check reports `reachable: false` plus the error rather than throwing.
 * A health endpoint that 500s when a dependency is down tells the operator
 * nothing except that something is wrong; the whole point is to say WHICH.
 */
@Injectable()
export class AdminSystemHealthService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      // Overall status derived from the parts, so the console has one thing to
      // colour a badge with.
      status: database.reachable && redis.reachable ? 'healthy' : 'degraded',
      database,
      redis,
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        nodeVersion: process.version,
        // Unset in the local Docker image on purpose — see the Dockerfile note
        // about ADR 0007's OTP fallback. Reported as null rather than guessed.
        nodeEnv: process.env.NODE_ENV ?? null,
      },
      config: this.configFlags(),
      checkedAt: new Date().toISOString(),
    };
  }

  private async checkDatabase() {
    const startedAt = Date.now();
    try {
      await db.execute(sql`select 1`);
      const latencyMs = Date.now() - startedAt;

      // drizzle's own bookkeeping table. `created_at` is the epoch-ms stamp
      // from the migration journal, which is what lets the applied head be
      // matched back to a file name below.
      const applied = await db.execute<{
        count: string;
        latest: string | null;
      }>(
        sql`select count(*)::text as count, max(created_at)::text as latest from drizzle.__drizzle_migrations`,
      );
      const row = (
        applied as unknown as Array<{ count: string; latest: string | null }>
      )[0];
      const appliedCount = Number(row?.count ?? 0);
      const latestEpochMs =
        row?.latest === null || row?.latest === undefined
          ? null
          : Number(row.latest);

      return {
        reachable: true,
        latencyMs,
        error: null,
        migrations: {
          applied: appliedCount,
          latestAppliedAt:
            latestEpochMs === null
              ? null
              : new Date(latestEpochMs).toISOString(),
          head: this.migrationHead(latestEpochMs),
        },
      };
    } catch (error) {
      return {
        reachable: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        migrations: null,
      };
    }
  }

  /**
   * Maps the newest applied migration's timestamp back to its file name via the
   * committed journal, so the console can show "0019_motionless_invaders"
   * instead of an epoch. Returns null rather than guessing when the journal is
   * not on disk — it is COPYed into the runtime image (see the Dockerfile), but
   * a future packaging change should degrade to "unknown", not to a wrong name.
   */
  private migrationHead(latestEpochMs: number | null): string | null {
    if (latestEpochMs === null) return null;

    const candidates = [
      path.join(__dirname, '..', '..', 'drizzle', 'meta', '_journal.json'),
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        'drizzle',
        'meta',
        '_journal.json',
      ),
      path.join(process.cwd(), 'drizzle', 'meta', '_journal.json'),
    ];

    for (const candidate of candidates) {
      try {
        if (!fs.existsSync(candidate)) continue;
        const journal = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
          entries: Array<{ when: number; tag: string }>;
        };
        return (
          journal.entries.find((e) => e.when === latestEpochMs)?.tag ?? null
        );
      } catch {
        // A malformed or unreadable journal is not a reason to fail the health
        // check — the database half of the answer is the important half.
        continue;
      }
    }
    return null;
  }

  private async checkRedis() {
    const startedAt = Date.now();
    try {
      const pong = await this.redis.ping();
      return {
        reachable: pong === 'PONG',
        latencyMs: Date.now() - startedAt,
        error: null,
      };
    } catch (error) {
      return {
        reachable: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Whether a credential is CONFIGURED — never the credential itself, and never
   * a prefix of one. Booleans only.
   */
  private configFlags() {
    const msg91Configured = Boolean(
      process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID,
    );
    return {
      adminUrlConfigured: Boolean(process.env.ADMIN_URL),
      msg91Configured,
      // ADR 0007: with no msg91 credentials the API logs the OTP to its own
      // console instead of sending SMS. Surfaced because an operator seeing
      // "no OTP received" needs to know this is why.
      devOtpFallbackActive:
        !msg91Configured && process.env.NODE_ENV !== 'production',
      fcmConfigured: Boolean(
        process.env.FCM_PROJECT_ID && process.env.FCM_SERVICE_ACCOUNT_JSON,
      ),
      // There is no FCM send path in this codebase at all — devices-schema.ts
      // stores tokens and nothing dispatches. Stated so the console does not
      // imply push works because a credential exists.
      pushDeliveryImplemented: false,
    };
  }
}
