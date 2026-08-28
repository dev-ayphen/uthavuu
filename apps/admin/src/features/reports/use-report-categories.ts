"use client";

import { useQuery } from "@tanstack/react-query";

import type { FilterOption } from "@/components/data";
import { apiFetch } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import type { ReportCategory } from "./types";

/**
 * Options for the Reports page's Category filter — when the operator is allowed
 * to have them.
 *
 * THE AWKWARD BIT, STATED PLAINLY
 * ───────────────────────────────────────────────────────────────────────────
 * `GET /admin/reports` needs `reports:manage`, which both roles hold. The only
 * endpoint that can enumerate categories is `GET /admin/report-categories`,
 * and `AdminCategoriesController` gates the whole controller on
 * `platform:manage` — super admin only. Verified live: an ops admin gets
 * 403 ADMIN_MISSING_PERMISSION. So the people who use the reports queue most
 * are exactly the people who cannot fetch its category list.
 *
 * Three ways out, and why this one:
 *
 *   Hardcode the eight seeded keys. Rejected — categories are a lookup table an
 *   admin can add to from `/platform/categories`, so a hardcoded list is wrong
 *   the first time someone uses that page, and silently: the new category's
 *   reports would be unfilterable with no indication why.
 *
 *   Derive options from the rows on screen. Rejected — a select whose options
 *   change as you page through is not a filter, it is a guess, and it can only
 *   ever offer categories that already appear in the current 25 rows.
 *
 *   Ask, and drop the control if the answer is no. Chosen. An ops admin gets a
 *   Reports page with status, search, date and reporter filters — everything
 *   except the one control the API will not serve them — instead of a select
 *   that 403s on open or, worse, sits there empty looking broken. The URL
 *   parameter still works if they are handed a link with `?categoryKey=`, so a
 *   super admin can share a filtered view and it renders correctly for them.
 *
 * A 403 here is therefore a normal outcome, not an error: it resolves to `null`
 * and nothing is logged or shown. Any OTHER failure also resolves to `null` —
 * one absent filter is a much smaller problem than a red error state over a
 * table full of perfectly good rows.
 */
export function useReportCategoryOptions(): readonly FilterOption[] | null {
  const { data } = useQuery({
    queryKey: ["admin", "report-categories"],
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<ReportCategory[]>("/admin/report-categories", { signal });
      } catch (error) {
        // Deliberately swallowed. Re-throwing would put this query into an
        // error state that some future caller might render.
        if (error instanceof ApiError) return null;
        throw error;
      }
    },
    // Categories change roughly never, and a refetch on every window focus
    // would re-ask a question already answered with 403.
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (!data || data.length === 0) return null;

  return data.map((category) => ({
    value: category.key,
    label: category.emoji ? `${category.emoji} ${category.label}` : category.label,
  }));
}
