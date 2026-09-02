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
      <span className="tabular block whitespace-nowrap text-fg-subtle">
        {from ? `From ${from}` : "From activation"}
      </span>
      <span className="tabular block whitespace-nowrap text-[11px] text-fg-faint">
        {to ? `Until ${to}` : "No end date"}
      </span>
    </span>
  );
}
