"use client";

import { useDashboardSummary } from "@/features/dashboard/use-dashboard-summary";
import { usePhotoVerificationSummary } from "@/features/report-photos/use-photo-verification-summary";

import { visibleBadgeKeys, type NavBadgeKey, type VisibleNavSection } from "./nav";

/**
 * Sidebar counters, from the two endpoints that supply any of them.
 *
 * `GET /admin/dashboard` counts users and flagged comments.
 * `GET /admin/report-photos/summary` counts photos the automated check flagged.
 * Nothing counts open reports, flagged reports, or admins, so those badges are
 * simply absent — `undefined`, which the sidebar renders as no badge at all.
 *
 * ⚠️ THE PHOTO BADGE UNDERCOUNTS ITS QUEUE, AND THAT IS THE API'S DEFINITION,
 * NOT A CHOICE MADE HERE
 * ───────────────────────────────────────────────────────────────────────────
 * Two photo states need a human, and they mean opposite things:
 * `review_required` (the check ran and flagged something) and `failed` (the
 * check never ran — timeout, throttle, or no provider configured at all). The
 * queue rests on the union of both; `summary.pendingReview` counts
 * `review_required` alone (`admin-report-photos.service.ts`).
 *
 * COUNTING THEM TOGETHER IN A BADGE WOULD BE THE RIGHT ANSWER. A badge is a
 * call to action — "N things are waiting for you" — and both states are waiting
 * for you. The distinction belongs in the queue, where the operator can act on
 * it, not in a chip that has room for one number. This file cannot make that
 * union: the endpoint returns one figure and no breakdown, and there is nothing
 * else to add it to.
 *
 * The consequence has to be stated rather than discovered: with no moderation
 * provider configured — every environment today — every upload is recorded
 * `failed`, so this badge is absent while the queue is full. It is not lying
 * (no badge says nothing, which is this file's whole discipline), but it is
 * silent about real work. The fix is on the API side: `pendingReview` should
 * count the `awaiting` union its own queue defaults to, or break the two out.
 * Until it does, the queue page carries the number instead — the summary cards
 * label what they actually measure, and the table states how many of the rows
 * on screen were never checked.
 *
 * THE TWO REQUESTS FAIL INDEPENDENTLY, and the code below is arranged so they
 * can. A dashboard outage must not also silence the photo queue's badge: the
 * moderation queue is exactly the thing an operator needs to see a number for
 * while something else is broken. Hence the photo badge is written before the
 * `if (!data)` bail-out rather than after it.
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

  // `visibleBadgeKeys` is pure, so computing it between two hooks is safe — but
  // both hooks must be called on every render, before any early return, or the
  // hook order changes between the loading and loaded passes.
  const allowed = visibleBadgeKeys(sections);

  // Not fetched at all when the entry is hidden. A counter for a door this
  // operator cannot open is a false alarm, and asking for it would also spend a
  // request on an endpoint that would refuse them.
  const { summary } = usePhotoVerificationSummary({
    enabled: allowed.has("reportPhotosPending"),
  });

  const badges: NavBadges = {};

  // Written first, so a dashboard failure cannot take this badge down with it.
  // `> 0` on purpose: a grey "0" beside a moderation queue is visual noise on
  // an empty queue, and `pendingReview === null` means "not counted", which is
  // not the same as "none" and must never render as one.
  //
  // Counts every photo awaiting a decision — flagged AND never examined —
  // since the API's summary was fixed on 2026-09-05. Before that it counted
  // only `review_required`, so with no provider configured the badge stayed
  // silent over a full queue.
  // — see the header. No badge here does NOT mean the queue is empty.
  if (allowed.has("reportPhotosPending") && summary?.pendingReview) {
    badges.reportPhotosPending = summary.pendingReview;
  }

  if (!data) return badges;

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
