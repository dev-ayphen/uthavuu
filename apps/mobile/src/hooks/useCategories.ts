import { useQuery } from '@tanstack/react-query';
import { listReportCategories } from '@uthavu/libs-mobile/api/reports';
import {
  categoryColor,
  FALLBACK_CATEGORY_TILES,
  type CategoryTile,
} from '@uthavu/libs-mobile/data/categories';

/** The query key ReportFlowScreen already used — shared so both hit one cache entry. */
export const REPORT_CATEGORIES_QUERY_KEY = ['reportCategories'] as const;

/**
 * The citizen-selectable categories, from the server.
 *
 * WHY THIS EXISTS. The Dashboard grid, the Discover chip row and the
 * report-flow picker each rendered a hardcoded eight-entry constant with
 * English titles baked in. An admin creating a category saw nothing appear on
 * a phone; renaming one updated report cards (they carry the label from the
 * server) but not the grid, so the same category read two different ways on two
 * screens of the same app.
 *
 * Falls back to the bundled list while loading and on error. That is a
 * deliberate choice for an emergency product: a citizen who opens Discover on a
 * bad connection gets a usable grid of the categories this build knows about,
 * rather than an empty screen. The fallback is stale, never wrong-by-invention
 * — every tile still routes by key, and the server decides what a key means.
 */
export function useCategories(): {
  categories: CategoryTile[];
  isLoading: boolean;
  isFallback: boolean;
} {
  const { data, isPending, isError } = useQuery({
    queryKey: REPORT_CATEGORIES_QUERY_KEY,
    queryFn: listReportCategories,
    // The taxonomy changes about as often as a deploy. Long staleness keeps
    // every screen that mounts a grid from re-asking.
    staleTime: 10 * 60 * 1000,
  });

  const usable = data && data.length > 0;
  return {
    categories: usable
      ? data.map((c) => ({
          id: c.key,
          title: c.label,
          emoji: c.emoji,
          color: categoryColor(c.key),
        }))
      : FALLBACK_CATEGORY_TILES,
    isLoading: isPending,
    isFallback: !usable && (isError || isPending),
  };
}
