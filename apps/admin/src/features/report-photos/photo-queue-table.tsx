"use client";

import { ScanLine, ShieldCheck } from "lucide-react";

import {
  ClearFiltersButton,
  DataTable,
  DateCell,
  DateRangeFilter,
  ListPagination,
  ListSearchInput,
  offsetListAdapter,
  PersonCell,
  ResultAnnouncer,
  useListQuery,
  useListState,
  type DataTableColumn,
  type FilterDef,
  type ListConfig,
} from "@/components/data";
import { Alert, Badge, FilterRow, FilterSelect } from "@/components/ui";
import { reportPhotoDetailHref } from "@/features/moderation/routes";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { REPORT_STATUS_LABEL } from "@/features/reports/report-status-badge";
import { useReportCategoryOptions } from "@/features/reports/use-report-categories";
import { apiFetch } from "@/lib/api-client";
import { PhotoReviewActions } from "./photo-review-actions";
import { PrivatePhoto } from "./private-photo";
import {
  automatedCheck,
  countNeverChecked,
  photoStateCopy,
  reasonLabel,
  reasonTone,
} from "./reason-copy";
import type { ReportPhotoRow } from "./types";
import { photoStatusRef } from "./wire";

/**
 * The photo verification queue.
 *
 * WHAT THE RESTING VIEW SHOWS
 * ───────────────────────────────────────────────────────────────────────────
 * `status` has no default here because the ENDPOINT has one:
 * `ListReportPhotosSchema.status` defaults to `awaiting`, which the API defines
 * as the union of `review_required` and `failed` — everything a human still has
 * to decide about. Omitting the parameter and asking for `awaiting` are the same
 * request, so it stays out of the URL like every other resting value.
 *
 * ⚠️ THE UNION IS NOT A TIDY-UP, IT IS THE WHOLE POINT. `failed` means the
 * provider never answered, and with no AWS credentials configured — the state of
 * every environment today — every single photo is recorded `failed`. A queue
 * defaulted to `review_required` alone would show an empty screen while the
 * entire backlog sat behind a filter nobody had a reason to change.
 *
 * They are still separately selectable below, in plain language, because
 * "the model is flagging things" and "Rekognition is down" send an operator to
 * two different places.
 *
 * `isNarrowed` is false at rest, so an empty table shows the "queue is clear"
 * copy rather than "nothing matched your filters" — the right sentence for a
 * queue that is genuinely empty and the wrong one for a filter nobody set.
 */
export const REPORT_PHOTOS_LIST: ListConfig = {
  defaultSort: { key: "createdAt", direction: "desc" },
  filterKeys: ["status", "risk", "categoryKey", "from", "to"],
  defaultFilters: {},
};

/**
 * The seeded `photo_verification_statuses` keys, worded for a moderator.
 *
 * LABELLED BY WHAT HAPPENED, NOT BY THE STATUS KEY. "Review required" and
 * "Verification failed" are the database's words for two states of the SYSTEM;
 * next to a photograph they both read as verdicts on the photograph. What an
 * operator is actually choosing between is "the check flagged something" and
 * "the check never ran", so that is what the options say.
 *
 * The two awaiting states come first, and `all` is offered last because the
 * blank option is NOT "everything" — it is the API's `awaiting` union, and
 * without an explicit escape hatch there is no way to see a decided photo
 * except one status at a time.
 */
const STATUS_FILTER: FilterDef = {
  id: "status",
  label: "Verification",
  // Both of the two states below, which is what the endpoint returns when
  // `status` is omitted. Not "All" — calling it that would be false.
  allLabel: "Waiting for a decision",
  options: [
    { value: "review_required", label: "Flagged by the check" },
    // NOT a synonym for the one above: the provider never answered, so nothing
    // examined the photo and the model has no opinion about it at all.
    { value: "failed", label: "Never checked" },
    { value: "verifying", label: "Check still running" },
    { value: "passed", label: "Cleared by the check" },
    { value: "rejected", label: "Already decided — refused" },
    { value: "all", label: "Every photo" },
  ],
};

/**
 * The band the automated check scored, and only that.
 *
 * ⚠️ IT IS NOT A PROPERTY OF THE PHOTOGRAPH, WHICH IS WHY IT SAYS "score".
 * The API filters on the stored `risk_level` column, and the decision engine
 * writes `medium` into that column for an upload it never analysed — a resting
 * default, not a reading. So "Medium" here also returns photos nothing looked
 * at. Those rows say "Not checked" and print no risk of their own, so the
 * mismatch is visible rather than silent, but the control is labelled for what
 * it actually selects on: a score the check produced.
 */
const RISK_FILTER: FilterDef = {
  id: "risk",
  label: "Risk score",
  allLabel: "Any score",
  options: [
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ],
};

const COLUMNS: ReadonlyArray<DataTableColumn<ReportPhotoRow>> = [
  {
    id: "photo",
    header: "Photo",
    headerHidden: true,
    width: "4rem",
    skeletonWidth: "100%",
    cell: (row) => (
      <span className="block overflow-hidden rounded-control border border-border">
        <PrivatePhoto photoId={row.id} variant="thumb" label="Held photo" />
      </span>
    ),
  },
  {
    id: "report",
    header: "Report",
    primary: true,
    width: "15rem",
    skeletonWidth: "80%",
    // Category rides along as a second line rather than taking a column of its
    // own — the same trade `FlaggedCommentsTable` makes, and for the same
    // reason: the facts are read together, and eight thin columns push the
    // decision buttons off a 1440px screen. The buttons are the point of a
    // queue.
    cell: (row) => (
      <span className="block min-w-0">
        <span
          className="block truncate font-medium text-fg"
          title={row.reportTitle ?? undefined}
        >
          {row.reportTitle ?? "Not attached to a report yet"}
        </span>
        <span className="block truncate text-[11px] text-fg-faint">
          {[row.categoryLabel, row.reportStatus ? REPORT_STATUS_LABEL[row.reportStatus] : null]
            .filter(Boolean)
            .join(" · ") || "—"}
        </span>
      </span>
    ),
  },
  {
    id: "state",
    header: "Review state",
    width: "8rem",
    skeletonWidth: "4.5rem",
    // The QUEUE's state — resolved or not — kept in its own column beside the
    // machine's verdict rather than merged with it. They are different facts
    // about different actors, and a moderator who reads one as the other has
    // taken a model's guess for a colleague's sign-off.
    cell: (row) => {
      // `photoStateCopy` renames exactly one key: `failed` becomes "Not
      // checked". The API's own label is "Verification failed", which in a
      // column about a photograph reads as a verdict on the photograph.
      const state = photoStateCopy(photoStatusRef(row.verificationStatus));
      if (!state) return <span className="text-fg-faint select-none">—</span>;
      return <Badge tone={state.tone}>{state.label}</Badge>;
    },
  },
  {
    id: "decision",
    header: "Automated check",
    width: "9rem",
    skeletonWidth: "5rem",
    // ⚠️ A `failed` row renders NEITHER a verdict NOR a risk band. The engine
    // stored `review` at medium risk for it, but those are resting defaults
    // written so the photo would queue — not measurements — and printing them
    // beside a photograph nothing has ever examined is the console asserting a
    // reading that was never taken. `automatedCheck` makes that unforgettable:
    // on its `ran: false` branch there is no `risk` field to reach for.
    cell: (row) => {
      const check = automatedCheck(row);

      if (!check.ran) {
        return (
          <span className="block min-w-0">
            <Badge tone={check.tone}>{check.label}</Badge>
            <span className="mt-0.5 block text-[11px] text-fg-faint">
              Nothing examined this photo
            </span>
          </span>
        );
      }

      return (
        <span className="block min-w-0">
          <Badge tone={check.decision.tone}>{check.decision.label}</Badge>
          {/* Risk is paired here rather than given a column: it is the same
              engine's output, read in the same glance. It stays independently
              filterable through the Risk control above. */}
          <span className="mt-0.5 block text-[11px] text-fg-faint">
            Risk: {check.risk.label}
          </span>
        </span>
      );
    },
  },
  {
    id: "reasons",
    header: "Triggered labels",
    width: "10.5rem",
    skeletonWidth: "70%",
    // EXACTLY what the backend said fired. Nothing is added and no taxonomy
    // parent is inferred — see reason-copy.ts for why inferring would undo the
    // API's emergency carve-out on screen.
    cell: (row) => {
      const check = automatedCheck(row);

      // "Nothing flagged" is TRUE for a checked photo and a lie for an
      // unchecked one — it is the sentence a moderator reads as reassurance,
      // and here it would mean "nothing looked". They must not share a cell.
      if (!check.ran) {
        return <span className="text-[11px] text-fg-faint">No labels — the check never ran</span>;
      }

      const reasons = check.reasons;
      if (reasons.length === 0) {
        return <span className="text-[11px] text-fg-faint">Nothing flagged</span>;
      }

      const shown = reasons.slice(0, 2);
      const rest = reasons.length - shown.length;

      return (
        <span
          className="flex min-w-0 flex-wrap items-center gap-1"
          title={reasons.map(reasonLabel).join(", ")}
        >
          {shown.map((reason) => (
            <Badge key={reason} tone={reasonTone(reason)}>
              {reasonLabel(reason)}
            </Badge>
          ))}
          {rest > 0 ? <span className="text-[11px] text-fg-faint">+{rest}</span> : null}
        </span>
      );
    },
  },
  {
    id: "reporter",
    header: "Reporter",
    width: "8.5rem",
    skeletonWidth: "60%",
    cell: (row) =>
      row.reporter ? (
        <PersonCell person={{ id: row.reporter.id ?? undefined, name: row.reporter.name }} />
      ) : (
        // The uploader FK is SET NULL on account deletion, so the moderation
        // record outlives the person. Saying so beats a blank cell.
        <PersonCell person={{ deleted: true }} />
      ),
  },
  {
    id: "createdAt",
    header: "Submitted",
    sortKey: "createdAt",
    width: "8.5rem",
    skeletonWidth: "5rem",
    cell: (row) => <DateCell value={row.createdAt} relative />,
  },
  {
    id: "actions",
    header: "Actions",
    // Without this, a click on Approve is swallowed by the row-navigation
    // handler and opens the detail page instead of the dialog.
    interactive: true,
    align: "end",
    width: "12.5rem",
    skeletonWidth: "7rem",
    cell: (row) => (
      <span className="flex items-center justify-end gap-1.5">
        <PhotoReviewActions photo={row} compact />
      </span>
    ),
  },
];

export function PhotoQueueTable() {
  const { toggleSort, params: listParams } = useListState();

  const { view, page, params, isFetching, isPlaceholder, refetch } = useListQuery<
    unknown,
    ReportPhotoRow
  >({
    key: ["admin", "report-photos"],
    adapter: offsetListAdapter<ReportPhotoRow>(),
    fetcher: ({ searchParams, signal }) =>
      apiFetch("/admin/report-photos", { searchParams, signal }),
  });

  const rows = view.kind === "ready" ? view.rows : [];
  const neverChecked = countNeverChecked(rows);

  return (
    <div className="space-y-4">
      <PhotoFilters total={page?.total ?? null} />

      <UncheckedNote count={neverChecked} total={rows.length} />

      <DataTable
        view={view}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowHref={(row) => reportPhotoDetailHref(row.id)}
        caption="Photos awaiting verification"
        className={MODERATION_TABLE}
        sort={listParams.sort}
        onToggleSort={toggleSort}
        onRetry={refetch}
        isPlaceholder={isPlaceholder}
        loadingRows={Math.min(params.pageSize, 10)}
        minWidth="76rem"
        empty={{
          icon: <ShieldCheck className="size-10" />,
          title: "Nothing waiting for a decision",
          description:
            "No photo is unresolved — nothing the check flagged, and nothing it failed to run on. Photos already approved or rejected are hidden; pick “Every photo” in the Verification filter to see them.",
        }}
        filteredEmptyTitle="No photos match these filters"
        filteredEmptyDescription="Nothing matches what you're filtering on. Widen the filters or clear them to go back to the review queue."
        footer={<ListPagination page={page} isFetching={isFetching} />}
      />
    </div>
  );
}

/**
 * "N of these were never checked."
 *
 * ==========================================================================
 * THE COMMON CASE, NOT THE EDGE CASE.
 * ==========================================================================
 * With no moderation credentials configured — which is every environment today
 * — `UnconfiguredModerationProvider` returns `not-configured` for every upload,
 * so 100% of this queue is `failed`. Each row already says "Not checked" on its
 * own, but a moderator working down a list reads the ROWS and not the pattern,
 * and the pattern is the operationally important fact: the automated check is
 * not running at all, and every decision on this page is being made unaided.
 *
 * Stated once, above the table, from the rows actually on screen — not from the
 * summary endpoint, which counts something else (see `summary-cards.tsx`).
 *
 * `info`, not `warning`: this is context the operator needs before acting, and
 * it is a fact about the environment. Amber here would be read as a warning
 * about the photographs below it, which is the mistake this whole change is
 * undoing.
 */
function UncheckedNote({ count, total }: { count: number; total: number }) {
  if (count === 0) return null;

  const all = count === total;

  return (
    <Alert tone="info" icon={ScanLine} announce={false}>
      {all
        ? total === 1
          ? "This photo was never checked — no moderation provider answered, so nothing has examined it. Decide from the photograph itself."
          : `None of these ${total} photos was checked — no moderation provider answered, so nothing has examined them. Decide from the photographs themselves.`
        : `${count} of these ${total} photos ${count === 1 ? "was" : "were"} never checked — no moderation provider answered for ${count === 1 ? "it" : "them"}. The rest carry a real verdict.`}
    </Alert>
  );
}

/**
 * This queue's filter row, hand-rolled rather than `FilterBar`.
 *
 * Same reason `StoryFilters` and `AuditFilters` are: `FilterBar` renders a
 * search box and then a run of `<select>`s, and this endpoint needs the two
 * date inputs in the middle of that run. Its only other slot is `actions`,
 * which is right-aligned with `ml-auto` — putting "From"/"To" there would
 * separate them from the controls they belong with. Everything else matches
 * FilterBar deliberately: URL-backed values, the active tint, the "Clear all"
 * escape hatch, the live-region announcement.
 */
function PhotoFilters({ total }: { total: number | null }) {
  const { params, setFilter, isFilterActive } = useListState();
  // Absent for an admin who cannot read the category table — `GET
  // /admin/report-categories` is gated on `platform:manage` while this queue
  // needs `reports:manage`. The hook resolves to null and the control simply
  // does not render, rather than sitting there empty and looking broken.
  const categoryOptions = useReportCategoryOptions();

  return (
    <FilterRow>
      <ListSearchInput
        placeholder="Report title or landmark…"
        label="Search held photos"
        className="w-full sm:w-64"
      />

      <FilterSelect
        label={STATUS_FILTER.label}
        allLabel={STATUS_FILTER.allLabel}
        options={STATUS_FILTER.options}
        value={params.filters.status ?? ""}
        active={isFilterActive("status")}
        onChange={(value) => setFilter("status", value)}
      />

      <FilterSelect
        label={RISK_FILTER.label}
        allLabel={RISK_FILTER.allLabel}
        options={RISK_FILTER.options}
        value={params.filters.risk ?? ""}
        active={isFilterActive("risk")}
        onChange={(value) => setFilter("risk", value)}
      />

      {categoryOptions ? (
        <FilterSelect
          label="Category"
          allLabel="All categories"
          options={categoryOptions}
          value={params.filters.categoryKey ?? ""}
          active={isFilterActive("categoryKey")}
          onChange={(value) => setFilter("categoryKey", value)}
          className="max-w-56"
        />
      ) : null}

      <DateRangeFilter />

      <ClearFiltersButton />

      <ResultAnnouncer count={total} noun="photo" />
    </FilterRow>
  );
}
