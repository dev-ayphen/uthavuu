"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Defer a call until the user stops doing the thing.
 *
 * Used for search-as-you-type: without it, "chennai" is seven requests and
 * seven URL rewrites, and the replies can land out of order so the table ends
 * up showing results for "chenn".
 *
 * The callback is held in a ref rather than in the dependency array, so a
 * caller passing an inline arrow does not cancel and restart the timer on every
 * render — which would mean it never fires while typing continues.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number,
): { run: (...args: TArgs) => void; cancel: () => void; flush: (...args: TArgs) => void } {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // A pending timer that fires after unmount would call setState on a gone
  // component and, worse here, rewrite the URL of whatever page replaced it.
  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    (...args: TArgs) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        callbackRef.current(...args);
      }, delayMs);
    },
    [cancel, delayMs],
  );

  /** Fire now and drop the pending timer — for Enter and for blur. */
  const flush = useCallback(
    (...args: TArgs) => {
      cancel();
      callbackRef.current(...args);
    },
    [cancel],
  );

  return { run, cancel, flush };
}
