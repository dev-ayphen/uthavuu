/**
 * The shared list/table layer.
 *
 * A list page imports from here and from "@/components/layout" only. Everything
 * below is generic over the row type; nothing in it knows what a report or a
 * support ticket is.
 *
 * The usual shape of a page:
 *
 *   <PageLayout title="Users" contentWidth="wide">
 *     <ListStateProvider config={USERS_LIST} fallback={<DataTableSkeleton />}>
 *       <UsersTable />          // calls useListQuery(), renders <DataTable>
 *     </ListStateProvider>
 *   </PageLayout>
 */

export { DataTable, type ColumnAlign, type DataTableColumn, type DataTableProps } from "./data-table";
export { ListPane, TableScrollRegion } from "./list-pane";
export { Pagination, ListPagination, pageWindow, type PaginationProps } from "./pagination";
export { SearchInput, ListSearchInput } from "./search-input";
export { FilterBar, type FilterDef, type FilterOption } from "./filter-bar";
// The row shell, the labelled dropdown and the active tint are design-layer
// primitives and come from "@/components/ui" (i.e. `@uthavu/libs-web`) — this
// barrel does not proxy them, any more than it proxies Select or InlineField.
export { ClearFiltersButton, DateRangeFilter, ResultAnnouncer } from "./filter-controls";
export {
  ListEmptyState,
  ListFailureState,
  ListFailureInline,
  type ListEmptyCopy,
} from "./list-feedback";
export { SelectionList, SelectionListItem } from "./selection-list";
export {
  DetailBody,
  DetailEmpty,
  DetailField,
  DetailFields,
  DetailHeader,
  DetailSection,
  DetailSkeleton,
} from "./detail-panel";
export {
  BooleanCell,
  CodeCell,
  CountCell,
  DateCell,
  EmptyCell,
  MutedCell,
  PersonCell,
  RelativeTime,
  RemovedContentCell,
  TextCell,
  formatDate,
  formatRelative,
  type PersonRef,
} from "./cells";

// Hooks and pure helpers, re-exported so a page has one import path.
export { ListStateProvider, useListState, type ListStateValue } from "@/hooks/use-list-state";
export {
  useListQuery,
  shouldRetryListError,
  type ListFetchArgs,
  type ListFetcher,
  type ListView,
  type UseListQueryOptions,
  type UseListQueryResult,
} from "@/hooks/use-list-query";
export {
  arrayListAdapter,
  cursorListAdapter,
  customListAdapter,
  detectListAdapter,
  offsetListAdapter,
  pageRange,
  ListShapeError,
  type ListAdapter,
  type ListPage,
} from "@/lib/list-page";
export {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  MAX_PAGE_SIZE,
  type ListConfig,
  type ListParams,
  type ListSort,
  type SortDirection,
} from "@/lib/list-params";
export {
  classifyListFailure,
  isExpectedRefusal,
  isSessionFailure,
  type ListFailure,
  type ListFailureKind,
} from "@/lib/list-failure";
