import type { Route } from "next";

/**
 * Typed-route helpers for this section.
 *
 * Same reasoning — and the same single cast — as
 * `src/features/moderation/routes.ts`: with `typedRoutes: true`, `Route` at its
 * default `T = string` resolves the dynamic arm to `never`, so an interpolated
 * `/monetization/sponsors/${id}` cannot satisfy `DataTable.rowHref` or
 * `Crumb.href` however it is written. Keeping the cast in one function with a
 * signature that cannot be misused (an id in, a URL for a route that
 * demonstrably exists out) is better than sprinkling it through the feature.
 *
 * `encodeURIComponent` is not decoration: the id is a UUIDv7 arriving from an
 * API response rather than from a literal, and a stray `/` or `?` in one would
 * silently change which route the link points at.
 */

export const SPONSORS_INDEX = "/monetization/sponsors" as Route;
export const SPONSORS_NEW = "/monetization/sponsors/new" as Route;

export function sponsorEditHref(sponsorId: string): Route {
  return `/monetization/sponsors/${encodeURIComponent(sponsorId)}` as Route;
}
