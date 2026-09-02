/**
 * Platform -> App Settings. The shapes `/admin/settings` returns and accepts.
 *
 * Transcribed from the FROZEN contract agreed with the backend agent building
 * this module in parallel, then reconciled field by field against that agent's
 * DTO and Drizzle schema once they appeared. As of writing, the API's own implementation
 * has landed in the working tree (`apps/api/src/admin/admin-settings.*`,
 * `db/schema/settings-schema.ts`) but the RUNNING container has not picked it
 * up — `GET /admin/settings` still answers 404 while `/admin/me` answers 403,
 * so the API is up and this route simply is not served yet.
 * The console renders that honestly — see `settings-view.tsx`, which shows an
 * explicit "not built yet" rather than a form over invented values.
 *
 *   GET   /admin/settings  -> AdminSettings
 *   PATCH /admin/settings  -> AdminSettings   (accepts ANY SUBSET of the fields)
 *
 * Both require `platform:manage`. Read and write share the one permission, so
 * there is no "can look but not touch" state to render: the page is gated
 * whole, server-side, in `permission.ts`.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT CONTAIN
 * ───────────────────────────────────────────────────────────────────────────
 * Anything the contract does not name. The prototype's version of this screen
 * rendered 14 toggles of which 11 were bound to nothing at all, their on/off
 * position decided by array index (`docs/webadmin/07-platform-settings.md`
 * §2A). Every field below round-trips through a real PATCH; nothing on this
 * page exists that is not in this type.
 */

/** The 11 settings an operator can actually change. */
export type AdminSettingsFields = {
  /** 1..80. */
  appName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  /** 1..10. */
  maxPhotosPerReport: number;
  /** 1..50. */
  maxVolunteersPerReport: number;
  /** One of 1 | 3 | 5 | 10. The radii the mobile app's discovery offers. */
  defaultRadiusKm: number;
  allowAnonymousReports: boolean;
  commentsEnabled: boolean;
  commentFlaggingEnabled: boolean;
  /** Blocks citizen writes app-wide. Confirmed before enabling. */
  maintenanceMode: boolean;
  /** Blocks citizen writes app-wide, reads still allowed. Confirmed before enabling. */
  readOnlyMode: boolean;
};

export type AdminSettings = AdminSettingsFields & {
  /** ISO. Server-authored — never the browser's clock. */
  updatedAt: string;
  /** `null` means no admin is recorded against the change (a seed, a migration). */
  updatedBy: { id: string; name: string } | null;
  /**
   * The admin who last changed this has since been deleted; the change survives.
   * Distinct from `updatedBy === null` (never had one), and the two read very
   * differently to an operator trying to work out who touched a live switch.
   */
  updatedByDeleted: boolean;
};

/** The body PATCH accepts. Any subset — a single-key patch is legal and used. */
export type AdminSettingsPatch = Partial<AdminSettingsFields>;

/**
 * The four radii, as the contract fixes them. Not a range and not free text:
 * these are the values the mobile app's discovery filter offers, so an
 * arbitrary number here would be a radius no citizen can ever be shown.
 */
export const RADIUS_OPTIONS = ["1", "3", "5", "10"] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];

const RADIUS_OPTION_SET: ReadonlySet<string> = new Set<string>(RADIUS_OPTIONS);

export function isRadiusOption(value: string): boolean {
  return RADIUS_OPTION_SET.has(value);
}

/** Bounds, mirrored from the contract. Changing one here changes it in the form. */
export const APP_NAME_MAX = 80;
export const MAX_PHOTOS_MIN = 1;
export const MAX_PHOTOS_MAX = 10;
export const MAX_VOLUNTEERS_MIN = 1;
export const MAX_VOLUNTEERS_MAX = 50;
/**
 * These two are not in the frozen contract, which typed both fields only as
 * `string | null`. They are transcribed from the API's own DTO
 * (`update-platform-settings.dto.ts`), which constrains both.
 */
export const SUPPORT_EMAIL_MAX = 200;
export const SUPPORT_PHONE_MAX = 32;

/**
 * The two app-wide kill switches, named once so the dialog, the banner, the
 * card and the PATCH body cannot drift apart.
 */
export type KillSwitch = "maintenanceMode" | "readOnlyMode";

/**
 * Is this actually a settings record?
 *
 * `apiFetch` casts the parsed JSON to its type parameter without checking it —
 * a 204, an HTML error page from a proxy, or a contract that drifted would all
 * arrive here typed as `AdminSettings` and blow up mid-render, inside a
 * component, with a message about reading a property of undefined.
 *
 * Only the fields this page structurally depends on are checked. This is not a
 * schema — it is the difference between "the console and the API disagree,
 * here is what to tell support" and a white screen.
 */
export function isUsableSettings(value: unknown): value is AdminSettings {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.appName === "string" &&
    typeof record.maxPhotosPerReport === "number" &&
    typeof record.maxVolunteersPerReport === "number" &&
    typeof record.defaultRadiusKm === "number" &&
    typeof record.maintenanceMode === "boolean" &&
    typeof record.readOnlyMode === "boolean" &&
    typeof record.updatedAt === "string"
  );
}
