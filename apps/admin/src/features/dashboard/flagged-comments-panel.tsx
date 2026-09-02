"use client";

import Link from "next/link";
import type { Route } from "next";
import { Flag, RotateCcw, ShieldCheck } from "lucide-react";

import { formatDate, ListFailureState, RelativeTime, RemovedContentCell } from "@/components/data";
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { FlagStatusBadge } from "@/features/comments/flag-actions";
import { cn } from "@/lib/cn";
import {
  PanelBodySkeleton,
  PanelCenter,
  PanelFootnote,
  PanelRow,
  PanelScroll,
} from "./panel";
import { useFlaggedComments, type FlaggedCommentSummary } from "./use-flagged-comments";

/**
 * The newest comment flags waiting for review.
 *
 * THIS PANEL WAS RELABELLED, NOT INVENTED
 * ───────────────────────────────────────────────────────────────────────────
 * The dashboard design called this card "Latest flagged reports". Reports
 * cannot be flagged in Uthavu — `report_comment_flags` is the only flag table
 * in the schema and there is no `report_flags` — so the card was pointing at a
 * feature that does not exist. `config/nav.ts` already made exactly this
 * correction for the sidebar ("Flagged Reports" -> "Flagged Comments") and
 * explains it at the entry; the wording here matches so the console cannot
 * disagree with itself about what can be flagged.
 *
 * There is deliberately NO placeholder for report flagging anywhere in this
 * file. A "coming soon" line is a promise, and promising a moderation queue
 * with no source is the fabrication this console keeps having to undo
 * (docs/_audit/issues.md issue 18).
 *
 * FOUR STATES, IN THIS ORDER: loading -> failure -> empty -> rows. "Nothing
 * waiting for review" is a real and welcome result; rendering it over a failed
 * request would tell a moderator their queue is clear when it is the API that
 * is gone. This panel owns its own request, so its failure leaves the counters
 * above and the urgent-requests panel beside it untouched.
 */

const REVIEW_QUEUE_HREF: Route = "/reports/flagged";

const FOOTNOTE_LINK =
  "rounded-control font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The existing moderation screen, scoped to one report's flags.
 *
 * `reportId` is a declared filter key on that page (FLAGGED_COMMENTS_LIST), so
 * the scope shows up as an active filter with a working "Clear all" rather than
 * being silently dropped on the next page change. Static route + query, so no
 * `Route` cast is needed; `encodeURIComponent` because the id comes from an API
 * response, and a stray `&` or `#` in one would change which page this opens.
 */
function reviewHref(reportId: string | null): Route {
  if (!reportId) return REVIEW_QUEUE_HREF;
  return `/reports/flagged?reportId=${encodeURIComponent(reportId)}`;
}

export function FlaggedCommentsPanel({ className }: { className?: string }) {
  const { view, isFetching, refetch } = useFlaggedComments();

  return (
    // Floor + ceiling, then the rows scroll inside the ceiling — the same
    // bounding as the panel above it, and for the same reason. See there.
    <Card className={cn("flex min-h-[12.5rem] max-h-[18rem] flex-col", className)}>
      <CardHeader className="shrink-0">
        <CardTitle>
          <Flag className="size-4 text-danger-fg" />
          Latest flagged comments
        </CardTitle>
        {view.kind !== "loading" && view.kind !== "failure" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={isFetching}
            className="-mr-1.5"
          >
            <RotateCcw className={cn(isFetching && "animate-spin")} />
            <span className="sr-only">Refresh flagged comments</span>
          </Button>
        ) : null}
      </CardHeader>

      {/* Same bounding as the panel above it: `min-h-0` so the pane can shrink
          at the ceiling, `flex-auto` so the rows size the card below it. */}
      <CardBody className="flex min-h-0 flex-auto flex-col px-0 pb-3">
        {view.kind === "loading" ? (
          <PanelBodySkeleton />
        ) : view.kind === "failure" ? (
          <PanelCenter>
            <div className="my-auto">
              <ListFailureState failure={view.failure} onRetry={refetch} />
            </div>
          </PanelCenter>
        ) : view.kind === "empty" ? (
          // "The queue is clear", NOT "nobody has ever flagged anything" —
          // there may be a hundred already resolved. Same distinction the
          // queue page itself draws in its empty copy.
          <PanelCenter>
            <EmptyState
              className="my-auto py-4"
              icon={<ShieldCheck className="size-7" />}
              title="Nothing waiting for review"
              description="Every comment flag has been dealt with. New ones land here as citizens report comments."
            />
          </PanelCenter>
        ) : (
          <PanelScroll>
            <ul className="divide-y divide-border">
              {view.rows.map((flag) => (
                <li key={flag.id}>
                  <FlaggedRow flag={flag} />
                </li>
              ))}
            </ul>

            <PanelFootnote>
              {/* Three different sentences, because the panel knows three
                  different things: the whole queue, a counted backlog, or a
                  backlog it could not count. */}
              {view.showingAll ? (
                <>That’s every flag waiting for review. </>
              ) : view.total !== null ? (
                <>
                  {view.total} {view.total === 1 ? "flag is" : "flags are"} waiting for review.{" "}
                </>
              ) : (
                <>More are waiting for review. </>
              )}
              <Link href={REVIEW_QUEUE_HREF} className={FOOTNOTE_LINK}>
                Open the review queue
              </Link>
            </PanelFootnote>
          </PanelScroll>
        )}
      </CardBody>
    </Card>
  );
}

function FlaggedRow({ flag }: { flag: FlaggedCommentSummary }) {
  return (
    <PanelRow
      href={reviewHref(flag.reportId)}
      accent="amber"
      icon={<Flag className="size-3.5" />}
      meta={
        flag.createdAt ? (
          <span title={formatDate(flag.createdAt, true) ?? undefined}>
            <RelativeTime value={flag.createdAt} />
          </span>
        ) : null
      }
    >
      {/* A comment a moderator already took down can still carry an open flag —
          the removal and the verdict are separate records. Struck through and
          badged, never blanked: a moderation log you cannot read is not
          reviewable. */}
      <RemovedContentCell body={flag.body} removed={flag.removed} />

      <span className="mt-1 flex min-w-0 items-center gap-1.5">
        <FlagStatusBadge status={flag.status} />
        {flag.reportTitle ? (
          <span className="truncate text-[11px] text-fg-faint" title={flag.reportTitle}>
            on {flag.reportTitle}
          </span>
        ) : null}
      </span>
    </PanelRow>
  );
}
