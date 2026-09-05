import { Jimp } from 'jimp';
import { decodeImage, type DecodedBitmap } from './decode-image';
import {
  DEFAULT_DUPLICATE_DISTANCE,
  PERCEPTUAL_HASH_BITS,
  hammingDistance,
  perceptualHash,
} from './perceptual-hash';

// dHash encodes left-to-right brightness gradients, so a flat colour hashes to
// all zeros and proves nothing. Every fixture below therefore carries real
// horizontal structure. The load-bearing test is `survives re-encoding`: a JPEG
// of the same scene shares none of its bytes with the PNG, which is precisely
// the case SHA-256 cannot catch and this hash exists for.

/** Deterministic image bytes with horizontal structure driven by `seed`. */
async function patternedBytes(
  seed: number,
  mime: 'image/jpeg' | 'image/png' = 'image/png',
): Promise<Buffer> {
  const width = 128;
  const height = 128;
  const image = new Jimp({ width, height, color: 0x000000ff });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Smoothly varying, seed-dependent gradients rather than noise. Noise
      // survives neither downsampling nor JPEG, so it would make the test
      // measure the encoder instead of the hash.
      const value =
        128 +
        90 * Math.sin((x / 16) * (1 + seed * 0.7)) * Math.cos(y / 24 + seed);
      const channel = Math.max(0, Math.min(255, Math.round(value)));
      const offset = (y * width + x) * 4;
      image.bitmap.data[offset] = channel;
      image.bitmap.data[offset + 1] = channel;
      image.bitmap.data[offset + 2] = channel;
      image.bitmap.data[offset + 3] = 255;
    }
  }
  return Buffer.from(await image.getBuffer(mime));
}

async function patterned(
  seed: number,
  mime: 'image/jpeg' | 'image/png' = 'image/png',
): Promise<DecodedBitmap> {
  const bytes = await patternedBytes(seed, mime);
  const bitmap = decodeImage(bytes, mime === 'image/png' ? 'png' : 'jpeg');
  if (!bitmap) throw new Error('fixture failed to decode');
  return bitmap;
}

describe('perceptualHash', () => {
  it('returns a fixed-width 16-character hex hash', async () => {
    expect(perceptualHash(await patterned(1))).toMatch(/^[0-9a-f]{16}$/);
    expect(PERCEPTUAL_HASH_BITS).toBe(64);
  });

  it('is stable — the same pixels always hash the same way', async () => {
    const bitmap = await patterned(2);
    expect(perceptualHash(bitmap)).toBe(perceptualHash(bitmap));
  });

  it('survives re-encoding to a different format, where sha256 cannot', async () => {
    // The reused-stock-photo case. Same picture, PNG vs JPEG: not one byte in
    // common, so the exact hash is useless and this one must still match.
    const asPng = perceptualHash(await patterned(3, 'image/png'));
    const asJpeg = perceptualHash(await patterned(3, 'image/jpeg'));

    const distance = hammingDistance(asPng, asJpeg);
    expect(distance).not.toBeNull();
    expect(distance!).toBeLessThanOrEqual(DEFAULT_DUPLICATE_DISTANCE);
  });

  it('separates genuinely different photographs', async () => {
    const a = perceptualHash(await patterned(1));
    const b = perceptualHash(await patterned(5));

    const distance = hammingDistance(a, b);
    expect(distance).not.toBeNull();
    // Comfortably outside the duplicate threshold — if this ever fails, the
    // threshold is flagging unrelated reports as reuse and sending real
    // emergencies to a human queue for no reason.
    expect(distance!).toBeGreaterThan(DEFAULT_DUPLICATE_DISTANCE);
  });

  it('is unaffected by a uniform brightness shift', async () => {
    // Why dHash was chosen over aHash: comparing neighbours rather than an
    // absolute mean makes the hash survive two phones metering the same scene
    // differently.
    const base = await patterned(4);
    const brighter: DecodedBitmap = {
      width: base.width,
      height: base.height,
      data: Buffer.from(base.data),
    };
    for (let i = 0; i < brighter.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        brighter.data[i + channel] = Math.min(
          255,
          brighter.data[i + channel] + 25,
        );
      }
    }

    expect(perceptualHash(brighter)).toBe(perceptualHash(base));
  });
});

describe('hammingDistance', () => {
  it('is zero for identical hashes', () => {
    expect(hammingDistance('a1b2c3d4e5f60789', 'a1b2c3d4e5f60789')).toBe(0);
  });

  it('counts differing bits, not differing characters', () => {
    // 0x0 vs 0xf is four differing bits inside a single nibble.
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
  });

  it('counts across the whole string', () => {
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
  });

  it('returns null rather than a misleading number for incomparable input', () => {
    // A large number would read as "definitely not a duplicate" — a claim this
    // function cannot make about a hash it could not parse.
    expect(hammingDistance('abc', 'abcd')).toBeNull();
    expect(hammingDistance('', '')).toBeNull();
    expect(hammingDistance('zzzzzzzzzzzzzzzz', '0000000000000000')).toBeNull();
  });
});
