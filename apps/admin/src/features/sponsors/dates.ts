/**
 * `<input type="date">` <-> ISO 8601, pinned to IST.
 *
 * WHY A HARDCODED OFFSET AND NOT THE BROWSER'S ZONE
 * ───────────────────────────────────────────────────────────────────────────
 * A `date` input has no timezone: whatever the operator picks is interpreted in
 * the BROWSER's zone. Everything else in this console renders dates through
 * `formatDate`, which is pinned to `Asia/Kolkata` on purpose (see
 * `src/components/data/cells.tsx`) — Uthavu is a Tamil Nadu product, operators
 * work in IST, and letting the environment decide makes the same row read
 * differently between a laptop and a Vercel region.
 *
 * Leave the input on the browser's zone and those two disagree. An operator on
 * a UTC laptop picks the 1st, the table renders the 31st, and the only
 * available conclusion is that the console corrupted the value.
 *
 * The offset is a literal +05:30 rather than an `Intl` round trip because India
 * has observed a fixed +05:30 with no DST since 1945 — there is no transition
 * for a fixed offset to be wrong across.
 *
 * WHY DATES AND NOT DATETIMES
 * ───────────────────────────────────────────────────────────────────────────
 * A sponsorship runs for days, not minutes. Offering hours and minutes would
 * imply a precision the product does not have and make every campaign window an
 * extra two decisions. `startDate` / `endDate` are typed `string | null` and
 * documented as ISO in the contract, so a day is written to the wire as the
 * instant that day BEGINS in IST.
 *
 * THE TWO FUNCTIONS ARE EXACT INVERSES. That is the property that matters: a
 * value loaded from the API, shown in the picker and saved again untouched
 * comes back as the same day. It holds whether the API returns a full instant
 * (`2026-09-01T00:00:00+05:30`) or a bare date (`2026-09-01`), because both
 * land on 1 September when read in IST.
 */

const IST_OFFSET_MINUTES = 330;
const IST_SUFFIX = "T00:00:00+05:30";

/** Shown next to every date field, so nobody has to guess whose calendar this is. */
export const TIMEZONE_LABEL = "IST";

/** ISO instant (or bare date) -> `YYYY-MM-DD` in IST. Empty string for null/unparseable. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  // Shift the instant, then read it back in UTC: `toISOString()` is the only
  // formatter guaranteed to produce the exact `YYYY-MM-DD` the input element
  // requires, in every locale.
  return new Date(parsed.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` -> epoch ms at 00:00 IST. `null` for blank or unparseable. */
export function dateInputToTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // A browser that cannot render a native picker falls back to a text box, so
  // an unparseable value is reachable rather than theoretical.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const ms = Date.parse(`${trimmed}${IST_SUFFIX}`);
  return Number.isNaN(ms) ? null : ms;
}

/** `YYYY-MM-DD` -> ISO instant at 00:00 IST. `null` for blank or unparseable. */
export function dateInputToIso(value: string): string | null {
  const ms = dateInputToTimestamp(value);
  return ms === null ? null : new Date(ms).toISOString();
}
