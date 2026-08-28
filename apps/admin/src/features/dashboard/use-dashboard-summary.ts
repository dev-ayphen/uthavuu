"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";

/**
 * Dashboard data, from `GET /admin/dashboard`.
 *
 * The API supplies FOUR headline totals and ONE moderation counter. The design
 * shows twelve numbers. The missing seven have no source in the API — not a
 * placeholder to swap later, but no table to count. They are typed `null` and
 * render as an em dash, deliberately:
 *
 *   a `0` on "Fake reports" reads as "nothing to review". The truth is "we do
 *   not track this yet". An ops person acts on the first and investigates the
 *   second, so showing 0 would be worse than showing nothing.
 *
 * `flaggedReportsPendingReview` is null *permanently*, not pending: only
 * comments can be flagged in this product; there is no flagged-reports table.
 */

export type DashboardTotals = {
  users: number;
  reportsToday: number;
  activeMissions: number;
  completedToday: number;
};

/** `null` = the API has no source for this number. Render an em dash. */
export type DashboardCounters = {
  activeUsers: number | null;
  criticalOpen: number | null;
  fakeReports: number | null;
  pendingReview: number | null;
  helpsGiven: number | null;
  fieldUpdates: number | null;
  commentsToday: number | null;
  impactStories: number | null;
};

export type DashboardSummary = {
  totals: DashboardTotals;
  counters: DashboardCounters;
  /** IANA zone the API counted "today" in. Surfaced so the figures are legible. */
  timeZone: string;
  generatedAt: string;
};

type AdminDashboardResponse = {
  totalUsers: number;
  todaysReports: number;
  activeMissions: number;
  completedToday: number;
  flaggedCommentsPendingReview: number | null;
  flaggedReportsPendingReview: number | null;
  timeZone: string;
  generatedAt: string;
};

/**
 * The viewer's own zone, so "today" means their today rather than the server's.
 * Falls through to the API default (Asia/Kolkata) if the browser won't say.
 */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["admin", "dashboard", browserTimeZone() ?? "default"],
    queryFn: async (): Promise<DashboardSummary> => {
      const body = await apiFetch<AdminDashboardResponse>("/admin/dashboard", {
        searchParams: { timeZone: browserTimeZone() },
      });

      return {
        totals: {
          users: body.totalUsers,
          reportsToday: body.todaysReports,
          activeMissions: body.activeMissions,
          completedToday: body.completedToday,
        },
        counters: {
          // The two the API actually counts.
          pendingReview: body.flaggedCommentsPendingReview,
          fakeReports: body.flaggedReportsPendingReview, // always null — see header
          // No endpoint counts these. Not a TODO in this file: adding one means
          // adding a query in apps/api, and inventing a number here to fill the
          // grid would be the exact failure this comment exists to prevent.
          activeUsers: null,
          criticalOpen: null,
          helpsGiven: null,
          fieldUpdates: null,
          commentsToday: null,
          impactStories: null,
        },
        timeZone: body.timeZone,
        generatedAt: body.generatedAt,
      };
    },
  });
}

/** Formats a counter for display: a real number, or an em dash when untracked. */
export function formatCount(value: number | null | undefined): string | number {
  return value ?? "—";
}
