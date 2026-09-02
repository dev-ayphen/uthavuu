"use client";

import { useDashboardSummary } from "@/features/dashboard/use-dashboard-summary";

import { visibleBadgeKeys, type NavBadgeKey, type VisibleNavSection } from "./nav";

/**
 * Sidebar counters, from the one endpoint that supplies any of them.
 *
 * `GET /admin/dashboard` counts users and flagged comments. Nothing counts open
 * reports, flagged reports, or admins, so those badges are simply absent —
 * `undefined`, which the sidebar renders as no badge at all.
 *
 * That is the deliberate choice. A badge is a call to action: "8" next to
 * Reports means eight things are waiting for you. A made-up 8, or a 0 standing
 * in for "unknown", sends an operator looking for work that isn't there or —
 * worse — lets them conclude a real queue is empty. No badge says nothing,
 * which is the only true thing available.
 *
 * Shares the dashboard's query key, so the sidebar and the dashboard show the
 * same numbers from one request rather than disagreeing after a refetch.
 *
 * PERMISSIONS: a counter for a hidden entry is dropped here, not merely left
 * unrendered. Same reasoning one step further — a number is a call to action,
 * and calling an operator to work behind a door they cannot open is the exact
 * dead end the nav gating exists to remove. The allowed set is derived from the
 * already-gated sections (`visibleBadgeKeys`), so it cannot drift from what is
 * actually on screen.
 *
 * The FETCH is not gated, and does not need to be: `GET /admin/dashboard`
 * carries no @RequireAdminPermissions, every admin lands on the Dashboard
 * anyway, and this shares that page's query key — so this costs no extra
 * request. Only the mapping of a figure onto a badge is gated.
 */
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

export function useNavBadges(sections: readonly VisibleNavSection[]): NavBadges {
  const { data } = useDashboardSummary();

  // Hooks first, always — the early return has to come after `useQuery`, or the
  // hook order changes between the loading and loaded renders.
  const allowed = visibleBadgeKeys(sections);
  if (!data) return {};

  const badges: NavBadges = {};

  // Each figure is now a `Counter` — `{ value, note }` — where `value: null`
  // means the API has no number, as opposed to a real zero. Unwrapping it here
  // is the same decision this file already made, spelled out: no value, no
  // badge. Never `?? 0`, which would put a "0" beside Users on a failed count.
  if (allowed.has("users") && data.totals.users.value !== null) {
    badges.users = data.totals.users.value;
  }

  // Only surface a moderation badge when there is something to moderate —
  // a grey "0" next to Reports is visual noise on an empty queue.
  if (allowed.has("commentsFlagged") && data.counters.pendingReview.value) {
    badges.commentsFlagged = data.counters.pendingReview.value;
  }

  // reportsOpen / reportsFlagged / admins: no endpoint counts these. See above.
  return badges;
}
