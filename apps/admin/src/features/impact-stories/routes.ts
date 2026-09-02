import type { Route } from "next";

/**
 * Typed-route helper for the Impact Stories detail page.
 *
 * Same shape and same reasoning as `features/moderation/routes.ts`: with
 * `typedRoutes: true`, `Route` at its default `T = string` resolves the dynamic
 * arm to `never`, so an interpolated `/community/impact-stories/${id}` cannot
 * satisfy `DataTable.rowHref` or `DetailHeader.backHref` however it is written.
 * The cast is unavoidable, so it lives in exactly one place with a signature
 * that cannot be misused: an id goes in, a URL for a route that demonstrably
 * exists comes out.
 *
 * It is deliberately NOT added to `features/moderation/routes.ts`. Impact
 * Stories are not a moderation surface — this page takes no moderation action
 * at all — and three other lanes are live in this repo, so a local helper is
 * also the change that cannot collide with theirs.
 *
 * `encodeURIComponent` is not decoration: story ids arrive from an API response
 * rather than from a literal, and a stray `/` or `?` would silently change
 * which route the link points at.
 */
export function impactStoryDetailHref(storyId: string): Route {
  return `/community/impact-stories/${encodeURIComponent(storyId)}` as Route;
}

/** The list itself. Static, so no cast is needed. */
export const IMPACT_STORIES_HREF = "/community/impact-stories" satisfies Route;
