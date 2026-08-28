"use client";

import { useMemo } from "react";
import { Camera, Megaphone, MessageSquare, Users } from "lucide-react";

import {
  DataTable,
  DateCell,
  FilterBar,
  ListPagination,
  formatDate,
  MutedCell,
  offsetListAdapter,
  PersonCell,
  useListQuery,
  useListState,
  type DataTableColumn,
  type FilterDef,
  type ListConfig,
} from "@/components/data";
import { reportDetailHref } from "@/features/moderation/routes";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ReportStatusBadge } from "./report-status-badge";
import type { AdminReportRow } from "./types";
import { useReportCategoryOptions } from "./use-report-categories";

/**
 * The moderation queue: every help request, in whatever state.
 *
 * `ListAdminReportsSchema` defaults `status` to `all` and `includeDeleted` to
 * `false`, so both are declared here as resting values. That keeps `/reports`
 * clean, and — the part that matters — keeps an empty table saying "No reports
 * yet" instead of "nothing matched your filters", because neither default is
 * narrowing in the sense an operator means.
 *
 * `reporterId` is a filter key with no select of its own: it exists so a link
 * from a member's profile ("All 12 reports") lands here already scoped, and so
 * that scope shows up as an active filter with a working "Clear all". Without
 * it in `filterKeys` the parameter would be dropped from the URL on the next
 * page change and silently widen the view.
 */
export const REPORTS_LIST: ListConfig = {
  defaultSort: { key: "createdAt", direction: "desc" },
  filterKeys: ["status", "includeDeleted", "categoryKey", "reporterId"],
  defaultFilters: { status: "all", includeDeleted: "false" },
};

const STATUS_FILTER: FilterDef = {
  id: "status",
  label: "Status",
  options: [
    { value: "all", label: "Any status" },
    { value: "open", label: "Open" },
    { value: "expired", label: "Expired" },
    { value: "closed", label: "Closed" },
    { value: "completed", label: "Completed" },
    { value: "deleted", label: "Hidden / removed" },
  ],
};

const INCLUDE_DELETED_FILTER: FilterDef = {
  id: "includeDeleted",
  label: "Removed",
  options: [
    { value: "false", label: "Hidden from view" },
    { value: "true", label: "Included" },
  ],
};

const COLUMNS: ReadonlyArray<DataTableColumn<AdminReportRow>> = [
  {
    id: "title",
    header: "Request",
    sortKey: "title",
    primary: true,
    width: "21rem",
    skeletonWidth: "75%",
    cell: (row) => (
      <span className="min-w-0">
        <span
          title={row.title}
          className={cn(
            "block truncate font-medium",
            // A removed report stays readable — struck through, never blanked.
            // A moderation log you cannot read is not reviewable.
            row.status === "deleted" ? "text-fg-faint line-through" : "text-fg",
          )}
        >
          {row.title}
        </span>
        <span className="block truncate text-[11px] text-fg-faint" title={row.description}>
          {row.description}
        </span>
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "7.5rem",
    skeletonWidth: "4rem",
    // Rendered straight from `row.status`, which the API derived. Never
    // recomputed here from expiryAt — see ReportStatusBadge for why.
    cell: (row) => <ReportStatusBadge status={row.status} />,
  },
  {
    id: "category",
    header: "Category",
    width: "9rem",
    skeletonWidth: "6rem",
    cell: (row) => (
      <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
        {row.category.emoji ? <span aria-hidden>{row.category.emoji}</span> : null}
        <span className="truncate">{row.category.label}</span>
      </span>
    ),
  },
  {
    id: "reporter",
    header: "Reporter",
    width: "10.5rem",
    skeletonWidth: "60%",
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <PersonCell
          person={{
            id: row.reporter.id ?? undefined,
            name: row.reporter.name,
            avatarUrl: row.reporter.avatarUrl,
            deleted: row.reporter.deleted,
          }}
        />
        {/* The console always sees who filed it. This marks the rows where
            CITIZENS do not — an anonymous report handled without noticing that
            is how a reporter's identity ends up in a public reply. */}
        {row.reporter.anonymousToPublic ? (
          <span
            title="Posted anonymously — citizens do not see this name."
            className="shrink-0 rounded-pill border border-border bg-surface-2 px-1.5 text-[10px] font-bold text-fg-faint"
          >
            anon
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: "activity",
    header: "Activity",
    align: "end",
    width: "8rem",
    skeletonWidth: "4rem",
    cell: (row) => (
      <span className="tabular flex items-center justify-end gap-2.5 text-[11px] text-fg-subtle">
        <span className="flex items-center gap-1" title={`${row.counts.activeVolunteers} active volunteers`}>
          <Users aria-hidden className="size-3 text-fg-faint" />
          {row.counts.activeVolunteers}/{row.neededVolunteers}
        </span>
        <span className="flex items-center gap-1" title={`${row.counts.comments} comments`}>
          <MessageSquare aria-hidden className="size-3 text-fg-faint" />
          {row.counts.comments}
        </span>
        <span className="flex items-center gap-1" title={`${row.counts.photos} photos`}>
          <Camera aria-hidden className="size-3 text-fg-faint" />
          {row.counts.photos}
        </span>
      </span>
    ),
  },
  {
    id: "location",
    header: "Landmark",
    width: "7.5rem",
    cell: (row) => <MutedCell value={row.location.landmark} />,
  },
  {
    id: "createdAt",
    header: "Filed",
    sortKey: "createdAt",
    width: "9.5rem",
    skeletonWidth: "5rem",
    // Filed and expires are read together — "posted 3h ago, window closed 2h
    // ago" is one thought — so they share a column rather than costing two.
    // Both stay independently sortable: the header sorts by filed date, and the
    // Expires column below sorts by expiry, which is how a moderator finds the
    // requests about to lapse.
    cell: (row) => (
      <span className="tabular block whitespace-nowrap text-fg-subtle">
        <DateCell value={row.createdAt} relative />
      </span>
    ),
  },
  {
    id: "expiryAt",
    header: "Expires",
    sortKey: "expiryAt",
    width: "9rem",
    skeletonWidth: "5rem",
    cell: (row) => (
      <span className="tabular block whitespace-nowrap text-[11px] text-fg-faint">
        {formatDate(row.expiryAt, true)}
      </span>
    ),
  },
];

export function ReportsTable() {
  const { toggleSort, params: listParams } = useListState();
  const categoryOptions = useReportCategoryOptions();

  const filters = useMemo<readonly FilterDef[]>(() => {
    const defs: FilterDef[] = [STATUS_FILTER, INCLUDE_DELETED_FILTER];
    // Absent for an ops admin, who cannot read the category table at all.
    // See use-report-categories.ts.
    if (categoryOptions) {
      defs.push({
        id: "categoryKey",
        label: "Category",
        allLabel: "All categories",
        options: categoryOptions,
      });
    }
    return defs;
  }, [categoryOptions]);

  const { view, page, params, isFetching, isPlaceholder, refetch } = useListQuery<
    unknown,
    AdminReportRow
  >({
    key: ["admin", "reports"],
    adapter: offsetListAdapter<AdminReportRow>(),
    fetcher: ({ searchParams, signal }) => apiFetch("/admin/reports", { searchParams, signal }),
  });

  const scopedToReporter = listParams.filters.reporterId;

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        searchPlaceholder="Title, description or landmark…"
        searchLabel="Search reports"
        resultCount={page?.total ?? null}
        resultNoun="report"
      />

      {/* A reporter scope arrives by link, not by a visible control, so it has
          to announce itself — otherwise the table looks like the whole queue
          and the counts look wrong. "Clear all" in the FilterBar removes it. */}
      {scopedToReporter ? (
        <p className="flex items-center gap-2 rounded-control border border-primary-soft-border bg-primary-soft px-3 py-2 text-xs text-primary-soft-fg">
          <Megaphone aria-hidden className="size-3.5 shrink-0" />
          Showing only reports filed by one member. Use “Clear all” to see the whole queue.
        </p>
      ) : null}

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowHref={(row) => reportDetailHref(row.id)}
        caption="Help requests"
        className={MODERATION_TABLE}
        sort={params.sort}
        onToggleSort={toggleSort}
        onRetry={refetch}
        isPlaceholder={isPlaceholder}
        loadingRows={Math.min(params.pageSize, 10)}
        minWidth="72.5rem"
        empty={{
          icon: <Megaphone className="size-10" />,
          title: "No reports yet",
          description:
            "Every help request filed from the mobile app lands here. Removed reports are excluded until you switch the Removed filter.",
        }}
        filteredEmptyTitle="No reports match these filters"
        filteredEmptyDescription="Nothing matches what you're filtering on. Widen the filters or clear them to see the whole queue again."
        footer={<ListPagination page={page} isFetching={isFetching} />}
      />
    </div>
  );
}
