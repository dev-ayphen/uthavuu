"use client";

import { FilterX } from "lucide-react";
import { useId } from "react";

import { ListSearchInput, useListState } from "@/components/data";
import { Badge, Button, Input, Select } from "@/components/ui";
import { useReportCategoryOptions } from "@/features/reports/use-report-categories";
import { cn } from "@/lib/cn";

/**
 * Impact Stories' own filter row.
 *
 * NOT `<FilterBar>`, for one structural reason: FilterBar renders a search box
 * and a run of `<select>`s and nothing else, and this endpoint needs two date
 * inputs in the middle of that run. FilterBar's only other slot is `actions`,
 * which is `ml-auto` right-aligned — putting "From"/"To" there would separate
 * them from the controls they belong with. `AuditFilters` set this precedent
 * for the same reason. Everything else — URL-backed values, the active-filter
 * tint, the "Clear all" escape hatch, the live-region announcement — matches
 * FilterBar deliberately, so all three read as the same control.
 *
 * The category select is reused wholesale from the Reports lane, including its
 * disappearing act: `GET /admin/report-categories` is gated on `platform:manage`
 * (super admin only) while this list needs `reports:manage` (both roles), so an
 * ops admin cannot enumerate the categories they are allowed to filter by. That
 * hook resolves to `null` on a 403 and the control is simply absent, rather than
 * sitting there empty and looking broken. The `?categoryKey=` URL parameter
 * still works, so a super admin can share a filtered link and it renders
 * correctly for whoever opens it.
 */
export function StoryFilters({ resultCount }: { resultCount: number | null }) {
  const { params, activeFilterCount, isNarrowed, setFilter, clearAll, isFilterActive } =
    useListState();
  const categoryOptions = useReportCategoryOptions();

  const categoryId = useId();
  const fromId = useId();
  const toId = useId();

  const activeTint = "border-primary-soft-border bg-primary-soft text-primary-soft-fg";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ListSearchInput
        placeholder="Search story titles…"
        label="Search impact stories"
        className="w-full sm:w-64"
      />

      {categoryOptions ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <label htmlFor={categoryId} className="micro-label whitespace-nowrap">
            Category
          </label>
          <Select
            id={categoryId}
            size="sm"
            value={params.filters.categoryKey ?? ""}
            onChange={(event) => setFilter("categoryKey", event.target.value)}
            className={cn("w-auto max-w-56", isFilterActive("categoryKey") && activeTint)}
          >
            <option value="">All categories</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={fromId} className="micro-label whitespace-nowrap">
          From
        </label>
        <Input
          id={fromId}
          type="date"
          value={params.filters.from ?? ""}
          // The API rejects `from > to` with a 400 (``from` must not be after
          // `to``). Constraining the pickers to each other makes that validation
          // error unreachable through the UI instead of explained after the fact.
          max={params.filters.to || undefined}
          onChange={(event) => setFilter("from", event.target.value)}
          className={cn("h-8 w-auto px-2.5 text-xs", isFilterActive("from") && activeTint)}
        />
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={toId} className="micro-label whitespace-nowrap">
          To
        </label>
        <Input
          id={toId}
          type="date"
          value={params.filters.to ?? ""}
          min={params.filters.from || undefined}
          onChange={(event) => setFilter("to", event.target.value)}
          className={cn("h-8 w-auto px-2.5 text-xs", isFilterActive("to") && activeTint)}
        />
      </div>

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
          until the rows change; a screen-reader user gets nothing at all. */}
      <p aria-live="polite" className="sr-only">
        {resultCount === null
          ? ""
          : `${resultCount} ${resultCount === 1 ? "story" : "stories"}${
              isNarrowed ? " matching the current filters" : ""
            }`}
      </p>
    </div>
  );
}
