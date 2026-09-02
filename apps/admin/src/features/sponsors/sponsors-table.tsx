"use client";

import Link from "next/link";
import { Handshake, Plus } from "lucide-react";

import {
  DataTable,
  FilterBar,
  ListPagination,
  offsetListAdapter,
  useListQuery,
  useListState,
  type DataTableColumn,
  type ListConfig,
} from "@/components/data";
import { Button } from "@/components/ui";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { apiFetch } from "@/lib/api-client";

import { CampaignWindow } from "./campaign-window";
import { CreativeLink, CreativeTypeBadge } from "./creative";
import { TIMEZONE_LABEL } from "./dates";
import { PlacementList } from "./placement-list";
import { SPONSORS_NEW, sponsorEditHref } from "./routes";
import { SponsorActions } from "./sponsor-actions";
import { SponsorStatusBadge } from "./sponsor-status-badge";
import { SponsorStatusTabs } from "./status-tabs";
import type { AdminSponsor } from "./types";

/**
 * Sponsors — the campaigns the mobile app's `<SponsorCard>` renders.
 *
 * WHY THERE IS NO SORT
 * ───────────────────────────────────────────────────────────────────────────
 * The frozen contract is `?page&limit&status&q` — four params, no `sort` and no
 * `order`. `defaultSort: null` keeps `listParamsToQuery` from appending a pair
 * the API never agreed to serve, and no column declares a `sortKey`, so the
 * headers never offer an affordance that would do nothing (or, against a strict
 * DTO, 400). Add both halves together the day the contract grows a sort.
 *
 * The backend orders this list newest-first by default — there is an index for
 * exactly that (`sponsors_created_at_idx`, commented "the console's default
 * view, newest first, unfiltered") — so the absence of a sort control is the
 * API's decision showing through, not a gap.
 *
 * `status` has NO default filter value, which is what keeps an empty table
 * saying "No sponsors yet" rather than "nothing matched your filters" (see
 * `isNarrowed`). The six status tabs write this same filter — see
 * `./status-tabs.tsx`.
 *
 * WHAT THIS TABLE DOES NOT HAVE A COLUMN FOR
 * ───────────────────────────────────────────────────────────────────────────
 * Budget, views, clicks, CTR, revenue. The prototype's list showed a Budget
 * column (§0.3) and its detail modal showed impressions; neither field exists
 * on the API and §4.1 records why the metrics were "fictional twice over" —
 * mobile reports no impressions, so nothing in this system can produce the
 * number. The backend schema states the same conclusion in its own words:
 * "A column whose only possible value is decorative is worse than no column,
 * because it looks like evidence." Adding one here would be inventing data.
 */
export const SPONSORS_LIST: ListConfig = {
  defaultSort: null,
  filterKeys: ["status"],
};

const COLUMNS: ReadonlyArray<DataTableColumn<AdminSponsor>> = [
  {
    id: "sponsor",
    header: "Sponsor",
    // `primary` makes this the cell DataTable wraps in the row's real <Link>,
    // so ⌘-click and "open in new tab" work like any other link.
    primary: true,
    width: "18rem",
    skeletonWidth: "80%",
    cell: (row) => (
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg" title={row.name}>
          {row.name}
        </span>
        {/* The campaign under the organisation: one sponsor may run several
            over time, and the campaign name is what tells two rows apart. */}
        {row.campaignName ? (
          <span className="block truncate text-[11px] text-fg-faint" title={row.campaignName}>
            {row.campaignName}
          </span>
        ) : (
          <span className="block truncate text-[11px] text-fg-faint">No campaign name</span>
        )}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "7.5rem",
    skeletonWidth: "4.5rem",
    // Straight from the API. Never recomputed from the dates — see
    // SponsorStatusBadge and CampaignWindow.
    cell: (row) => <SponsorStatusBadge status={row.status} />,
  },
  {
    id: "creative",
    header: "Creative",
    width: "14rem",
    skeletonWidth: "70%",
    cell: (row) => (
      <span className="flex min-w-0 flex-col items-start gap-1">
        <CreativeTypeBadge type={row.creativeType} />
        <CreativeLink sponsor={row} className="max-w-full text-[11px]" />
      </span>
    ),
  },
  {
    id: "placements",
    header: "Placements",
    width: "16rem",
    skeletonWidth: "60%",
    cell: (row) => <PlacementList placements={row.placements} />,
  },
  {
    id: "window",
    header: `Campaign window (${TIMEZONE_LABEL})`,
    width: "12rem",
    skeletonWidth: "8rem",
    cell: (row) => <CampaignWindow startDate={row.startDate} endDate={row.endDate} />,
  },
  {
    id: "actions",
    header: "Actions",
    // Stops a click on these buttons also triggering the row's navigation.
    interactive: true,
    align: "end",
    width: "13rem",
    skeletonWidth: "7rem",
    cell: (row) => (
      <span className="flex items-center justify-end gap-1.5">
        <SponsorActions sponsor={row} />
      </span>
    ),
  },
];

export function SponsorsTable() {
  const { params } = useListState();

  const { view, page, isFetching, isPlaceholder, refetch } = useListQuery<unknown, AdminSponsor>({
    key: ["admin", "sponsors"],
    // Pinned rather than left to `detectListAdapter`: the contract's envelope is
    // settled (`{ items, pagination: { page, limit, total, totalPages } }`), and
    // the detector cannot tell a missing total from an API that has none, so it
    // would quietly stop rendering "of 137".
    adapter: offsetListAdapter<AdminSponsor>(),
    // The ONLY place this feature reads the list endpoint. When the API lands,
    // nothing else in the feature has to change.
    fetcher: ({ searchParams, signal }) => apiFetch("/admin/sponsors", { searchParams, signal }),
  });

  return (
    <div className="space-y-4">
      <SponsorStatusTabs />

      <FilterBar
        // No `filters` — status is the segmented control above, and offering it
        // twice would let the two controls disagree on screen.
        // Names the four columns the API's `q` actually searches (service:
        // name, campaignName, category, location) rather than implying more.
        searchPlaceholder="Search name, campaign, category or location…"
        searchLabel="Search sponsors"
        resultCount={page?.total ?? null}
        resultNoun="sponsor"
      />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowHref={(row) => sponsorEditHref(row.id)}
        caption="Sponsors"
        className={MODERATION_TABLE}
        onRetry={refetch}
        isPlaceholder={isPlaceholder}
        loadingRows={Math.min(params.pageSize, 10)}
        minWidth="80rem"
        empty={{
          icon: <Handshake className="size-10" />,
          title: "No sponsors yet",
          description:
            "Sponsors are the cards the mobile app shows between requests and impact stories. Nothing has been set up yet.",
          action: (
            <Button size="sm" asChild>
              <Link href={SPONSORS_NEW}>
                <Plus />
                Add the first sponsor
              </Link>
            </Button>
          ),
        }}
        // Reached only when a status tab or the search box is narrowing the
        // list — never when the table is simply empty. Getting that distinction
        // wrong tells an operator their sponsors are gone when they are one
        // click away on another tab.
        filteredEmptyTitle="No sponsors match this filter"
        filteredEmptyDescription="Nothing matches the status tab or search you're on. Switch back to All, or clear the search, to see every sponsor again."
        footer={<ListPagination page={page} isFetching={isFetching} />}
      />
    </div>
  );
}
