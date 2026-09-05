// A perceptual fingerprint for "is this the same photo we have seen before?"
//
// WHY NOT JUST SHA-256. The exact hash in image-inspection.ts catches a
// byte-for-byte re-upload and nothing else. Re-saving a JPEG, cropping a border,
// or letting a phone re-encode on share changes every byte and leaves the
// picture identical to a human. A reused stock photo of a road accident is the
// case this exists to notice, and it will never arrive byte-identical twice.
//
// THE ALGORITHM is dHash (difference hash), chosen over aHash and pHash for
// reasons that matter at this scale:
//   - aHash (compare each pixel to the mean) is cheap but collides badly on
//     low-contrast images — and "a dark photo of a street at night" is a real
//     Uthavu report, not an edge case.
//   - pHash (discrete cosine transform) is the most robust and needs a DCT
//     implementation this codebase has no other use for.
//   - dHash compares each pixel to its right-hand neighbour, so it encodes
//     gradients rather than absolute brightness. That makes it naturally immune
//     to the exposure and white-balance shifts two phones produce photographing
//     the same scene, at a fraction of pHash's complexity.
//
// THE DOWNSAMPLER IS DELIBERATELY OURS. A box average over the source rectangle
// is the whole of it, and owning it matters: the resampling filter is what
// decides whether the same photograph re-encoded by a different library still
// lands on the same hash. Delegating that to a dependency's default — which can
// change in a minor release — would let an upgrade silently invalidate every
// hash already stored, and the failure would look like "duplicate detection
// stopped working" rather than like an upgrade.
//
// ⚠️ A MATCH IS A SIGNAL, NOT A VERDICT. Two genuinely different reports of the
// same junction at the same hour can hash close together. Nothing here may
// reject an upload or sanction a user on its own — a match routes to a human, as
// the product decision requires.

import type { DecodedBitmap } from './decode-image';

/**
 * 9x8 = 72 samples, giving 8x8 = 64 comparisons and a 64-bit hash.
 *
 * The extra column exists because each row compares sample N to sample N+1, so a
 * row of width W yields W-1 bits. This is the standard dHash geometry.
 */
const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

/** Bits in the resulting hash — 8 rows x 8 comparisons. */
export const PERCEPTUAL_HASH_BITS = (HASH_WIDTH - 1) * HASH_HEIGHT;

/**
 * Distance at or below which two photos are treated as "probably the same".
 *
 * 8 of 64 bits is a deliberately conservative default: tight enough that
 * unrelated photographs essentially never land inside it, loose enough to
 * survive re-encoding and mild cropping. Exported rather than inlined because
 * the decision engine takes it from configuration, and a threshold nobody can
 * tune is a threshold that is wrong forever.
 */
export const DEFAULT_DUPLICATE_DISTANCE = 8;

/**
 * Average luminance of the source rectangle mapping to one target cell.
 *
 * Rec. 601 coefficients, the same weighting every image library uses for
 * greyscale, so a photo converted elsewhere and re-uploaded still reduces to
 * comparable values. Averaging the whole rectangle rather than sampling one
 * pixel is what makes the result stable under JPEG's blocky artefacts.
 */
function cellLuminance(
  bitmap: DecodedBitmap,
  cellX: number,
  cellY: number,
): number {
  const startX = Math.floor((cellX * bitmap.width) / HASH_WIDTH);
  const endX = Math.max(
    startX + 1,
    Math.floor(((cellX + 1) * bitmap.width) / HASH_WIDTH),
  );
  const startY = Math.floor((cellY * bitmap.height) / HASH_HEIGHT);
  const endY = Math.max(
    startY + 1,
    Math.floor(((cellY + 1) * bitmap.height) / HASH_HEIGHT),
  );

  let total = 0;
  let samples = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * bitmap.width + x) * 4;
      total +=
        0.299 * bitmap.data[offset] +
        0.587 * bitmap.data[offset + 1] +
        0.114 * bitmap.data[offset + 2];
      samples += 1;
    }
  }
  return samples === 0 ? 0 : total / samples;
}

/**
 * 64-bit dHash as 16 lowercase hex characters.
 *
 * Takes an already-decoded bitmap rather than raw bytes so that a 4 MB JPEG is
 * decoded exactly once per upload — `inspectImage` has already done it, and
 * hands its bitmap straight here.
 *
 * Stored as text rather than a bigint because Postgres has no unsigned 64-bit
 * type, and the only operations ever performed on it are equality and Hamming
 * distance — neither of which needs arithmetic.
 */
export function perceptualHash(bitmap: DecodedBitmap): string {
  const cells: number[][] = [];
  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < HASH_WIDTH; x += 1) {
      row.push(cellLuminance(bitmap, x, y));
    }
    cells.push(row);
  }

  let bits = '';
  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
      bits += cells[y][x] > cells[y][x + 1] ? '1' : '0';
    }
  }

  // Chunked into 4-bit nibbles so the result is fixed-width hex regardless of
  // leading zeros — BigInt(...).toString(16) would silently shorten a hash whose
  // top bits happen to be zero, and equality against a stored value would fail.
  let hex = '';
  for (let index = 0; index < bits.length; index += 4) {
    hex += parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Differing-bit count between two hashes, or `null` if they are not comparable.
 *
 * Null rather than a throw or a large number: the caller's question is "are
 * these near-duplicates", and a malformed or differently-sized stored hash
 * cannot answer it either way. Returning a big number would read as "definitely
 * not a duplicate", which is a claim this function is not entitled to make.
 */
export function hammingDistance(a: string, b: string): number | null {
  if (a.length !== b.length || a.length === 0) return null;

  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = parseInt(a[index], 16);
    const right = parseInt(b[index], 16);
    if (Number.isNaN(left) || Number.isNaN(right)) return null;

    // Brian Kernighan's popcount over one nibble: clears the lowest set bit each
    // iteration, so it runs once per differing bit rather than once per bit.
    let diff = left ^ right;
    while (diff) {
      diff &= diff - 1;
      distance += 1;
    }
  }
  return distance;
}
