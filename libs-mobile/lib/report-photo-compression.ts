// Shrinks a camera capture to something the verification endpoint will accept,
// before it is ever put on the wire. The rule it follows lives in
// report-photo-plan.ts; this file is the half that touches files and pixels.
//
// WHY THIS EXISTS. `POST /uploads/report-photo` caps the file at 4 MB
// (apps/api/src/uploads/report-photo-limits.ts) because Rekognition refuses raw
// bytes over 5 MB and the API keeps a megabyte of headroom. That file's own
// comment assumes "a phone camera JPEG at quality 0.7 lands far below this" —
// true of a 12 MP sensor, false of the 50–200 MP sensors shipping on mid-range
// Android phones in this app's actual market. Over the limit the upload is
// refused, and the reporter has no way to make the file smaller by hand in the
// middle of an emergency.
//
// So the client makes it smaller instead. A report photo is evidence for a
// moderation model and a thumbnail for a volunteer — neither needs 100 MP.
//
// NOT A SUBSTITUTE FOR THE SERVER LIMIT. The server still enforces its own cap
// on the bytes it receives; this only stops the app from knowingly sending a
// file that cannot succeed. A client-side check the server trusted would be the
// bug, not the fix.

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

import {
  TARGET_REPORT_PHOTO_BYTES,
  planCompression,
  type CompressionStep,
  type PhotoMeasurements,
} from './report-photo-plan';

/** Size in bytes, or null when the file cannot be inspected. */
function measureBytes(uri: string): number | null {
  try {
    const { size } = new File(uri);
    // expo-file-system reports 0 for a file that does not exist or cannot be
    // read (SDK 57 `File.size`) — that is "unknown", not "empty". Passing it on
    // as a number would make planCompression see a 0-byte photo, conclude it
    // fits comfortably, and skip the compression the file may badly need.
    return size > 0 ? size : null;
  } catch {
    return null;
  }
}

function measureDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function renderJpeg(
  uri: string,
  step: CompressionStep,
  source: PhotoMeasurements
): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (step.edge !== null) {
    // Constrain the LONGER side. Passing `width` unconditionally would leave a
    // portrait photo taller than the edge it was supposed to be bounded by.
    // The free side is passed as an explicit null — SDK 57 types both keys, and
    // null is what tells it to derive that side from the aspect ratio.
    context.resize(
      source.width >= source.height
        ? { width: step.edge, height: null }
        : { width: null, height: step.edge }
    );
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: step.quality });
  return saved.uri;
}

/**
 * Returns a URI to upload — the original when it already fits, a re-encoded
 * copy when it did not.
 *
 * NEVER THROWS, AND ALWAYS RETURNS SOMETHING SENDABLE. Every failure path falls
 * back to the original capture, so a phone whose manipulator misbehaves still
 * gets to file its report and meet the server's real answer. Blocking an
 * emergency report on a failed optimisation would be a worse bug than the one
 * this fixes.
 *
 * Always saves JPEG, which has a second effect worth naming: a device that hands
 * back HEIC or WebP (the server accepts neither) is converted into a format that
 * can actually be judged, instead of being refused as an unsupported format.
 */
export async function compressReportPhoto(localUri: string): Promise<string> {
  try {
    const measurements: PhotoMeasurements = {
      bytes: measureBytes(localUri),
      ...(await measureDimensions(localUri)),
    };

    const steps = planCompression(measurements);
    if (steps.length === 0) return localUri;

    let bestUri = localUri;
    let bestBytes = measurements.bytes ?? Number.POSITIVE_INFINITY;

    for (const step of steps) {
      const candidateUri = await renderJpeg(localUri, step, measurements);
      const candidateBytes = measureBytes(candidateUri) ?? Number.POSITIVE_INFINITY;

      // Keep the smallest result seen, not simply the last one tried: a lower
      // rung of the ladder producing a bigger file is unlikely but possible, and
      // uploading the bigger one because it came last would be indefensible.
      if (candidateBytes < bestBytes) {
        bestUri = candidateUri;
        bestBytes = candidateBytes;
      }
      if (bestBytes <= TARGET_REPORT_PHOTO_BYTES) break;
    }

    return bestUri;
  } catch {
    return localUri;
  }
}
