"use client";

import { useQuery } from "@tanstack/react-query";

import { useListState, type ListConfig } from "@/components/data";
import { apiFetch } from "@/lib/api-client";

/**
 * Analytics, from `GET /admin/analytics` (permission: `analytics:view`).
 *
 * WHY THE LIST-STATE PROVIDER ON A PAGE WITH NO LIST
 * ───────────────────────────────────────────────────────────────────────────
 * The range and bucket belong in the URL for the same reason a filtered table
 * does: "reports over the last 90 days, weekly" is a view someone pastes into a
 * ticket. `ListStateProvider` already owns exactly that mechanism — parse,
 * clamp, keep defaults out of the address bar — plus the `<Suspense>` boundary
 * `useSearchParams()` requires. Re-deriving it here would be a second, subtly
 * different copy of `list-params.ts`. Only the filters are read; page and page
 * size are never sent.
 */
export const ANALYTICS_LIST: ListConfig = {
  filterKeys: ["range", "bucket"],
  // Matched to the API's own defaults: AnalyticsSchema defaults `bucket` to
  // "day", and the service falls back to the last 30 days. Because these agree,
  // the resting view has a clean `/analytics` URL AND — the part that matters —
  // neither counts as narrowing, so nothing is described as "filtered".
  defaultFilters: { range: "30d", bucket: "day" },
  defaultSort: null,
};

export const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
] as const;

export const BUCKET_OPTIONS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const;

export type AnalyticsBucketRow = {
  bucket: string;
  total: number;
  completed: number;
  expired: number;
};

export type AnalyticsResponse = {
  range: { from: string; to: string; timeZone: string; bucket: string };
  /** Excludes soft-deleted reports. */
  reportsOverTime: AnalyticsBucketRow[];
  /** Excludes soft-deleted reports — so this will NOT sum to reportsByStatus.total. */
  reportsByCategory: Array<{
    key: string;
    label: string;
    emoji: string;
    total: number;
    open: number;
    expired: number;
    completed: number;
  }>;
  /** INCLUDES soft-deleted reports, counted in their own `deleted` bucket. */
  reportsByStatus: {
    open: number;
    expired: number;
    closed: number;
    completed: number;
    deleted: number;
    total: number;
  };
  missions: {
    created: number;
    completed: number;
    /** null when no mission was created — a 0% rate would read as total failure. */
    completionRate: number | null;
  };
  responseTime: {
    unit: string;
    /** null for an empty set: `percentile_cont` returns null, and that is kept. */
    firstAcceptP50: number | null;
    firstAcceptP90: number | null;
    sampleSize: number;
  };
  userGrowth: {
    buckets: Array<{ bucket: string; newUsers: number }>;
    /** Staff excluded, so it agrees with the Dashboard's total. */
    totalUsers: number;
  };
  geography: {
    basis: string;
    /** Returned in the payload, not left to a comment. Render it. */
    caveat: string;
    topDistricts: Array<{ district: string | null; reports: number }>;
  };
  generatedAt: string;
};

/** The viewer's own zone, so "this week" means theirs. Falls back to the API's. */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function daysFor(range: string): number {
  return RANGE_OPTIONS.find((option) => option.value === range)?.days ?? 30;
}

export function useAnalytics() {
  const { params } = useListState();
  const range = params.filters.range ?? "30d";
  const bucket = params.filters.bucket ?? "day";
  const timeZone = browserTimeZone();

  return useQuery({
    // The PRESET is the key, not the instants it resolves to. Keying on the
    // computed timestamps would mint a new key every render and refetch forever.
    queryKey: ["admin", "analytics", range, bucket, timeZone ?? "default"],
    queryFn: async ({ signal }) => {
      const to = new Date();
      const from = new Date(to.getTime() - daysFor(range) * 24 * 60 * 60 * 1000);
      return apiFetch<AnalyticsResponse>("/admin/analytics", {
        searchParams: {
          from: from.toISOString(),
          to: to.toISOString(),
          bucket,
          timeZone,
        },
        signal,
      });
    },
    staleTime: 60_000,
    // A 403 stays a 403 however many times it is asked.
    retry: false,
  });
}

/**
 * A figure for display: the number, or an em dash when the API has none.
 *
 * Same contract as the dashboard's `formatCount`, and the same reason. `0` and
 * `null` are different facts here and must not look alike: a P50 of 0 means
 * volunteers accepted instantly, while a null P50 means nobody accepted at all
 * and there was nothing to take a percentile of.
 */
export function formatFigure(
  value: number | null | undefined,
  suffix = "",
): string {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat("en-IN").format(value)}${suffix}`;
}
