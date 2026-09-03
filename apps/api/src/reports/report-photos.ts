/**
 * What `report_photos.captured_live` actually means.
 *
 * BR-1 says a report photo must be taken with the in-app camera rather than
 * picked from the gallery. The MOBILE CLIENT enforces that; this API does not
 * and currently cannot — there is no EXIF inspection, no capture token, nothing
 * server-side that could tell the two apart. `report-a-request.md` records it
 * as a known enforcement gap, and `reports-schema.ts` says the column stays
 * unconditionally true for v0.1.
 *
 * So the value is the CLIENT'S CLAIM, recorded unverified — not a fact this API
 * established. It was written as a bare `true` at three insert sites, which
 * read as three independent assertions of something nobody checks; grepping
 * `captured_live` found no reader anywhere in the API, the console or the app,
 * so the column is write-only and has held exactly one value for its whole
 * existence.
 *
 * Named rather than removed, because the column is worth keeping for the day
 * capture can be verified: when it can, this constant becomes a real per-photo
 * argument and every call site changes with it. Until then the name is the
 * caveat, carried to each insert.
 *
 * ⚠️ Do NOT read this column as provenance. Nothing has checked it.
 */
export const PHOTO_CAPTURE_UNVERIFIED = true;
