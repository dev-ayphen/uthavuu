import { useCallback, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';

/**
 * The device's CURRENT position, for surfaces that need to be right about where
 * the user is now.
 *
 * WHY THIS EXISTS. `user.lastLat`/`lastLng` are written exactly once, during
 * signup (PermissionsScreen → ProfileSetup), and nothing ever updates them.
 * Every screen that read them was therefore answering "what is happening near
 * you?" with the coordinates of wherever the user happened to be standing when
 * they created their account. On a product whose promise is help within 1 km in
 * under a minute, someone who signs up at home and opens the app across the
 * city was being shown their neighbours' requests, not the ones around them.
 *
 * The stored coordinate stays as the FALLBACK — a stale real location beats no
 * location, and it is all there is when GPS is off or permission was refused.
 * Callers resolve in this order: an explicit location the user chose to explore,
 * then this hook's live fix, then the stored signup coordinate.
 *
 * PERMISSION IS NOT RE-PROMPTED ON ITS OWN. The focus refresh calls
 * `getForegroundPermissionsAsync`, which only reports the current grant; the
 * system dialog appears only when a caller passes `{ prompt: true }` from a
 * deliberate user action such as "Use my current location". A background
 * refresh that could throw up an OS dialog every time a tab regains focus is
 * its own bug.
 */
export type LocationStatus =
  | 'idle'
  | 'locating'
  | 'granted'
  | 'denied'
  | 'unavailable';

export type Coords = { lat: number; lng: number };

/**
 * How stale a fix may be before a screen focus re-reads GPS. A position request
 * costs battery and takes a moment, so refocusing after a few seconds — which
 * happens constantly during normal tab navigation — reuses the last fix.
 */
const STALE_AFTER_MS = 2 * 60_000;

export function useCurrentLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  // A ref, not state: this only gates whether the next refresh runs, and
  // re-rendering because a timestamp moved would be pointless work.
  const lastFixAt = useRef<number>(0);

  const refresh = useCallback(
    async (options?: { prompt?: boolean; force?: boolean }): Promise<Coords | null> => {
      const { prompt = false, force = false } = options ?? {};
      if (!force && !prompt && Date.now() - lastFixAt.current < STALE_AFTER_MS) {
        return coords;
      }

      setStatus('locating');
      try {
        const permission = prompt
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();

        if (permission.status !== 'granted') {
          setStatus('denied');
          return null;
        }

        const position = await Location.getCurrentPositionAsync({});
        const next: Coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        lastFixAt.current = Date.now();
        setCoords(next);
        setStatus('granted');
        return next;
      } catch {
        // GPS off, no fix, airplane mode. Distinct from 'denied' because the
        // remedy is different: denied is answered by a permission prompt or the
        // Settings app, unavailable by moving or waiting.
        setStatus('unavailable');
        return null;
      }
    },
    [coords]
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
      // Re-reading on focus is the point — coming back to a screen is exactly
      // when a position taken somewhere else has gone stale.
    }, [refresh])
  );

  return { coords, status, refresh };
}
