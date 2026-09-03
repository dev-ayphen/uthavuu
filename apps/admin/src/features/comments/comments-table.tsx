"use client";

import { useState } from "react";
import { Flag, MessageSquare } from "lucide-react";

import {
  DataTable,
  DateCell,
  FilterBar,
  ListPagination,
  offsetListAdapter,
  PersonCell,
  RemovedContentCell,
  useListQuery,
  useListState,
  type DataTableColumn,
  type FilterDef,
  type ListConfig,
} from "@/components/data";
import { Alert, Badge, Button } from "@/components/ui";
import { apiFetch } from "@/lib/api-client";
import { MODERATION_TABLE } from "@/features/moderation/table-surface";
import { CommentActions } from "./comment-actions";
import { CommentDetailDialog } from "./comment-detail-dialog";
import type { AdminCommentRow } from "./types";

const COMMENT_KEYS = [["admin", "comments"], ["admin", "flagged-comments"]];

/**
 * Public Community Comments, newest first.
 *
 * `ListAdminCommentsSchema` defaults `includeRemoved` to `"false"`, so that is
 * the resting value here. Getting this wrong is the difference between an empty
 * table saying "No comments yet" and one saying "nothing matched your filters"
 * — and the second sentence, on a page whose default view is deliberately
 * narrowed server-side, would send a moderator hunting for a filter they never
 * set.
 *
 * `flagged` is genuinely tri-state in the DTO (absent = no opinion), so it gets
 * a blank "Any" option. `includeRemoved` is not — it has a real default — so it
 * gets two explicit options instead, for the same reason `audience` does on the
 * Users page: an empty value would be dropped from the request and the API
 * would silently re-apply `false` while the select read "All".
 *
 * NO SORT CONTROLS. The endpoint takes no `sort`/`order` — it is hard-ordered
 * `createdAt desc`. No column declares a `sortKey`, so no header advertises a
 * control that does not exist.
 */
export const COMMENTS_LIST: ListConfig = {
  defaultSort: null,
  filterKeys: ["includeRemoved", "flagged", "reportId", "authorId"],
  defaultFilters: { includeRemoved: "false" },
};

const FILTERS: readonly FilterDef[] = [
  {
    id: "includeRemoved",
    label: "Removed",
    options: [
      { value: "false", label: "Live only" },
      { value: "true", label: "Include removed" },
    ],
  },
  {
    id: "flagged",
    label: "Flags",
    allLabel: "Any",
    options: [
      { value: "true", label: "Flagged" },
      { value: "false", label: "Never flagged" },
    ],
  },
];

export function CommentsTable() {
  const { params: listParams } = useListState();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { view, page, rows, params, isFetching, isPlaceholder, refetch } = useListQuery<
    unknown,
    AdminCommentRow
  >({
    key: ["admin", "comments"],
    adapter: offsetListAdapter<AdminCommentRow>(),
    fetcher: ({ searchParams, signal }) => apiFetch("/admin/comments", { searchParams, signal }),
  });

  // The open dialog reads from the LIVE row, not from a snapshot taken when it
  // was opened. Removing a comment from inside the dialog invalidates the list;
  // holding a copy would leave the panel still offering "Remove" on a comment
  // that is now removed, and the operator would send the action twice.
  const selected = selectedId === null ? null : (rows.find((row) => row.id === selectedId) ?? null);

  const columns: ReadonlyArray<DataTableColumn<AdminCommentRow>> = [
    {
      id: "body",
      header: "Comment",
      primary: true,
      width: "22rem",
      skeletonWidth: "85%",
      // RemovedContentCell strikes the text through behind a "Removed" badge
      // rather than blanking it. A moderation log you cannot read is not a log.
      cell: (row) => <RemovedContentCell body={row.body} removed={row.removed} />,
    },
    {
      id: "author",
      header: "Author",
      width: "10rem",
      skeletonWidth: "60%",
      // `author.deleted` renders as "Deleted account" — the comment outlives
      // the account that wrote it, and the row has to say so.
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <PersonCell
            person={{
              id: row.author.id ?? undefined,
              name: row.author.name,
              avatarUrl: row.author.avatarUrl,
              deleted: row.author.deleted,
            }}
          />
          {row.authorIsReporter ? (
            <Badge tone="info" className="shrink-0" title="Wrote this on their own request.">
              OP
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: "report",
      header: "On report",
      width: "11rem",
      skeletonWidth: "70%",
      cell: (row) => (
        <span className="block min-w-0 truncate text-xs text-fg-subtle" title={row.report.title}>
          {row.report.category.emoji ? `${row.report.category.emoji} ` : ""}
          {row.report.title}
        </span>
      ),
    },
    {
      id: "flags",
      header: "Flags",
      align: "end",
      width: "5rem",
      skeletonWidth: "2rem",
      cell: (row) =>
        row.flagCount === 0 ? (
          <span className="text-fg-faint select-none">—</span>
        ) : (
          <Badge tone="warning">
            <Flag className="size-2.5" aria-hidden />
            {row.flagCount}
          </Badge>
        ),
    },
    {
      id: "createdAt",
      header: "Posted",
      width: "9.5rem",
      skeletonWidth: "5rem",
      cell: (row) => <DateCell value={row.createdAt} relative />,
    },
    {
      id: "actions",
      header: "Actions",
      // `interactive` stops a click on these buttons also triggering the row's
      // own click handler.
      interactive: true,
      align: "end",
      width: "13.5rem",
      skeletonWidth: "6rem",
      cell: (row) => (
        <span className="flex items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(row.id)}>
            View
          </Button>
          <CommentActions
            commentId={row.id}
            removed={row.removed}
            preview={row.body}
            invalidateKeys={COMMENT_KEYS}
          />
        </span>
      ),
    },
  ];

  const scoped = listParams.filters.reportId ?? listParams.filters.authorId;

  return (
    <div className="space-y-4">
      <FilterBar
        filters={FILTERS}
        searchPlaceholder="Search comment text…"
        searchLabel="Search comments"
        resultCount={page?.total ?? null}
        resultNoun="comment"
      />

      {scoped ? (
        <Alert tone="primary" align="center" icon={MessageSquare}>
          Scoped to one {listParams.filters.reportId ? "report" : "author"}. Use “Clear all” to see
          every comment.
        </Alert>
      ) : null}

      <DataTable
        view={view}
        columns={columns}
        rowKey={(row) => row.id}
        onRowSelect={(row) => setSelectedId(row.id)}
        selectedRowKey={selected?.id ?? null}
        caption="Community comments"
        className={MODERATION_TABLE}
        onRetry={refetch}
        isPlaceholder={isPlaceholder}
        loadingRows={Math.min(params.pageSize, 10)}
        // Sized so the Remove button is reachable without scrolling sideways
        // on a 1440px laptop — it is the point of the page, not an extra.
        minWidth="71rem"
        empty={{
          icon: <MessageSquare className="size-10" />,
          title: "No comments yet",
          description:
            "Community comments on help requests appear here. Removed comments are excluded until you switch the Removed filter.",
        }}
        filteredEmptyTitle="No comments match these filters"
        filteredEmptyDescription="Nothing matches what you're filtering on. Widen the filters or clear them to see the whole conversation again."
        footer={<ListPagination page={page} isFetching={isFetching} />}
      />

      <CommentDetailDialog
        comment={selected}
        onClose={() => setSelectedId(null)}
        invalidateKeys={COMMENT_KEYS}
      />
    </div>
  );
}
