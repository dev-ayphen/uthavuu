"use client";

import { Users } from "lucide-react";

import {
  CountCell,
  DataTable,
  DateCell,
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
import { userDetailHref } from "@/features/moderation/routes";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { apiFetch } from "@/lib/api-client";
import type { AdminUserRow } from "./types";
import { UserStatusBadge } from "./user-status-badge";

/**
 * The citizen directory.
 *
 * DEFAULT FILTERS ARE THE WHOLE TRICK
 * ───────────────────────────────────────────────────────────────────────────
 * `ListAdminUsersSchema` defaults `audience` to `citizen` and `status` to
 * `all`. Declaring the same two here does three things at once:
 *
 *   1. They stay OUT of the URL at rest, so `/users` is a clean shareable link.
 *   2. They do not count as narrowing, so an empty table says "No community
 *      members yet" rather than "nothing matched your filters" — which would
 *      tell a moderator the citizen base had been wiped when it is simply the
 *      list's resting slice.
 *   3. `params.filters` is fully populated either way, so what the console
 *      sends and what the API would have defaulted to are the same request.
 *
 * WHY `audience` HAS NO BLANK "All" OPTION
 * ───────────────────────────────────────────────────────────────────────────
 * `FilterBar`'s `allLabel` renders `<option value="">`, and an empty filter is
 * omitted from the request — at which point the API re-applies its own
 * `citizen` default. The select would read "All" while the table showed
 * citizens only. `audience` has a real third value (`all`), so it is offered as
 * an explicit option instead. Same for `status`. Only `profileCompleted`, which
 * is genuinely optional server-side, gets a blank.
 */
export const USERS_LIST: ListConfig = {
  defaultSort: { key: "createdAt", direction: "desc" },
  filterKeys: ["audience", "status", "profileCompleted", "district"],
  defaultFilters: { audience: "citizen", status: "all" },
};

const FILTERS: readonly FilterDef[] = [
  {
    id: "audience",
    label: "Audience",
    options: [
      { value: "citizen", label: "Citizens" },
      { value: "staff", label: "Console staff" },
      { value: "all", label: "Everyone" },
    ],
  },
  {
    id: "status",
    label: "Account",
    options: [
      { value: "all", label: "Any status" },
      { value: "active", label: "Active" },
      { value: "suspended", label: "Suspended" },
    ],
  },
  {
    id: "profileCompleted",
    label: "Profile",
    allLabel: "Any",
    options: [
      { value: "true", label: "Completed" },
      { value: "false", label: "Not finished" },
    ],
  },
];

const COLUMNS: ReadonlyArray<DataTableColumn<AdminUserRow>> = [
  {
    id: "name",
    header: "Member",
    sortKey: "name",
    primary: true,
    width: "19rem",
    skeletonWidth: "60%",
    // A phone number is the identity here: mobile signs in by phone, and a
    // profile that never finished carries its number as its display name.
    cell: (row) => (
      <PersonCell
        person={{ id: row.id, name: row.name, avatarUrl: row.avatarUrl }}
        secondary={row.phoneNumber}
      />
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "10rem",
    skeletonWidth: "3.5rem",
    cell: (row) => (
      <UserStatusBadge status={row.status} isStaff={row.isStaff} role={row.adminRole} />
    ),
  },
  {
    id: "location",
    header: "Location",
    width: "11rem",
    cell: (row) => (
      <MutedCell value={[row.city, row.district].filter(Boolean).join(" · ") || null} />
    ),
  },
  {
    id: "profile",
    header: "Profile",
    width: "8rem",
    skeletonWidth: "4rem",
    // Signed up vs actually onboarded. `profileCompletedAt` stays null until
    // Profile Setup finishes, and "why can't this person post?" is a real
    // support question this column answers at a glance.
    cell: (row) =>
      row.profileCompleted ? (
        <span className="text-xs text-fg-subtle">Complete</span>
      ) : (
        <span className="text-xs text-warning-fg">Not finished</span>
      ),
  },
  {
    id: "reports",
    header: "Reports",
    sortKey: "reports",
    align: "end",
    width: "6.5rem",
    skeletonWidth: "2rem",
    cell: (row) => <CountCell value={row.counts.reports} />,
  },
  {
    id: "completions",
    header: "Helps",
    align: "end",
    width: "6rem",
    skeletonWidth: "2rem",
    cell: (row) => <CountCell value={row.counts.completions} />,
  },
  {
    id: "createdAt",
    header: "Joined",
    sortKey: "createdAt",
    width: "10rem",
    skeletonWidth: "5rem",
    cell: (row) => <DateCell value={row.createdAt} relative />,
  },
];

export function UsersTable() {
  const { toggleSort } = useListState();
  const { view, page, params, isFetching, isPlaceholder, refetch } = useListQuery<
    unknown,
    AdminUserRow
  >({
    key: ["admin", "users"],
    // Pinned rather than detected: `{ items, pagination }` is settled, and the
    // detector cannot tell an absent total from an API that has none.
    adapter: offsetListAdapter<AdminUserRow>(),
    fetcher: ({ searchParams, signal }) => apiFetch("/admin/users", { searchParams, signal }),
  });

  return (
    <div className="space-y-4">
      <FilterBar
        filters={FILTERS}
        searchPlaceholder="Name, phone or email…"
        searchLabel="Search community members"
        resultCount={page?.total ?? null}
        resultNoun="member"
      />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowHref={(row) => userDetailHref(row.id)}
        caption="Community members"
        className={MODERATION_TABLE}
        sort={params.sort}
        onToggleSort={toggleSort}
        onRetry={refetch}
        isPlaceholder={isPlaceholder}
        loadingRows={Math.min(params.pageSize, 10)}
        minWidth="69rem"
        empty={{
          icon: <Users className="size-10" />,
          title: "No community members yet",
          description:
            "Anyone who signs in on the mobile app appears here. Console staff are hidden by default — switch Audience to Everyone to include them.",
        }}
        filteredEmptyTitle="No members match these filters"
        filteredEmptyDescription="Nobody matches what you're filtering on. Widen the filters or clear them to see the whole directory again."
        footer={<ListPagination page={page} isFetching={isFetching} />}
      />
    </div>
  );
}
