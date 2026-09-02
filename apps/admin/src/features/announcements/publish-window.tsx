import { formatDate } from "@/components/data";

/**
 * When an update is visible — start, end, or neither.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ───────────────────────────────────────────────────────────────────────────
 * It never says "expired", "scheduled" or "live". Those are STATUS, the API
 * derives them, and re-deriving status in the browser from two timestamps is
 * exactly the mistake `ReportStatusBadge` exists to warn about — the console and
 * the database end up disagreeing and the console is the one that gets believed.
 * Here it renders two dates, honestly, and the badge beside it renders the
 * status the API sent.
 *
 * Both dates are formatted through the shared `formatDate`, which is pinned to
 * Asia/Kolkata — the same zone the editor writes in (see ./dates.ts), so a value
 * reads back exactly as it was typed. The zone is named once by whatever labels
 * this component (a column header, a DetailField) rather than repeated on every
 * line, which at two dates per row is noise.
 */
export function PublishWindow({
  publishAt,
  expiresAt,
  className,
}: {
  publishAt: string | null;
  expiresAt: string | null;
  className?: string;
}) {
  const from = formatDate(publishAt, true);
  const to = formatDate(expiresAt, true);

  if (!from && !to) {
    return (
      <span className={className}>
        <span className="text-fg-faint select-none">No window set</span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="tabular block whitespace-nowrap text-fg-subtle">
        {from ? `From ${from}` : "From publication"}
      </span>
      <span className="tabular block whitespace-nowrap text-[11px] text-fg-faint">
        {to ? `Until ${to}` : "No end date"}
      </span>
    </span>
  );
}
