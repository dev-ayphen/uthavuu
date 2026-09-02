"use client";

import { useListQuery, type ListConfig } from "@/components/data";
import { useDetailQuery } from "@/features/moderation/detail-query";
import { withIstDayBounds } from "@/features/audit-logs/use-audit-logs";
import { apiFetch } from "@/lib/api-client";
import type { ImpactStoryDetail, ImpactStoryListItem, ImpactStoryListResponse } from "./types";

/**
 * Community -> Impact Stories. The whole data layer for this section, in one
 * module, so the page and the table never talk to `apiFetch` directly.
 *
 * WHAT THIS LIST DELIBERATELY DOES NOT OFFER
 * ───────────────────────────────────────────────────────────────────────────
 * NO SORTABLE COLUMNS. `ListImpactStoriesSchema` has no `sort`/`order` pair —
 * one order, newest story first — and a plain `z.object` STRIPS unknown keys
 * rather than rejecting them, so `?sort=verifiedAt&order=asc` would return 200
 * with the rows in exactly the same order. A header chevron that reorders
 * nothing is worse than a fixed order: the operator concludes the console is
 * broken rather than that the list is fixed. So `defaultSort` is null, no column
 * declares a `sortKey`, and the table says the ordering out loud instead.
 * (Same call, same reasoning, as Audit Logs.)
 *
 * NO STATUS FILTER, AND NO MODERATION. Whether Impact Stories need an approval
 * workflow is open question 12 and is NOT decided — a completion is inserted
 * already `verified` in the same statement that creates it, so there is no
 * pending queue to filter for. The API offers no moderation verb and neither
 * does this console.
 *
 * NO DEFAULT FILTERS. Every filter in the schema is `.optional()` with no
 * default, so the resting view is genuinely un-narrowed. That is what lets an
 * empty table say "No impact stories yet" rather than "nothing matched" — see
 * the `empty` copy in `stories-table.tsx`.
 */
export const IMPACT_STORIES_LIST: ListConfig = {
  filterKeys: ["categoryKey", "from", "to"],
  defaultFilters: {},
  defaultSort: null,
};

/**
 * The list.
 *
 * `withIstDayBounds` is not optional politeness. `from`/`to` are `z.coerce.date()`
 * server-side (`dto/list-impact-stories.dto.ts`), which reads a bare
 * `2026-08-28` as midnight **UTC** — 05:30 IST. Sent raw, "up to today" would
 * silently exclude all of today and most of yesterday evening, and the table
 * would render "Nothing matches these filters" for a filter the operator would
 * swear is correct. That is the console manufacturing a false empty, which is
 * the one thing these pages must never do. The helper widens a date-only bound
 * to the instant a moderator means by it, in IST, and passes a full instant
 * through untouched.
 *
 * The bounds apply to the completion's `submitted_at` — when help landed — not
 * to the report's creation date. See the DTO's note: filtering on the other one
 * would make "stories from last week" quietly mean "stories about requests
 * raised last week", which is a different question.
 */
export function useImpactStories() {
  return useListQuery<ImpactStoryListResponse, ImpactStoryListItem>({
    key: ["admin", "impact-stories"],
    fetcher: ({ searchParams, signal }) =>
      apiFetch<ImpactStoryListResponse>("/admin/impact-stories", {
        searchParams: withIstDayBounds(searchParams),
        signal,
      }),
  });
}

/**
 * One story.
 *
 * `:id` is the `mission_completions` id, not the report id — the story IS the
 * completion, and one report has at most one.
 */
const NOT_FOUND_CODES = ["IMPACT_STORY_NOT_FOUND"] as const;

export function useImpactStory(storyId: string) {
  return useDetailQuery<ImpactStoryDetail>({
    key: ["admin", "impact-stories", storyId],
    path: `/admin/impact-stories/${encodeURIComponent(storyId)}`,
    notFoundCodes: NOT_FOUND_CODES,
  });
}

/**
 * "Report raised -> help submitted", said the way a person would say it.
 *
 * Null is a real value here and means "the timeline doesn't make sense" (the
 * service returns null rather than a negative number when a completion predates
 * its report). It renders as an em dash, never as "0 min" — zero is a claim
 * about how fast help arrived, and we do not have one.
 */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}
