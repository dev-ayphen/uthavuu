"use client";

import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import {
  DataTable,
  FilterBar,
  ListPagination,
  MutedCell,
  offsetListAdapter,
  PersonCell,
  useListQuery,
  useListState,
  type DataTableColumn,
  type FilterDef,
  type ListConfig,
} from "@/components/data";
import { Button } from "@/components/ui";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { apiFetch } from "@/lib/api-client";
import { TIMEZONE_LABEL } from "./dates";
import { PublishWindow } from "./publish-window";
import { ANNOUNCEMENTS_NEW, announcementEditHref } from "./routes";
import { TamilCoverageBadge, tamilCoverage } from "./tamil-coverage";
import type { AdminUpdate } from "./types";
import { UpdateActions } from "./update-actions";
import { UpdateStatusBadge } from "./update-status-badge";

/**
 * Announcements — admin-authored posts the console publishes INTO the mobile
 * app, as opposed to the citizen content the rest of the console moderates.
 *
 * Not to be confused with Community Updates, which is the PUBLIC per-report
 * feed anyone may post to — that lives at `/reports/comments`. The wire still
 * spells this one `community-updates`; see `./api.ts` for why.
 *
 * WHY THERE IS NO SORT
 * ───────────────────────────────────────────────────────────────────────────
 * The frozen contract is `?page&limit&status&q` — four params, no `sort` and no
 * `order`. `defaultSort: null` keeps `listParamsToQuery` from appending a pair
 * the API never agreed to serve, and no column declares a `sortKey`, so the
 * headers never offer an affordance that would do nothing (or, against a strict
 * DTO, 400). Add both halves together the day the contract grows a sort.
 *
 * `status` has NO default filter value. That is what keeps an empty table
 * saying "No announcements yet" rather than "nothing matched your filters" — a
 * default that narrows nothing must not count as narrowing (see `isNarrowed`).
 */
export const UPDATES_LIST: ListConfig = {
  defaultSort: null,
  filterKeys: ["status"],
};

const STATUS_FILTER: FilterDef = {
  id: "status",
  label: "Status",
  options: [
    { value: "", label: "Any status" },
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
    { value: "archived", label: "Archived" },
  ],
};

const COLUMNS: ReadonlyArray<DataTableColumn<AdminUpdate>> = [
  {
    id: "title",
    header: "Announcement",
    // `primary` makes this the cell DataTable wraps in the row's real <Link>,
    // so ⌘-click and "open in new tab" work like any other link.
    primary: true,
    width: "24rem",
    skeletonWidth: "80%",
    cell: (row) => (
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg" title={row.titleEn}>
          {row.titleEn}
        </span>
        {/* The Tamil title, when there is one, sits under the English rather
            than replacing it: the console's chrome is English, and an operator
            scanning for the announcement they wrote needs the title they typed. */}
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
    // Straight from the API. Never recomputed from publishAt/expiresAt — see
    // UpdateStatusBadge and PublishWindow.
    cell: (row) => <UpdateStatusBadge status={row.status} />,
  },
  {
    id: "tamil",
    header: "Tamil",
    width: "7.5rem",
    skeletonWidth: "4.5rem",
    cell: (row) => <TamilCoverageBadge coverage={tamilCoverage(row)} />,
  },
  {
    id: "window",
    header: `Publish window (${TIMEZONE_LABEL})`,
    width: "13rem",
    skeletonWidth: "8rem",
    cell: (row) => <PublishWindow publishAt={row.publishAt} expiresAt={row.expiresAt} />,
  },
  {
    id: "author",
    header: "Author",
    width: "10.5rem",
    skeletonWidth: "60%",
    cell: (row) => {
      // `authorDeleted` is the API's report that ON DELETE SET NULL fired: the
      // admin account is gone, the announcement it wrote is not. Naming that is
      // both honest and the answer to "why can't I open this profile?".
      //
      // Today the service derives `authorDeleted` from `author === null`, so the
      // third branch is unreachable — but the contract types the two fields
      // independently, and rendering "Deleted account" for an author the API
      // simply never had would be a specific claim about a person that isn't
      // true. It stays, saying only what is known.
      if (row.authorDeleted) {
        return <PersonCell person={{ name: row.author?.name ?? null, deleted: true }} />;
      }
      if (!row.author) {
        return <MutedCell value="No author recorded" />;
      }
      return <PersonCell person={{ id: row.author.id, name: row.author.name }} />;
    },
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
        <UpdateActions update={row} />
      </span>
    ),
  },
];

export function UpdatesTable() {
  const { params } = useListState();

  const { view, page, isFetching, isPlaceholder, refetch } = useListQuery<unknown, AdminUpdate>({
    key: ["admin", "community-updates"],
    // Pinned rather than left to `detectListAdapter`: the contract's envelope is
    // settled (`{ items, pagination: { page, limit, total, totalPages } }`), and
    // the detector cannot tell a missing total from an API that has none, so it
    // would quietly stop rendering "of 137".
    adapter: offsetListAdapter<AdminUpdate>(),
    // The ONLY place this feature reads the list endpoint. When the API lands,
    // nothing else in the feature has to change.
    fetcher: ({ searchParams, signal }) =>
      apiFetch("/admin/community-updates", { searchParams, signal }),
  });

  return (
    <div className="space-y-4">
      <FilterBar
        filters={[STATUS_FILTER]}
        searchPlaceholder="Search titles and body text…"
        searchLabel="Search announcements"
        resultCount={page?.total ?? null}
        resultNoun="announcement"
      />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowHref={(row) => announcementEditHref(row.id)}
        caption="Announcements"
        className={MODERATION_TABLE}
        onRetry={refetch}
        isPlaceholder={isPlaceholder}
        loadingRows={Math.min(params.pageSize, 10)}
        minWidth="75rem"
        empty={{
          icon: <Megaphone className="size-10" />,
          title: "No announcements yet",
          description:
            "Announcements are written here and broadcast to citizens in the mobile app — service notices, safety advisories, campaign news. Nothing has been written yet.",
          action: (
            <Button size="sm" asChild>
              <Link href={ANNOUNCEMENTS_NEW}>
                <Plus />
                Write the first announcement
              </Link>
            </Button>
          ),
        }}
        filteredEmptyTitle="No announcements match these filters"
        filteredEmptyDescription="Nothing matches what you're filtering on. Widen the status filter or clear it to see every announcement again."
        footer={<ListPagination page={page} isFetching={isFetching} />}
      />
    </div>
  );
}
