"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  customListAdapter,
  offsetListAdapter,
  useListQuery,
  type FilterDef,
  type ListConfig,
} from "@/components/data";
import { apiFetch } from "@/lib/api-client";

import { ASSIGNED_UNASSIGNED } from "./catalogue";
import { normalizeTicket, type SupportTicket } from "./types";
import { useTicketCatalogue } from "./use-ticket-catalogue";

/**
 * Platform -> Support, from `GET /admin/support-tickets`.
 *
 * NO DEFAULT FILTERS — AND THAT IS THE POINT
 * ───────────────────────────────────────────────────────────────────────────
 * Every filter is optional with no resting value, so nothing narrows the queue
 * at rest. That is what lets `isNarrowed` be trusted: an empty unfiltered queue
 * says "No support tickets yet", an empty FILTERED one says "nothing matched" —
 * the difference between a queue that is genuinely clear and one that looks
 * broken. Getting this wrong tells an operator their data is missing when it is
 * merely filtered out, which on a support queue means a citizen waiting.
 *
 * `sort` / `order` DO have DTO defaults (`createdAt` / `desc`), which is why
 * they are expressed as `defaultSort`: a sort sitting at its resting value
 * stays out of the URL, so the plain `/platform/support` link is the same view
 * as the sorted one.
 *
 * THE CATEGORY PARAM HAD TWO SPELLINGS. IT NOW HAS BOTH.
 * ───────────────────────────────────────────────────────────────────────────
 * The frozen contract spells the category filter `category`; the endpoint
 * originally shipped it as `categoryKey`. This console sends `category`, and
 * `ListSupportTicketsSchema` accepts either — the service reads
 * `query.category ?? query.categoryKey`. That reconciliation matters more than
 * it looks: a Zod object strips unknown keys, so the wrong spelling would not
 * have 400'd, it would have quietly returned the unnarrowed queue and let an
 * operator believe they were looking at a filtered list.
 */

/**
 * The API's own param names. An allowlist, not a catch-all: without it every
 * unrelated param on the URL (a `?ref=` from an email) would be forwarded to
 * the API as a filter, and "clear all" would wipe params this list does not own.
 *
 * `q`, `page` and `limit` are not here — `useListQuery` owns those. `from`,
 * `to` and `userId` are accepted by the shipped DTO but deliberately left out:
 * a filter with no on-screen control narrows the list invisibly, and an
 * operator who cannot see what removed the rows concludes the rows are gone.
 */
const FILTER_KEYS = ["status", "category", "priority", "assigned"] as const;

export const SUPPORT_LIST: ListConfig = {
  filterKeys: FILTER_KEYS,
  defaultFilters: {},
  defaultSort: { key: "createdAt", direction: "desc" },
};

/** The filter key the status tabs drive. Named so the tabs cannot drift from it. */
export const STATUS_FILTER_KEY = "status";

/**
 * `{ items, pagination }`, per `admin-pagination.ts`'s `paginate()`. Read as
 * `unknown` because the ROWS are validated rather than cast — see below.
 */
const SUPPORT_ADAPTER = customListAdapter<unknown, SupportTicket>((raw, context) => {
  // The envelope — total, page count, hasNext/hasPrev, and the ListShapeError
  // for a response that is not a list at all — is the shared layer's job, and
  // it already floors `pageCount` at 0 to match `paginate()`'s "Page 1 of 0"
  // for an empty table. Re-deriving that here would be a second copy of
  // pagination maths, wrong the first time the shared one is corrected.
  const page = offsetListAdapter<unknown>()(raw, context);

  // What is NOT the shared layer's job: the rows. `offsetListAdapter` hands
  // them through as `TRow`, which is a cast, not a check — a response whose
  // shape drifted would render a table of blanks and no error. Mapping through
  // `normalizeTicket` means every row on screen is one the console could
  // actually read, and a row it could not is dropped rather than drawn empty.
  const rows: SupportTicket[] = [];
  for (const entry of page.rows) {
    const ticket = normalizeTicket(entry);
    if (ticket) rows.push(ticket);
  }

  return { ...page, rows };
});

/** The queue. */
export function useSupportTickets() {
  return useListQuery<unknown, SupportTicket>({
    key: ["admin", "support-tickets"],
    fetcher: ({ searchParams, signal }) =>
      apiFetch<unknown>("/admin/support-tickets", { searchParams, signal }),
    adapter: SUPPORT_ADAPTER,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * The admin directory, for the "Assigned to" control
 * ──────────────────────────────────────────────────────────────────────────── */

/** Only what an assignee picker needs. The directory returns much more. */
export type AssignableAdmin = { id: string; name: string; email: string };

type AdminDirectoryRow = {
  userId?: unknown;
  name?: unknown;
  email?: unknown;
};

/**
 * Who a ticket can be assigned to, from `GET /admin/admins`.
 *
 * WHY THIS ENDPOINT IS SAFE TO CALL FROM HERE
 * ───────────────────────────────────────────────────────────────────────────
 * Verified, not assumed: `AdminAccountsController.list()` is gated on
 * `@RequireAdminPermissions('platform:manage')` — the SAME permission
 * `AdminSupportController` requires for its whole class. So anyone who can see
 * this queue can already read the directory, and the picker cannot become a
 * control that 403s for half the people who can see it.
 *
 * It returns a BARE ARRAY of `AdminAccountDetail`, and it spells the id
 * `userId`, not `id` — mapped once, here, rather than at three call sites.
 *
 * FAILURE IS NOT FATAL. `assignable` comes back empty and `failed` goes true,
 * and the callers render a disabled control with the reason beside it rather
 * than an empty dropdown that looks like "there are no admins". `retry: false`
 * because a directory this console merely decorates a control with is not worth
 * a second round trip when the queue itself has already loaded.
 */
export function useAssignableAdmins() {
  const query = useQuery({
    queryKey: ["admin", "admins", "assignable"],
    queryFn: ({ signal }) => apiFetch<unknown>("/admin/admins", { signal }),
    // The directory changes when someone joins or leaves, which is not often.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const admins = useMemo<AssignableAdmin[]>(() => {
    if (!Array.isArray(query.data)) return [];

    const out: AssignableAdmin[] = [];
    for (const entry of query.data as AdminDirectoryRow[]) {
      const id = typeof entry?.userId === "string" ? entry.userId : null;
      if (!id) continue;
      const email = typeof entry.email === "string" ? entry.email : "";
      out.push({
        id,
        // Falls back to the email rather than to "Unnamed": in an assignee
        // picker the email is the more useful identifier anyway, and it is real.
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name : email,
        email,
      });
    }
    return out;
  }, [query.data]);

  return {
    admins,
    isLoading: query.isPending,
    /** True when the directory could not be read. The control degrades, not the page. */
    failed: query.isError,
  };
}

/**
 * The filter controls beside the search box.
 *
 * Status is NOT here — it has its own tab strip (`status-tabs.tsx`), and a
 * second control for the same param would let two things on one screen disagree
 * about what the queue is showing.
 *
 * "Assigned to" is built from the live directory rather than hardcoded, so it
 * cannot drift. Every option except "Unassigned" carries a real `user.id`,
 * which needs no server-side convention — "assigned to me" is simply this
 * operator's own id. See `ASSIGNED_UNASSIGNED` for the single sentinel.
 */
export function useSupportFilters({
  currentAdminId,
}: {
  /** The signed-in admin, so their own row can be marked. Server-resolved. */
  currentAdminId: string | null;
}): readonly FilterDef[] {
  const { admins, failed } = useAssignableAdmins();
  const catalogue = useTicketCatalogue();

  return useMemo<FilterDef[]>(() => {
    const assignedOptions = [{ value: ASSIGNED_UNASSIGNED, label: "Unassigned" }];

    for (const admin of admins) {
      assignedOptions.push({
        value: admin.id,
        label: admin.id === currentAdminId ? `${admin.name} (you)` : admin.name,
      });
    }

    return [
      {
        id: "priority",
        label: "Priority",
        allLabel: "Any priority",
        options: catalogue.priorities,
      },
      {
        id: "category",
        label: "Category",
        allLabel: "Any category",
        options: catalogue.categories,
      },
      {
        id: "assigned",
        label: "Assigned to",
        allLabel: "Anyone",
        // A directory that failed to load leaves "Unassigned" — which needs no
        // directory — rather than an empty dropdown implying there are no
        // admins to assign to.
        options: failed ? [{ value: ASSIGNED_UNASSIGNED, label: "Unassigned" }] : assignedOptions,
      },
    ];
  }, [admins, failed, currentAdminId, catalogue.priorities, catalogue.categories]);
}
