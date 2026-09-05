// The hard limits a report photo must satisfy BEFORE it is offered to the
// moderation provider.
//
// WHERE THESE NUMBERS COME FROM. Every value below is dictated by Amazon
// Rekognition's published "Guidelines and quotas" for the Image API, not chosen
// by taste. Getting them wrong does not degrade gracefully — it means paying for
// a network round trip that comes back InvalidImageFormatException or
// ImageTooLargeException, after the citizen has already waited for it.
//
//   - Rekognition accepts PNG and JPEG ONLY. Not WebP, not HEIC, not GIF.
//   - Raw bytes passed as an API parameter are capped at 5 MB.
//   - Minimum image dimension is 80 px on both axes.
//   - Maximum for DetectModerationLabels and DetectLabels is 10,000 px on both.
//
// ⚠️ THIS IS NARROWER THAN `avatarUploadOptions` ON PURPOSE, and the difference
// is the whole point. multer.config.ts accepts image/webp and 5 MB because it
// was written for avatars, which are never sent to a moderation provider. A
// report photo has a second consumer with stricter rules, so it gets its own
// constants rather than loosening the shared ones. Avatars and mission
// completion photos are deliberately unaffected by everything in this file.

/** Formats Rekognition can actually read. Keys are magic-byte-verified, never client-declared. */
export const REPORT_PHOTO_FORMATS = ['jpeg', 'png'] as const;
export type ReportPhotoFormat = (typeof REPORT_PHOTO_FORMATS)[number];

/**
 * 4 MB, not Rekognition's 5 MB.
 *
 * The provider's ceiling is the size of the bytes it receives, and a file that
 * measures exactly at the ceiling is one re-encode away from being over it. The
 * headroom costs a citizen nothing — a phone camera JPEG at the quality: 0.7 the
 * app captures with lands far below this — and it removes a whole class of
 * failure that would only ever appear in production, on the largest photos,
 * after the upload had already succeeded.
 */
export const MAX_REPORT_PHOTO_BYTES = 4 * 1024 * 1024;

/** Rekognition refuses anything smaller on either axis. */
export const MIN_REPORT_PHOTO_DIMENSION = 80;

/** Rekognition refuses anything larger on either axis. */
export const MAX_REPORT_PHOTO_DIMENSION = 10_000;

/**
 * Magic byte prefixes, checked against the file's actual first bytes.
 *
 * The client's Content-Type is not evidence of anything: multer populates
 * `file.mimetype` straight from the multipart part header, so renaming a video
 * to .jpg and declaring image/jpeg passes every check the avatar path makes
 * today. These prefixes are what the bytes have to actually start with.
 */
export const MAGIC_BYTES: Record<ReportPhotoFormat, readonly number[]> = {
  // SOI marker followed by the first segment marker. Covers JFIF, Exif and raw.
  jpeg: [0xff, 0xd8, 0xff],
  // The PNG signature is fixed and 8 bytes long, including the CRLF/EOF traps
  // that exist to detect corruption in transit.
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/** MIME type to persist once the bytes have been verified to match. */
export const FORMAT_MIME: Record<ReportPhotoFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** File extension to store on disk, derived from the sniffed format only. */
export const FORMAT_EXTENSION: Record<ReportPhotoFormat, string> = {
  jpeg: '.jpg',
  png: '.png',
};
