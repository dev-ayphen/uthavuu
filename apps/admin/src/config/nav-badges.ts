"use client";

import { useDashboardSummary } from "@/features/dashboard/use-dashboard-summary";

import type { NavBadgeKey } from "./nav";

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
 */
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

export function useNavBadges(): NavBadges {
  const { data } = useDashboardSummary();
  if (!data) return {};

  const badges: NavBadges = { users: data.totals.users };

  // Only surface a moderation badge when there is something to moderate —
  // a grey "0" next to Reports is visual noise on an empty queue.
  if (data.counters.pendingReview) badges.commentsFlagged = data.counters.pendingReview;

  // reportsOpen / reportsFlagged / admins: no endpoint counts these. See above.
  return badges;
}
