import type { Route } from "next";

/**
 * Typed-route helpers for this section.
 *
 * Same reasoning — and the same single cast — as `features/moderation/routes.ts`
 * and `features/announcements/routes.ts`: with `typedRoutes: true`, `Route` at
 * its default `T = string` resolves the dynamic arm to `never`, so an
 * interpolated `/admins/${id}` cannot satisfy `DataTable.rowHref` or
 * `DetailHeader.backHref` however it is written. Keeping the cast in one
 * function whose signature cannot be misused (an id in, a URL for a route that
 * demonstrably exists out) beats sprinkling it through the feature.
 *
 * `encodeURIComponent` is not decoration: an admin's `userId` is a better-auth
 * user id arriving from an API response rather than from a literal, and a stray
 * `/` or `?` in one would silently change which route the link points at.
 */

export const ADMINS_INDEX = "/admins" as Route;

export function adminDetailHref(userId: string): Route {
  return `/admins/${encodeURIComponent(userId)}` as Route;
}
