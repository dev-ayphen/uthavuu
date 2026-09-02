"use client";

import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import {
  DataTable,
  DateCell,
  PersonCell,
  type DataTableColumn,
} from "@/components/data";
import { Badge } from "@/components/ui";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { AdminAccountActions } from "./admin-actions";
import { AdminRoleBadge, AdminStatusBadge, LastSuperAdminBadge, YouBadge } from "./badges";
import { adminDetailHref } from "./routes";
import { readLastLogin, type AdminAccountDetail } from "./types";
import { useAdminAccounts } from "./use-admin-accounts";

/**
 * Who can sign in to this console, and what each of them can do about it.
 *
 * WHY EVERY ROW CARRIES A `⋮` MENU RATHER THAN A ROW OF BUTTONS
 * ───────────────────────────────────────────────────────────────────────────
 * The moderation tables put their two or three actions inline, and that is
 * right for them: "Remove" and "Restore" are the whole job, done dozens of
 * times an hour. This table is the opposite shape. It has up to five actions
 * per row, they differ per row (your own row has three completely different
 * ones), two of them are destructive, and an operator visits this page rarely.
 * Five inline buttons would be a wall of controls whose enabled/disabled state
 * changes line by line — and the `Suspend` a super admin clicks by accident is
 * one they cannot undo without telling a colleague.
 *
 * A menu makes the destructive pair a deliberate second click, gives each item
 * room for the sentence explaining why it is unavailable, and keeps the row
 * readable as DATA — which is what an operator is here for most of the time.
 *
 * WHAT THE ROW IS ALLOWED TO CLAIM
 * ───────────────────────────────────────────────────────────────────────────
 * Two of these columns render fields `GET /admin/admins` does not return, even
 * though `GET /admin/admins/:id` beside it does (see `./types.ts`). Neither
 * guesses. Status renders "Not reported" rather than a confident green
 * "Active"; last login renders "Not reported" rather than "Never". Both are the
 * difference between reporting a fact and inventing one about a colleague's
 * account — and both point at the detail page, which knows.
 *
 * The same gap is why the `⋮` menu will not choose between "Suspend access" and
 * "Restore access" here; `buildActions()` in `./admin-actions.tsx` says why at
 * length.
 */
function buildColumns({
  canManage,
  selfUserId,
  peers,
}: {
  canManage: boolean;
  selfUserId: string | null;
  peers: readonly AdminAccountDetail[];
}): ReadonlyArray<DataTableColumn<AdminAccountDetail>> {
  return [
    {
      id: "name",
      header: "Admin",
      width: "20rem",
      primary: true,
      skeletonWidth: "60%",
      cell: (row) => (
        <PersonCell person={{ id: row.userId, name: row.name }} secondary={row.email} />
      ),
    },
    {
      id: "role",
      header: "Role",
      width: "11rem",
      skeletonWidth: "5rem",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          <AdminRoleBadge role={row.role} />
          {/* The two facts that explain a disabled menu item, shown one step
              BEFORE the menu — the same reasoning as the staff mark on
              `features/users/user-status-badge.tsx`. */}
          {row.isLastSuperAdmin ? <LastSuperAdminBadge /> : null}
        </span>
      ),
    },
    {
      id: "status",
      header: "Console access",
      width: "10rem",
      skeletonWidth: "4rem",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          <AdminStatusBadge status={row.status} />
          {isSelfRow(row, selfUserId) ? <YouBadge /> : null}
        </span>
      ),
    },
    {
      id: "lastLoginAt",
      header: "Last login",
      width: "11rem",
      skeletonWidth: "5rem",
      cell: (row) => <LastLoginCell value={row.lastLoginAt} />,
    },
    {
      id: "createdAt",
      header: "Added",
      width: "11rem",
      skeletonWidth: "5rem",
      cell: (row) => <DateCell value={row.createdAt} relative />,
    },
    {
      id: "actions",
      header: "Actions",
      // The header is for assistive tech only: a visible "Actions" label over a
      // 3rem column of `⋮` triggers is noise.
      headerHidden: true,
      // Stops a click on the trigger also firing the row's own navigation.
      interactive: true,
      align: "end",
      width: "4rem",
      skeletonWidth: "1.5rem",
      cell: (row) => (
        <span className="flex items-center justify-end">
          <AdminAccountActions
            admin={row}
            canManage={canManage}
            selfUserId={selfUserId}
            peers={peers}
            variant="menu"
          />
        </span>
      ),
    },
  ];
}

function isSelfRow(row: AdminAccountDetail, selfUserId: string | null): boolean {
  return row.isSelf === true || (selfUserId !== null && row.userId === selfUserId);
}

/**
 * Three states, spelled out — see `readLastLogin`.
 *
 * "Never" is a claim: this person has an account and has not once used it,
 * which is exactly the thing a super admin auditing console access is looking
 * for. Printing it because a field was ABSENT would send them chasing a
 * colleague who signs in every morning.
 */
function LastLoginCell({ value }: { value: string | null | undefined }) {
  const lastLogin = readLastLogin(value);

  if (lastLogin.kind === "at") return <DateCell value={lastLogin.iso} withTime relative />;

  if (lastLogin.kind === "never") {
    return <span className="text-xs text-warning-fg">Never</span>;
  }

  return (
    <span
      className="text-xs text-fg-faint"
      title="The admin list endpoint doesn't return a last-login time. Open the account to see it."
    >
      Not reported
    </span>
  );
}

export function AdminsTable({
  canManage,
  selfUserId,
}: {
  canManage: boolean;
  selfUserId: string | null;
}) {
  const { view, rows, page, isPlaceholder, refetch } = useAdminAccounts();

  // `rows` is passed through so the edit dialog can read the API's own role
  // labels off the records it already has, rather than the console keeping a
  // second copy of the API's lookup table. See `roleOptions()`.
  const columns = useMemo(
    () => buildColumns({ canManage, selfUserId, peers: rows }),
    [canManage, selfUserId, rows],
  );

  const superAdmins = rows.filter((row) => row.role?.key === "super_admin").length;

  return (
    <div className="space-y-3">
      {view.kind === "ready" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{page?.total ?? rows.length} accounts</Badge>
          <Badge tone="neutral">{superAdmins} super admin{superAdmins === 1 ? "" : "s"}</Badge>
        </div>
      ) : null}

      <DataTable
        view={view}
        columns={columns}
        rowKey={(row) => row.userId}
        rowHref={(row) => adminDetailHref(row.userId)}
        caption="Admin accounts"
        className={MODERATION_TABLE}
        minWidth="68rem"
        // A console has a handful of admins, so the skeleton is the whole table.
        loadingRows={6}
        isPlaceholder={isPlaceholder}
        onRetry={refetch}
        empty={{
          icon: <ShieldCheck className="size-10" />,
          title: "No admin accounts",
          description:
            "Nobody can sign in to this console. The first account is created by the API's seed step, not from here.",
        }}
        // No filters exist on this list, so `narrowed` can never be true and
        // this copy is unreachable — declared anyway so it cannot be wrong if
        // a filter is ever added.
        filteredEmptyTitle="No admins match these filters"
        filteredEmptyDescription="Nobody matches what you're filtering on. Clear the filters to see every account again."
      />
    </div>
  );
}

/** Suspense fallback: the same columns and row count, so nothing shifts. */
export function AdminsTableSkeleton() {
  const columns = buildColumns({ canManage: false, selfUserId: null, peers: [] });

  return (
    <DataTable
      view={{ kind: "loading" }}
      columns={columns}
      rowKey={(row) => row.userId}
      caption="Loading admin accounts"
      className={MODERATION_TABLE}
      minWidth="68rem"
      loadingRows={6}
      empty={{ title: "" }}
    />
  );
}
