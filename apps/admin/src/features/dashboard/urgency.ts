/**
 * What "urgent" means on this dashboard — and it is NOT a new definition.
 *
 * THE ONE THRESHOLD, IN THREE PLACES
 * ───────────────────────────────────────────────────────────────────────────
 * `reports` has no urgency, priority or severity column. Urgency in Uthavu is
 * derived from `expiry_at`, everywhere, and the threshold that makes a request
 * critical is fifteen minutes:
 *
 *   libs-mobile/lib/urgency.ts   getUrgencyTone() returns 'critical' when
 *                                expiryAt - now < 15 * 60_000. This is what
 *                                paints a card red on a citizen's phone.
 *   docs/design/design-system.md §5 TONES documents that threshold.
 *   apps/api  .../admin-dashboard.service.ts CRITICAL_WINDOW_MINUTES = 15,
 *                                counted as `effectiveStatus = 'open' AND
 *                                expiry_at <= now() + 15 minutes`. That is the
 *                                "Critical open" tile sitting directly above
 *                                this panel.
 *
 * The console and the phone must agree about which requests are on fire, and
 * the panel must agree with the tile above it — so this file restates the same
 * rule rather than inventing a console-only one. If the product ever moves the
 * threshold, all three move together or the dashboard starts contradicting
 * itself on one screen.
 *
 * WHY THE COMPARISON IS `<=` AND NOT `<`
 * ───────────────────────────────────────────────────────────────────────────
 * The mobile helper uses a strict `<`, the API's SQL uses `<=`. They differ
 * only for a report expiring at exactly 15m00.000s. This panel sits under the
 * API's counter and has to match the number in it, so it follows the API.
 */

/** 15 minutes, in milliseconds. See the header before changing it. */
export const CRITICAL_WINDOW_MS = 15 * 60_000;

/**
 * Milliseconds until `expiryAt`, or null when the API sent something that is
 * not a date. Null is not zero: an unparseable timestamp must drop the row,
 * never render it as "expired".
 */
export function msUntil(expiryAt: string, now: number): number | null {
  const at = new Date(expiryAt).getTime();
  return Number.isNaN(at) ? null : at - now;
}

/**
 * True for an open report inside the critical window.
 *
 * The `> 0` half matters: `GET /admin/reports?status=open` cannot return an
 * already-expired report (the API derives `expired` from `expiry_at < now()`),
 * but the browser's clock keeps moving after the response arrives. A row that
 * ticks past its deadline while the panel is open stops being an open request
 * and leaves the list, rather than sitting there counting downwards past zero.
 */
export function isCritical(expiryAt: string, now: number): boolean {
  const remaining = msUntil(expiryAt, now);
  return remaining !== null && remaining > 0 && remaining <= CRITICAL_WINDOW_MS;
}

/**
 * "12m left".
 *
 * FLOOR, NOT ROUND. Rounding 14m40s up to "15m left" promises more time than
 * the request has, and the whole point of this panel is the deadline. Under a
 * minute has no honest whole-minute rendering at all, so it says so in words.
 */
export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "Expired";
  if (remainingMs < 60_000) return "under 1m left";
  return `${Math.floor(remainingMs / 60_000)}m left`;
}
