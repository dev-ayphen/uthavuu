"use client";

import Link from "next/link";
import { Flag } from "lucide-react";
import { useId } from "react";

import { formatDate, PersonCell } from "@/components/data";
import { Badge } from "@/components/ui";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/features/moderation/dialog";
import { reportDetailHref, userDetailHref } from "@/features/moderation/routes";
import { ReportStatusBadge } from "@/features/reports/report-status-badge";
import { CommentActions } from "./comment-actions";
import type { AdminCommentRow } from "./types";

/**
 * The full text of one comment, plus where it sits.
 *
 * WHY A DIALOG AND NOT A ROUTE
 * ───────────────────────────────────────────────────────────────────────────
 * There is no `GET /admin/comments/:id`. A detail route would have to fetch the
 * whole list and pick the row out of it, which stops working the moment the
 * comment is on page four. Everything a moderator needs is already in the list
 * response, so the honest shape is to open what we have rather than invent a
 * fetch for it.
 *
 * The cost is that this view is not linkable, which for a short comment matters
 * much less than it does for a report. If a by-id endpoint appears later, this
 * becomes a route with no change to the table.
 */
export function CommentDetailDialog({
  comment,
  onClose,
  invalidateKeys,
}: {
  comment: AdminCommentRow | null;
  onClose: () => void;
  invalidateKeys: string[][];
}) {
  const titleId = useId();

  return (
    <Dialog open={comment !== null} onClose={onClose}>
      {comment ? (
        <>
          <DialogHeader
            title="Comment"
            titleId={titleId}
            description={<span className="tabular">Posted {formatDate(comment.createdAt, true)}</span>}
            onClose={onClose}
          />

          <DialogBody>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {comment.removed ? <Badge tone="danger">Removed</Badge> : null}
                {comment.authorIsReporter ? (
                  <Badge tone="info" title="Written by the person who filed the report.">
                    Reporter
                  </Badge>
                ) : null}
                {comment.flagCount > 0 ? (
                  <Badge tone="warning">
                    <Flag className="size-2.5" aria-hidden />
                    {comment.flagCount} {comment.flagCount === 1 ? "flag" : "flags"}
                  </Badge>
                ) : null}
              </div>

              {/* Struck through, never blanked — the whole point of keeping the
                  row after a removal is that the decision stays reviewable. */}
              <blockquote
                className={
                  comment.removed
                    ? "rounded-control border border-border bg-surface-inset px-3 py-2.5 text-sm whitespace-pre-wrap text-fg-faint line-through"
                    : "rounded-control border border-border bg-surface-inset px-3 py-2.5 text-sm whitespace-pre-wrap text-fg"
                }
              >
                {comment.body}
              </blockquote>

              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="micro-label">Author</dt>
                  <dd className="mt-1">
                    {comment.author.id ? (
                      <Link
                        href={userDetailHref(comment.author.id)}
                        className="inline-flex rounded-control hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <PersonCell
                          person={{
                            id: comment.author.id,
                            name: comment.author.name,
                            avatarUrl: comment.author.avatarUrl,
                          }}
                        />
                      </Link>
                    ) : (
                      <PersonCell person={{ deleted: true }} />
                    )}
                  </dd>
                </div>

                <div className="min-w-0">
                  <dt className="micro-label">On report</dt>
                  <dd className="mt-1 flex min-w-0 items-center gap-2">
                    <span className="truncate text-fg" title={comment.report.title}>
                      {comment.report.category.emoji ? `${comment.report.category.emoji} ` : ""}
                      {comment.report.title}
                    </span>
                    <ReportStatusBadge status={comment.report.effectiveStatus} />
                  </dd>
                </div>

                {comment.removed ? (
                  <div className="min-w-0">
                    <dt className="micro-label">Removed</dt>
                    <dd className="tabular mt-1 text-fg">
                      {formatDate(comment.removedAt, true) ?? "—"}
                    </dd>
                  </div>
                ) : null}

                <div className="min-w-0">
                  <dt className="micro-label">Comment id</dt>
                  <dd className="mt-1">
                    <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                      {comment.id}
                    </code>
                  </dd>
                </div>
              </dl>
            </div>
          </DialogBody>

          <DialogFooter>
            <div className="flex items-center justify-between gap-3">
              <Link
                href={reportDetailHref(comment.report.id)}
                className="rounded-control text-xs font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open the report
              </Link>
              <CommentActions
                commentId={comment.id}
                removed={comment.removed}
                preview={comment.body}
                invalidateKeys={invalidateKeys}
              />
            </div>
          </DialogFooter>
        </>
      ) : null}
    </Dialog>
  );
}
