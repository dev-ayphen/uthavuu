"use client";

import { ScrollText, UserX } from "lucide-react";

import {
  DataTable,
  DateCell,
  ListPagination,
  type DataTableColumn,
} from "@/components/data";
import { Badge } from "@/components/ui";
import type { AuditLogRow } from "./types";
import { AuditFilters } from "./audit-filters";
import { ChangeCell } from "./change-cell";
import { useAuditLogs } from "./use-audit-logs";

/**
 * WHY THE CELLS CARRY THEIR OWN `max-w-*`
 * ───────────────────────────────────────────────────────────────────────────
 * `DataTable` renders an auto-layout table, so the `width` on a `<col>` is a
 * hint the browser is free to overrule — and it does, the moment a cell holds
 * something long. An audit target can be a whole spam comment body, and left
 * unbounded it stretched the Target column wide enough to push "What changed"
 * and "Reason" — the two columns the page exists for — off the right edge and
 * behind a horizontal scroll.
 *
 * A `truncate` class cannot fix that by itself: it needs a bounded content box
 * to truncate against, and in an auto-layout table the cell simply grows
 * instead. Capping the CONTENT rather than the column is what makes truncation
 * engage, and it keeps the full value on hover via `title`.
 */
const COLUMNS: ReadonlyArray<DataTableColumn<AuditLogRow>> = [
  {
    id: "createdAt",
    header: "When",
    width: "11rem",
    skeletonWidth: "85%",
    // Not sortable, and no chevron pretending otherwise: the endpoint ignores
    // `sort`/`order` entirely and always returns `createdAt desc, id desc`.
    cell: (row) => <DateCell value={row.createdAt} withTime relative />,
  },
  {
    id: "actor",
    header: "Admin",
    width: "13rem",
    primary: true,
    cell: (row) => <ActorCell row={row} />,
  },
  {
    id: "action",
    header: "Action",
    width: "13rem",
    cell: (row) => (
      <Badge tone="info" title={row.action.key}>
        {row.action.label}
      </Badge>
    ),
  },
  {
    id: "target",
    header: "Target",
    width: "14rem",
    cell: (row) => <TargetCell row={row} />,
  },
  {
    // The change and the justification for it, in ONE column.
    //
    // They were two. On the Platform pane — the narrowest content area in the
    // console, sharing its width with both the app sidebar and the sub-menu —
    // the six-column table overflowed by ~200px and pushed exactly these two
    // off the right edge behind a horizontal scrollbar. The two columns an
    // accountability page exists for were the two you could not see.
    //
    // Merged, they always fit, and they read better adjacent anyway:
    // "status: open → closed" directly above the moderator's own words.
    id: "change",
    header: "What changed, and why",
    cell: (row) => (
      <span className="block min-w-0">
        <ChangeCell before={row.before} after={row.after} />
        {row.reason ? (
          <span
            className="mt-1 block max-w-64 truncate text-[11px] text-fg-subtle"
            title={row.reason}
          >
            &ldquo;{row.reason}&rdquo;
          </span>
        ) : null}
      </span>
    ),
  },
];

/**
 * The accountability surface: who did what, to which record, when, and why.
 *
 * Read-only by construction on both sides — `AdminAuditController` publishes no
 * write route, because an admin who can post an audit entry can forge one.
 */
export function AuditTable() {
  const { view, page, params, isFetching, isPlaceholder, refetch } = useAuditLogs();

  return (
    <div className="space-y-3">
      <AuditFilters resultCount={page?.total ?? null} />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        caption="Administrative actions, newest first"
        minWidth="60rem"
        loadingRows={8}
        isPlaceholder={isPlaceholder}
        onRetry={refetch}
        empty={{
          icon: <ScrollText className="size-10" />,
          title: "No admin actions recorded yet",
          description:
            "This log writes itself. The moment anyone closes a report, removes a comment, edits a category or suspends an account, the entry appears here — with who did it and what changed.",
        }}
        filteredEmptyTitle="No actions match these filters"
        filteredEmptyDescription="Nothing was recorded for this combination of action, target and date range. Widen the dates or clear the filters to see the whole trail."
        footer={
          view.kind === "ready" ? (
            <ListPagination page={page} isFetching={isFetching} />
          ) : null
        }
      />

      {view.kind === "ready" ? (
        <p className="text-[11px] text-fg-faint">
          Always ordered newest first. Entries are written inside the same transaction as the
          action they describe, so this trail cannot drift from what actually happened
          {params.filters.from || params.filters.to ? " — dates are read in IST" : ""}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The acting admin, from the snapshot columns rather than a join.
 *
 * `PersonCell` is deliberately not used here. Its `deleted` branch replaces the
 * name with "Deleted account", which is right for a comment author but wrong
 * for an audit row: the entire reason `admin_audit_logs` copies `actor_name` /
 * `actor_email` at write time is so a departed admin's actions stay attributable.
 * Throwing that away at render would undo the schema's work.
 */
function ActorCell({ row }: { row: AuditLogRow }) {
  const { actor } = row;
  return (
    <span className="block min-w-0">
      <span className="block max-w-44 truncate font-semibold text-fg" title={actor.email}>
        {actor.name}
      </span>
      <span className="mt-0.5 flex items-center gap-1">
        <span className="truncate font-mono text-[10px] text-fg-faint">{actor.roleKey}</span>
        {actor.accountExists ? null : (
          <Badge tone="neutral" title="This admin account no longer exists. The entry is kept.">
            <UserX className="size-2.5" aria-hidden />
            Account removed
          </Badge>
        )}
      </span>
      {row.ipAddress ? (
        <span className="block truncate font-mono text-[10px] text-fg-faint" title={row.userAgent ?? undefined}>
          {row.ipAddress}
        </span>
      ) : null}
    </span>
  );
}

/** What was acted on: its type, and the label snapshot taken at the time. */
function TargetCell({ row }: { row: AuditLogRow }) {
  const { target } = row;
  return (
    <span className="block min-w-0">
      <span className="micro-label block">{target.type.label}</span>
      {target.label ? (
        <span className="block max-w-52 truncate text-fg" title={target.label}>
          {target.label}
        </span>
      ) : null}
      {target.id ? (
        <code
          className="mt-0.5 block max-w-52 truncate font-mono text-[10px] text-fg-faint"
          title={target.id}
        >
          {target.id}
        </code>
      ) : null}
    </span>
  );
}

/**
 * The fallback for `ListStateProvider`'s Suspense boundary.
 *
 * Same columns, same widths, same row count as the loaded table, so the server
 * HTML and the hydrated table occupy identical space and nothing shifts when
 * the rows arrive. `DataTable` already renders the skeleton for a `loading`
 * view — reusing it is what keeps the two shapes from drifting apart.
 */
export function AuditTableSkeleton() {
  return (
    <div className="space-y-3">
      <DataTable
        view={{ kind: "loading" }}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        caption="Loading administrative actions"
        minWidth="60rem"
        loadingRows={8}
        empty={{ title: "" }}
      />
    </div>
  );
}
