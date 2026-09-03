"use client";

import {
  ClearFiltersButton,
  DateRangeFilter,
  ListSearchInput,
  ResultAnnouncer,
  useListState,
} from "@/components/data";
import { FilterRow, FilterSelect } from "@/components/ui";
import { useReportCategoryOptions } from "@/features/reports/use-report-categories";

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
  const { params, setFilter, isFilterActive } = useListState();
  const categoryOptions = useReportCategoryOptions();

  return (
    <FilterRow>
      <ListSearchInput
        placeholder="Search story titles…"
        label="Search impact stories"
        className="w-full sm:w-64"
      />

      {categoryOptions ? (
        <FilterSelect
          label="Category"
          allLabel="All categories"
          options={categoryOptions}
          value={params.filters.categoryKey ?? ""}
          active={isFilterActive("categoryKey")}
          onChange={(value) => setFilter("categoryKey", value)}
          // Category labels carry an emoji and a full phrase; capped so one
          // long one does not set the width of the row.
          className="max-w-56"
        />
      ) : null}

      <DateRangeFilter />

      <ClearFiltersButton />

      <ResultAnnouncer count={resultCount} noun="story" pluralNoun="stories" />
    </div>
  );
}
