"use client";

import { LifeBuoy, MessageSquare } from "lucide-react";

import {
  DataTable,
  DateCell,
  FilterBar,
  ListPagination,
  MutedCell,
  PersonCell,
  useListState,
  type DataTableColumn,
} from "@/components/data";
import { Badge } from "@/components/ui";

import { TicketPriorityBadge, TicketStatusBadge } from "./badges";
import { ticketDetailHref } from "./routes";
import { StatusTabs } from "./status-tabs";
import type { SupportTicket } from "./types";
import { useSupportFilters, useSupportTickets } from "./use-support-tickets";

/**
 * The support queue.
 *
 * COLUMN ORDER IS TRIAGE ORDER. An agent picking up the queue asks, in this
 * sequence: what is it, who is it from, what kind, how urgent, where is it, who
 * has it, how stale. Sorting the columns any other way makes them re-scan the
 * row for each question.
 */
const COLUMNS: ReadonlyArray<DataTableColumn<SupportTicket>> = [
  {
    id: "ticket",
    header: "Ticket",
    primary: true,
    skeletonWidth: "85%",
    cell: (row) => (
      <span className="block min-w-0 max-w-[26rem]">
        <span className="flex min-w-0 items-baseline gap-2">
          {/* The reference a citizen reads out over the phone (`UT-1042`), so
              it is the one thing on the row that must be selectable and
              monospaced. Null until the API sends it — rendered as nothing
              rather than as a made-up number. */}
          {row.ticketNumber ? (
            <span className="tabular shrink-0 text-[11px] font-bold text-fg-faint">
              {row.ticketNumber}
            </span>
          ) : null}
          <span className="min-w-0 truncate" title={row.subject}>
            {row.subject}
          </span>
          {/* An API-served count (`messageTotals()`), never one this console
              derived. It is the queue's most useful signal — a ticket with no
              messages is one nobody has answered — and it says "messages"
              rather than "replies" because the count includes internal notes. */}
          {row.messageCount ? (
            <span
              className="tabular flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-fg-faint"
              title={`${row.messageCount} message${row.messageCount === 1 ? "" : "s"} in this thread, including internal notes`}
            >
              <MessageSquare aria-hidden className="size-3" />
              {row.messageCount}
            </span>
          ) : null}
        </span>
        {/* The citizen's opening message, one line, with the whole thing on
            hover. A queue is worked by skimming; making someone open every row
            to learn what it is about is what makes a queue feel slow. */}
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
        secondary={row.user.phone}
      />
    ),
  },
  {
    id: "category",
    header: "Category",
    width: "10rem",
    cell: (row) => (
      <Badge tone="neutral" title={row.category.key}>
        {row.category.label}
      </Badge>
    ),
  },
  {
    id: "priority",
    header: "Priority",
    width: "7rem",
    cell: (row) => <TicketPriorityBadge priority={row.priority} />,
  },
  {
    id: "status",
    header: "Status",
    width: "8rem",
    cell: (row) => <TicketStatusBadge status={row.status} />,
  },
  {
    id: "assigned",
    header: "Assigned",
    width: "11rem",
    cell: (row) =>
      row.assignedAdmin ? (
        <PersonCell person={{ id: row.assignedAdmin.id, name: row.assignedAdmin.name }} />
      ) : (
        // Not an em dash. "Unassigned" is a state somebody has to act on, and
        // it is the thing an agent scans this column for.
        <MutedCell value="Unassigned" />
      ),
  },
  {
    id: "updatedAt",
    header: "Updated",
    width: "11rem",
    // Both sort keys are in `LIST_SUPPORT_TICKETS_SORTS`; nothing else is, so
    // no other column advertises a sort it cannot perform.
    sortKey: "updatedAt",
    cell: (row) => <DateCell value={row.updatedAt} relative />,
  },
];

/**
 * Feedback, bug reports and account problems raised from the mobile app's Help
 * & Support screen — and the console's half of the conversation.
 *
 * Rows open the ticket. The whole point of this rebuild is that a support
 * ticket is a thread to work, not a record to read, so the row is a link to the
 * workbench rather than a dead end.
 */
export function SupportTable({ currentAdminId }: { currentAdminId: string | null }) {
  const { view, page, isFetching, isPlaceholder, refetch } = useSupportTickets();
  const { params, toggleSort } = useListState();
  const filters = useSupportFilters({ currentAdminId });

  return (
    <div className="space-y-3">
      <StatusTabs />

      <FilterBar
        filters={filters}
        searchPlaceholder="Search subject, description or UT-number…"
        searchLabel="Search tickets"
        resultCount={page?.total ?? null}
        resultNoun="ticket"
      />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowHref={(row) => ticketDetailHref(row.id)}
        caption="Support tickets"
        minWidth="82rem"
        loadingRows={8}
        isPlaceholder={isPlaceholder}
        sort={params.sort}
        onToggleSort={toggleSort}
        onRetry={refetch}
        empty={{
          icon: <LifeBuoy className="size-10" />,
          title: "No support tickets yet",
          description:
            "Nothing has been raised from the app's Help & Support screen. When someone submits one, it lands here as Open — this is an empty queue, not a missing one.",
        }}
        // `q` matches subject, description AND ticket_number server-side, which
        // is why the placeholder names the UT-number: "find UT-1042" is the
        // single most likely thing typed into this box, and a search that could
        // not find it would look broken.
        // The filtered-empty case is handled by DataTable off `view.narrowed`,
        // which is why the status tabs must clear the param rather than write
        // `status=all`: a tab that always sets a filter would make every empty
        // result look filtered, including a genuinely clear queue.
        filteredEmptyTitle="No tickets match these filters"
        filteredEmptyDescription="No ticket matches this combination of status, priority, category, assignee and search. Clear the filters to see the whole queue."
        footer={view.kind === "ready" ? <ListPagination page={page} isFetching={isFetching} /> : null}
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
      minWidth="82rem"
      loadingRows={8}
      empty={{ title: "" }}
    />
  );
}
