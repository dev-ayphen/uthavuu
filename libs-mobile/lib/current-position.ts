// Getting a usable position out of a phone that is indoors, on battery saver,
// or simply cold-starting its GPS.
//
// WHY `getCurrentPositionAsync({})` IS NOT ENOUGH. It asks the OS for a FRESH
// fix and rejects with "Current location is unavailable. Make sure that location
// services are enabled" when the OS cannot produce one. Expo's own docs say that
// call "may take some time to resolve, especially when you're inside a
// building" — and a citizen reporting an emergency is very often inside a
// building, on a mid-range phone, in a hurry. A bare call there fails for a
// reason the reporter cannot act on, with a message that blames a setting which
// may well already be on.
//
// THREE OUTCOMES, THREE DIFFERENT REMEDIES, which is the whole point of this
// file — the screen can only say something useful if it can tell them apart:
//
//   services off      → the Location toggle is off. Only the user can fix it.
//   no fix, but cached → use the cached fix. A few hundred metres stale beats
//                        refusing to let them file the report at all.
//   nothing at all     → genuinely unavailable; retry or type it in.

import * as Location from 'expo-location';

/** Location is switched off at the OS level — a settings trip, not a retry. */
export class LocationServicesDisabledError extends Error {
  constructor() {
    super('Location services are disabled on this device.');
    this.name = 'LocationServicesDisabledError';
  }
}

/** Services are on, but neither a fresh nor a cached fix could be obtained. */
export class LocationUnavailableError extends Error {
  constructor() {
    super('No location fix is available right now.');
    this.name = 'LocationUnavailableError';
  }
}

export type Coordinates = { lat: number; lng: number };

/**
 * How long to wait for a fresh fix before settling for a cached one.
 *
 * expo-location exposes no timeout of its own, so this is a race. 12 seconds is
 * long enough for a warm GPS or a Wi-Fi/cell triangulation to land, and short
 * enough that a reporter is not left watching a spinner while an emergency is in
 * progress — at which point a cached fix from minutes ago is plainly the better
 * answer.
 */
const FRESH_FIX_TIMEOUT_MS = 12_000;

/** A cached fix older than this is treated as no fix at all. */
const MAX_CACHED_AGE_MS = 10 * 60 * 1000;

/**
 * Widest cached-fix uncertainty still worth using, in metres.
 *
 * The report's radius options start at 1 km, so a fix good to ~2 km still puts
 * the request in the right neighbourhood for volunteers to self-select. Beyond
 * that it stops being a location and starts being a guess.
 */
const MAX_CACHED_UNCERTAINTY_M = 2000;

/**
 * Balanced, not High.
 *
 * `High` asks for a ~10 m GPS-grade fix, which is the accuracy least likely to
 * resolve indoors and the one that drains the most battery getting there. A
 * report is placed on a map at neighbourhood scale — ~100 m is already finer
 * than the smallest radius a volunteer can choose.
 */
const FRESH_FIX_ACCURACY = Location.Accuracy.Balanced;

function toCoordinates(position: Location.LocationObject): Coordinates {
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}

/** Resolves null rather than rejecting, so the caller can simply fall through. */
async function freshFix(): Promise<Location.LocationObject | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: FRESH_FIX_ACCURACY }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), FRESH_FIX_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // "Current location is unavailable" lands here. Not fatal on its own — the
    // cached fix below is still worth asking for.
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function cachedFix(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getLastKnownPositionAsync({
      maxAge: MAX_CACHED_AGE_MS,
      requiredAccuracy: MAX_CACHED_UNCERTAINTY_M,
    });
  } catch {
    return null;
  }
}

/**
 * A position to attach to a report, or a typed error saying why there is none.
 *
 * Assumes foreground permission has already been granted — permission is the
 * caller's business, because the remedy for a denial is a prompt this function
 * has no business showing.
 *
 * Throws `LocationServicesDisabledError` or `LocationUnavailableError`; never a
 * bare expo-location error, so no screen has to pattern-match on a vendor's
 * message string to decide what to tell somebody.
 */
export async function getUsablePosition(): Promise<Coordinates> {
  // Checked FIRST and reported separately: if the toggle is off, no amount of
  // waiting or retrying will help, and "check your GPS/network and try again"
  // would be advice that cannot work.
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationServicesDisabledError();
  }

  const fresh = await freshFix();
  if (fresh) return toCoordinates(fresh);

  const cached = await cachedFix();
  if (cached) return toCoordinates(cached);

  throw new LocationUnavailableError();
}
