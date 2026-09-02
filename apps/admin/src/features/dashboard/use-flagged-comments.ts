"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { shouldRetryListError } from "@/hooks/use-list-query";
import { apiFetch } from "@/lib/api-client";
import { classifyListFailure, type ListFailure } from "@/lib/list-failure";
import { ListShapeError } from "@/lib/list-page";

/**
 * The newest comment flags waiting for review, from
 * `GET /admin/flagged-comments?limit=5`.
 *
 * WHY THIS PANEL IS ABOUT COMMENTS AND NOT REPORTS
 * ───────────────────────────────────────────────────────────────────────────
 * The dashboard's design asked for "Latest flagged reports". There is no such
 * thing in Uthavu: `report_comment_flags` is the only flag table in the schema,
 * there is no `report_flags`, and nothing anywhere lets a citizen flag a
 * report. `config/nav.ts` already made this correction for the sidebar entry
 * ("Flagged Reports" -> "Flagged Comments"); this panel is the same correction
 * on the dashboard, so the console does not disagree with itself about what can
 * be flagged. The counter tile above it that reads "Fake reports" is blank for
 * the same reason and says so in its own note.
 *
 * NO STATUS PARAMETER, DELIBERATELY
 * ───────────────────────────────────────────────────────────────────────────
 * `ListFlaggedCommentsSchema.status` is optional, and omitting it does NOT mean
 * "everything": `AdminCommentsService.listFlags()` falls back to
 * `status in ('submitted', 'under_review')` — the review queue. That is the
 * same pair `AdminDashboardService` counts for `flaggedCommentsPendingReview`,
 * which is the "Pending review" tile directly above this panel, and the same
 * resting view `/reports/flagged` shows. All three therefore agree by
 * construction; passing a status here is what would break that.
 *
 * Rows arrive newest-first (`order by created_at desc, id desc`), so "latest"
 * is the API's ordering, not a re-sort here.
 */

/** Five rows: a glance, with the full queue one click away in the footnote. */
const PAGE_SIZE = 5;

export type FlaggedCommentSummary = {
  /** The FLAG's id, not the comment's. */
  id: string;
  /** When it was flagged. ISO, or null if the API sent something unparseable. */
  createdAt: string | null;
  status: { key: string; label: string };
  body: string | null;
  /** A moderator already took the comment down; the flag is still open. */
  removed: boolean;
  reportId: string | null;
  reportTitle: string | null;
};

export type FlaggedCommentsView =
  | { kind: "loading" }
  | { kind: "failure"; failure: ListFailure }
  /** The API answered and the queue is clear. Not "nobody ever flagged". */
  | { kind: "empty" }
  | {
      kind: "ready";
      rows: FlaggedCommentSummary[];
      /** Flags waiting for review in total, or null if the API did not say. */
      total: number | null;
      /**
       * True when these rows ARE the whole queue, so the panel may say so.
       *
       * Without the API's total it is inferred from a short page, which is the
       * only honest reading available: a full page might have more behind it,
       * and claiming completeness there would tell a moderator the queue is
       * done when 78 flags are sitting one click away.
       */
      showingAll: boolean;
    };

export type UseFlaggedCommentsResult = {
  view: FlaggedCommentsView;
  /** A request is in flight, including a background refresh behind live rows. */
  isFetching: boolean;
  refetch: () => void;
};

type FlaggedCommentsPage = { items: FlaggedCommentSummary[]; total: number | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readIso(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  return Number.isNaN(new Date(raw).getTime()) ? null : raw;
}

/**
 * One flag, or null when it has no id — without one the row cannot be keyed and
 * its "Review" link would point at the unfiltered queue, which is a lie about
 * where the click goes.
 */
function readFlag(raw: unknown): FlaggedCommentSummary | null {
  if (!isRecord(raw)) return null;

  const id = readString(raw.id);
  if (!id) return null;

  const status = isRecord(raw.status) ? raw.status : {};
  const comment = isRecord(raw.comment) ? raw.comment : {};
  const report = isRecord(raw.report) ? raw.report : {};

  const key = readString(status.key);

  return {
    id,
    createdAt: readIso(raw.createdAt),
    status: {
      key: key ?? "",
      // The API authors the label. Falling back to the raw key rather than to
      // invented prose keeps an unrecognised status readable instead of blank.
      label: readString(status.label) ?? key ?? "Flagged",
    },
    body: readString(comment.body),
    removed: comment.removed === true,
    reportId: readString(report.id),
    reportTitle: readString(report.title),
  };
}

function readFlaggedCommentsPage(raw: unknown): FlaggedCommentsPage {
  const body = isRecord(raw) ? raw : null;
  const items = body?.items;
  if (!Array.isArray(items)) {
    throw new ListShapeError("The flagged-comments response had no `items` array.");
  }

  const pagination = body && isRecord(body.pagination) ? body.pagination : null;

  return {
    items: items.map(readFlag).filter((row) => row !== null),
    total: pagination ? readNumber(pagination.total) : null,
  };
}

export function useFlaggedComments(): UseFlaggedCommentsResult {
  const query = useQuery({
    queryKey: ["admin", "dashboard", "flagged-comments", PAGE_SIZE],
    queryFn: async ({ signal }) => {
      const raw = await apiFetch<unknown>("/admin/flagged-comments", {
        searchParams: { limit: String(PAGE_SIZE) },
        signal,
      });
      return readFlaggedCommentsPage(raw);
    },
    // Narrower than the app-wide `retry: 1`: a refusal (403) and an unreadable
    // response both fail identically on a second attempt.
    retry: shouldRetryListError,
    staleTime: 30_000,
  });

  const { status, error, data } = query;

  const view = useMemo<FlaggedCommentsView>(() => {
    if (status === "pending") return { kind: "loading" };
    if (status === "error") return { kind: "failure", failure: classifyListFailure(error) };
    if (!data || data.items.length === 0) return { kind: "empty" };
    return {
      kind: "ready",
      rows: data.items,
      total: data.total,
      showingAll:
        data.total !== null ? data.items.length >= data.total : data.items.length < PAGE_SIZE,
    };
  }, [status, error, data]);

  return {
    view,
    isFetching: query.isFetching,
    refetch: () => {
      void query.refetch();
    },
  };
}
