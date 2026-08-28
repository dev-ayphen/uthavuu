"use client";

import { Shapes } from "lucide-react";
import { useMemo } from "react";

import {
  CodeCell,
  CountCell,
  DataTable,
  DateCell,
  EmptyCell,
  type DataTableColumn,
} from "@/components/data";
import { Badge } from "@/components/ui";
import { formatExpiry, useReportCategories, type ReportCategoryRow } from "./use-report-categories";

/**
 * @param countsAreTrustworthy see `reportCountsAreTrustworthy` below.
 */
function buildColumns(
  countsAreTrustworthy: boolean,
): ReadonlyArray<DataTableColumn<ReportCategoryRow>> {
  return [
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
      cell: (row) =>
        countsAreTrustworthy ? (
          <CountCell value={row.reportCount} />
        ) : (
          <EmptyCell />
        ),
    },
    {
      id: "updatedAt",
      header: "Last changed",
      width: "11rem",
      cell: (row) => <DateCell value={row.updatedAt} relative />,
    },
  ];
}

/**
 * Is `reportCount` worth rendering as a number?
 *
 * ===================== A MEASURED API DEFECT =============================
 * `GET /admin/report-categories` returns `reportCount: 0` for EVERY category,
 * always, regardless of the data. It is not a data fact — it is a bug in
 * `AdminCategoriesService.list()`, and the console must not launder it into a
 * confident zero.
 *
 * The cause, taken from the SQL Drizzle actually emits for that query:
 *
 *     select "id", "key", (
 *         select count(*) from "reports"
 *         where "category_id" = "id"          <-- both unqualified
 *           and "deleted_at" is null
 *       ) from "report_categories"
 *
 * Interpolating `${reports.categoryId}` / `${reportCategories.id}` into a raw
 * `sql` template renders the bare column NAME, with no table qualifier. Inside
 * the subquery both names then resolve against its own FROM, so the predicate
 * is `reports.category_id = reports.id` — self-referential, and true for zero
 * rows by construction. Verified in psql:
 *
 *     select count(*) from reports where category_id = id;   ->  0
 *     -- properly correlated, same instant:      medicalHelp ->  64
 *
 * The fix belongs in `apps/api` (qualify the columns, or use a leftJoin +
 * groupBy), which is outside this task's scope — so it is reported, not patched.
 *
 * WHY A HEURISTIC RATHER THAN A HARDCODED EM DASH
 * ───────────────────────────────────────────────────────────────────────────
 * A single non-zero count anywhere proves the query is correlating properly,
 * so trusting the column exactly when some row is non-zero makes this
 * self-healing: the day the API is fixed, real numbers appear with no change
 * here. The one case it gets "wrong" is a database where every category
 * genuinely has zero reports — and there it shows "not measured" instead of
 * "zero", which is the safe direction to be wrong in.
 *
 * The em dash is the established convention for exactly this (see `formatCount`
 * in features/dashboard): a `0` says "nothing has been posted in this
 * category", which is a claim about the community. "Not measured" is the truth.
 * ==========================================================================
 */
function reportCountsAreTrustworthy(rows: ReportCategoryRow[]): boolean {
  return rows.some((row) => row.reportCount > 0);
}

const SKELETON_COLUMNS = buildColumns(true);

/**
 * The nine request categories, including the one citizens never see.
 *
 * READ-ONLY, AND SAYING SO
 * ───────────────────────────────────────────────────────────────────────────
 * The API does expose POST / PATCH / DELETE here, so this is not "there is
 * nothing to call". It is not wired because an edit flow needs a confirm dialog
 * (delete is destructive and 409s when the category is in use) and this console
 * has no shared dialog primitive yet — building one belongs in the shared UI
 * layer, not in a feature folder. Rather than ship a disabled "Edit" button,
 * which is a control that lies about being a control, the page states plainly
 * where these values are changed today.
 */
export function CategoriesTable() {
  const { view, rows, page, isPlaceholder, refetch } = useReportCategories();

  const countsAreTrustworthy = reportCountsAreTrustworthy(rows);
  const columns = useMemo(() => buildColumns(countsAreTrustworthy), [countsAreTrustworthy]);

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
        minWidth="66rem"
        // Nine rows is the whole table, so the skeleton is the whole table.
        loadingRows={9}
        isPlaceholder={isPlaceholder}
        onRetry={refetch}
        empty={{
          icon: <Shapes className="size-10" />,
          title: "No categories configured",
          description:
            "Categories are master data, normally created by the API's seed step. With none, the mobile app has nothing for a citizen to post under.",
        }}
      />

      {view.kind === "ready" ? (
        <div className="space-y-1.5 text-[11px] text-fg-faint">
          <p>
            These values are read live by the API on every report — a change to a label, emoji or
            expiry reaches the mobile app with no deploy. Editing is not wired into this console
            yet; today they are set by <code className="font-mono">pnpm db:seed</code> in the API.
          </p>
          {!countsAreTrustworthy ? (
            <p>
              Report counts read <span className="text-fg-muted">—</span> because the API is
              returning <code className="font-mono">0</code> for every category: its per-category
              subquery compares <code className="font-mono">reports.category_id</code> against{" "}
              <code className="font-mono">reports.id</code> instead of the category&rsquo;s, so it
              can never match. Showing that zero as a fact would claim these categories are unused.
            </p>
          ) : null}
        </div>
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
      minWidth="66rem"
      loadingRows={9}
      empty={{ title: "" }}
    />
  );
}
