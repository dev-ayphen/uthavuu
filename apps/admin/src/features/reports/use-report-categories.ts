"use client";

import { useQuery } from "@tanstack/react-query";

import type { FilterOption } from "@/components/data";
import { apiFetch } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import type { ReportCategory } from "./types";

/**
 * Options for the Reports page's Category filter.
 *
 * BOTH ROLES GET THIS FILTER NOW
 * ───────────────────────────────────────────────────────────────────────────
 * This hook used to carry a long account of why ops admins silently lost the
 * Category filter: `GET /admin/reports` needs `reports:manage`, which both roles
 * hold, but `AdminCategoriesController` gated its whole controller — list
 * included — on `platform:manage`, super admin only. So the moderators who live
 * in the reports queue were exactly the people who could not fetch the list to
 * filter it by, and this hook coped by dropping the control.
 *
 * That was the wrong place to fix it, and it has been fixed at the source:
 * `GET /admin/report-categories` now requires `reports:manage`, while every
 * write on that controller still requires `platform:manage`. Reading the
 * taxonomy discloses nothing — it is labels and emoji that every signed-in
 * CITIZEN can already fetch from `GET /reports/categories`. The controller
 * states the reasoning in full.
 *
 * WHY THE NULL-ON-FAILURE BEHAVIOUR STAYS ANYWAY. It is no longer a permission
 * workaround, but it is still the right response to a filter that cannot load:
 * one absent control is a much smaller problem than a red error state over a
 * table full of perfectly good rows, and the URL parameter keeps working if
 * someone is handed a link with `?categoryKey=`. A 403 is no longer expected
 * here — but an admin whose permissions were revoked mid-session would still
 * produce one, and it should degrade rather than break the page.
 *
 * SHARED CACHE KEY, DELIBERATELY. `["admin", "report-categories"]` is the same
 * key `features/report-categories` uses, so editing a category in Platform ->
 * Categories invalidates this filter too and the two cannot drift.
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
