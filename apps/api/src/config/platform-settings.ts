// The one function that answers "what is the platform configured to do right
// now", and the shape every reader gets back.
//
// A plain exported function rather than an injectable service, for the same
// reason account-status.ts is one: its callers sit on both sides of the DI
// boundary and in several different modules. MaintenanceGuard (global,
// registered by MaintenanceModule), ReportsService (ReportsModule),
// CommentsService (CommentsModule), PlatformConfigService (ConfigModule) and
// AdminSettingsService (AdminModule) all need the same answer. Injecting a
// shared provider would mean editing five modules' import lists to add a
// dependency none of them has any other reason to know about; a plain function
// keeps every one of them reading the identical rule.
import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  PLATFORM_SETTINGS_DEFAULTS,
  platformSettings,
} from '../db/schema/settings-schema';
import type { PlatformSettingsRow } from '../db/schema/settings-schema';

/**
 * The public configuration shape — exactly what `GET /config` returns, and
 * exactly the fields any enforcement point is allowed to read.
 *
 * Deliberately excludes `id`, `singleton`, `updatedBy` and the timestamps:
 * those are the admin projection's business (AdminSettings), not a citizen's.
 */
export interface PlatformConfig {
  appName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  maxPhotosPerReport: number;
  maxVolunteersPerReport: number;
  defaultRadiusKm: number;
  allowAnonymousReports: boolean;
  commentsEnabled: boolean;
  commentFlaggingEnabled: boolean;
  maintenanceMode: boolean;
  readOnlyMode: boolean;
}

/** Projects the stored row onto the public shape. One place, so `GET /config` and `GET /admin/settings` cannot disagree about a field name. */
export function toPlatformConfig(row: PlatformSettingsRow): PlatformConfig {
  return {
    appName: row.appName,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    maxPhotosPerReport: row.maxPhotosPerReport,
    maxVolunteersPerReport: row.maxVolunteersPerReport,
    defaultRadiusKm: row.defaultRadiusKm,
    allowAnonymousReports: row.allowAnonymousReports,
    commentsEnabled: row.commentsEnabled,
    commentFlaggingEnabled: row.commentFlaggingEnabled,
    maintenanceMode: row.maintenanceMode,
    readOnlyMode: row.readOnlyMode,
  };
}

/**
 * Reads the singleton row, or null if it has not been seeded.
 *
 * `limit(1)` is belt-and-braces: `platform_settings_singleton_key` +
 * `platform_settings_singleton_true` already make a second row impossible to
 * insert (see settings-schema.ts).
 */
export async function readPlatformSettingsRow(): Promise<PlatformSettingsRow | null> {
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.singleton, true))
    .limit(1);

  return row ?? null;
}

let warnedAboutMissingRow = false;

/**
 * The effective configuration.
 *
 * DELIBERATELY NOT CACHED. Two of these fields are kill switches read by
 * MaintenanceGuard on every mutating citizen request, and
 * docs/webadmin/07-platform-settings.md §5A.3's complaint is precisely about a
 * stop button that does not stop anything — a cache with a TTL reintroduces
 * that failure for the length of the TTL, and an in-process cache
 * reintroduces it indefinitely on any second API process, where a PATCH
 * handled by process A never invalidates process B. account-status.ts declines
 * a cache for the identical reason on the identical class of control
 * ("a Redis cache would buy microseconds and cost a window in which a
 * just-suspended account keeps working"), and this is one indexed single-row
 * lookup against a one-row table that Postgres serves from shared buffers.
 *
 * If this ever shows up in a profile, the fix is a cache with EXPLICIT
 * cross-process invalidation on PATCH (Redis pub/sub), not a bare TTL.
 *
 * MISSING ROW FALLS BACK TO THE DEFAULTS, and that is a considered choice
 * rather than laziness. The fallback values are the same constants the column
 * defaults use, so "no row" and "freshly seeded row" behave identically —
 * including both kill switches being off, which is correct: a row that does not
 * exist was never switched on by anybody. The alternative (throw loudly, as the
 * lookup-table readers elsewhere do) would take down every citizen write on a
 * database where `pnpm db:seed` has not run yet, to report a condition that
 * cannot have hidden an operator's intent. The one-shot warning below is so
 * this is still noticed rather than silently absorbed.
 */
export async function getPlatformConfig(): Promise<PlatformConfig> {
  const row = await readPlatformSettingsRow();
  if (row) return toPlatformConfig(row);

  if (!warnedAboutMissingRow) {
    warnedAboutMissingRow = true;
    console.warn(
      '[platform-settings] No platform_settings row found — falling back to the built-in defaults. Run `pnpm db:seed`.',
    );
  }

  return { ...PLATFORM_SETTINGS_DEFAULTS };
}
