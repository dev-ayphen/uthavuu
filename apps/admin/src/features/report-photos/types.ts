/**
 * Shapes returned by the `/admin/report-photos` endpoints.
 *
 * ==========================================================================
 * THE ONE THING TO UNDERSTAND BEFORE EDITING ANY FILE IN THIS FEATURE
 * ==========================================================================
 * A report held for moderation has ZERO `report_photos` rows and no public
 * photo URL. That is deliberate backend behaviour, not a gap: the photo is
 * quarantined on `photo_uploads` and the `report_photos` relationship is
 * created by the BACKEND, in a transaction, only after a moderator approves.
 *
 * Two consequences this whole feature is built around:
 *
 *   1. Every image on these pages comes from the private, admin-authenticated
 *      route `GET /admin/report-photos/:id/file`. Never from `/uploads/**`,
 *      and therefore never through `resolveUploadUrl` / `UploadedPhoto`, which
 *      exist to re-home PUBLIC upload paths. See `private-photo.tsx`.
 *
 *   2. The console never manipulates report status. Approve / reject /
 *      request-new POST to the admin endpoint; the API re-checks state, runs
 *      its transaction, writes the audit row and transitions the report. What
 *      renders afterwards is the refetched server answer — never a badge
 *      flipped locally because a click returned 200.
 *
 * TWO FIELDS ARE READ TOLERANTLY, ON PURPOSE. `verificationStatus` and the
 * detail's report context are the two places the contract could reasonably ship
 * in either of two shapes, and this console is being written against an
 * endpoint that is still being built. `wire.ts` reads both shapes rather than
 * betting on one and rendering "undefined" if the bet loses. Everything else
 * here is taken at face value from the contract.
 */

import type { ReportStatus } from "@/features/reports/types";

/**
 * The backend's verdict. `apps/api/src/moderation/verification-decision.ts`.
 * Null until the decision engine has run.
 */
export type PhotoDecision = "pass" | "review" | "reject";

export type PhotoRiskLevel = "low" | "medium" | "high";

/**
 * Machine-readable cause of a non-PASS verdict, transcribed from
 * `DecisionReason` in the API's decision engine.
 *
 * CODES, NEVER PROSE — the API stores codes precisely so the console and the
 * mobile app can each word them for their own audience. `reason-copy.ts` owns
 * this console's wording; nothing here re-derives a threshold.
 */
export type PhotoDecisionReason =
  | "explicit-content"
  | "hate-symbols"
  | "unusable-quality"
  | "partial-nudity"
  | "swimwear-or-underwear"
  | "graphic-violence"
  | "visually-disturbing"
  | "weapons"
  | "drugs"
  | "not-photographic"
  | "category-mismatch"
  | "duplicate-image"
  | "verification-unavailable";

/**
 * Why an analysis could not be produced.
 *
 * ⚠️ Every one of these produces a verdict of `review` at `medium` risk with a
 * fully-populated, all-clear signal summary — and records the status as
 * `failed`, not `review_required`. Those values are RESTING DEFAULTS written so
 * the photo would queue for a person; none of them is a measurement, and none
 * of them may be rendered as one. `reason-copy.ts` (`automatedCheck`) is where
 * that rule lives, and it is a discriminated union so a call site cannot reach
 * for a risk band that was never taken.
 */
export type PhotoUnavailableReason =
  | "not-configured"
  | "timeout"
  | "throttled"
  | "rejected-image"
  | "provider-error"
  | "invalid-response";

/**
 * The stored signal summary — the bands each category landed in, NOT the
 * provider's raw response.
 *
 * Every field is optional here even though the API's own type has them all
 * required: a row verified by an older build, or one whose `signals` column is
 * still null, must render as "not recorded" rather than as `undefined`.
 */
export type PhotoSignals = {
  imageQuality?: "pass" | "poor" | "unknown";
  nudity?: "none" | "partial" | "explicit";
  sexualContent?: "none" | "detected";
  violence?: "none" | "low" | "medium" | "high";
  drugs?: "none" | "possible";
  weapons?: "none" | "possible";
  categoryRelevance?: "high" | "low" | "unchecked";
  /** "Is this a photograph at all". NOT manipulation or AI-generation detection. */
  notPhotographic?: boolean;
  duplicate?: boolean;
  overallRisk?: PhotoRiskLevel;
  decision?: PhotoDecision;
};

/** A lookup-table reference, once `wire.ts` has normalised it. */
export type PhotoStatusRef = { key: string; label: string };

export type PhotoPerson = { id: string | null; name: string | null };

/** One row of `GET /admin/report-photos`. */
export type ReportPhotoRow = {
  id: string;
  reportId: string | null;
  reportTitle: string | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  reporter: PhotoPerson | null;
  createdAt: string;
  verifiedAt: string | null;
  /** `photo_verification_statuses`. String or `{key,label}` on the wire. */
  verificationStatus: string | PhotoStatusRef | null;
  decision: PhotoDecision | null;
  riskLevel: PhotoRiskLevel | null;
  /** ONLY the reasons the backend says actually fired. Never re-derived here. */
  reasons: PhotoDecisionReason[] | null;
  reportStatus: ReportStatus | null;
};

/** The report this photo was attached to, however the endpoint nests it. */
export type ReportPhotoContext = {
  title: string | null;
  description: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string | null;
  reporter: PhotoPerson | null;
};

/** `GET /admin/report-photos/:id` — the row, plus everything an audit needs. */
export type ReportPhotoDetail = ReportPhotoRow & {
  signals: PhotoSignals | null;
  /** `aws-rekognition` or `unconfigured`. Null before any verdict. */
  provider: string | null;
  moderationModelVersion: string | null;
  labelModelVersion: string | null;
  unavailableReason: PhotoUnavailableReason | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  mimeType: string | null;
  sha256: string | null;
  /** dHash, 16 hex chars. Compared by Hamming distance, not equality. */
  phash: string | null;

  // The HUMAN decision, kept separate from `decision` above so that "the model
  // said review, a moderator approved it" stays legible. Never conflate them.
  reviewedBy: PhotoPerson | null;
  reviewedAt: string | null;
  reviewReason: string | null;

  /** Nested report context, when the endpoint sends it nested. See wire.ts. */
  report?: Partial<ReportPhotoContext> | null;
  // …or flat, when it doesn't.
  reportDescription?: string | null;
  reportLandmark?: string | null;
  reportLat?: number | null;
  reportLng?: number | null;
  reportCreatedAt?: string | null;
};

/**
 * `GET /admin/report-photos/summary`.
 *
 * Every figure is `number | null`, and null is NOT zero. A "0" beside Pending
 * review reads as "checked, nothing to do"; the truth when the API sends
 * nothing is "we don't know", and an operator acts on the first and
 * investigates the second. Same discipline as the dashboard's counters.
 */
export type ReportPhotoSummary = {
  pendingReview: number | null;
  highRisk: number | null;
  today: number | null;
};
