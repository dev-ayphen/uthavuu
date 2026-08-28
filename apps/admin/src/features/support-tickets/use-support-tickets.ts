"use client";

import { useListQuery, type FilterDef, type ListConfig } from "@/components/data";
import { apiFetch } from "@/lib/api-client";

/**
 * Platform -> Support, from `GET /admin/support-tickets`.
 *
 * NO DEFAULT FILTERS — AND THAT IS THE POINT
 * ───────────────────────────────────────────────────────────────────────────
 * Every filter in `ListSupportTicketsSchema` is `.optional()` with no default,
 * so nothing is narrowing at rest. This table currently returns `total: 0`, and
 * because `isNarrowed` is false the operator is told "No support tickets yet"
 * rather than "nothing matched your filters" — the difference between a queue
 * that is genuinely clear and one that looks broken.
 *
 * `sort`/`order` DO have DTO defaults (`createdAt` / `desc`), which is why they
 * are expressed as `defaultSort` instead: a sort sitting at its resting value
 * stays out of the URL, so the plain `/platform/support` link is the same view
 * as the sorted one.
 */
export const SUPPORT_LIST: ListConfig = {
  // An allowlist of the filters that have a VISIBLE control. `userId`, `from`
  // and `to` are accepted by the API but deliberately left out: a filter with
  // no on-screen control narrows the list invisibly, and an operator who cannot
  // see what removed the rows concludes the rows are gone.
  filterKeys: ["status", "categoryKey"],
  defaultFilters: {},
  defaultSort: { key: "createdAt", direction: "desc" },
};

export type SupportTicketRow = {
  id: string;
  subject: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  category: { key: string; label: string };
  status: { key: string; label: string };
  user: {
    id: string;
    name: string;
    /** Admin-only projection — staff need it to follow up. Never on a citizen route. */
    phoneNumber: string | null;
    avatarUrl: string | null;
  };
};

type SupportListResponse = {
  items: SupportTicketRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function useSupportTickets() {
  return useListQuery<SupportListResponse, SupportTicketRow>({
    key: ["admin", "support-tickets"],
    fetcher: ({ searchParams, signal }) =>
      apiFetch<SupportListResponse>("/admin/support-tickets", { searchParams, signal }),
  });
}

/**
 * Filter options, transcribed from `db/seed.ts`.
 *
 * WHY THESE ARE HARDCODED AND AUDIT LOGS' ARE NOT
 * ───────────────────────────────────────────────────────────────────────────
 * `ticket_statuses` and `ticket_categories` are lookup tables with no catalogue
 * endpoint — there is no support equivalent of `GET /admin/audit-logs/catalogue`,
 * so there is nothing to read them from. That makes this list a genuine
 * duplicate of the seed, and it can drift.
 *
 * The failure mode is quiet, which is what makes it worth naming: the service
 * matches on `eq(ticketStatuses.key, ...)`, so a key that no longer exists
 * returns 200 with an empty page rather than a 400. Verified live:
 * `?status=bogus` -> 200, total 0. A stale option here would look like "no
 * tickets in that state", not like a broken filter.
 *
 * The fix is a `GET /admin/support-tickets/catalogue` on the API side, at which
 * point this constant is deleted and replaced with a query — exactly as the
 * audit page already does.
 */
export const SUPPORT_FILTERS: readonly FilterDef[] = [
  {
    id: "status",
    label: "Status",
    allLabel: "Any status",
    options: [
      { value: "new", label: "New" },
      { value: "in_review", label: "In Review" },
      { value: "resolved", label: "Resolved" },
    ],
  },
  {
    id: "categoryKey",
    label: "Category",
    allLabel: "Any category",
    options: [
      { value: "technical_problem", label: "Technical Problem" },
      { value: "bug_report", label: "Bug Report" },
      { value: "account_problem", label: "Account Problem" },
      { value: "feature_request", label: "Feature Request" },
      { value: "complaint", label: "Complaint" },
      { value: "other", label: "Other" },
    ],
  },
];

/** Badge tone per ticket state. Unknown keys stay neutral rather than guessing. */
export function statusTone(key: string): "info" | "warning" | "success" | "neutral" {
  switch (key) {
    case "new":
      return "info";
    case "in_review":
      return "warning";
    case "resolved":
      return "success";
    default:
      return "neutral";
  }
}
