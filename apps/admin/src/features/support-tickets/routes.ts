import type { Route } from "next";

/**
 * Typed-route helpers for this section.
 *
 * Same reasoning — and the same single cast — as `features/moderation/routes.ts`
 * and `features/announcements/routes.ts`: with `typedRoutes: true`, `Route` at
 * its default `T = string` resolves the dynamic arm to `never`, so an
 * interpolated `/platform/support/${id}` cannot satisfy `DataTable.rowHref` or
 * `Crumb.href` however it is written. Keeping the cast in one function with a
 * signature that cannot be misused (an id in, a URL for a route that
 * demonstrably exists out) beats sprinkling it through the feature.
 *
 * `encodeURIComponent` is not decoration: a ticket id is a UUIDv7 arriving from
 * an API response rather than from a literal, and a stray `/` or `?` in one
 * would silently change which route the link points at.
 */

export const SUPPORT_INDEX = "/platform/support" as Route;

export function ticketDetailHref(ticketId: string): Route {
  return `/platform/support/${encodeURIComponent(ticketId)}` as Route;
}
