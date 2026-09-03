"use client";

import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import {
  DataTable,
  FilterBar,
  ListPagination,
  formatDate,
  offsetListAdapter,
  useListQuery,
  useListState,
  type DataTableColumn,
  type FilterDef,
  type ListConfig,
} from "@/components/data";
import { Button } from "@/components/ui";
import { TIMEZONE_LABEL } from "@/features/announcements/dates";
import { TamilCoverageBadge, tamilCoverage } from "@/features/announcements/tamil-coverage";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { apiFetch } from "@/lib/api-client";
import { AudienceSummary } from "./audience-summary";
import { BroadcastActions } from "./broadcast-actions";
import { BroadcastStatusBadge } from "./broadcast-status-badge";
import { DeliveryCell } from "./delivery-figures";
import { BROADCASTS_NEW, broadcastEditHref } from "./routes";
import type { AdminBroadcast } from "./types";

/**
 * Broadcasts — push notifications the console sends TO citizens' phones.
 *
 * Not to be confused with Announcements, which citizens PULL by opening the
 * app; the difference is direction, and it is why this table has an audience
 * and a reach where that one has a publish window (ADR 0013).
 *
 * WHY THERE IS NO SORT
 * ───────────────────────────────────────────────────────────────────────────
 * `ListBroadcastsSchema` accepts `page`, `limit`, `status` and `q` — no `sort`
 * and no `order`. `defaultSort: null` keeps `listParamsToQuery` from appending
 * a pair the API never agreed to serve, and no column declares a `sortKey`, so
 * the headers never offer an affordance that would do nothing. Add both halves
 * together the day the DTO grows a sort. The API's own order is newest first,
 * with the id as tiebreaker.
 *
 * WHY THERE IS NO AUDIENCE FILTER, despite an obvious column for it: the DTO
 * has no `audience` param. A filter the API silently ignores is worse than no
 * filter, because the operator believes the narrowed list.
 *
 * `status` has NO default value. That is what keeps an empty table saying
 * "No broadcasts yet" rather than "nothing matched your filters" — a default
 * that narrows nothing must not count as narrowing (see `isNarrowed`).
 */
export const BROADCASTS_LIST: ListConfig = {
  defaultSort: null,
  filterKeys: ["status"],
};

/**
 * The five seeded statuses, in the lookup table's own `sort_order`.
 *
 * Hardcoded because the API exposes no endpoint that lists them, and a
 * `select distinct` over whatever has happened so far would hide `sending` on a
 * day nothing has failed — which is the one status an operator most needs to be
 * able to search for. An unknown key here yields an empty page rather than a
 * 400, by the DTO's design, so the risk of drift is a filter that finds
 * nothing rather than a broken request.
 */
const STATUS_FILTER: FilterDef = {
  id: "status",
  label: "Status",
  options: [
    { value: "", label: "Any status" },
    { value: "draft", label: "Draft" },
    { value: "scheduled", label: "Scheduled" },
    { value: "sending", label: "Sending" },
    { value: "sent", label: "Sent" },
    { value: "cancelled", label: "Cancelled" },
  ],
};

const COLUMNS: ReadonlyArray<DataTableColumn<AdminBroadcast>> = [
  {
    id: "broadcast",
    header: "Broadcast",
    // `primary` makes this the cell DataTable wraps in the row's real <Link>,
    // so ⌘-click and "open in new tab" work like any other link.
    primary: true,
    width: "22rem",
    skeletonWidth: "80%",
    cell: (row) => (
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg" title={row.titleEn}>
          {row.titleEn}
        </span>
        {/* The Tamil title, when there is one, sits UNDER the English rather
            than replacing it: the console's chrome is English, and an operator
            looking for the notice they wrote needs the words they typed. */}
        {row.titleTa ? (
          <span lang="ta" className="block truncate text-[11px] text-fg-faint" title={row.titleTa}>
            {row.titleTa}
          </span>
        ) : (
          <span className="block truncate text-[11px] text-fg-faint" title={row.bodyEn}>
            {row.bodyEn}
          </span>
        )}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "7rem",
    skeletonWidth: "4rem",
    // Straight from the API. Never recomputed from `scheduledAt` — see
    // BroadcastStatusBadge for why that temptation is dangerous here.
    cell: (row) => <BroadcastStatusBadge status={row.status} />,
  },
  {
    id: "audience",
    header: "Audience",
    width: "12rem",
    skeletonWidth: "70%",
    cell: (row) => <AudienceSummary record={row} />,
  },
  {
    id: "tamil",
    header: "Tamil",
    width: "7.5rem",
    skeletonWidth: "4.5rem",
    // Reused verbatim from Announcements: the two-column translation model and
    // the per-field fallback rule are identical, and a second implementation
    // would be a second thing to keep in step with the alert renderer.
    cell: (row) => <TamilCoverageBadge coverage={tamilCoverage(row)} />,
  },
  {
    id: "reach",
    header: "Reach",
    width: "11rem",
    skeletonWidth: "7rem",
    // Two figures, two units — never a ratio. See delivery-figures.tsx.
    cell: (row) => <DeliveryCell record={row} />,
  },
  {
    id: "when",
    header: `When (${TIMEZONE_LABEL})`,
    width: "11.5rem",
    skeletonWidth: "8rem",
    cell: (row) => <WhenCell record={row} />,
  },
  {
    id: "actions",
    header: "Actions",
    // Stops a click on these buttons also triggering the row's navigation.
    interactive: true,
    align: "end",
    width: "13rem",
    skeletonWidth: "6rem",
    cell: (row) => (
      <span className="flex items-center justify-end gap-1.5">
        <BroadcastActions record={row} />
      </span>
    ),
  },
];

/**
 * The one date that matters for this row, labelled with WHICH date it is.
 *
 * A bare timestamp in a column called "When" would read as the send time on
 * every row, including the scheduled ones that have not sent and the cancelled
 * ones that never will. Naming it is the difference between a record and a
 * claim.
 */
function WhenCell({ record }: { record: AdminBroadcast }) {
  const sent = formatDate(record.sentAt, true);
  if (sent) {
    return (
      <span>
        <span className="micro-label block text-fg-faint">Sent</span>
        <span className="tabular block whitespace-nowrap text-fg-subtle">{sent}</span>
      </span>
    );
  }

  const planned = formatDate(record.scheduledAt, true);
  if (planned) {
    return (
      <span>
        <span className="micro-label block text-fg-faint">
          {record.status.key === "cancelled" ? "Was planned" : "Planned"}
        </span>
        <span className="tabular block whitespace-nowrap text-fg-subtle">{planned}</span>
      </span>
    );
  }

  return (
    <span>
      <span className="micro-label block text-fg-faint">Written</span>
      <span className="tabular block whitespace-nowrap text-fg-subtle">
        {formatDate(record.createdAt, true)}
      </span>
    </span>
  );
}

export function BroadcastsTable() {
  const { params } = useListState();

  const { view, page, isFetching, isPlaceholder, refetch } = useListQuery<
    unknown,
    AdminBroadcast
  >({
    key: ["admin", "broadcasts"],
    // Pinned rather than left to `detectListAdapter`: the envelope is settled
    // (`{ items, pagination: { page, limit, total, totalPages } }`, verified
    // against the running API), and the detector cannot tell a missing total
    // from an API that has none, so it would quietly stop rendering "of 137".
    adapter: offsetListAdapter<AdminBroadcast>(),
    // The ONLY place this feature reads the list endpoint.
    fetcher: ({ searchParams, signal }) => apiFetch("/admin/broadcasts", { searchParams, signal }),
  });

  return (
    <div className="space-y-4">
      <FilterBar
        filters={[STATUS_FILTER]}
        searchPlaceholder="Search English and Tamil copy…"
        searchLabel="Search broadcasts"
        resultCount={page?.total ?? null}
        resultNoun="broadcast"
      />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowHref={(row) => broadcastEditHref(row.id)}
        caption="Broadcasts"
        className={MODERATION_TABLE}
        onRetry={refetch}
        isPlaceholder={isPlaceholder}
        loadingRows={Math.min(params.pageSize, 10)}
        minWidth="84rem"
        empty={{
          icon: <Megaphone className="size-10" />,
          title: "No broadcasts yet",
          description:
            "A broadcast pushes a notification to citizens' phones — a flood warning, a relief-centre opening, a service outage. Nothing has been written yet.",
          action: (
            <Button size="sm" asChild>
              <Link href={BROADCASTS_NEW}>
                <Plus />
                Write the first broadcast
              </Link>
            </Button>
          ),
        }}
        filteredEmptyTitle="No broadcasts match these filters"
        filteredEmptyDescription="Nothing matches what you're filtering on. Widen the status filter or clear the search to see every broadcast again."
        footer={<ListPagination page={page} isFetching={isFetching} />}
      />
    </div>
  );
}
