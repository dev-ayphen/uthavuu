import type { Route } from "next";

/**
 * Typed-route helpers for Community -> Broadcasts.
 *
 * Same reasoning — and the same single cast — as
 * `features/announcements/routes.ts`: with `typedRoutes: true`, `Route` at its
 * default `T = string` resolves the dynamic arm to `never`, so an interpolated
 * `/community/broadcasts/${id}` cannot satisfy `DataTable.rowHref` or
 * `Crumb.href` however it is written. Keeping the cast in one function whose
 * signature cannot be misused (an id in, a URL for a route that demonstrably
 * exists out) beats sprinkling it through the feature.
 *
 * `encodeURIComponent` is not decoration: the id is a UUIDv7 arriving from an
 * API response rather than from a literal, and a stray `/` or `?` in one would
 * silently change which route the link points at.
 */

export const BROADCASTS_INDEX = "/community/broadcasts" as Route;
export const BROADCASTS_NEW = "/community/broadcasts/new" as Route;

export function broadcastEditHref(broadcastId: string): Route {
  return `/community/broadcasts/${encodeURIComponent(broadcastId)}` as Route;
}
