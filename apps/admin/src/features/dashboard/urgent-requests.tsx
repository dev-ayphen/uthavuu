"use client";

import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";

import { formatDate, ListFailureState } from "@/components/data";
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { reportDetailHref } from "@/features/moderation/routes";
import { cn } from "@/lib/cn";
import {
  PanelBodySkeleton,
  PanelCenter,
  PanelFootnote,
  PanelRow,
  PanelScroll,
} from "./panel";
import { formatCountdown } from "./urgency";
import { useUrgentRequests, type UrgentReport } from "./use-urgent-requests";

/**
 * Open help requests inside the 15-minute window, soonest first.
 *
 * WHAT MAKES A ROW APPEAR HERE IS NOT THIS FILE'S DECISION. The window is the
 * product's existing definition of "critical" — the same one that paints a card
 * red on a citizen's phone and the same one the "Critical open" tile above this
 * panel counts. See ./urgency for the three places it is written down, and
 * ./use-urgent-requests for the query.
 *
 * FOUR STATES, IN THIS ORDER: loading -> failure -> empty -> rows. Checking
 * empty before failure would render "No urgent requests" over a request that
 * never came back — telling an operator the queue is clear at the exact moment
 * they most need to know it isn't. The union in the hook makes that
 * unrepresentable; this file only renders the arm it is handed.
 *
 * This panel owns its own request, so a failure here leaves the counters above
 * and the flagged-comments panel beside it untouched.
 */

/**
 * The same query, on the full moderation table: open requests, soonest
 * deadline first. Static route + query string, so no `Route` cast is needed.
 * `sort=<key>:<direction>` is the URL form `readSort()` parses; the API's own
 * split `sort`/`order` pair is built from it by `listParamsToQuery`.
 */
const OPEN_QUEUE_HREF: Route = "/reports?status=open&sort=expiryAt:asc";

const FOOTNOTE_LINK =
  "rounded-control font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring";

export function UrgentRequests({ className }: { className?: string }) {
  const { view, isFetching, refetch } = useUrgentRequests();

  return (
    // A FLOOR AND A CEILING, NOT A FIXED HEIGHT.
    //
    // `min-h` keeps the two panels level with each other and with the activity
    // feed beside them at rest. `max-h` is what makes the scroll pane below
    // work: the card grows with its rows, stops at the ceiling, and from there
    // the rows scroll INSIDE it — so a busy queue can never push the counter
    // tiles off the page.
    //
    // Not a fixed height, because the empty state is the tallest thing this
    // card renders and the shortest thing it can be asked to fit. Pinned to
    // 12.5rem it overflowed its own card on a narrow column, spilling the copy
    // out of the border. Content-driven between two bounds fits both.
    <Card className={cn("flex min-h-[12.5rem] max-h-[18rem] flex-col", className)}>
      <CardHeader className="shrink-0">
        <CardTitle>
          <AlertTriangle className="size-4 text-danger-fg" />
          Urgent requests
        </CardTitle>
        {/* Not rendered in "failure": ListFailureState carries its own retry,
            and two of them disagree about which one worked. */}
        {view.kind !== "loading" && view.kind !== "failure" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={isFetching}
            className="-mr-1.5"
          >
            <RotateCcw className={cn(isFetching && "animate-spin")} />
            <span className="sr-only">Refresh urgent requests</span>
          </Button>
        ) : null}
      </CardHeader>

      {/* min-h-0 lets this shrink once the card hits its ceiling; without it
          the pane grows to fit its rows, the scroll escapes to the document,
          and the card header slides away with the content. `flex-auto` rather
          than `flex-1` so the rows still size the card below that ceiling —
          see PanelScroll for why the difference matters here. */}
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
          // A genuinely good result, and it has to read like one. "No urgent
          // requests" is not an error and not an absence of data — it is the
          // queue being clear, which is what the window is measured for.
          <PanelCenter>
            <EmptyState
              className="my-auto py-4"
              icon={<CheckCircle2 className="size-7" />}
              title="No urgent requests"
              description="Nothing open is within 15 minutes of expiring. Requests appear here as their deadline closes in."
            />
          </PanelCenter>
        ) : (
          <PanelScroll>
            <ul className="divide-y divide-border">
              {view.rows.map((report) => (
                <li key={report.id}>
                  <UrgentRow report={report} />
                </li>
              ))}
            </ul>

            <PanelFootnote>
              {/* A saturated page cannot tell how many more there are, so it
                  says "more" rather than naming a total it did not measure. The
                  "Critical open" tile above counts them all. */}
              {view.truncated ? (
                <>Showing the {view.rows.length} soonest; more are inside the window. </>
              ) : (
                <>That’s every open request inside the 15-minute window. </>
              )}
              <Link href={OPEN_QUEUE_HREF} className={FOOTNOTE_LINK}>
                Open the queue
              </Link>
            </PanelFootnote>
          </PanelScroll>
        )}
      </CardBody>
    </Card>
  );
}

function UrgentRow({ report }: { report: UrgentReport }) {
  // Category label, then where, then who is on it. Each part is dropped when
  // the API did not send it — an empty separator reads as missing data.
  const facts = [
    report.category.label,
    report.landmark,
    describeVolunteers(report),
  ].filter((part) => part !== null);

  return (
    <PanelRow
      href={reportDetailHref(report.id)}
      accent="rose"
      icon={
        report.category.emoji ? (
          <span className="text-[13px] leading-none">{report.category.emoji}</span>
        ) : (
          <AlertTriangle className="size-3.5" />
        )
      }
      // The countdown is the point of the row, so it carries the danger token
      // rather than the muted one every other panel's meta column uses.
      metaClassName="tabular font-semibold text-danger-fg"
      meta={
        // The absolute IST deadline on hover: "6m left" is the scannable form,
        // but coordinating with anyone needs the real time.
        <span title={formatDate(report.expiryAt, true) ?? undefined}>
          {formatCountdown(report.remainingMs)}
        </span>
      }
    >
      <span className="block truncate font-medium text-fg" title={report.title}>
        {report.title}
      </span>
      {facts.length > 0 ? (
        <span className="mt-0.5 block truncate text-[11px] text-fg-faint">
          {facts.join(" · ")}
        </span>
      ) : null}
    </PanelRow>
  );
}

/**
 * "Nobody helping yet" / "1 of 2 helping".
 *
 * Null when the API sent no volunteer counts, so the row simply omits the fact
 * instead of claiming nobody has responded — which is the one thing on this
 * panel most likely to send someone chasing a request that is already covered.
 * `activeVolunteers` counts CONFIRMED volunteers only: a volunteer still inside
 * their 15-minute confirmation window has not started helping, and the API
 * counts them the same way for the "Active missions" tile.
 */
function describeVolunteers(report: UrgentReport): string | null {
  const active = report.activeVolunteers;
  if (active === null) return null;
  if (active === 0) return "nobody helping yet";
  const needed = report.neededVolunteers;
  return needed === null ? `${active} helping` : `${active} of ${needed} helping`;
}
