"use client";

import { LifeBuoy } from "lucide-react";

import {
  DataTable,
  DateCell,
  FilterBar,
  ListPagination,
  PersonCell,
  useListState,
  type DataTableColumn,
} from "@/components/data";
import { Badge } from "@/components/ui";
import {
  statusTone,
  SUPPORT_FILTERS,
  useSupportTickets,
  type SupportTicketRow,
} from "./use-support-tickets";

const COLUMNS: ReadonlyArray<DataTableColumn<SupportTicketRow>> = [
  {
    id: "subject",
    header: "Ticket",
    primary: true,
    skeletonWidth: "85%",
    cell: (row) => (
      <span className="block min-w-0 max-w-[26rem]">
        <span className="block truncate" title={row.subject}>
          {row.subject}
        </span>
        {/* The body, one line, with the whole thing on hover. A queue is worked
            by skimming; making someone open every row to learn what it is about
            is what makes a queue feel slow. */}
        <span
          className="mt-0.5 block truncate text-[11px] font-normal text-fg-faint"
          title={row.description}
        >
          {row.description}
        </span>
      </span>
    ),
  },
  {
    id: "user",
    header: "Raised by",
    width: "14rem",
    cell: (row) => (
      <PersonCell
        person={{ id: row.user.id, name: row.user.name, avatarUrl: row.user.avatarUrl }}
        secondary={row.user.phoneNumber}
      />
    ),
  },
  {
    id: "category",
    header: "Category",
    width: "11rem",
    cell: (row) => (
      <Badge tone="neutral" title={row.category.key}>
        {row.category.label}
      </Badge>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "8rem",
    cell: (row) => (
      <Badge tone={statusTone(row.status.key)} title={row.status.key}>
        {row.status.label}
      </Badge>
    ),
  },
  {
    id: "createdAt",
    header: "Raised",
    width: "11rem",
    // Both sort keys are in `LIST_SUPPORT_TICKETS_SORTS`; nothing else is, so
    // no other column advertises a sort it cannot perform.
    sortKey: "createdAt",
    cell: (row) => <DateCell value={row.createdAt} relative />,
  },
  {
    id: "updatedAt",
    header: "Last touched",
    width: "11rem",
    sortKey: "updatedAt",
    cell: (row) => <DateCell value={row.updatedAt} relative />,
  },
];

/**
 * Feedback and support requests raised from the mobile app's Help & Support
 * screen. Empty today — which is a working queue, not a broken page.
 */
export function SupportTable() {
  const { view, page, isFetching, isPlaceholder, refetch } = useSupportTickets();
  const { params, toggleSort } = useListState();

  return (
    <div className="space-y-3">
      <FilterBar
        filters={SUPPORT_FILTERS}
        searchPlaceholder="Search subject and body…"
        searchLabel="Search tickets"
        resultCount={page?.total ?? null}
        resultNoun="ticket"
      />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        caption="Support tickets"
        minWidth="72rem"
        loadingRows={8}
        isPlaceholder={isPlaceholder}
        sort={params.sort}
        onToggleSort={toggleSort}
        onRetry={refetch}
        empty={{
          icon: <LifeBuoy className="size-10" />,
          title: "No support tickets yet",
          description:
            "Nothing has been raised from the app's Help & Support screen. When someone submits one, it lands here as New — this is an empty queue, not a missing one.",
        }}
        filteredEmptyTitle="No tickets match these filters"
        filteredEmptyDescription="No ticket matches this combination of status, category and search. Clear the filters to see the whole queue."
        footer={
          view.kind === "ready" ? (
            <ListPagination page={page} isFetching={isFetching} />
          ) : null
        }
      />
    </div>
  );
}

/** Suspense fallback: the same table, in its loading view. */
export function SupportTableSkeleton() {
  return (
    <DataTable
      view={{ kind: "loading" }}
      columns={COLUMNS}
      rowKey={(row) => row.id}
      caption="Loading support tickets"
      minWidth="72rem"
      loadingRows={8}
      empty={{ title: "" }}
    />
  );
}
