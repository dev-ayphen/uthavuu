import { Jimp } from 'jimp';
import { inspectImage, sniffFormat } from './image-inspection';
import { MAX_REPORT_PHOTO_BYTES } from './report-photo-limits';

// The bug this file exists to prevent is the one multer.config.ts still has for
// avatars: `fileFilter` trusts `file.mimetype`, which multer copies from the
// multipart part's Content-Type header. A client writes that header. So the
// cases below are not hypothetical hardening — the first one ("declares itself
// a PNG but is not") is the exact payload that reaches disk today as
// `<uuid>.png` and is then served back with an image content type.
//
// Fixtures are generated rather than committed: a real encoder produces real
// headers, and a hand-written byte array would only ever prove that the code
// agrees with my idea of a JPEG.

async function makeImage(
  width: number,
  height: number,
  mime: 'image/jpeg' | 'image/png',
): Promise<Buffer> {
  const image = new Jimp({ width, height, color: 0x336699ff });
  return Buffer.from(await image.getBuffer(mime));
}

describe('sniffFormat', () => {
  it('identifies a real JPEG from its bytes', async () => {
    expect(sniffFormat(await makeImage(100, 100, 'image/jpeg'))).toBe('jpeg');
  });

  it('identifies a real PNG from its bytes', async () => {
    expect(sniffFormat(await makeImage(100, 100, 'image/png'))).toBe('png');
  });

  it('refuses a file that merely claims to be an image', () => {
    // What a renamed .txt/.mp4/.exe looks like at the byte level.
    expect(
      sniffFormat(Buffer.from('this is definitely not a photo')),
    ).toBeUndefined();
  });

  it('refuses a buffer shorter than the signature it would need', () => {
    expect(sniffFormat(Buffer.from([0xff, 0xd8]))).toBeUndefined();
  });
});

describe('inspectImage', () => {
  it('accepts a real JPEG and reports its true dimensions', async () => {
    const result = inspectImage(await makeImage(320, 240, 'image/jpeg'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('jpeg');
    expect(result.width).toBe(320);
    expect(result.height).toBe(240);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts a real PNG', async () => {
    const result = inspectImage(await makeImage(200, 200, 'image/png'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.format).toBe('png');
  });

  it('gives identical bytes an identical sha256, and different bytes a different one', async () => {
    const a = await makeImage(120, 120, 'image/png');
    const b = await makeImage(120, 120, 'image/png');
    const c = await makeImage(121, 120, 'image/png');

    const [ra, rb, rc] = [inspectImage(a), inspectImage(b), inspectImage(c)];
    if (!ra.ok || !rb.ok || !rc.ok)
      throw new Error('fixtures should inspect ok');

    expect(ra.sha256).toBe(rb.sha256);
    expect(ra.sha256).not.toBe(rc.sha256);
  });

  it('rejects an empty file', () => {
    const result = inspectImage(Buffer.alloc(0));
    expect(result).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a non-image regardless of what the client called it', () => {
    const result = inspectImage(Buffer.from('GIF89a-ish, but really text'));
    expect(result).toEqual({ ok: false, reason: 'unsupported-format' });
  });

  it('rejects a truncated image whose header is still valid', async () => {
    // The case a magic-byte check alone cannot catch, and the reason decoding is
    // not optional: an upload that died halfway still starts with FF D8 FF.
    const whole = await makeImage(400, 400, 'image/jpeg');
    const half = whole.subarray(0, Math.floor(whole.length / 2));

    expect(sniffFormat(half)).toBe('jpeg');
    expect(inspectImage(half)).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('rejects an image below the provider minimum of 80px', async () => {
    const result = inspectImage(await makeImage(64, 64, 'image/png'));
    expect(result).toEqual({ ok: false, reason: 'too-small' });
  });

  it('rejects an image that is tall enough but too narrow', async () => {
    const result = inspectImage(await makeImage(40, 300, 'image/png'));
    expect(result).toEqual({ ok: false, reason: 'too-small' });
  });

  it('rejects a file over the byte ceiling before attempting to decode it', () => {
    // Deliberately not a real image: reaching the size check means no decoder
    // ever saw these bytes, which is the property being asserted.
    const oversized = Buffer.alloc(MAX_REPORT_PHOTO_BYTES + 1, 0xff);
    expect(inspectImage(oversized)).toEqual({ ok: false, reason: 'too-large' });
  });
});
