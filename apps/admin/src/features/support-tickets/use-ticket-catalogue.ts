"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";

import {
  TICKET_CATEGORY_OPTIONS,
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_OPTIONS,
  type TicketOption,
} from "./catalogue";

/**
 * The statuses, priorities and categories this section filters on, read from
 * the database rather than transcribed from it.
 *
 * `GET /admin/support-tickets/catalogue` was added for exactly this — the
 * service's own comment names `features/support-tickets/catalogue.ts` as the
 * problem it solves. Same shape and same reasoning as the audit page's
 * `GET /admin/audit-logs/catalogue` (ADR 0012): the console needs the COMPLETE,
 * ORDERED set on day one, and `select distinct` over the tickets could only
 * ever offer the values somebody already used.
 *
 * The API returns them pre-ordered — statuses and priorities by `sort_order`,
 * so the lifecycle renders as a pipeline rather than as an alphabetical list —
 * which is why nothing here sorts them again.
 *
 * FALLS BACK RATHER THAN EMPTIES. Before the request resolves (and for as long
 * as it cannot), the transcribed constants stand in. The status tabs are this
 * queue's primary navigation; an empty tab bar on arrival, or during an API
 * blip, is a worse failure than a briefly stale one. See the long note in
 * `./catalogue.ts` for why that trade is made in this direction.
 */

type CatalogueEntry = { key?: unknown; label?: unknown; id?: unknown };

type CatalogueResponse = {
  statuses?: unknown;
  priorities?: unknown;
  categories?: unknown;
};

export type TicketCatalogue = {
  statuses: readonly TicketOption[];
  priorities: readonly TicketOption[];
  categories: readonly TicketOption[];
  /** True until the real catalogue lands. Callers may show a resting state. */
  isFallback: boolean;
};

function readOptions(raw: unknown, fallback: readonly TicketOption[]): readonly TicketOption[] {
  if (!Array.isArray(raw)) return fallback;

  const out: TicketOption[] = [];
  for (const entry of raw as CatalogueEntry[]) {
    const key = typeof entry?.key === "string" && entry.key.trim() ? entry.key : null;
    if (!key) continue;
    // The label falls back to the key rather than to empty: an unlabelled
    // option is unpickable, and the key is at least true.
    out.push({
      value: key,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label : key,
    });
  }

  // An empty catalogue is treated as no catalogue. A filter bar with zero
  // options is indistinguishable from a broken one, and the constants are
  // strictly more useful than nothing.
  return out.length > 0 ? out : fallback;
}

export function useTicketCatalogue(): TicketCatalogue {
  const query = useQuery({
    queryKey: ["admin", "support-tickets", "catalogue"],
    queryFn: ({ signal }) => apiFetch<CatalogueResponse>("/admin/support-tickets/catalogue", { signal }),
    // Lookup tables change on a `db:seed`, not on a shift. Refetching them
    // behind every list request would be one wasted round trip per navigation.
    staleTime: 10 * 60 * 1000,
    // A catalogue that cannot be read is not worth a second attempt: the
    // constants already cover it, and the queue itself has its own retry.
    retry: false,
  });

  return useMemo<TicketCatalogue>(() => {
    const data = query.data;

    return {
      statuses: readOptions(data?.statuses, TICKET_STATUS_OPTIONS),
      priorities: readOptions(data?.priorities, TICKET_PRIORITY_OPTIONS),
      categories: readOptions(data?.categories, TICKET_CATEGORY_OPTIONS),
      isFallback: data === undefined,
    };
  }, [query.data]);
}
