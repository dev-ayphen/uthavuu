"use client";

import { FilterX } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Badge, Button, Select } from "@/components/ui";
import { useListState } from "@/hooks/use-list-state";
import { cn } from "@/lib/cn";
import { ListSearchInput } from "./search-input";

/**
 * Search + filters, all of it backed by the query string.
 *
 * Every control here writes to the URL rather than to component state, which is
 * what makes a narrowed view something a moderator can paste into a ticket and
 * something that survives a reload. See `use-list-state.tsx` for the mechanism.
 *
 * "CLEAR ALL" IS NOT DECORATION
 * ───────────────────────────────────────────────────────────────────────────
 * It is the escape hatch from a filtered-to-zero table. Without a visible way
 * out, an operator looking at an empty result set cannot tell "these records
 * are gone" from "I filtered them out three clicks ago", and the reasonable
 * conclusion is the alarming one. It appears exactly when something is
 * narrowing the list, and it reports how many things.
 */

export type FilterOption = {
  value: string;
  label: string;
  /** Optional count, e.g. "Suspended (12)". Omit unless it is cheap and true. */
  count?: number;
};

export type FilterDef = {
  /** The API's query param name — `status`, `audience`, `district`, … */
  id: string;
  label: string;
  options: readonly FilterOption[];
  /**
   * Label for the "no opinion" choice. Omit for a filter that always has a
   * value (the API's `audience`, which defaults to `citizen` rather than
   * to "everyone").
   */
  allLabel?: string;
};

export function FilterBar({
  filters = [],
  searchPlaceholder,
  searchLabel,
  /** Total matching rows, for the live announcement. `null` while unknown. */
  resultCount,
  resultNoun = "result",
  /** Right-aligned page actions — export, bulk action, "New …". */
  actions,
  className,
}: {
  filters?: readonly FilterDef[];
  searchPlaceholder?: string;
  searchLabel?: string;
  resultCount?: number | null;
  resultNoun?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const { params, activeFilterCount, isNarrowed, setFilter, clearAll, isFilterActive } =
    useListState();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ListSearchInput
        placeholder={searchPlaceholder}
        label={searchLabel}
        className="w-full sm:w-64"
      />

      {filters.map((filter) => (
        <FilterSelect
          key={filter.id}
          filter={filter}
          value={params.filters[filter.id] ?? ""}
          active={isFilterActive(filter.id)}
          onChange={(value) => setFilter(filter.id, value)}
        />
      ))}

      {isNarrowed ? (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <FilterX />
          Clear all
          {activeFilterCount > 0 ? (
            <Badge tone="neutral" className="ml-0.5">
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      ) : null}

      {/* Debounced search gives no visible confirmation that anything happened
          until the rows change; a screen-reader user gets nothing at all. This
          says so out loud. */}
      <p aria-live="polite" className="sr-only">
        {resultCount === null || resultCount === undefined
          ? ""
          : `${resultCount} ${resultCount === 1 ? resultNoun : `${resultNoun}s`}${
              isNarrowed ? " matching the current filters" : ""
            }`}
      </p>

      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function FilterSelect({
  filter,
  value,
  active,
  onChange,
}: {
  filter: FilterDef;
  value: string;
  active: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {/* A bare <select> of statuses reads as "Active" with no clue what that
          is a property OF, both visually and to a screen reader. */}
      <label htmlFor={id} className="micro-label whitespace-nowrap">
        {filter.label}
      </label>
      <Select
        id={id}
        size="sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn("w-auto", active && "border-primary-soft-border bg-primary-soft text-primary-soft-fg")}
      >
        {filter.allLabel !== undefined ? <option value="">{filter.allLabel}</option> : null}
        {filter.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.count === undefined ? option.label : `${option.label} (${option.count})`}
          </option>
        ))}
      </Select>
    </div>
  );
}
