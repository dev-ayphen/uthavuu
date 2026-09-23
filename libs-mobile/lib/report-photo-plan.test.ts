import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPRESSION_LADDER,
  MAX_REPORT_PHOTO_BYTES,
  MAX_REPORT_PHOTO_EDGE,
  TARGET_REPORT_PHOTO_BYTES,
  planCompression,
} from './report-photo-plan';

/**
 * The rules that decide whether a capture is re-encoded at all.
 *
 * Runner and rationale as in data/category-state.test.ts — node:test over a
 * deliberately pure module, no jest/vitest dependency added to this workspace.
 */

const MB = 1024 * 1024;

describe('planCompression', () => {
  describe('photos that are already fine', () => {
    test('a small, modest-resolution capture is uploaded untouched', () => {
      assert.deepEqual(planCompression({ bytes: 1.2 * MB, width: 1920, height: 1080 }), []);
    });

    test('a photo exactly at the target is still left alone', () => {
      assert.deepEqual(
        planCompression({ bytes: TARGET_REPORT_PHOTO_BYTES, width: 1600, height: 1200 }),
        []
      );
    });
  });

  describe('photos that must shrink', () => {
    test('a file over the target is compressed even at a modest resolution', () => {
      const steps = planCompression({ bytes: 6 * MB, width: 1600, height: 1200 });
      assert.equal(steps.length, COMPRESSION_LADDER.length);
    });

    test('a huge-resolution photo is compressed even when its file is small', () => {
      // A 108 MP shot that happened to compress well still costs the reporter
      // upload time and the decoder memory, and sits above what the provider
      // needs. Bytes alone is not the whole test.
      const steps = planCompression({ bytes: 1 * MB, width: 12000, height: 9000 });
      assert.equal(steps.length, COMPRESSION_LADDER.length);
      assert.equal(steps[0]?.edge, 2048);
    });

    test('an unreadable file size is treated as too big, not as small', () => {
      // measureBytes() returns null for a file it cannot stat. Assuming "small"
      // there would skip compression on exactly the photos most likely to fail.
      const steps = planCompression({ bytes: null, width: 4000, height: 3000 });
      assert.equal(steps.length, COMPRESSION_LADDER.length);
    });

    test('a photo just over the server ceiling is compressed', () => {
      const steps = planCompression({ bytes: MAX_REPORT_PHOTO_BYTES + 1, width: 2000, height: 1500 });
      assert.ok(steps.length > 0);
    });
  });

  describe('never upscales', () => {
    test('a capture smaller than a step’s edge is re-encoded at that step, not enlarged', () => {
      // 900 px longest edge: every rung of the ladder targets something bigger,
      // so each must resize nothing and only re-encode.
      const steps = planCompression({ bytes: 5 * MB, width: 900, height: 600 });
      assert.deepEqual(
        steps.map((s) => s.edge),
        COMPRESSION_LADDER.map(() => null)
      );
      assert.deepEqual(
        steps.map((s) => s.quality),
        COMPRESSION_LADDER.map((s) => s.quality)
      );
    });

    test('a mid-sized capture resizes only on the rungs below it', () => {
      // 1500 px longest edge: below 2048 and 1600, above 1280.
      const steps = planCompression({ bytes: 5 * MB, width: 1500, height: 1500 });
      assert.deepEqual(
        steps.map((s) => s.edge),
        [null, null, 1280]
      );
    });

    test('portrait captures are judged on their longest edge, not their width', () => {
      // 1200 wide but 4000 tall — reading `width` alone would call this small.
      const steps = planCompression({ bytes: 1 * MB, width: 1200, height: 4000 });
      assert.equal(steps.length, COMPRESSION_LADDER.length);
      assert.equal(steps[0]?.edge, 2048);
    });
  });

  describe('the ladder itself', () => {
    test('descends in both dimension and quality', () => {
      for (let i = 1; i < COMPRESSION_LADDER.length; i += 1) {
        const previous = COMPRESSION_LADDER[i - 1]!;
        const current = COMPRESSION_LADDER[i]!;
        assert.ok((current.edge ?? 0) < (previous.edge ?? 0), 'edge must shrink');
        assert.ok(current.quality < previous.quality, 'quality must drop');
      }
    });

    test('starts at the resolution cap, so the first rung is the cheapest fix', () => {
      assert.equal(COMPRESSION_LADDER[0]?.edge, MAX_REPORT_PHOTO_EDGE);
    });

    test('targets less than the server accepts, leaving room for multipart framing', () => {
      assert.ok(TARGET_REPORT_PHOTO_BYTES < MAX_REPORT_PHOTO_BYTES);
    });
  });
});
