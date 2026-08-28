"use client";

import { arrayListAdapter, useListQuery, type ListConfig } from "@/components/data";
import { apiFetch } from "@/lib/api-client";

/**
 * Platform -> Categories, from `GET /admin/report-categories`.
 *
 * A BARE ARRAY, AND AN ADAPTER PINNED TO SAY SO
 * ───────────────────────────────────────────────────────────────────────────
 * This is master data — nine rows — so `AdminCategoriesService.list()`
 * deliberately returns a plain array with no pagination envelope.
 * `detectListAdapter` would handle it, but the shape here is settled, and
 * `arrayListAdapter` is the honest declaration of that: it reports
 * `total: rows.length` and `hasNext: false`, so the page cannot grow a Next
 * button that would page past the end of a list with no pages.
 *
 * Why this endpoint and not the citizen-facing `GET /reports/categories`: that
 * one filters to `citizenSelectable = true`, which hides `disasterRelief` —
 * precisely the row an admin most needs to see.
 *
 * NO FILTERS, DELIBERATELY. The endpoint accepts no query params at all, so a
 * `citizenSelectable` dropdown would either be a client-side filter that
 * disagrees with the URL contract every other list here honours, or a param the
 * API silently ignores. Nine rows fit on one screen; a filter would be
 * decoration with a failure mode.
 */
export const CATEGORIES_LIST: ListConfig = {
  filterKeys: [],
  defaultFilters: {},
  defaultSort: null,
};

export type ReportCategoryRow = {
  id: string;
  /** Stable identifier the mobile app and the seed both key on. */
  key: string;
  label: string;
  emoji: string;
  /** How long a report in this category stays live before it expires. */
  defaultExpiryMinutes: number;
  /** False for admin-only categories, e.g. `disasterRelief`. */
  citizenSelectable: boolean;
  /** Reports currently using it, soft-deleted ones excluded. */
  reportCount: number;
  createdAt: string;
  updatedAt: string;
};

export function useReportCategories() {
  return useListQuery<ReportCategoryRow[], ReportCategoryRow>({
    key: ["admin", "report-categories"],
    fetcher: ({ signal }) =>
      apiFetch<ReportCategoryRow[]>("/admin/report-categories", { signal }),
    adapter: arrayListAdapter<ReportCategoryRow>(),
  });
}

/**
 * Minutes as an operator reads them: "6h", "3d", "90m".
 *
 * The stored unit is minutes because that is what `ReportsService` adds to
 * `created_at`, but nobody thinks in 4320 minutes. Exact divisions only — 100
 * minutes stays "100m" rather than becoming a rounded "2h" that would misstate
 * when a request actually expires.
 */
export function formatExpiry(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return `${minutes}m`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days}d`;
  }
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}
