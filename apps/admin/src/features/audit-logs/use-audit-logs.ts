"use client";

import { useQuery } from "@tanstack/react-query";

import { useListQuery, type ListConfig } from "@/components/data";
import { apiFetch } from "@/lib/api-client";
import type { AuditCatalogue, AuditLogRow } from "./types";

/**
 * Platform -> Audit Logs.
 *
 * WHAT THIS LIST DELIBERATELY DOES NOT OFFER
 * ───────────────────────────────────────────────────────────────────────────
 * No search box and no sortable columns. `ListAuditLogsSchema` accepts neither
 * `q` nor `sort`/`order`, and a plain `z.object` STRIPS unknown keys rather
 * than rejecting them — so `?q=anything` returns 200 with every row, and
 * `?sort=createdAt&order=asc` returns the same fixed `createdAt desc` order.
 * Verified live: `/admin/audit-logs?q=zzzznomatch` -> 200, total 9.
 *
 * A control that silently does nothing is worse than a missing one: the
 * operator concludes the log is unsearchable *and* that the console is broken.
 * The service orders by `createdAt desc, id desc` — newest first, always — and
 * that is what the page says out loud instead.
 *
 * NO DEFAULT FILTERS
 * ───────────────────────────────────────────────────────────────────────────
 * Every filter in `ListAuditLogsSchema` is `.optional()` with no default, so
 * `defaultFilters` is empty and the resting view is genuinely un-narrowed.
 * That is what makes an empty table say "No admin actions recorded yet" rather
 * than "nothing matched" — see the `empty` copy in `audit-table.tsx`.
 */
export const AUDIT_LIST: ListConfig = {
  // `actorUserId` / `targetId` have no dropdown — they arrive as deep links
  // (e.g. "everything this admin did"). They are still declared here so they
  // survive paging, count as narrowing, and are cleared by "Clear all".
  filterKeys: ["action", "targetType", "actorUserId", "targetId", "from", "to"],
  defaultFilters: {},
  // Fixed server-side ordering; nothing to express in the URL.
  defaultSort: null,
};

/**
 * India Standard Time, as a fixed offset.
 *
 * Asia/Kolkata has observed no DST since 1945, so a literal `+05:30` is exact
 * rather than an approximation — and it keeps this a pure string operation
 * with no dependency on the browser's own zone.
 */
const IST_OFFSET = "+05:30";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Widen a date-only bound to the instant a moderator means by it.
 *
 * THE BUG THIS EXISTS TO PREVENT, measured against the live API:
 *
 *   /admin/audit-logs?to=2026-08-28                      -> total 0
 *   /admin/audit-logs?to=2026-08-28T23:59:59.999+05:30   -> total 9
 *
 * `z.coerce.date()` reads a bare `2026-08-28` as midnight UTC, which is 05:30
 * IST — so "up to today" silently excludes all of today, and most of it excludes
 * yesterday evening too. The table then renders "Nothing matches these filters"
 * for a filter the operator would swear is correct. That is the console
 * manufacturing a false empty, which is the one thing these pages must never do.
 *
 * `from` gets the same treatment in the other direction: the START of the day
 * in IST (18:30 UTC the previous day), not 05:30 IST.
 *
 * Values that are already full instants are passed through untouched, so a
 * hand-edited URL keeps whatever precision it was given.
 */
export function withIstDayBounds(
  searchParams: Record<string, string>,
): Record<string, string> {
  const next = { ...searchParams };
  if (next.from && DATE_ONLY.test(next.from)) {
    next.from = `${next.from}T00:00:00.000${IST_OFFSET}`;
  }
  if (next.to && DATE_ONLY.test(next.to)) {
    next.to = `${next.to}T23:59:59.999${IST_OFFSET}`;
  }
  return next;
}

type AuditListResponse = {
  items: AuditLogRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function useAuditLogs() {
  return useListQuery<AuditListResponse, AuditLogRow>({
    key: ["admin", "audit-logs"],
    fetcher: ({ searchParams, signal }) =>
      apiFetch<AuditListResponse>("/admin/audit-logs", {
        searchParams: withIstDayBounds(searchParams),
        signal,
      }),
  });
}

/**
 * The action and target-type dropdowns' options.
 *
 * Served from the lookup tables rather than distilled from the rows on screen,
 * which matters most on a near-empty log: an action nobody has performed yet is
 * still a filterable choice. Hardcoding the list here instead would be worse
 * than stale — `action` is a `z.enum` server-side, so a key that drifts out of
 * the catalogue is a 400, not an empty page.
 *
 * Cached hard: this is master data that only changes on a deploy plus `db:seed`.
 */
export function useAuditCatalogue() {
  return useQuery({
    queryKey: ["admin", "audit-logs", "catalogue"],
    queryFn: ({ signal }) => apiFetch<AuditCatalogue>("/admin/audit-logs/catalogue", { signal }),
    staleTime: 60 * 60 * 1000,
    // A 403 here is the same 403 the list itself gets; the list already says so
    // properly, and a second permission message beside it is noise.
    retry: false,
  });
}
