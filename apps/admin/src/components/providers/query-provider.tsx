"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Server-state plumbing.
 *
 * The client is created inside `useState` so each browser session gets exactly
 * one instance, and so a module-level client is never shared across requests on
 * the server (which would leak one user's cached data into another's render).
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Moderation data goes stale fast; a short window still spares the
            // API a refetch storm when an operator tabs between sections.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
