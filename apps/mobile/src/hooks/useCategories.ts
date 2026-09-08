import { useQuery } from '@tanstack/react-query';
import { listReportCategories } from '@uthavu/libs-mobile/api/reports';
import {
  resolveCategoryState,
  type CategoryState,
} from '@uthavu/libs-mobile/data/category-state';

/** The query key ReportFlowScreen already used — shared so both hit one cache entry. */
export const REPORT_CATEGORIES_QUERY_KEY = ['reportCategories'] as const;

/**
 * The citizen-selectable categories, from the server.
 *
 * WHY THIS EXISTS. The Dashboard grid, the Discover picker and the report-flow
 * picker each rendered a hardcoded eight-entry constant with English titles
 * baked in. An admin creating a category saw nothing appear on a phone; renaming
 * one updated report cards (they carry the label from the server) but not the
 * grid, so the same category read two different ways on two screens of the same
 * app.
 *
 * THE DECISION ITSELF LIVES IN `libs-mobile/data/category-state.ts`, not here.
 * That is where the loading / server-rows / server-said-none distinction is
 * made and argued — including the bug this hook used to contain, where a
 * successful EMPTY response rendered eight bundled tiles while reporting
 * `isFallback: false`. Keeping the rule in a pure, framework-free function is
 * what lets it be tested; this hook is only the wiring.
 */
export function useCategories(): CategoryState {
  const { data, isPending, isError } = useQuery({
    queryKey: REPORT_CATEGORIES_QUERY_KEY,
    queryFn: listReportCategories,
    // The taxonomy changes about as often as a deploy. Long staleness keeps
    // every screen that mounts a grid from re-asking.
    staleTime: 10 * 60 * 1000,
  });

  return resolveCategoryState({ data, isPending, isError });
}
