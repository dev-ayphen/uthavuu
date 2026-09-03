"use client";

import type { ReactNode } from "react";

import { FilterRow, FilterSelect, type FilterOption } from "@/components/ui";
import { useListState } from "@/hooks/use-list-state";
import { ClearFiltersButton, ResultAnnouncer } from "./filter-controls";
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

// The option shape is the shared `FilterSelect`'s, re-exported so a list page
// declaring its filters has one import path.
export type { FilterOption };

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
  const { params, setFilter, isFilterActive } = useListState();

  return (
    <FilterRow className={className}>
      <ListSearchInput
        placeholder={searchPlaceholder}
        label={searchLabel}
        className="w-full sm:w-64"
      />

      {filters.map((filter) => (
        <FilterSelect
          key={filter.id}
          label={filter.label}
          options={filter.options}
          allLabel={filter.allLabel}
          value={params.filters[filter.id] ?? ""}
          active={isFilterActive(filter.id)}
          onChange={(value) => setFilter(filter.id, value)}
        />
      ))}

      <ClearFiltersButton />

      <ResultAnnouncer count={resultCount} noun={resultNoun} />

      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </FilterRow>
  );
}
