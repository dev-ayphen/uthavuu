import type {
  PhotoStatusRef,
  ReportPhotoContext,
  ReportPhotoDetail,
  ReportPhotoSummary,
} from "./types";

/**
 * Tolerant readers for the two fields of the report-photos contract whose shape
 * is genuinely ambiguous, plus the summary.
 *
 * WHY TOLERANCE, HERE AND NOWHERE ELSE
 * ───────────────────────────────────────────────────────────────────────────
 * This console was built against a contract while the endpoints behind it were
 * still being written. Guessing wrong on a field means the page renders
 * "undefined" at a moderator, and the two places a reasonable API author could
 * go either way are:
 *
 *   `verificationStatus` — every OTHER lookup table in this API is projected as
 *   `{ key, label }` (flag status, volunteer status), but reports project their
 *   derived status as a bare string. Both are precedents in the same codebase.
 *
 *   the detail's report context — the contract lists `reportTitle` flat on the
 *   row AND "report context (title, description, landmark, lat, lng, createdAt,
 *   reporter)" on the detail, which reads equally well as a nested `report`
 *   object or as more flat fields.
 *
 * So both are read from either shape. This is NOT a licence to parse defensively
 * everywhere — every other field is taken at face value, and a shape mismatch
 * there should fail loudly rather than degrade quietly.
 *
 * All pure. No React, no fetching — which is what makes it the part of this
 * feature with real unit tests.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Anything that is not a finite number becomes null. No `Number()` coercion. */
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Turn a `snake_case` lookup key into something readable.
 *
 * The FALLBACK only. When the API sends a label, its label wins — the labels
 * live in `photo_verification_statuses` and the API owns them, so a local map
 * would be a second source of truth and wrong the first time one is reworded.
 * Echoing a prettified key is still better than blanking: "Review Required"
 * tells an operator what state the row is in; an empty cell tells them nothing
 * and looks like missing data.
 */
export function humaniseKey(key: string): string {
  return key
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * `verificationStatus`, from either wire shape.
 *
 * Returns null only when there is genuinely nothing — which is a real state,
 * not an error: a row can exist before the decision engine has run.
 */
export function photoStatusRef(value: unknown): PhotoStatusRef | null {
  const asString = readString(value);
  if (asString) return { key: asString, label: humaniseKey(asString) };

  if (isRecord(value)) {
    const key = readString(value.key);
    if (!key) return null;
    return { key, label: readString(value.label) ?? humaniseKey(key) };
  }

  return null;
}

/**
 * The report this photo belongs to, from either wire shape.
 *
 * Reads the nested `report` object first and falls back to the flat fields, so
 * whichever way the endpoint ships, the Report Information panel is populated.
 * Returns null only when NEITHER shape carries anything — which is itself
 * meaningful and must be said out loud rather than rendered as blanks: a photo
 * still in quarantine has no report yet, because verification happens BEFORE
 * the report is created. That is the gate working, not data missing.
 */
export function reportContextOf(detail: ReportPhotoDetail): ReportPhotoContext | null {
  const nested = isRecord(detail.report) ? detail.report : null;

  const context: ReportPhotoContext = {
    title: readString(nested?.title) ?? readString(detail.reportTitle),
    description: readString(nested?.description) ?? readString(detail.reportDescription),
    landmark: readString(nested?.landmark) ?? readString(detail.reportLandmark),
    lat: readNumber(nested?.lat) ?? readNumber(detail.reportLat),
    lng: readNumber(nested?.lng) ?? readNumber(detail.reportLng),
    createdAt: readString(nested?.createdAt) ?? readString(detail.reportCreatedAt),
    reporter: readPerson(nested?.reporter) ?? detail.reporter ?? null,
  };

  const hasAnything =
    context.title !== null ||
    context.description !== null ||
    context.landmark !== null ||
    context.createdAt !== null ||
    context.reporter !== null ||
    (context.lat !== null && context.lng !== null);

  return hasAnything ? context : null;
}

function readPerson(value: unknown): { id: string | null; name: string | null } | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  if (id === null && name === null) return null;
  return { id, name };
}

/**
 * The summary counters, with the null/zero distinction preserved.
 *
 * `?? 0` is banned here for the same reason it is banned on the dashboard: a
 * fabricated zero beside "Pending review" tells an operator the queue is clear.
 * A missing figure must render as an em dash and say it is not counted.
 */
export function readSummary(body: unknown): ReportPhotoSummary {
  const record = isRecord(body) ? body : {};
  return {
    pendingReview: readNumber(record.pendingReview),
    highRisk: readNumber(record.highRisk),
    today: readNumber(record.today),
  };
}

/** `1.4 MB`, or null when the API sent no size. Never "0 B" for "unknown". */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
