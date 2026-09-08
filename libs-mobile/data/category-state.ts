import {
  categoryColor,
  FALLBACK_CATEGORY_TILES,
  type CategoryTile,
} from './categories';

/**
 * What the category grid should render, given what the query knows.
 *
 * ======================= THE BUG THIS REPLACES ============================
 * `useCategories()` decided this inline, and got one case wrong:
 *
 *     const usable = data && data.length > 0;
 *     categories: usable ? data.map(...) : FALLBACK_CATEGORY_TILES,
 *     isFallback: !usable && (isError || isPending),
 *
 * On a SUCCESSFUL EMPTY RESPONSE — the server answering `[]` because no category
 * is citizen-selectable — `isError` and `isPending` are both false. So `usable`
 * was false, the eight bundled `FALLBACK_CATEGORY_TILES` rendered, AND
 * `isFallback` reported `false`: the app presented categories that do not exist
 * on the server as though they were live data, with nothing marking them as
 * stale.
 *
 * The consequence was not cosmetic. A citizen taps "Blood Donation", the report
 * flow posts `categoryKey: 'bloodDonation'`, and the API rejects it because no
 * such row exists. An emergency app sent someone down a dead end at the moment
 * they needed it to work.
 *
 * ==================== THE DISTINCTION, STATED ONCE ========================
 * There are three states, and the middle one is the one that was missing:
 *
 *   NOTHING KNOWN YET (loading, or the request failed) -> fallback tiles.
 *     Deliberate offline resilience, and it stays. A citizen opening Discover on
 *     a bad connection gets a usable grid of the categories this build ships
 *     rather than a blank screen. The tiles are STALE, never invented — each one
 *     routes by key and the server decides what a key means.
 *
 *   THE SERVER ANSWERED, WITH ROWS -> those rows. The taxonomy is the server's.
 *
 *   THE SERVER ANSWERED, WITH NONE -> an honest empty state.
 *     `[]` is a real answer, not a failure, and substituting the fallback here
 *     is the one case where the fallback would be wrong-by-invention rather than
 *     merely stale.
 *
 * A SUCCESSFUL ANSWER ALWAYS WINS OVER A LATER ERROR. If `data` is defined, a
 * subsequent failed refetch does not flip the grid back to the bundled tiles:
 * the last thing the server actually said is better evidence than a list this
 * build was compiled with. That is why the branch below tests `data === undefined`
 * rather than testing `isError` first.
 *
 * Pure and framework-free on purpose — no React, no React Query — so the rule
 * above can be tested directly (`category-state.test.ts`). The hook is the thin
 * part; this is the part that was wrong.
 * ==========================================================================
 */

/** The minimum this module needs from `GET /reports/categories`. */
export type ServerCategory = {
  key: string;
  label: string;
  emoji: string;
};

export type CategorySource = 'server' | 'fallback' | 'empty';

export type CategoryState = {
  categories: CategoryTile[];
  /** The request has not produced an answer yet. */
  isLoading: boolean;
  /** These tiles came from the bundle, not the server. Never true with `isEmpty`. */
  isFallback: boolean;
  /** The server answered, and there are no categories. Renders an empty state. */
  isEmpty: boolean;
  /**
   * The request failed and no earlier answer is being shown, so the tiles are
   * the bundled ones. Only ever true alongside `isFallback` — it is what lets a
   * screen offer Retry instead of implying the grid is current.
   */
  isError: boolean;
  /** The three cases above, for a caller that would rather switch than branch. */
  source: CategorySource;
};

export function resolveCategoryState(input: {
  data: ServerCategory[] | undefined;
  isPending: boolean;
  isError: boolean;
}): CategoryState {
  const { data, isPending, isError } = input;

  // Nothing has come back yet — still in flight, or it failed before ever
  // succeeding. This is the fallback's entire purpose.
  if (data === undefined) {
    return {
      categories: FALLBACK_CATEGORY_TILES,
      isLoading: isPending,
      isFallback: true,
      isEmpty: false,
      isError,
      source: 'fallback',
    };
  }

  // The server spoke and said there is nothing. Say so.
  //
  // `isError` is reported as false from here down even if the LATEST refetch
  // failed: a successful answer is being displayed, so there is nothing for a
  // Retry button to fix and nothing stale to warn about. See "A SUCCESSFUL
  // ANSWER ALWAYS WINS OVER A LATER ERROR" above — that is a decision, not an
  // oversight.
  if (data.length === 0) {
    return {
      categories: [],
      isLoading: false,
      isFallback: false,
      isEmpty: true,
      isError: false,
      source: 'empty',
    };
  }

  return {
    categories: data.map((category) => ({
      id: category.key,
      title: category.label,
      emoji: category.emoji,
      // Colour is a client concern — the API has no colour column. An unknown
      // key (a category created after this build shipped) gets the neutral
      // fallback rather than crashing on an undefined lookup.
      color: categoryColor(category.key),
    })),
    isLoading: false,
    isFallback: false,
    isEmpty: false,
    isError: false,
    source: 'server',
  };
}
