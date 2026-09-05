// Shared draft state shape for the report flow — one source of truth for
// ReportFlowScreen and each step component's props.

// Matches CreateReportSchema/UpdateReportSchema server-side (apps/api/src/reports/dto) —
// long enough to reject "help"/"asap" without being onerous for a genuine request.
export const DESCRIPTION_MIN_LENGTH = 20;

/**
 * Where one captured photo is in the verification round trip.
 *
 *   verifying — the upload is in flight; no verdict exists yet.
 *   pass      — attachable, and publishes with the report immediately.
 *   review    — attachable, but attaching it HOLDS the whole report.
 *   reject    — refused. There is no upload id; the photo cannot be attached
 *               and the only way forward is a new capture.
 *   failed    — the request never produced a verdict (offline, rate-limited,
 *               server error). Deliberately NOT folded into `reject`: one means
 *               "this picture is not allowed", the other means "we never got to
 *               look", and telling a person the first when the second happened
 *               is both wrong and unfixable from their side.
 */
export type PhotoDraftState = 'verifying' | 'pass' | 'review' | 'reject' | 'failed';

export type PhotoDraft = {
  /**
   * Identity for this capture attempt, and the key every async update matches
   * on. NOT the local URI: two captures can in principle land on the same path,
   * and matching on the URI would let a late response for a removed photo write
   * itself onto its replacement. A `map` keyed on this simply finds nothing when
   * the entry is gone, which is the behaviour a removed-mid-upload photo needs.
   */
  key: string;
  localUri: string;
  /** Set for 'pass' and 'review' only — the currency `POST /reports` accepts. */
  uploadId: string | null;
  state: PhotoDraftState;
  /**
   * The API's machine reason code, untranslated. Rendered through
   * photoVerdictCopy.ts; never shown raw, and never accompanied by a score,
   * label, threshold or provider name.
   */
  reason: string | null;
  /** Already-localised text for `state === 'failed'` only. */
  error: string;
};

export type ReportDraft = {
  photos: PhotoDraft[];
  title: string;
  description: string;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  landmark: string;
  anonymous: boolean;
  phoneVisible: boolean;
  neededVolunteers: number;
  customExpiryHours: number | null;
};

// BR-2's default expiry is stored in minutes; this is purely a display label
// (e.g. "6 hours", "3 days") — the server computes the real expiry_at.
export function formatExpiryMinutes(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export const EMPTY_DRAFT: ReportDraft = {
  photos: [],
  title: '',
  description: '',
  lat: null,
  lng: null,
  locationLabel: '',
  landmark: '',
  anonymous: false,
  phoneVisible: false,
  neededVolunteers: 1,
  customExpiryHours: null,
};
