import { formatDate } from "@/components/data";

/**
 * When a campaign runs — start, end, or neither.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ───────────────────────────────────────────────────────────────────────────
 * It never says "expired", "scheduled" or "live". Those are STATUS, the API
 * derives them in SQL against the database's clock
 * (`apps/api/src/sponsors/sponsor-status.ts`), and re-deriving them in a
 * browser is the mistake `SponsorStatusBadge` exists to warn about. Here it
 * renders two dates, honestly, and the badge beside it renders the status the
 * API sent.
 *
 * The two nulls are not the same absence, and the schema is explicit about it:
 * no start date means "live the moment it is activated", no end date means
 * "runs until somebody pauses it". Rendering both as "—" would hide a real,
 * chosen setting behind the same glyph used for missing data.
 *
 * Both dates are formatted through the shared `formatDate`, pinned to
 * Asia/Kolkata — the same zone the editor writes in (see ./dates.ts), so a
 * value reads back exactly as it was picked. The zone is named once by whatever
 * labels this component (a column header, a DetailField) rather than repeated
 * on every line, which at two dates per row is noise.
 */
export function CampaignWindow({
  startDate,
  endDate,
  className,
}: {
  startDate: string | null;
  endDate: string | null;
  className?: string;
}) {
  const from = formatDate(startDate);
  const to = formatDate(endDate);

  if (!from && !to) {
    return (
      <span className={className}>
        <span className="text-fg-faint select-none">Runs whenever it&rsquo;s active</span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span
        className="tabular block whitespace-nowrap text-fg-subtle"
        title={from ? `Runs from the start of ${from}, IST.` : undefined}
      >
        {from ? `From ${from}` : "From activation"}
      </span>
      {/*
        THE TWO BOUNDS ARE NOT SYMMETRIC, AND THE WORD "UNTIL" HIDES IT.
        The API's predicate is `start_date <= now() AND end_date > now()`
        (apps/api/src/sponsors/sponsor-status.ts) and this console writes each
        picked day as midnight IST (./dates.ts) — so the start day IS included
        and the end day is NOT. Verified against the running API on 2026-09-02:
        a campaign whose end date was today already read `Expired` and served
        nothing.

        The cell keeps its short label — this column is 12rem and two dates a
        row — and the tooltip carries the precision, while the FORM says it in
        full at the point the operator picks the date. What this must never do
        is subtract a day to display "the last day it runs": that would be a
        second implementation of a backend rule, in a browser, which is exactly
        what `SponsorStatusBadge` exists to warn against.
      */}
      <span
        className="tabular block whitespace-nowrap text-[11px] text-fg-faint"
        title={
          to
            ? `Stops at the start of ${to}, IST — the last day it runs is the day before.`
            : "No end date: it runs until somebody pauses it."
        }
      >
        {to ? `Until ${to}` : "No end date"}
      </span>
    </span>
  );
}
