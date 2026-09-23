import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The one contract this module has: `reverseGeocode` NEVER throws.
 *
 * It is worth a test because the failure it guards against is invisible in
 * development and total in the field. `reverseGeocodeAsync` is a network call to
 * a platform geocoder, so it fails for reasons unrelated to the coordinate —
 * and every caller had it inside the same `try` as the GPS fix. On
 * PermissionsScreen that meant a failed LABEL lookup stopped a user finishing
 * signup, with a "Could not get your location" alert, seconds after a perfectly
 * good latitude and longitude had already been obtained.
 *
 * `expo-location` is a native module and cannot be imported under plain `node`,
 * so it is mocked here. Same runner and harness as the other unit tests in this
 * package — see data/category-state.test.ts for why it is `node:test`.
 */

const reverseGeocodeAsync = mock.fn();

mock.module('expo-location', {
  namedExports: { reverseGeocodeAsync },
});

const { reverseGeocode } = await import('./geocode');

describe('reverseGeocode', () => {
  test('maps a full result to city and district', async () => {
    reverseGeocodeAsync.mock.mockImplementationOnce(async () => [
      { city: 'Chennai', subregion: 'Chennai', region: 'Tamil Nadu' },
    ]);

    assert.deepEqual(await reverseGeocode(13.0827, 80.2707), {
      city: 'Chennai',
      district: 'Chennai',
    });
  });

  test('falls back through subregion and region when city is missing', async () => {
    reverseGeocodeAsync.mock.mockImplementationOnce(async () => [
      { city: null, subregion: null, region: 'Tamil Nadu' },
    ]);

    assert.deepEqual(await reverseGeocode(13.0827, 80.2707), {
      city: '',
      district: 'Tamil Nadu',
    });
  });

  test('returns empty labels when the geocoder has nothing for the coordinate', async () => {
    reverseGeocodeAsync.mock.mockImplementationOnce(async () => []);

    assert.deepEqual(await reverseGeocode(0, 0), { city: '', district: '' });
  });

  test('RESOLVES, never rejects, when the geocoder itself fails', async () => {
    reverseGeocodeAsync.mock.mockImplementationOnce(async () => {
      throw new Error('Network request failed');
    });

    // The assertion that matters: the caller keeps its coordinate and carries on.
    assert.deepEqual(await reverseGeocode(13.0827, 80.2707), {
      city: '',
      district: '',
    });
  });
});
