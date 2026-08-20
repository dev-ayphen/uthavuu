// GPS → human-readable city/district. Per docs/features/auth.md BR-4, this is a label
// and fallback filter only — never re-derive lat/lng from it, only ever the other way.

import * as Location from 'expo-location';

export type ReverseGeocodeResult = {
  city: string;
  district: string;
};

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
  return {
    city: result?.city ?? result?.subregion ?? '',
    district: result?.subregion ?? result?.region ?? '',
  };
}
