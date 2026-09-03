import { Globe, MapPin } from "lucide-react";

import type { AdminBroadcast } from "./types";

/**
 * Who a broadcast selects — the single most consequential field on the record.
 *
 * WHY THE DISTRICT IS SHOWN IN QUOTES AND VERBATIM
 * ───────────────────────────────────────────────────────────────────────────
 * `broadcasts.district` is matched with an equality comparison against
 * `user.district`, which is itself free text written by the mobile client's
 * reverse-geocode. There is no districts table to key against, so the match is
 * exact and a spelling that differs by one character selects NOBODY — silently,
 * with a successful-looking send behind it. Rendering the stored string
 * verbatim, quoted, is what lets an operator spot "Chenai" before they press
 * Send rather than after.
 *
 * The label beside it comes from the API's lookup table, so a `district`
 * audience reads as whatever the backend calls it ("A single district" today).
 */
export function AudienceSummary({
  record,
  className,
}: {
  record: Pick<AdminBroadcast, "audience" | "district">;
  className?: string;
}) {
  const targeted = record.audience.key === "district";

  return (
    <span className={className}>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-fg">
        {targeted ? (
          <MapPin aria-hidden className="size-3.5 shrink-0 text-fg-faint" />
        ) : (
          <Globe aria-hidden className="size-3.5 shrink-0 text-fg-faint" />
        )}
        <span className="truncate">
          {targeted && record.district ? `“${record.district}”` : record.audience.label}
        </span>
      </span>
      {targeted ? (
        <span className="block truncate text-[11px] text-fg-faint">
          {record.district ? record.audience.label : "District missing — this cannot be sent"}
        </span>
      ) : (
        <span className="block truncate text-[11px] text-fg-faint">
          Everyone who can sign in
        </span>
      )}
    </span>
  );
}
