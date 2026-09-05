import type { Route } from "next";

/**
 * Typed-route helpers for the moderation sections' dynamic detail pages.
 *
 * WHY THE CAST
 * ───────────────────────────────────────────────────────────────────────────
 * `typedRoutes: true` generates `Route<T>` so that a dynamic href only
 * typechecks when TypeScript can infer the literal segment — `Route` with its
 * default `T = string` resolves the dynamic arm to `never` and accepts static
 * routes only. `DataTable.rowHref` and `DetailHeader.backHref` are declared as
 * plain `Route`, not generically over the destination, so an interpolated
 * `/users/${id}` cannot satisfy them however it is written.
 *
 * The cast is therefore unavoidable, and the useful thing to do with it is put
 * it in exactly two places and give each a signature that cannot be misused: an
 * id goes in, a URL for a route that demonstrably exists comes out. Nothing
 * else in these features casts a route.
 *
 * `encodeURIComponent` is not decoration. A better-auth user id is a 32-char
 * nanoid, but a report id is a UUIDv7 and both arrive from an API response
 * rather than from a literal — a stray `/` or `?` in an id would silently
 * change which route the link points at.
 */

export function userDetailHref(userId: string): Route {
  return `/users/${encodeURIComponent(userId)}` as Route;
}

export function reportDetailHref(reportId: string): Route {
  return `/reports/${encodeURIComponent(reportId)}` as Route;
}

/** Every report a given citizen filed. Static route + query, so no cast needed. */
export function reportsByReporterHref(reporterId: string): Route {
  return `/reports?reporterId=${encodeURIComponent(reporterId)}`;
}

/** Every comment on a given report. */
export function commentsForReportHref(reportId: string): Route {
  return `/reports/comments?reportId=${encodeURIComponent(reportId)}`;
}

/**
 * One quarantined photo in the verification queue.
 *
 * Lives here with the other two casts rather than in `features/report-photos/`,
 * so the console still has exactly one place where a dynamic href is asserted.
 * A `photo_uploads` id is a UUIDv7 arriving from an API response, so
 * `encodeURIComponent` matters for the same reason it does above.
 */
export function reportPhotoDetailHref(photoId: string): Route {
  return `/reports/photo-verification/${encodeURIComponent(photoId)}` as Route;
}

/** The verification queue, optionally scoped to one report. Static route + query. */
export function photoVerificationHref(reportId?: string): Route {
  return reportId
    ? `/reports/photo-verification?reportId=${encodeURIComponent(reportId)}`
    : "/reports/photo-verification";
}
