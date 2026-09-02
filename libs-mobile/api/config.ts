// Matches GET /config (apps/api) — the platform settings the admin console's
// Platform tab edits. docs/webadmin/07-platform-settings.md §5A.4 calls this
// endpoint "the missing link": the console has always had switches that
// "control what mobile users see", and mobile has never read them, so every
// switch was decoration. §5A.3: "a switch that looks like a stop button and
// isn't one is worse than no switch."
//
// This module is the ONLY place mobile talks to /config. Everything else
// consumes it through useConfig() (apps/mobile/src/hooks/useConfig.ts), which
// always resolves to a full PlatformConfig — DEFAULT_PLATFORM_CONFIG when the
// fetch fails. A config fetch failure must never block launch or a screen: the
// app is a community *emergency* tool, and "the settings endpoint was slow" is
// never a good reason to stop someone reporting a person who needs help.
import { apiRequest } from '../lib/api';

// The four radii the product offers (docs/01_Product_Summary.md core loop,
// and RootStackParamList's CategoryList params). The server sends a plain
// number; anything outside this set is treated as a bad value and replaced
// with the default rather than propagated into a typed navigation param.
export type RadiusKm = 1 | 3 | 5 | 10;

export type PlatformConfig = {
  appName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  maxPhotosPerReport: number;
  maxVolunteersPerReport: number;
  defaultRadiusKm: RadiusKm;
  allowAnonymousReports: boolean;
  commentsEnabled: boolean;
  commentFlaggingEnabled: boolean;
  maintenanceMode: boolean;
  readOnlyMode: boolean;
};

// The values the client hardcoded before this module existed — used verbatim
// when /config can't be reached (offline, API down, or a build running against
// an older API that has no /config yet), so behaviour is unchanged rather than
// invented. Each one is the value it replaced, with two deliberate exceptions
// noted below.
export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  appName: 'Uthavu',
  supportEmail: null,
  supportPhone: null,
  // 4, matching the server (apps/api/src/reports/dto/create-report.dto.ts:30).
  // The client previously rendered two explicit photo slots and carried an
  // unused `MAX_PHOTOS = 2`, but that 2 was arbitrary — nothing read it and the
  // API has always accepted 4. A fallback is what we use when we CANNOT ask the
  // server, so it should mean "what the server accepts", not "what one screen
  // happened to draw". Falling back to 2 would silently deny a user two photos
  // whenever /config is unreachable, for no safety reason.
  maxPhotosPerReport: 4,
  // The client's stepper clamped to 99, which the server has always rejected —
  // neededVolunteers is max(20) in create-report.dto.ts:25 and
  // update-report.dto.ts:21. 20 is both the server's real cap and the
  // contract's default, so the fallback matches the API instead of preserving
  // a client-side value that could only ever produce a 400.
  maxVolunteersPerReport: 20,
  defaultRadiusKm: 5,
  allowAnonymousReports: true,
  commentsEnabled: true,
  commentFlaggingEnabled: true,
  maintenanceMode: false,
  readOnlyMode: false,
};

const RADIUS_VALUES: readonly number[] = [1, 3, 5, 10];

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function positiveIntOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function radiusOr(value: unknown, fallback: RadiusKm): RadiusKm {
  return typeof value === 'number' && RADIUS_VALUES.includes(value) ? (value as RadiusKm) : fallback;
}

// Field-by-field merge onto the defaults rather than a cast. Two reasons: an
// older API may not send every key yet (this endpoint is new and is landing in
// parallel with this client), and a single unexpected value — a null appName, a
// radius of 7 — should degrade that one setting, not the whole config.
export function normalizePlatformConfig(raw: unknown): PlatformConfig {
  const d = DEFAULT_PLATFORM_CONFIG;
  if (raw === null || typeof raw !== 'object') return d;
  const c = raw as Record<string, unknown>;
  return {
    appName: stringOr(c.appName, d.appName),
    supportEmail: nullableString(c.supportEmail),
    supportPhone: nullableString(c.supportPhone),
    maxPhotosPerReport: positiveIntOr(c.maxPhotosPerReport, d.maxPhotosPerReport),
    maxVolunteersPerReport: positiveIntOr(c.maxVolunteersPerReport, d.maxVolunteersPerReport),
    defaultRadiusKm: radiusOr(c.defaultRadiusKm, d.defaultRadiusKm),
    allowAnonymousReports: booleanOr(c.allowAnonymousReports, d.allowAnonymousReports),
    commentsEnabled: booleanOr(c.commentsEnabled, d.commentsEnabled),
    commentFlaggingEnabled: booleanOr(c.commentFlaggingEnabled, d.commentFlaggingEnabled),
    maintenanceMode: booleanOr(c.maintenanceMode, d.maintenanceMode),
    readOnlyMode: booleanOr(c.readOnlyMode, d.readOnlyMode),
  };
}

// One shared key so every screen reads the same cached entry — the config is
// fetched once per launch, not once per screen that asks for it.
export const CONFIG_QUERY_KEY = ['platformConfig'] as const;

export async function getPlatformConfig(): Promise<PlatformConfig> {
  const raw = await apiRequest<unknown>('/config', { method: 'GET', auth: true });
  return normalizePlatformConfig(raw);
}
