"use client";

import { X } from "lucide-react";

import {
  ClearFiltersButton,
  DateRangeFilter,
  ResultAnnouncer,
  useListState,
} from "@/components/data";
import { FilterRow, FilterSelect } from "@/components/ui";
import { useAuditCatalogue } from "./use-audit-logs";

/**
 * Audit Logs' own filter row.
 *
 * NOT `<FilterBar>`, and that is the whole point: FilterBar always renders a
 * search box, and this endpoint has no `q` (see the note in use-audit-logs.ts).
 * A search box that silently returns every row is a worse lie than no search
 * box. Everything else here — URL-backed values, the active-filter tint, the
 * "Clear all" escape hatch, the live-region announcement — matches FilterBar
 * deliberately, so the two read as the same control.
 */
export function AuditFilters({ resultCount }: { resultCount: number | null }) {
  const { params, setFilter, isFilterActive } = useListState();
  const catalogue = useAuditCatalogue();

  const actions = catalogue.data?.actions ?? [];
  const targetTypes = catalogue.data?.targetTypes ?? [];

  // The catalogue rides the same 403 as the list, which already explains itself
  // properly. Disabling rather than hiding keeps the row from reflowing when it
  // loads, and a disabled control is honest about being temporarily unusable.
  const optionsUnavailable = catalogue.isPending || catalogue.isError;

  return (
    <FilterRow>
      <FilterSelect
        label="Action"
        allLabel="All actions"
        // The catalogue speaks `key`/`label`; the control speaks `value`/`label`.
        options={actions.map((action) => ({ value: action.key, label: action.label }))}
        value={params.filters.action ?? ""}
        active={isFilterActive("action")}
        disabled={optionsUnavailable}
        onChange={(value) => setFilter("action", value)}
        // Action labels are the longest text in this row; without a cap this
        // one dropdown decides how wide the whole row is.
        className="max-w-56"
      />

      <FilterSelect
        label="Target"
        allLabel="All targets"
        options={targetTypes.map((type) => ({ value: type.key, label: type.label }))}
        value={params.filters.targetType ?? ""}
        active={isFilterActive("targetType")}
        disabled={optionsUnavailable}
        onChange={(value) => setFilter("targetType", value)}
      />

      <DateRangeFilter />

      {/* Deep-link filters have no dropdown of their own — they arrive from a
          link ("everything this admin did"). Rendering them as removable chips
          is what stops the list being narrowed by something invisible, which is
          how an operator concludes rows are missing. */}
      <IdChip label="Actor" value={params.filters.actorUserId} onClear={() => setFilter("actorUserId", null)} />
      <IdChip label="Target id" value={params.filters.targetId} onClear={() => setFilter("targetId", null)} />

      <ClearFiltersButton />

      <ResultAnnouncer count={resultCount} noun="entry" pluralNoun="entries" />
    </FilterRow>
  );
}

function IdChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string | undefined;
  onClear: () => void;
}) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-1 rounded-pill border border-primary-soft-border bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary-soft-fg">
      <span className="micro-label text-primary-soft-fg">{label}</span>
      <code className="font-mono" title={value}>
        {value.slice(0, 8)}…
      </code>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear the ${label.toLowerCase()} filter`}
        className="rounded-pill p-0.5 transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}
