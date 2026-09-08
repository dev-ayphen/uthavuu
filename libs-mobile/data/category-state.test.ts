import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK_CATEGORY_TILES } from './categories';
import { resolveCategoryState, type ServerCategory } from './category-state';

/**
 * The empty-versus-fallback distinction.
 *
 * WHY `node:test` AND NOT JEST OR VITEST. `apps/mobile` and `libs-mobile` have
 * no unit-test runner at all — the only mobile tests in this repo are Maestro
 * E2E flows. Adding jest-expo or vitest here would mean a new dependency and a
 * rewritten `pnpm-lock.yaml`, which is a shared, append-only-ish artifact that
 * parallel sessions coordinate over (COORDINATION.md § 2). Node 24 strips
 * TypeScript types natively and ships a test runner, so this file costs nothing
 * and blocks nobody.
 *
 * That is only possible because `category-state.ts` is pure: no React, no React
 * Query, no React Native. Which is itself the argument for having extracted it —
 * the rule that was wrong is now the rule that is tested.
 */

const SERVER_ROWS: ServerCategory[] = [
  { key: 'medicalHelp', label: 'Medical Help', emoji: '❤️' },
  { key: 'animalRescue', label: 'Animal Rescue', emoji: '🐶' },
];

describe('resolveCategoryState', () => {
  describe('while nothing is known yet', () => {
    test('renders the bundled tiles while loading, and says they are the fallback', () => {
      const state = resolveCategoryState({
        data: undefined,
        isPending: true,
        isError: false,
      });

      assert.equal(state.source, 'fallback');
      assert.equal(state.isFallback, true);
      assert.equal(state.isLoading, true);
      assert.equal(state.isEmpty, false);
      assert.deepEqual(state.categories, FALLBACK_CATEGORY_TILES);
    });

    test('renders the bundled tiles on a failed request — deliberate offline resilience', () => {
      const state = resolveCategoryState({
        data: undefined,
        isPending: false,
        isError: true,
      });

      assert.equal(state.source, 'fallback');
      assert.equal(state.isFallback, true);
      assert.equal(state.isError, true);
      assert.equal(state.categories.length, 8);
    });
  });

  describe('when the server answered with rows', () => {
    test('uses the server rows, not the bundle', () => {
      const state = resolveCategoryState({
        data: SERVER_ROWS,
        isPending: false,
        isError: false,
      });

      assert.equal(state.source, 'server');
      assert.equal(state.isFallback, false);
      assert.equal(state.isEmpty, false);
      assert.deepEqual(
        state.categories.map((c) => c.id),
        ['medicalHelp', 'animalRescue'],
      );
      assert.deepEqual(
        state.categories.map((c) => c.title),
        ['Medical Help', 'Animal Rescue'],
      );
    });

    test('preserves the server order — the API decides it, not this function', () => {
      // The API sorts alphabetically by label under an ICU collation
      // (apps/api/src/reports/report-category-order.ts). Re-sorting here would
      // put the app back out of step with the admin console, which is the
      // original bug.
      const reversed = [...SERVER_ROWS].reverse();
      const state = resolveCategoryState({
        data: reversed,
        isPending: false,
        isError: false,
      });

      assert.deepEqual(
        state.categories.map((c) => c.id),
        ['animalRescue', 'medicalHelp'],
      );
    });

    test('gives an unknown key a colour instead of crashing', () => {
      const state = resolveCategoryState({
        data: [{ key: 'floodRescue', label: 'Flood Rescue', emoji: '🌊' }],
        isPending: false,
        isError: false,
      });

      assert.equal(state.categories[0].id, 'floodRescue');
      assert.equal(typeof state.categories[0].color, 'string');
      assert.ok(state.categories[0].color.length > 0);
    });
  });

  describe('when the server answered with NONE — the bug', () => {
    const emptyResponse = resolveCategoryState({
      data: [],
      isPending: false,
      isError: false,
    });

    test('does NOT substitute the bundled tiles', () => {
      // The old code rendered all eight here. A citizen tapping one of them sent
      // `categoryKey` for a category the server does not have, and the report
      // failed to create.
      assert.deepEqual(emptyResponse.categories, []);
      assert.notEqual(emptyResponse.categories.length, 8);
    });

    test('reports an honest empty state rather than a silent fallback', () => {
      assert.equal(emptyResponse.source, 'empty');
      assert.equal(emptyResponse.isEmpty, true);
      assert.equal(emptyResponse.isFallback, false);
      assert.equal(emptyResponse.isLoading, false);
      assert.equal(emptyResponse.isError, false);
    });

    test('never claims to be showing live data while showing the bundle', () => {
      // The precise defect: `isFallback: false` alongside eight bundled tiles.
      // Whatever else changes, these two must never disagree.
      for (const input of [
        { data: undefined, isPending: true, isError: false },
        { data: undefined, isPending: false, isError: true },
        { data: [], isPending: false, isError: false },
        { data: SERVER_ROWS, isPending: false, isError: false },
      ]) {
        const state = resolveCategoryState(input);
        const showingBundle =
          state.categories.length > 0 &&
          state.categories === FALLBACK_CATEGORY_TILES;

        assert.equal(
          showingBundle,
          state.isFallback,
          `showing the bundle must equal isFallback for ${JSON.stringify(input)}`,
        );
      }
    });
  });

  describe('a successful answer outranks a later failure', () => {
    test('keeps server rows when a refetch fails', () => {
      const state = resolveCategoryState({
        data: SERVER_ROWS,
        isPending: false,
        isError: true,
      });

      assert.equal(state.source, 'server');
      assert.equal(state.isFallback, false);
      assert.equal(state.categories.length, 2);
    });

    test('keeps the empty state when a refetch fails, rather than reverting to the bundle', () => {
      // "The server told us there are none, and our latest check failed" is
      // still better evidence than a list compiled into this build months ago.
      const state = resolveCategoryState({
        data: [],
        isPending: false,
        isError: true,
      });

      assert.equal(state.source, 'empty');
      assert.equal(state.isEmpty, true);
      assert.deepEqual(state.categories, []);
    });
  });
});
