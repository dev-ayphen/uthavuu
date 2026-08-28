"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Theme plumbing.
 *
 * next-themes writes `data-theme` onto <html> from a blocking inline script in
 * <head>, before first paint — that is what prevents the flash of the wrong
 * theme on a hard load. The value is persisted in localStorage under
 * `uthavu-admin-theme`.
 *
 * `disableTransitionOnChange` suppresses the CSS colour transitions for the
 * duration of a theme swap, so toggling reads as an instant repaint rather
 * than every surface on screen cross-fading independently.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
      themes={["light", "dark"]}
      storageKey="uthavu-admin-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
