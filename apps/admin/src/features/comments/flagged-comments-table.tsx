"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import {
  ClearFiltersButton,
  DataTable,
  DateCell,
  filterTint,
  ListPagination,
  offsetListAdapter,
  RemovedContentCell,
  useListQuery,
  useListState,
  type DataTableColumn,
  type FilterDef,
  type ListConfig,
} from "@/components/data";
import { InlineField, Select } from "@/components/ui";
import { reportDetailHref } from "@/features/moderation/routes";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { CommentActions } from "./comment-actions";
import { FlagStatusBadge, ResolveFlagAction } from "./flag-actions";
import type { AdminFlaggedCommentRow } from "./types";

const FLAG_KEYS = [["admin", "flagged-comments"], ["admin", "comments"]];

/**
 * The comment-flag review queue.
 *
 * THE ONE FILTER THAT ISN'T A PLAIN DEFAULT
 * ───────────────────────────────────────────────────────────────────────────
 * `ListFlaggedCommentsSchema.status` is OPTIONAL, and omitting it does not mean
 * "everything" — `listFlags()` falls back to `inArray(status, ['submitted',
 * 'under_review'])`, i.e. the pending queue. There is no `all` value to ask
 * for, so the resting view is genuinely narrowed server-side and no
 * `defaultFilters` entry can express that.
 *
 * Two consequences, both handled here rather than papered over:
 *
 *   The blank option is labelled "Waiting for review", not "All". Calling it
 *   "All" would be false — picking it hides every resolved flag.
 *
 *   The empty-state copy says the QUEUE is clear, not that no flags exist.
 *   `isNarrowed` is false at rest, so `DataTable` shows the `empty` copy, and
 *   "No flagged comments" would read as "nobody has ever flagged anything"
 *   when there may be a hundred already dismissed. The copy points at the
 *   status filter instead.
 *
 * This queue's pending pair is deliberately the same one AdminDashboardService
 * counts for its `flaggedCommentsPendingReview` tile, so the sidebar badge and
 * the number of rows here can never disagree.
 */
export const FLAGGED_COMMENTS_LIST: ListConfig = {
  defaultSort: null,
  filterKeys: ["status", "reportId"],
  defaultFilters: {},
};

const FILTERS: readonly FilterDef[] = [
  {
    id: "status",
    label: "Flag state",
    allLabel: "Waiting for review",
    options: [
      { value: "submitted", label: "Submitted" },
      { value: "under_review", label: "Under review" },
      { value: "action_taken", label: "Action taken" },
      { value: "dismissed", label: "Dismissed" },
    ],
  },
];

const COLUMNS: ReadonlyArray<DataTableColumn<AdminFlaggedCommentRow>> = [
  {
    id: "comment",
    header: "Flagged comment",
    primary: true,
    width: "21rem",
    skeletonWidth: "85%",
    // The report title rides along as a second line rather than taking a column
    // of its own. Eight thin columns pushed the Resolve button off a 1440px
    // screen, and the button is the entire point of this queue — pairing the
    // facts that are read together buys the width back without losing any.
    cell: (row) => (
      <span className="block min-w-0">
        <RemovedContentCell body={row.comment.body} removed={row.comment.removed} />
        <Link
          href={reportDetailHref(row.report.id)}
          title={row.report.title}
          className="mt-0.5 block truncate rounded-control text-[11px] text-fg-faint hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          on “{row.report.title}”
        </Link>
      </span>
    ),
  },
  {
    id: "reason",
    header: "Why it was flagged",
    width: "10.5rem",
    skeletonWidth: "60%",
    cell: (row) => (
      <span className="block min-w-0">
        <span className="block truncate text-xs text-fg" title={row.reason}>
          {row.reason}
        </span>
        <span className="block truncate text-[11px] text-fg-faint">
          raised by {row.flaggedBy.name}
        </span>
      </span>
    ),
  },
  {
    id: "author",
    header: "Comment by",
    width: "9rem",
    skeletonWidth: "55%",
    cell: (row) => (
      <span
        className={
          row.comment.author.deleted
            ? "block truncate text-xs text-fg-faint italic"
            : "block truncate text-xs text-fg-subtle"
        }
        title={row.comment.author.name}
      >
        {row.comment.author.deleted ? "Deleted account" : row.comment.author.name}
      </span>
    ),
  },
  {
    id: "status",
    header: "State",
    width: "8rem",
    skeletonWidth: "4rem",
    cell: (row) => <FlagStatusBadge status={row.status} />,
  },
  {
    id: "createdAt",
    header: "Raised",
    width: "9.5rem",
    skeletonWidth: "5rem",
    cell: (row) => <DateCell value={row.createdAt} relative />,
  },
  {
    id: "actions",
    header: "Actions",
    interactive: true,
    align: "end",
    width: "14rem",
    skeletonWidth: "7rem",
    cell: (row) => (
      <span className="flex items-center justify-end gap-1.5">
        {/* Both halves of the decision live in one row: deal with the comment,
            then record what was decided about the flag. Splitting them across
            two pages is how a queue fills with removed comments whose flags are
            still marked "submitted". */}
        <CommentActions
          commentId={row.comment.id}
          removed={row.comment.removed}
          preview={row.comment.body}
          invalidateKeys={FLAG_KEYS}
        />
        <ResolveFlagAction flag={row} />
      </span>
    ),
  },
];

export function FlaggedCommentsTable() {
  const { view, page, params, isFetching, isPlaceholder, refetch } = useListQuery<
    unknown,
    AdminFlaggedCommentRow
  >({
    key: ["admin", "flagged-comments"],
    adapter: offsetListAdapter<AdminFlaggedCommentRow>(),
    fetcher: ({ searchParams, signal }) =>
      apiFetch("/admin/flagged-comments", { searchParams, signal }),
  });

  return (
    <div className="space-y-4">
      <FlagFilters total={page?.total ?? null} />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        caption="Flagged comments"
        className={MODERATION_TABLE}
        onRetry={refetch}
        isPlaceholder={isPlaceholder}
        loadingRows={Math.min(params.pageSize, 10)}
        // Sized so Resolve is reachable on a 1440px laptop without scrolling
        // sideways first.
        minWidth="72rem"
        empty={{
          icon: <ShieldCheck className="size-10" />,
          title: "Nothing waiting for review",
          description:
            "No comment flags are sitting unresolved. Flags that were already actioned or dismissed are hidden — use the Flag state filter to see them.",
        }}
        filteredEmptyTitle="No flags in that state"
        filteredEmptyDescription="Nothing matches what you're filtering on. Clear the filters to go back to the review queue."
        footer={<ListPagination page={page} isFetching={isFetching} />}
      />
    </div>
  );
}

/**
 * This page's filter row, hand-rolled instead of using `FilterBar`.
 *
 * `FilterBar` always renders a `ListSearchInput`, and
 * `ListFlaggedCommentsSchema` has no `q` — Zod would strip it silently, so
 * typing would set `?q=`, flip `isNarrowed` to true, change the empty copy to
 * "nothing matched your filters", and return exactly the same rows. A search
 * box that does nothing while claiming to have filtered is worse than no
 * search box, so this page grows its own row from the same `useListState`.
 */
function FlagFilters({ total }: { total: number | null }) {
  const { params, setFilter, isFilterActive } = useListState();
  const filter = FILTERS[0];
  if (!filter) return null;
  const value = params.filters[filter.id] ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InlineField label={filter.label}>
        {(id) => (
          <Select
            id={id}
            size="sm"
            value={value}
            onChange={(event) => setFilter(filter.id, event.target.value)}
            className={cn("w-auto", filterTint(isFilterActive(filter.id)))}
          >
            <option value="">{filter.allLabel}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </InlineField>

      <ClearFiltersButton />

      <p aria-live="polite" className="sr-only">
        {total === null ? "" : `${total} ${total === 1 ? "flag" : "flags"}`}
      </p>
    </div>
  );
}
