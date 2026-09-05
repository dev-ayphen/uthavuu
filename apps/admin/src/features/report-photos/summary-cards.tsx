"use client";

import { CalendarClock, ShieldAlert, ShieldQuestion } from "lucide-react";

import { Alert, Skeleton, StatCard } from "@/components/ui";
import { usePhotoVerificationSummary } from "./use-photo-verification-summary";

/**
 * The three figures above the queue, from `GET /admin/report-photos/summary`.
 *
 * NULL IS NOT ZERO, AND NEITHER IS AN ERROR
 * ───────────────────────────────────────────────────────────────────────────
 * Each card shows a real number or an em dash — never a plausible-looking 0. A
 * "0" beside Pending review reads as "checked, nothing waiting"; the truth when
 * the API sends nothing is "we don't know". An operator ACTS on the first and
 * INVESTIGATES the second, so the two must not render identically. Same
 * discipline the dashboard's counters are built on, and the same reason
 * `readSummary` refuses to coerce.
 *
 * A FAILED SUMMARY DOES NOT BLANK THE QUEUE. This block owns its own request
 * and its own failure: the table below is a separate query and must keep
 * working when the counters do not. The failure is stated once, quietly, rather
 * than thrown as a page-level error state over a perfectly good list.
 *
 * ⚠️ "FLAGGED FOR REVIEW" IS NOT "WAITING FOR A DECISION", AND THE CARD SAYS SO
 * ───────────────────────────────────────────────────────────────────────────
 * The card below used to be labelled "Pending review". It is not that number.
 * `GET /admin/report-photos/summary` computes `pendingReview` as
 * `count(*) filter (where key = 'review_required')`
 * (`admin-report-photos.service.ts`) — `review_required` ALONE. The queue under
 * it rests on `status=awaiting`, which the same API defines as the UNION of
 * `review_required` and `failed`. The two do not count the same population.
 *
 * That gap is not academic. `failed` is what the API records when the provider
 * never answered, and with no AWS credentials configured — every environment
 * today — every upload lands there. So this card reads "0" while the queue
 * below it is full. A zero beside "Pending review" is the single most dangerous
 * sentence this page can say: it means "checked, nothing to do" to an operator
 * who then walks away from a full queue.
 *
 * FIXED IN THE API, 2026-09-05. `pendingReview` used to count only
 * `review_required`, so with no provider configured — every environment today —
 * the card read 0 above a full queue and the sidebar badge went silent. It now
 * counts the same `awaiting` union the queue rests on (`review_required` +
 * `failed`, excluding anything already reviewed), so this card and the queue
 * below it can no longer disagree.
 *
 * The label therefore says "waiting for a decision" rather than "flagged": the
 * number includes photos nothing ever examined, and calling those "flagged"
 * would imply a finding that does not exist. The queue itself still separates
 * the two — that distinction is the moderator's job to see, not the card's.
 *
 * THE "TODAY" CARD IS DELIBERATELY VAGUE, because the contract is. The endpoint
 * returns a figure called `today` and does not say which timestamp it counts —
 * submitted, verified, or decided. Naming it "Submitted today" would be this
 * console inventing a definition and an operator acting on it. It is labelled
 * for what it is and its footnote says the basis is unstated.
 */
export function PhotoVerificationSummary() {
  const { summary, isLoading, isError } = usePhotoVerificationSummary();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-card" />
        ))}
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <Alert tone="neutral" align="center" icon={ShieldQuestion} dashed>
        The queue counters couldn’t be loaded, so they’re hidden rather than shown as zero. The
        list below is unaffected.
      </Alert>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        label="Waiting for a decision"
        value={format(summary.pendingReview)}
        // Both kinds: photos the check flagged, and photos it never examined.
        // Both need a person; neither is resolved. The queue below distinguishes
        // them, which is where that distinction actually helps.
        sublabel="Photos held for a person — flagged by the automated check, or never examined by it."
        note={summary.pendingReview === null ? "not counted" : undefined}
        icon={ShieldQuestion}
        accent="amber"
      />
      <StatCard
        label="High risk"
        value={format(summary.highRisk)}
        // A subset of the card beside it, so it inherits the same blind spot:
        // an unchecked photo has no measured risk at all and can never appear
        // here, whatever the photograph turns out to show.
        sublabel="Scored high by the check. Unchecked photos have no score and are never counted."
        note={summary.highRisk === null ? "not counted" : undefined}
        icon={ShieldAlert}
        accent="rose"
      />
      <StatCard
        label="Today"
        value={format(summary.today)}
        sublabel="The API doesn’t state which timestamp this counts"
        note={summary.today === null ? "not counted" : undefined}
        icon={CalendarClock}
        accent="blue"
      />
    </div>
  );
}

/** An em dash for "no number". Never `?? 0`. */
function format(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en-IN").format(value);
}
