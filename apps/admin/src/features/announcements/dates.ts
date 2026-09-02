/**
 * `<input type="datetime-local">` <-> ISO 8601, pinned to IST.
 *
 * WHY A HARDCODED OFFSET AND NOT THE BROWSER'S ZONE
 * ───────────────────────────────────────────────────────────────────────────
 * A `datetime-local` input has no timezone: whatever the operator types is
 * interpreted in the BROWSER's zone. Everything else in this console renders
 * dates through `formatDate`, which is pinned to `Asia/Kolkata` on purpose
 * (see `src/components/data/cells.tsx`) — "Uthavu is a Tamil Nadu product,
 * moderators work in IST, and letting the environment decide makes the same row
 * read differently between a laptop and a Vercel region."
 *
 * Leave the input on the browser's zone and those two disagree. An operator on
 * a UTC laptop types 09:00, the table renders 14:30, and the only available
 * conclusion is that the console corrupted the value. So the editor is pinned
 * to the same zone the table reads in: what you type is what you see.
 *
 * The offset is a literal +05:30 rather than an `Intl` round trip because
 * India has observed a fixed +05:30 with no DST since 1945 — there is no
 * transition for a fixed offset to be wrong across. If that ever changes, this
 * is the one file to fix, and the two functions below are exact inverses so a
 * value survives a load/save round trip unchanged.
 */

const IST_OFFSET_MINUTES = 330;
const IST_SUFFIX = "+05:30";

/** Shown next to every time field, so nobody has to guess whose clock this is. */
export const TIMEZONE_LABEL = "IST";

/** ISO instant -> `YYYY-MM-DDTHH:mm` in IST. Empty string for null/unparseable. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  // Shift the instant, then read it back in UTC: `toISOString()` is the only
  // formatter guaranteed to produce the exact `YYYY-MM-DDTHH:mm` the input
  // element requires, in every locale.
  return new Date(parsed.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` in IST -> epoch ms. `null` for blank or unparseable. */
export function localInputToTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Some browsers hand back seconds when the user picks them; normalise so the
  // suffix always lands on a complete time.
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00`
    : trimmed;
  const ms = Date.parse(`${withSeconds}${IST_SUFFIX}`);
  return Number.isNaN(ms) ? null : ms;
}

/** `YYYY-MM-DDTHH:mm` in IST -> ISO instant. `null` for blank or unparseable. */
export function localInputToIso(value: string): string | null {
  const ms = localInputToTimestamp(value);
  return ms === null ? null : new Date(ms).toISOString();
}
