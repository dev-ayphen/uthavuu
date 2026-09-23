// GPS → human-readable city/district. Per docs/features/auth.md BR-4, this is a label
// and fallback filter only — never re-derive lat/lng from it, only ever the other way.

import * as Location from 'expo-location';

export type ReverseGeocodeResult = {
  city: string;
  district: string;
};

/**
 * NEVER THROWS — by design, and this is the whole point of the function.
 *
 * `reverseGeocodeAsync` is a network call to a platform geocoder (Apple's on
 * iOS, Play services' on Android). It fails for reasons that have nothing to do
 * with the coordinate it was handed: no network, the geocoder rate-limiting the
 * device, an Android build without Play services, a simulator with no data
 * connection. Callers had it inside the same `try` as the GPS fix, so any of
 * those blocked the flow — most damagingly on PermissionsScreen, where a failed
 * LABEL lookup stopped a user finishing signup even though a perfectly good
 * lat/lng had already been obtained. The coordinate is the data; city/district
 * are decoration. Losing the decoration must never cost the data.
 *
 * Callers already handle empty labels (`city ? `${city}, ${district}` : district`),
 * so "" is a valid, expected result rather than a sentinel anyone has to check.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return {
      city: result?.city ?? result?.subregion ?? '',
      district: result?.subregion ?? result?.region ?? '',
    };
  } catch (e) {
    console.warn('[geocode] reverse lookup failed; continuing without a place label', e);
    return { city: '', district: '' };
  }
}
