// Server-side truth about an uploaded file: is it really an image, what kind,
// how big, and what is its content fingerprint.
//
// WHY THIS EXISTS. Nothing in the API has ever looked inside an uploaded file.
// `avatarUploadOptions.fileFilter` (multer.config.ts) branches on
// `file.mimetype`, which multer copies verbatim from the multipart part's
// Content-Type header — a value the client writes. A `.mp4` announced as
// `image/png` is written to disk as `<uuid>.png` and served back with an image
// content type. That was survivable while the only consumer was an <img> tag
// that would simply fail to render. It stops being survivable the moment the
// bytes are forwarded to a paid moderation API and a verdict about them is
// stored as if it meant something.
//
// The order below is deliberate and each step is cheaper than the next:
//   1. size      — a length check, no parsing at all
//   2. magic     — three to eight byte comparisons
//   3. decode    — full parse; the only step that proves the file is not corrupt
//   4. dimension — read from the decoded bitmap, not from a header we trusted
//
// Decoding is last because it is the expensive one, and because a truncated
// JPEG can have a perfectly valid header: only a real decode distinguishes "a
// photo" from "the first 40 KB of a photo the upload dropped halfway through".

import { createHash } from 'crypto';
import { decodeImage, type DecodedBitmap } from './decode-image';
import {
  MAGIC_BYTES,
  MAX_REPORT_PHOTO_BYTES,
  MAX_REPORT_PHOTO_DIMENSION,
  MIN_REPORT_PHOTO_DIMENSION,
  REPORT_PHOTO_FORMATS,
  type ReportPhotoFormat,
} from './report-photo-limits';

/**
 * Why an upload was refused.
 *
 * These are deliberately coarse. They exist to drive a log line and to pick one
 * of a small set of human sentences — never to be echoed to the client verbatim,
 * because the distinction between "corrupt" and "not an image" tells whoever is
 * probing the endpoint exactly how far their payload got.
 */
export type ImageRejection =
  | 'empty'
  | 'too-large'
  | 'unsupported-format'
  | 'corrupt'
  | 'too-small'
  | 'too-large-dimensions';

export type ImageInspection =
  | {
      ok: true;
      format: ReportPhotoFormat;
      width: number;
      height: number;
      byteSize: number;
      /** Hex SHA-256 of the exact bytes on disk — the exact-duplicate signal. */
      sha256: string;
      /**
       * The decoded pixels, handed back so the perceptual hash does not decode
       * the same 4 MB JPEG a second time. Callers that only need the metadata
       * can ignore it; it is not retained anywhere by this module.
       */
      bitmap: DecodedBitmap;
    }
  | { ok: false; reason: ImageRejection };

/** Does the buffer physically begin with this format's signature? */
function matchesMagic(bytes: Buffer, format: ReportPhotoFormat): boolean {
  const signature = MAGIC_BYTES[format];
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * The format this file actually is, or undefined if it is neither JPEG nor PNG.
 *
 * Exported because the quarantine writer needs it to choose an extension, and
 * choosing one from the client's filename is the same mistake in a new place.
 */
export function sniffFormat(bytes: Buffer): ReportPhotoFormat | undefined {
  return REPORT_PHOTO_FORMATS.find((format) => matchesMagic(bytes, format));
}

export function inspectImage(bytes: Buffer): ImageInspection {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_REPORT_PHOTO_BYTES) {
    return { ok: false, reason: 'too-large' };
  }

  const format = sniffFormat(bytes);
  if (!format) return { ok: false, reason: 'unsupported-format' };

  // The sniff above decides what is ALLOWED; this decode only proves the bytes
  // are intact. Both are needed: a truncated JPEG still starts with FF D8 FF, so
  // the signature alone cannot tell a photo from the first 40 KB of one.
  const bitmap = decodeImage(bytes, format);
  if (!bitmap) return { ok: false, reason: 'corrupt' };
  const { width, height } = bitmap;

  if (
    width < MIN_REPORT_PHOTO_DIMENSION ||
    height < MIN_REPORT_PHOTO_DIMENSION
  ) {
    return { ok: false, reason: 'too-small' };
  }
  if (
    width > MAX_REPORT_PHOTO_DIMENSION ||
    height > MAX_REPORT_PHOTO_DIMENSION
  ) {
    return { ok: false, reason: 'too-large-dimensions' };
  }

  return {
    ok: true,
    format,
    width,
    height,
    byteSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bitmap,
  };
}
