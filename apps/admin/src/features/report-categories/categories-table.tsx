"use client";

import { Shapes } from "lucide-react";
import { useMemo } from "react";

import {
  CodeCell,
  CountCell,
  DataTable,
  DateCell,
  type DataTableColumn,
} from "@/components/data";
import { Badge, Button } from "@/components/ui";
import { formatExpiry, useReportCategories, type ReportCategoryRow } from "./use-report-categories";

/**
 * @param onEdit opens the create/edit dialog on this row.
 * @param onDelete opens the delete confirmation for this row.
 */
function buildColumns(
  onEdit: ((row: ReportCategoryRow) => void) | null,
  onDelete: ((row: ReportCategoryRow) => void) | null,
): ReadonlyArray<DataTableColumn<ReportCategoryRow>> {
  const columns: DataTableColumn<ReportCategoryRow>[] = [
    {
      id: "label",
      header: "Category",
      width: "16rem",
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          {/* The emoji is data, not decoration — it is what the mobile app shows
              on the category chip — so it is announced rather than aria-hidden. */}
          <span className="text-base leading-none" role="img" aria-label={`${row.label} icon`}>
            {row.emoji}
          </span>
          <span className="truncate">{row.label}</span>
        </span>
      ),
    },
    {
      id: "key",
      header: "Key",
      width: "10rem",
      cell: (row) => <CodeCell value={row.key} truncate={false} />,
    },
    {
      id: "citizenSelectable",
      header: "Who can post to it",
      width: "11rem",
      cell: (row) =>
        row.citizenSelectable ? (
          <Badge tone="success">Citizens</Badge>
        ) : (
          // Not "No". The interesting fact is who CAN use it, and disasterRelief
          // being admin-only is a deliberate product decision, not an absence.
          <Badge tone="warning" title="Hidden from the mobile app's category picker">
            Admins only
          </Badge>
        ),
    },
    {
      id: "defaultExpiryMinutes",
      header: "Stays live for",
      width: "8rem",
      align: "end",
      cell: (row) => (
        <span className="tabular text-fg" title={`${row.defaultExpiryMinutes} minutes`}>
          {formatExpiry(row.defaultExpiryMinutes)}
        </span>
      ),
    },
    {
      id: "reportCount",
      header: "Reports",
      width: "7rem",
      align: "end",
      // Rendered as a plain number again. This column used to be suppressed
      // behind a `reportCountsAreTrustworthy` heuristic, because the API's
      // per-category subquery compared `reports.category_id` against
      // `reports.id` and so returned 0 for every row. That is fixed — the
      // subquery is now written with an explicit alias and qualifies the outer
      // column (see the comment on `AdminCategoriesService.list()`), and the
      // heuristic went with it rather than being left to quietly hide real
      // counts on a database where every category genuinely has none.
      cell: (row) => <CountCell value={row.reportCount} />,
    },
    {
      id: "updatedAt",
      header: "Last changed",
      width: "11rem",
      cell: (row) => <DateCell value={row.updatedAt} relative />,
    },
  ];

  if (onEdit && onDelete) {
    columns.push({
      id: "actions",
      header: "Actions",
      // Two actions, so they are inline rather than behind a `⋮` — the same call
      // the moderation tables make. A menu earns its extra click when it hides
      // several destructive options; here it would hide one.
      interactive: true,
      align: "end",
      width: "10rem",
      skeletonWidth: "5rem",
      cell: (row) => (
        <span className="flex items-center justify-end gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => onEdit(row)}>
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => onDelete(row)}>
            Delete
          </Button>
        </span>
      ),
    });
  }

  return columns;
}

const SKELETON_COLUMNS = buildColumns(null, null);

/**
 * The request categories, including the one citizens never see.
 *
 * ORDERING IS THE API'S, NOT THIS TABLE'S. Rows arrive sorted alphabetically by
 * `label` under an ICU collation, and `GET /reports/categories` sorts by the
 * very same expression — see `apps/api/src/reports/report-category-order.ts`. So
 * this table and the citizen's category grid list the same categories in the
 * same order. Re-sorting here would silently re-open the gap that made the two
 * surfaces disagree in the first place.
 */
export function CategoriesTable({
  onEdit,
  onDelete,
}: {
  onEdit: (row: ReportCategoryRow) => void;
  onDelete: (row: ReportCategoryRow) => void;
}) {
  const { view, rows, page, isPlaceholder, refetch } = useReportCategories();

  const columns = useMemo(() => buildColumns(onEdit, onDelete), [onEdit, onDelete]);

  const citizenSelectable = rows.filter((row) => row.citizenSelectable).length;

  return (
    <div className="space-y-3">
      {view.kind === "ready" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{page?.total ?? rows.length} categories</Badge>
          <Badge tone="neutral">{citizenSelectable} citizen-selectable</Badge>
          <Badge tone="neutral">{rows.length - citizenSelectable} admin-only</Badge>
        </div>
      ) : null}

      <DataTable
        view={view}
        columns={columns}
        rowKey={(row) => row.id}
        caption="Report categories"
        minWidth="76rem"
        // Nine rows is the whole table, so the skeleton is the whole table.
        loadingRows={9}
        isPlaceholder={isPlaceholder}
        onRetry={refetch}
        empty={{
          icon: <Shapes className="size-10" />,
          title: "No categories configured",
          description:
            "With none, the mobile app has nothing for a citizen to post under. Create one to reopen reporting — the API refuses to delete the last citizen-selectable category, so reaching this state takes deliberate effort.",
        }}
      />

      {view.kind === "ready" ? (
        <p className="text-[11px] text-fg-faint">
          These values are read live by the API on every report — a change to a label, emoji or
          expiry reaches the mobile app with no deploy, and the citizen category list is ordered
          exactly as it is here.
        </p>
      ) : null}
    </div>
  );
}

/** Suspense fallback: same columns, same nine rows, so nothing shifts. */
export function CategoriesTableSkeleton() {
  return (
    <DataTable
      view={{ kind: "loading" }}
      columns={SKELETON_COLUMNS}
      rowKey={(row) => row.id}
      caption="Loading report categories"
      minWidth="76rem"
      loadingRows={9}
      empty={{ title: "" }}
    />
  );
}
