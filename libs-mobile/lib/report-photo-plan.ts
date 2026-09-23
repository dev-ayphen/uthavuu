// What to do with a capture before uploading it — the decision, with none of
// the doing. See report-photo-compression.ts for the half that touches files.
//
// SPLIT FOR THE SAME REASON category-state.ts IS SPLIT. The rule here is the
// part that can be wrong in a way nobody notices (an off-by-one against the
// server's ceiling, an accidental upscale, a 0-byte file read as "small
// enough"), and it is only testable off-device if it imports nothing native.
// Everything in this file is pure arithmetic over three numbers.

/**
 * The server's hard ceiling, mirrored.
 *
 * `MAX_REPORT_PHOTO_BYTES` in apps/api/src/uploads/report-photo-limits.ts — 4 MB,
 * which is itself Rekognition's 5 MB raw-bytes quota minus a megabyte of
 * headroom. Duplicated rather than imported: libs-mobile does not depend on
 * apps/api, and one number is not worth a dependency edge from client to server.
 * If the server's limit moves, this moves with it.
 */
export const MAX_REPORT_PHOTO_BYTES = 4 * 1024 * 1024;

/**
 * What compression aims for — deliberately under the ceiling, not at it.
 *
 * Multipart framing, the `categoryKey` field and the part headers all ride along
 * with the file, so a payload measuring exactly 4 MB on disk arrives over the
 * limit. Half a megabyte of slack costs a reporter nothing perceptible and
 * removes the whole class of "just barely refused".
 */
export const TARGET_REPORT_PHOTO_BYTES = 3.5 * 1024 * 1024;

/**
 * Longest edge that survives untouched.
 *
 * Rekognition's own ceiling is 10,000 px, so this is not about what the provider
 * accepts — it is about what it needs. Moderation labels and category relevance
 * survive a 2048 px long edge intact, and every pixel above that is bytes the
 * reporter waits on while an emergency is in progress.
 */
export const MAX_REPORT_PHOTO_EDGE = 2048;

/**
 * One re-encode attempt: a longest-edge target and a JPEG quality.
 *
 * `edge: null` means "do not resize at this step" — set when the source is
 * already smaller than the step's edge, because scaling up would add bytes to an
 * image being re-encoded to lose them.
 */
export type CompressionStep = { edge: number | null; quality: number };

export type PhotoMeasurements = {
  /** Null when the file's size could not be read — treated as "assume too big". */
  bytes: number | null;
  width: number;
  height: number;
};

/**
 * The ladder, tried in order until one lands under the target.
 *
 * Descending in BOTH dimension and quality rather than quality alone: below
 * about 0.4, JPEG quality stops buying much size and starts visibly destroying
 * the detail a moderator is being asked to judge. Dropping resolution keeps the
 * picture honest at a lower cost per byte.
 */
export const COMPRESSION_LADDER: readonly CompressionStep[] = [
  { edge: 2048, quality: 0.7 },
  { edge: 1600, quality: 0.6 },
  { edge: 1280, quality: 0.45 },
];

/**
 * Decides what (if anything) to do with a capture.
 *
 * Returns an empty list when the photo should be uploaded exactly as captured —
 * re-encoding a file that already fits would cost the reporter a decode/encode
 * cycle and a generation of JPEG loss to achieve nothing.
 */
export function planCompression(measurements: PhotoMeasurements): CompressionStep[] {
  const { bytes, width, height } = measurements;
  const longestEdge = Math.max(width, height);

  // An unreadable size is not evidence of a small file. Compressing a photo that
  // did not need it wastes a second; skipping one that did costs the reporter
  // the upload entirely, so the unknown case takes the cheap side of that trade.
  const knownToFit = bytes !== null && bytes <= TARGET_REPORT_PHOTO_BYTES;
  if (knownToFit && longestEdge <= MAX_REPORT_PHOTO_EDGE) return [];

  return COMPRESSION_LADDER.map((step) => ({
    // Never upscale: a 900 px capture asked to render at 1280 px comes back
    // bigger than it started, which is the opposite of the job.
    edge: step.edge !== null && longestEdge > step.edge ? step.edge : null,
    quality: step.quality,
  }));
}
