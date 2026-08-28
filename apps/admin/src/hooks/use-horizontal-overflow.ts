"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Is this element actually scrolling sideways right now?
 *
 * A horizontally scrollable region has to be keyboard-operable (WCAG 2.1.1) —
 * otherwise the only way to reach the columns off the right edge is a mouse.
 * The fix is `tabIndex={0}`, but applying it unconditionally puts a tab stop on
 * every table whether or not it overflows, so keyboard users pay a stop for a
 * scroll that isn't there. This measures, so the stop appears only when it buys
 * something.
 *
 * Re-measured on element resize AND content resize: a column of long Tamil
 * addresses can push a table into overflow without the container changing size
 * at all.
 */
export function useHorizontalOverflow<T extends HTMLElement>() {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const elementRef = useRef<T | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    // 1px of slack: sub-pixel layout rounding otherwise reports a permanent
    // 0.5px overflow on tables that visibly fit.
    setIsOverflowing(element.scrollWidth - element.clientWidth > 1);
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      elementRef.current = node;
      if (!node) return;

      const observer = new ResizeObserver(measure);
      observer.observe(node);
      const content = node.firstElementChild;
      if (content) observer.observe(content);
      observerRef.current = observer;
      measure();
    },
    [measure],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, isOverflowing, measure };
}
