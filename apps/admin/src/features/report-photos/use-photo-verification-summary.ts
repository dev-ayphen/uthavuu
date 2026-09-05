"use client";

import { useQuery } from "@tanstack/react-query";

import { shouldRetryListError } from "@/hooks/use-list-query";
import { apiFetch } from "@/lib/api-client";
import { readSummary } from "./wire";
import type { ReportPhotoSummary } from "./types";

/**
 * `GET /admin/report-photos/summary` — the three figures above the queue, and
 * the sidebar's unresolved-count badge.
 *
 * ONE QUERY, TWO CONSUMERS, ONE NUMBER. The badge beside "Photo Verification"
 * in the sidebar and the "Flagged by the check" card at the top of the queue
 * read the same cache entry, so they cannot disagree after a refetch — the same
 * arrangement `nav-badges.ts` already has with the dashboard.
 *
 * ⚠️ `pendingReview` COUNTS `review_required` ONLY — the photos the automated
 * check ran on and flagged. Photos it never ran on are recorded `failed`, need a
 * moderator just as much, and are in none of these three figures. Every consumer
 * of this hook has to label the number for what it measures rather than for the
 * queue it sits above; see `nav-badges.ts` for the full note and the API-side
 * fix it wants.
 *
 * NOTHING IS COERCED TO ZERO. `readSummary` turns anything that is not a finite
 * number into null, and null renders as an em dash. A fabricated "0" beside a
 * moderation counter tells a moderator the queue is clear, which is the one
 * wrong thing this page could say.
 *
 * `enabled` exists for the sidebar: a counter for an entry the operator cannot
 * see is a call to action behind a door they cannot open, so `nav-badges.ts`
 * does not even ask.
 */
export const REPORT_PHOTO_SUMMARY_KEY = ["admin", "report-photos", "summary"] as const;

export function usePhotoVerificationSummary({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: REPORT_PHOTO_SUMMARY_KEY,
    queryFn: async ({ signal }) => readSummary(await apiFetch("/admin/report-photos/summary", { signal })),
    enabled,
    retry: shouldRetryListError,
    // Shorter than the app default: this is a work queue, and the number beside
    // it going stale is the difference between an operator picking up a photo
    // and walking past it.
    staleTime: 15_000,
  });

  const summary: ReportPhotoSummary | null = query.data ?? null;

  return { summary, isLoading: query.isPending, isError: query.isError, refetch: query.refetch };
}
