"use client";

import Link from "next/link";
import type { Route } from "next";
import { CheckCircle2, ImageOff, ShieldAlert } from "lucide-react";

import { Button, Card, CardBody, CardHeader, CardTitle, Skeleton } from "@/components/ui";
import { usePhotoVerificationSummary } from "@/features/report-photos/use-photo-verification-summary";
import { cn } from "@/lib/cn";
import { PanelCenter, PanelFootnote } from "./panel";

/**
 * "Photo Verification — N flagged by the automated check", on the dashboard.
 *
 * ⚠️ WHAT THIS NUMBER IS NOT. `summary.pendingReview` counts photos with status
 * `review_required` alone — the ones the check RAN on and flagged. Photos the
 * check never ran on are recorded `failed`, need a moderator just as much, and
 * are not in this figure (`admin-report-photos.service.ts`). With no moderation
 * provider configured — every environment today — every upload lands in
 * `failed`, so this panel can read zero above a full queue.
 *
 * That is why the zero state below does not say "nothing to do". It says what
 * was actually measured and sends the operator to the queue, which counts the
 * unchecked photos itself. See `config/nav-badges.ts` for the same note about
 * the sidebar badge, and the API-side fix both of them want.
 *
 * ONE REAL NUMBER, OR NONE. It renders `summary.pendingReview` from
 * `GET /admin/report-photos/summary` and nothing else. There is deliberately no
 * decorative second metric, no trend, and no "0" standing in for a figure the
 * API did not send: a number on a dashboard is a call to action, and an
 * operator who walks over to a queue that is not there stops trusting the next
 * one. `null` means "not counted" and says so; it never becomes a zero.
 *
 * It shares its cache entry with the sidebar badge and the queue page's cards,
 * so all three move together and cannot disagree after a refetch.
 *
 * This panel owns its own request and its own failure, exactly like the two
 * beside it: a 500 here must leave the urgent-requests panel and the counter
 * tiles alone.
 */

const QUEUE_HREF: Route = "/reports/photo-verification";

const FOOTNOTE_LINK =
  "rounded-control font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring";

export function PhotoVerificationPanel({ className }: { className?: string }) {
  const { summary, isLoading, isError, refetch } = usePhotoVerificationSummary();
  const pending = summary?.pendingReview ?? null;

  return (
    <Card className={cn("flex min-h-[12.5rem] max-h-[18rem] flex-col", className)}>
      <CardHeader className="shrink-0">
        <CardTitle>
          <ImageOff className="size-4 text-warning-fg" />
          Photo verification
        </CardTitle>
      </CardHeader>

      {/* min-h-0 so this pane can shrink inside the bounded card; without it the
          content sizes the pane, the scroll escapes to the document, and the
          card header slides away with it. */}
      <CardBody className="flex min-h-0 flex-auto flex-col pb-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
        ) : isError || !summary ? (
          <PanelCenter>
            <div className="my-auto text-center">
              <p className="text-xs text-fg-subtle">
                The queue count couldn’t be loaded, so it is hidden rather than shown as zero.
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          </PanelCenter>
        ) : pending === null ? (
          <PanelCenter>
            <p className="my-auto text-center text-xs text-fg-subtle">
              The API returns no count for this queue yet. Blank means “not counted”, not zero.
            </p>
          </PanelCenter>
        ) : pending === 0 ? (
          // A real zero, and it reads like one — but only for what it counts.
          // "Nothing awaiting review" would be a claim about the whole queue,
          // Counts BOTH flagged and never-examined photos since the API fix of
          // 2026-09-05, so an empty state here really does mean an empty queue.
          <PanelCenter>
            <div className="my-auto text-center">
              <CheckCircle2 aria-hidden className="mx-auto size-7 text-fg-faint" />
              <p className="mt-2 text-sm font-bold text-fg">Nothing waiting for a decision</p>
              <p className="mt-1 text-xs text-fg-subtle">
                Every held photo is counted here — flagged or never examined.</p>
            </div>
          </PanelCenter>
        ) : (
          <div className="flex min-h-0 flex-auto flex-col">
            <p className="tabular text-3xl leading-none font-extrabold tracking-tight text-warning-fg">
              {new Intl.NumberFormat("en-IN").format(pending)}
            </p>
            <p className="mt-1.5 text-xs font-bold text-fg">
              {pending === 1 ? "photo flagged by the check" : "photos flagged by the check"}
            </p>
            <p className="mt-1 text-[11px] text-fg-faint">
              Each one is a report nobody outside the console can see yet. Photos the check never
              ran on are waiting too, and aren’t in this count.
            </p>

            {/* Shown only when the API actually sent it — never as a zero. */}
            {summary.highRisk ? (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-danger-fg">
                <ShieldAlert aria-hidden className="size-3.5 shrink-0" />
                {summary.highRisk} scored high risk by the automated check
              </p>
            ) : null}
          </div>
        )}

        {!isLoading ? (
          <PanelFootnote>
            <Link href={QUEUE_HREF} className={FOOTNOTE_LINK}>
              Open the queue
            </Link>
          </PanelFootnote>
        ) : null}
      </CardBody>
    </Card>
  );
}
