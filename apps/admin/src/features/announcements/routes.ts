import type { Route } from "next";

/**
 * Typed-route helpers for this section.
 *
 * Same reasoning — and the same single cast — as
 * `src/features/moderation/routes.ts`: with `typedRoutes: true`, `Route` at its
 * default `T = string` resolves the dynamic arm to `never`, so an interpolated
 * `/announcements/${id}` cannot satisfy `DataTable.rowHref` or `Crumb.href`
 * however it is written. Keeping the cast in one function with a signature that
 * cannot be misused (an id in, a URL for a route that demonstrably exists out)
 * is better than sprinkling it through the feature.
 *
 * `encodeURIComponent` is not decoration: the id is a UUIDv7 arriving from an
 * API response rather than from a literal, and a stray `/` or `?` in one would
 * silently change which route the link points at.
 *
 * NAMING: these are the ANNOUNCEMENTS routes. They used to live under
 * `/community/updates`, which was wrong — "Community Updates" is the public
 * per-report feed this console moderates at `/reports/comments`, not the
 * admin-authored broadcasts this section writes. The HTTP paths these pages
 * call are still `/admin/community-updates`; see the note in `./api.ts`.
 */

export const ANNOUNCEMENTS_INDEX = "/announcements" as Route;
export const ANNOUNCEMENTS_NEW = "/announcements/new" as Route;

export function announcementEditHref(announcementId: string): Route {
  return `/announcements/${encodeURIComponent(announcementId)}` as Route;
}
