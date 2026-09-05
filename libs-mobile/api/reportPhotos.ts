// Report photos: captured, sent for a verdict, attached only if one allows it.
//
// A SIBLING OF users.ts's uploadImage(), NOT A REPLACEMENT — the same split the
// API made deliberately (apps/api/src/uploads/report-photo.controller.ts).
// Avatars, mission-completion photos and support-ticket attachments still go to
// `POST /uploads`: they carry no verdict and are legitimately public the moment
// they land. Report photos come here, stay private until a verdict allows
// publication, and can come back refused. Folding the two into one function
// would mean one call site branching on which rules apply, which is how the
// stricter branch eventually gets skipped.
//
// WHAT THIS CHECK IS, AND WHAT IT IS NOT. The backend checks the IMAGE — is it
// safe, is it legible, does it plausibly match the chosen category. It does not,
// and cannot, establish that the emergency in the photo is real. No copy in this
// app may say or imply otherwise. It likewise does not detect AI-generated or
// manipulated images, and does not read text in the picture.

import { apiRequest } from '../lib/api';
import type { CategoryId } from '../data/categories';

/**
 * pass   — attachable, publishes immediately.
 * review — attachable, but the whole report is held until a moderator looks.
 * reject — not attachable at all; `uploadId` is null and the user must retake.
 */
export type PhotoVerdict = 'pass' | 'review' | 'reject';

/**
 * The API's machine-readable cause for a non-pass verdict.
 *
 * CODES, NEVER PROSE — mirrors `DecisionReason` + `ImageRejection` server-side.
 * The sentence a person reads is chosen on this side, in their language; a
 * message coming down the wire would be a third English-only copy that drifts
 * from both the app and the admin console. Map these to copy through
 * apps/mobile's photoVerdictCopy.ts, never by showing the code.
 */
export type PhotoReasonCode =
  // Content and relevance (from the decision engine)
  | 'explicit-content'
  | 'hate-symbols'
  | 'unusable-quality'
  | 'partial-nudity'
  | 'swimwear-or-underwear'
  | 'graphic-violence'
  | 'visually-disturbing'
  | 'weapons'
  | 'drugs'
  | 'not-photographic'
  | 'category-mismatch'
  | 'duplicate-image'
  | 'verification-unavailable'
  // File-level (the image never got as far as being analysed)
  | 'empty'
  | 'too-large'
  | 'unsupported-format'
  | 'corrupt'
  | 'too-small'
  | 'too-large-dimensions';

export type ReportPhotoUpload = {
  /** Null exactly when `verdict` is 'reject' — there is nothing to attach. */
  uploadId: string | null;
  verdict: PhotoVerdict;
  /**
   * Typed as a plain string, not `PhotoReasonCode`, on purpose: the server owns
   * this vocabulary and can add a code before an app that knows it has shipped.
   * A union here would make the client's own type a lie about what can arrive.
   * Resolve it through `photoReasonCopyKey()`, which falls back rather than
   * rendering an unknown code at somebody.
   */
  reason: string | null;
};

/** The API's code for "you have uploaded too many photos too quickly" (429). */
export const UPLOAD_RATE_LIMITED = 'UPLOAD_RATE_LIMITED';

/**
 * Sends one captured photo for verification.
 *
 * Resolves for EVERY verdict, reject included — a refused photo is a successful
 * request whose answer happens to be no. It rejects only when the request itself
 * failed (offline, 401, 429), which is what keeps "the network died" and "this
 * picture is not allowed" from arriving on the same code path and being reported
 * with the same words.
 */
export function uploadReportPhoto(
  localUri: string,
  categoryKey: CategoryId
): Promise<ReportPhotoUpload> {
  const filename = localUri.split('/').pop() ?? `photo-${Date.now()}.jpg`;
  const extension = /\.(\w+)$/.exec(filename)?.[1]?.toLowerCase();
  // Only what the API accepts (JPEG/PNG, sniffed from magic bytes server-side —
  // this header is a hint, never the thing that's trusted).
  const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

  const form = new FormData();
  // categoryKey FIRST, then the file. multer streams the parts in order and
  // anything that wants to look at a text field while the file is still
  // arriving can only do so if the field came first. Nothing depends on that
  // today, but the reverse order is a trap that costs an afternoon to find.
  form.append('categoryKey', categoryKey);
  // React Native's FormData accepts this { uri, name, type } shape for a file
  // part — not a real Blob/File, which don't exist for local URIs on-device.
  form.append('file', { uri: localUri, name: filename, type: mimeType } as unknown as Blob);

  return apiRequest('/uploads/report-photo', { method: 'POST', auth: true, body: form });
}

/**
 * The owner-only URL for a photo that has not published yet.
 *
 * A held or not-yet-attached photo has no public URL by design, so the reporter
 * cannot be shown one. Nothing in the capture flow needs this — it renders the
 * on-device file it just captured — but any screen that has to show a
 * server-side copy before publication must go through here, with the bearer
 * token attached.
 */
export function reportPhotoPath(uploadId: string): string {
  return `/uploads/report-photo/${uploadId}`;
}
