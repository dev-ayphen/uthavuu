"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { ErrorBoundary } from "./error-boundary";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

/**
 * The provider tree, outermost first.
 *
 * ThemeProvider wraps the boundary so the fallback UI is themed too — an error
 * screen rendered on the wrong background is its own small failure.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <QueryProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast:
                  "!bg-surface !text-fg !border-border !rounded-card !shadow-popover !font-sans",
                description: "!text-fg-subtle",
              },
            }}
          />
        </QueryProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
