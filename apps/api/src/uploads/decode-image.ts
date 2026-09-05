// Decodes JPEG and PNG bytes to a raw RGBA bitmap.
//
// WHY NOT `Jimp.read`. Jimp's own entry point sniffs the file type through a
// DYNAMIC IMPORT of `file-type`, which is ESM-only. Under this project's Jest
// setup (CommonJS, no --experimental-vm-modules) that throws
// "A dynamic import callback was invoked without --experimental-vm-modules"
// before a single byte is decoded. The fix is not to turn on experimental VM
// modules for the whole suite; it is to stop asking Jimp to sniff.
//
// We already know the format — image-inspection.ts establishes it from magic
// bytes, and it has to, because the client's Content-Type is not evidence. So
// the format-specific decoder is called directly. That removes the dynamic
// import, removes a redundant second sniff, and keeps the runtime and the test
// environment on exactly the same code path — which the previous arrangement
// did not.

import jpegFormat from '@jimp/js-jpeg';
import pngFormat from '@jimp/js-png';
import type { ReportPhotoFormat } from './report-photo-limits';

/** Raw RGBA pixels: 4 bytes per pixel, row-major, no padding. */
export type DecodedBitmap = {
  width: number;
  height: number;
  data: Buffer;
};

// Built once at module load. Each call constructs a small descriptor object
// holding `decode`; doing that per image would be pointless allocation on the
// hot path.
const DECODERS: Record<ReportPhotoFormat, (bytes: Buffer) => DecodedBitmap> = {
  jpeg: jpegFormat().decode,
  png: pngFormat().decode,
};

/**
 * Returns the decoded bitmap, or undefined if the bytes will not decode.
 *
 * Undefined rather than a thrown error because "this file is broken" is an
 * expected outcome for user-supplied input, not an exceptional one — a
 * half-uploaded photo is a Tuesday. The decoder's own error is deliberately
 * discarded: it is generated from attacker-controllable bytes and can echo
 * fragments of them into logs.
 */
export function decodeImage(
  bytes: Buffer,
  format: ReportPhotoFormat,
): DecodedBitmap | undefined {
  try {
    const bitmap = DECODERS[format](bytes);
    // A decoder that returns a degenerate bitmap has not really succeeded, and
    // every consumer downstream divides by or iterates over these numbers.
    if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) return undefined;
    return bitmap;
  } catch {
    return undefined;
  }
}
