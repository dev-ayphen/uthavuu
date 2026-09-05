// Machine reason code -> the sentence a reporter reads.
//
// WHY THE MAPPING LIVES HERE AND NOT ON THE WIRE. The API answers with codes
// (`category-mismatch`, `too-small`) precisely so each surface can word the
// outcome for its own audience in its own language. This app is English +
// Tamil; the API is English-only. Rendering `error.message` from the server
// would put an untranslated sentence in front of a Tamil-speaking reporter, and
// rendering the code itself would put `swimwear-or-underwear` on their screen.
//
// WHAT THESE SENTENCES MAY NOT CONTAIN. No confidence scores, no detection
// label names, no thresholds, no provider name, no hint that a specific
// category of content was detected in someone's photograph. A person retaking a
// photo needs to know what to do differently; everything beyond that is either
// an accusation or an invitation to probe the classifier.
//
// GROUPED, NOT ONE SENTENCE PER CODE. Nineteen codes collapse into eight
// outcomes because there are only eight different things a reporter can DO
// about them. Distinct wording per code would leak exactly the detail the
// paragraph above forbids, and would tell them nothing extra.

import type { PhotoReasonCode } from '@uthavu/libs-mobile/api/reportPhotos';
import {
  REPORT_NOT_AWAITING_PHOTO,
  isReportPhotoErrorCode,
} from '@uthavu/libs-mobile/api/reports';

const REASON_COPY_KEYS: Record<PhotoReasonCode, string> = {
  // Content the app will not carry. One shared sentence: naming which of these
  // fired would tell somebody what a photograph of theirs was classified as.
  'explicit-content': 'photoVerification.reason.guidelines',
  'hate-symbols': 'photoVerification.reason.guidelines',
  'partial-nudity': 'photoVerification.reason.guidelines',
  'swimwear-or-underwear': 'photoVerification.reason.guidelines',
  'graphic-violence': 'photoVerification.reason.guidelines',
  'visually-disturbing': 'photoVerification.reason.guidelines',
  weapons: 'photoVerification.reason.guidelines',
  drugs: 'photoVerification.reason.guidelines',

  // Legible-image problems — the fix is "take it again, differently".
  'unusable-quality': 'photoVerification.reason.quality',
  'too-small': 'photoVerification.reason.quality',

  // The file, not the picture. A person can't act on the distinction between
  // "corrupt" and "unsupported format"; both mean take a fresh camera photo.
  empty: 'photoVerification.reason.file',
  corrupt: 'photoVerification.reason.file',
  'unsupported-format': 'photoVerification.reason.file',
  'too-large': 'photoVerification.reason.file',
  'too-large-dimensions': 'photoVerification.reason.file',

  // Actionable and specific — these three each have a different fix.
  'not-photographic': 'photoVerification.reason.notPhotographic',
  'category-mismatch': 'photoVerification.reason.categoryMismatch',
  'duplicate-image': 'photoVerification.reason.duplicate',

  // Not the photo's fault at all: the check itself could not run. Always a
  // 'review' verdict server-side, never a reject.
  'verification-unavailable': 'photoVerification.reason.unavailable',
};

/**
 * The i18n key for a reason code, or a safe generic one for anything unknown.
 *
 * The cast is the point rather than a shortcut: `reason` is typed as a plain
 * string because the server can add a code any time, so the lookup must be
 * allowed to miss. A code this build has never heard of falls back to "take
 * another one" — vague, but true, and better than a blank card or a raw code.
 */
export function photoReasonCopyKey(reason: string | null): string {
  if (!reason) return 'photoVerification.reason.unknown';
  return REASON_COPY_KEYS[reason as PhotoReasonCode] ?? 'photoVerification.reason.unknown';
}

const PUBLISH_ERROR_COPY_KEYS: Record<string, string> = {
  PHOTO_NOT_VERIFIED: 'photoVerification.publishError.notVerified',
  PHOTO_REJECTED: 'photoVerification.publishError.rejected',
  PHOTO_NEEDS_REVIEW: 'photoVerification.publishError.needsReview',
  PHOTO_REQUIRED: 'photoVerification.publishError.required',
  PHOTO_UNAVAILABLE: 'photoVerification.publishError.unavailable',
};

/**
 * The i18n key for a failed `POST /reports`, or null when the failure had
 * nothing to do with photos and the caller should use its own generic message.
 *
 * Every one of these means the same thing operationally — the photos have to be
 * captured again — so each sentence ends there rather than explaining which of
 * five internal states was reached.
 */
export function publishErrorCopyKey(code: string | undefined): string | null {
  if (!isReportPhotoErrorCode(code)) return null;
  return PUBLISH_ERROR_COPY_KEYS[code] ?? null;
}

/**
 * The i18n key for a failed `PUT /reports/:id/photos`, or null for a failure
 * that has nothing to do with photos.
 *
 * Same five photo codes as publish, plus one that only this endpoint can raise.
 * REPORT_NOT_AWAITING_PHOTO is deliberately NOT routed through the map above:
 * every sentence there ends in "take another one", and that is the wrong
 * instruction here. The photo was fine; the REPORT stopped waiting for it — a
 * moderator rejected it, it expired, or the reporter cancelled it in another
 * session. Sending them back to the camera for a report that no longer exists
 * as a live thing is a loop they cannot get out of.
 */
export function replacePhotoErrorCopyKey(code: string | undefined): string | null {
  if (code === REPORT_NOT_AWAITING_PHOTO) return 'photoVerification.replaceError.notAwaiting';
  return publishErrorCopyKey(code);
}
