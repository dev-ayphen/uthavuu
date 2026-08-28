"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Height that fills the rest of the viewport from wherever this element starts.
 *
 * Mode B (inner scroll) needs a BOUNDED height, or `overflow-y-auto` has
 * nothing to overflow and the scroll escapes to the document — taking the
 * sub-menu with it. The usual fix is `h-[var(--app-content-height)]`, which is
 * `calc(100svh - header)`. That is correct directly under AppLayout and wrong
 * anywhere below a `PageLayout`, whose sticky page header is IN FLOW and so
 * occupies real height the token knows nothing about. Getting it wrong by that
 * much gives you two scrollbars: the pane's, and the document's underneath.
 *
 * Measuring the element's own top removes the guess, and composes with whatever
 * chrome happens to sit above it.
 *
 * `svh`, never `vh`: `vh` is the viewport with mobile browser chrome ignored,
 * so a `100vh` pane is taller than the screen exactly when the address bar is
 * showing. The console is desktop-first but the rule costs nothing to keep.
 */
export function useViewportFillHeight<T extends HTMLElement>(bottomGapPx = 0) {
  const [offsetTop, setOffsetTop] = useState<number | null>(null);
  const elementRef = useRef<T | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    // Only measure at rest. Once the pane fills the viewport the document
    // should not scroll at all; measuring mid-scroll would feed a shrinking
    // height back into a moving `top` and oscillate.
    if (window.scrollY !== 0) return;
    setOffsetTop(element.getBoundingClientRect().top);
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      elementRef.current = node;
      if (!node) return;
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      if (document.body) observer.observe(document.body);
      observerRef.current = observer;
      measure();
    },
    [measure],
  );

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      observerRef.current?.disconnect();
    };
  }, [measure]);

  // Before the first measurement, fall back to the layout token rather than to
  // `auto` — an unbounded first paint would flash a full-length table.
  const height =
    offsetTop === null
      ? "var(--app-content-height)"
      : `calc(100svh - ${Math.max(0, Math.round(offsetTop)) + bottomGapPx}px)`;

  return { ref, height, remeasure: measure };
}
