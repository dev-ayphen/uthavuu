"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";

import { shouldRetryListError } from "@/hooks/use-list-query";
import { apiFetch } from "@/lib/api-client";
import { classifyListFailure, type ListFailure } from "@/lib/list-failure";
import { ListShapeError } from "@/lib/list-page";
import { isCritical, msUntil } from "./urgency";

/**
 * Open help requests about to expire, from `GET /admin/reports`.
 *
 * THE QUERY, AND WHY IT IS THE RIGHT ONE
 * ───────────────────────────────────────────────────────────────────────────
 *     /admin/reports?status=open&sort=expiryAt&order=asc&limit=25
 *
 *   status=open   `ListAdminReportsSchema.status` filters on the DERIVED
 *                 status (report-effective-status.ts), not `reports.status_id`
 *                 — which nothing in the codebase ever sets to 'expired'.
 *                 Derived 'open' means: not soft-deleted, stored status
 *                 'open', and `expiry_at >= now()`. That is exactly the first
 *                 half of what the "Critical open" tile above this panel
 *                 counts.
 *   sort=expiryAt
 *   order=asc     Soonest deadline first. The API orders by `reports.expiry_at`
 *                 with `reports.id` as a tiebreak, so the ordering is total and
 *                 the page is stable.
 *
 * THE SECOND HALF OF "CRITICAL" IS APPLIED HERE, NOT SERVER-SIDE
 * ───────────────────────────────────────────────────────────────────────────
 * There is no "expiring within N minutes" filter in the DTO, so the 15-minute
 * window is applied to the fetched rows — with the same threshold the API's
 * counter and the mobile app use (see ./urgency). Two consequences worth
 * stating rather than discovering:
 *
 *  1. Because the rows arrive sorted by `expiry_at` ascending, every critical
 *     row is at the FRONT of the page. So the count found here is exact —
 *     unless the whole page is critical, in which case there may be more
 *     beyond it and the panel says so instead of implying a total.
 *  2. The window is evaluated against the browser clock, which keeps moving
 *     after the response lands. `now` ticks, so a request that runs out while
 *     the panel is open leaves the list instead of counting past zero.
 *
 * NOTHING HERE INVENTS A ROW. A malformed response raises `ListShapeError` and
 * renders as a failure with a retry — never as "No urgent requests", which
 * would tell an operator the queue is clear when it is the response that was
 * unreadable.
 */

/** One page of the queue. 25 is the DTO's own default; the API caps it at 100. */
const PAGE_SIZE = 25;

/** How often the countdowns re-render. Fine-grained enough for whole minutes. */
const TICK_MS = 30_000;

export type UrgentReport = {
  id: string;
  title: string;
  /** ISO. Guaranteed parseable — rows with an unreadable deadline are dropped. */
  expiryAt: string;
  /** Milliseconds left as of the tick this row was filtered on. Always > 0. */
  remainingMs: number;
  category: { label: string | null; emoji: string | null };
  landmark: string | null;
  /** Volunteers who have CONFIRMED, and how many the reporter asked for. */
  activeVolunteers: number | null;
  neededVolunteers: number | null;
};

export type UrgentRequestsView =
  | { kind: "loading" }
  | { kind: "failure"; failure: ListFailure }
  /** The API answered and nothing is inside the window. A real, calm result. */
  | { kind: "empty" }
  | {
      kind: "ready";
      rows: UrgentReport[];
      /**
       * True when every row of the fetched page was critical, so there may be
       * more past the page edge. The panel must not claim a total in that case.
       */
      truncated: boolean;
    };

export type UseUrgentRequestsResult = {
  view: UrgentRequestsView;
  /** A request is in flight, including a background refresh behind live rows. */
  isFetching: boolean;
  refetch: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Anything that is not a finite number becomes null. No `Number()` coercion. */
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * One row, or null when the fields the panel is built on are missing.
 *
 * A row with no id, no title or no deadline cannot be rendered honestly — it
 * would be a link to nowhere with an empty countdown — so it is dropped rather
 * than patched with placeholders.
 */
function readReport(raw: unknown): Omit<UrgentReport, "remainingMs"> | null {
  if (!isRecord(raw)) return null;

  const id = readString(raw.id);
  const title = readString(raw.title);
  const expiryAt = readString(raw.expiryAt);
  if (!id || !title || !expiryAt) return null;
  if (Number.isNaN(new Date(expiryAt).getTime())) return null;

  const category = isRecord(raw.category) ? raw.category : {};
  const counts = isRecord(raw.counts) ? raw.counts : {};

  return {
    id,
    title,
    expiryAt,
    category: { label: readString(category.label), emoji: readString(category.emoji) },
    landmark: isRecord(raw.location) ? readString(raw.location.landmark) : null,
    activeVolunteers: readNumber(counts.activeVolunteers),
    neededVolunteers: readNumber(raw.neededVolunteers),
  };
}

function readReportPage(raw: unknown): Array<Omit<UrgentReport, "remainingMs">> {
  const items = isRecord(raw) ? raw.items : null;
  if (!Array.isArray(items)) {
    throw new ListShapeError("The reports response had no `items` array.");
  }
  return items.map(readReport).filter((row) => row !== null);
}

function subscribeToTick(onStoreChange: () => void): () => void {
  const timer = setInterval(onStoreChange, TICK_MS);
  return () => clearInterval(timer);
}

/**
 * The wall clock, quantised to the tick.
 *
 * `useSyncExternalStore` rather than `useState` + an interval effect: the
 * snapshot must be stable between ticks or every render would produce a new
 * value and loop, and quantising to the tick bucket is what makes it stable.
 *
 * The server snapshot is 0 deliberately. React Query has no server data here,
 * so during SSR this hook's consumer is always in its loading branch and the
 * value is never rendered; 0 keeps it that way rather than putting a real
 * server clock reading into markup the browser would immediately disagree with.
 */
function useNow(): number {
  return useSyncExternalStore(
    subscribeToTick,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => 0,
  );
}

export function useUrgentRequests(): UseUrgentRequestsResult {
  const query = useQuery({
    queryKey: ["admin", "dashboard", "urgent-requests", PAGE_SIZE],
    queryFn: async ({ signal }) => {
      const raw = await apiFetch<unknown>("/admin/reports", {
        searchParams: {
          status: "open",
          sort: "expiryAt",
          order: "asc",
          limit: String(PAGE_SIZE),
        },
        signal,
      });
      return readReportPage(raw);
    },
    // Narrower than the app-wide `retry: 1`. Re-sending a request that was
    // correctly refused (403) or that the API could not parse just fails the
    // same way, a round trip later.
    retry: shouldRetryListError,
    // Deadlines move on their own, so this goes stale faster than the rest of
    // the console. No polling interval: the countdowns tick locally, the
    // app-wide refetch-on-focus covers coming back to the tab, and the header
    // carries a refresh for the operator who wants it now.
    staleTime: 15_000,
  });

  const { status, error, data } = query;
  const now = useNow();

  const view = useMemo<UrgentRequestsView>(() => {
    if (status === "pending") return { kind: "loading" };
    if (status === "error") return { kind: "failure", failure: classifyListFailure(error) };

    const fetched = data ?? [];
    const rows: UrgentReport[] = [];
    for (const row of fetched) {
      if (!isCritical(row.expiryAt, now)) continue;
      const remainingMs = msUntil(row.expiryAt, now);
      if (remainingMs === null) continue;
      rows.push({ ...row, remainingMs });
    }

    if (rows.length === 0) return { kind: "empty" };
    return { kind: "ready", rows, truncated: rows.length === PAGE_SIZE };
  }, [status, error, data, now]);

  return {
    view,
    isFetching: query.isFetching,
    refetch: () => {
      void query.refetch();
    },
  };
}
