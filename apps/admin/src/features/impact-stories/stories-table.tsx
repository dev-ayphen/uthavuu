"use client";

import { ArrowRight, Sparkles } from "lucide-react";

import {
  DataTable,
  DateCell,
  EmptyCell,
  ListPagination,
  type DataTableColumn,
} from "@/components/data";
import { Skeleton } from "@/components/ui";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { impactStoryDetailHref } from "./routes";
import { StoryFilters } from "./story-filters";
import { StoryHelperCell, StoryReporterCell } from "./story-identity";
import { StoryPhoto } from "./story-photo";
import { StoryStatusBadge } from "./story-status-badge";
import type { ImpactStoryListItem } from "./types";
import { formatDuration, useImpactStories } from "./use-impact-stories";

/**
 * Community -> Impact Stories: the public record of help that actually landed.
 *
 * READ-ONLY, DELIBERATELY. There is no approve, reject, publish, unpublish or
 * take-down control on this page, and none should be added on the strength of
 * the sidebar's `impactStoriesPending` badge. That badge implies a review queue;
 * no such state exists (a completion is inserted already `verified`), and
 * whether Impact Stories SHOULD have an approval workflow is open question 12 in
 * `docs/_audit/open-questions.md` — undecided. A button that implies a workflow
 * would be inventing product from a nav label, and the first operator to press
 * it would be the one who discovers it. Removing a story is the *report's*
 * moderation action, and it already lives on `/reports/[id]`.
 *
 * The before/after pair leads the row rather than the title, because that is how
 * this record is actually read: the pictures are the evidence, and the title is
 * the caption on them.
 *
 * NO COLUMN DECLARES A `sortKey`. The endpoint accepts no sort/order pair, and
 * a plain `z.object` strips unknown keys rather than rejecting them — so a
 * header chevron here would reorder nothing while looking like it should, which
 * reads as a broken console rather than as a fixed order. The footer says the
 * ordering out loud instead. See `use-impact-stories.ts`.
 */
const COLUMNS: ReadonlyArray<DataTableColumn<ImpactStoryListItem>> = [
  {
    id: "photos",
    header: "Before / after",
    width: "10rem",
    skeletonWidth: "80%",
    // The two thumbs SHARE the cell rather than claiming fixed widths.
    // `MODERATION_TABLE` sets `table-fixed`, and when the declared column widths
    // sum past `minWidth` the browser scales every column down proportionally —
    // so a pair of `w-16` thumbs plus the arrow can end up wider than the cell
    // they sit in and spill over the neighbouring column. `flex-1 min-w-0` makes
    // each thumb exactly half of whatever the cell turns out to be, at any
    // viewport and any scaling. (`min-w-0` again: a flex child defaults to
    // `min-width: auto` and refuses to shrink below its content.)
    cell: (row) => (
      <span className="flex w-full items-center gap-1">
        <span className="min-w-0 flex-1 overflow-hidden rounded-control border border-border">
          <StoryPhoto url={row.beforePhotoUrl} alt="Before" variant="thumb" />
        </span>
        <ArrowRight aria-hidden className="size-3 shrink-0 text-fg-faint" />
        <span className="min-w-0 flex-1 overflow-hidden rounded-control border border-border">
          <StoryPhoto url={row.afterPhotoUrl} alt="After" variant="thumb" />
        </span>
      </span>
    ),
  },
  {
    id: "story",
    header: "Story",
    primary: true,
    width: "19rem",
    skeletonWidth: "75%",
    cell: (row) => (
      <span className="min-w-0">
        <span title={row.reportTitle} className="block truncate font-medium text-fg">
          {row.reportTitle}
        </span>
        <span className="block truncate text-[11px] text-fg-faint">{row.category.label}</span>
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "7.5rem",
    skeletonWidth: "4.5rem",
    cell: (row) => <StoryStatusBadge status={row.status} />,
  },
  {
    id: "reporter",
    header: "Asked for help",
    width: "12rem",
    skeletonWidth: "70%",
    // "Deleted account", "Posted anonymously" and a real name are three
    // different outcomes here and stay three different renderings. See
    // story-identity.tsx and docs/architecture/data.md invariant 3.
    cell: (row) => <StoryReporterCell story={row} />,
  },
  {
    id: "helper",
    header: "Helped by",
    width: "11.5rem",
    skeletonWidth: "70%",
    cell: (row) => <StoryHelperCell story={row} />,
  },
  {
    id: "duration",
    header: "Took",
    align: "end",
    width: "6.5rem",
    skeletonWidth: "3.5rem",
    cell: (row) => {
      const duration = formatDuration(row.durationMinutes);
      // Null is a real value: the service returns it rather than a negative
      // number when a completion predates its report. An em dash says "we don't
      // have an honest number"; "0 min" would be a claim about how fast help
      // arrived that nobody made.
      if (!duration) return <EmptyCell />;
      return (
        <span className="tabular whitespace-nowrap text-fg-subtle" title="Request raised → help submitted">
          {duration}
        </span>
      );
    },
  },
  {
    id: "submittedAt",
    header: "Submitted",
    width: "9rem",
    skeletonWidth: "5rem",
    cell: (row) => <DateCell value={row.submittedAt} relative />,
  },
  {
    id: "verifiedAt",
    header: "Verified",
    width: "8rem",
    skeletonWidth: "5rem",
    cell: (row) => (
      <span className="tabular block whitespace-nowrap text-[11px] text-fg-faint">
        <DateCell value={row.verifiedAt} />
      </span>
    ),
  },
];

export function StoriesTable() {
  const { view, page, isFetching, isPlaceholder, refetch } = useImpactStories();

  return (
    <div className="space-y-4">
      <StoryFilters resultCount={page?.total ?? null} />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowHref={(row) => impactStoryDetailHref(row.id)}
        caption="Impact stories, newest first"
        className={MODERATION_TABLE}
        minWidth="76rem"
        loadingRows={8}
        isPlaceholder={isPlaceholder}
        onRetry={refetch}
        empty={{
          icon: <Sparkles className="size-10" />,
          title: "No impact stories yet",
          description:
            "A story is written the moment a volunteer submits proof that a request was completed — the before and after, who helped, and how long it took. Nothing has been completed yet.",
        }}
        filteredEmptyTitle="No stories match these filters"
        filteredEmptyDescription="Nothing was completed in this category or date range. Widen the dates or clear the filters to see every story."
        footer={view.kind === "ready" ? <ListPagination page={page} isFetching={isFetching} /> : null}
      />

      {view.kind === "ready" ? (
        <p className="text-[11px] text-fg-faint">
          Always ordered newest story first — the API serves one order, so these columns don&rsquo;t
          sort. Dates filter on when help was submitted, read in IST. This section is read-only: a
          story is the record of a completed mission, and taking one down means moderating its
          report.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Fills `ListStateProvider`'s Suspense boundary while `useSearchParams()`
 * resolves. Same columns, same widths, same row count as the loaded table, so
 * the server HTML and the hydrated table occupy identical space and nothing
 * shifts when the rows arrive. Reusing `DataTable`'s own loading view is what
 * keeps the two shapes from drifting apart.
 */
export function StoriesTableSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      {/* Mirrors StoryFilters: the search box, then Category / From / To.
          Omitting it would let the table jump up by a row's height the moment
          the search params resolve. */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
      </div>

      <DataTable
        view={{ kind: "loading" }}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        caption="Loading impact stories"
        className={MODERATION_TABLE}
        minWidth="76rem"
        loadingRows={8}
        empty={{ title: "" }}
      />
    </div>
  );
}
