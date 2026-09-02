"use client";

import { arrayListAdapter, useListQuery, type ListConfig } from "@/components/data";
import { useDetailQuery, type DetailView } from "@/features/moderation/detail-query";
import { apiFetch } from "@/lib/api-client";
import { ADMIN_NOT_FOUND_CODES } from "./admin-errors";
import type { AdminAccountDetail } from "./types";

/**
 * Every read this section makes, in one place.
 *
 * ⚠ THE TWO ENDPOINTS DISAGREE ABOUT WHAT AN ADMIN ACCOUNT IS
 * ───────────────────────────────────────────────────────────────────────────
 * `GET /admin/admins/:id` (`AdminAccountsService.findOne`) returns the full
 * record — status, last login, `isSelf`, `isLastSuperAdmin`. `GET /admin/admins`
 * does not: the list is still served by the older `AdminService.listAdmins()`,
 * which selects five columns and none of those four.
 *
 * Nothing here papers over that. The table renders what it was told and says
 * "Not reported" for what it was not, pointing at the detail page, which does
 * know. Inventing an "Active" badge or a "Never" last-login from an absent
 * field would be the console making a claim about a colleague's account that no
 * endpoint made — see `./types.ts`.
 *
 * Isolating both fetches here means the day `listAdmins()` catches up, the
 * table starts telling the truth with no change to any component.
 *
 * A BARE ARRAY, AND AN ADAPTER PINNED TO SAY SO
 * ───────────────────────────────────────────────────────────────────────────
 * `GET /admin/admins` returns a plain array with no pagination envelope — this
 * is a handful of staff accounts, not a citizen directory, and the contract
 * declares no query params at all. `detectListAdapter` would cope, but the
 * shape is settled and `arrayListAdapter` is the honest declaration of that: it
 * reports `total: rows.length` and `hasNext: false`, so the page cannot grow a
 * Next button that would page past the end of a list with no pages.
 *
 * NO FILTERS AND NO SORT, DELIBERATELY. The endpoint accepts neither, so a
 * status dropdown would be either a client-side filter that disagrees with the
 * URL contract every other list here honours, or a param the API silently
 * ignores. The API already orders by role then email, which is the order an
 * operator wants; re-sorting client-side would make the header controls lie
 * about being server-backed.
 */
export const ADMINS_LIST: ListConfig = {
  filterKeys: [],
  defaultFilters: {},
  defaultSort: null,
};

export function useAdminAccounts() {
  return useListQuery<AdminAccountDetail[], AdminAccountDetail>({
    key: ["admin", "admins"],
    fetcher: ({ signal }) => apiFetch<AdminAccountDetail[]>("/admin/admins", { signal }),
    adapter: arrayListAdapter<AdminAccountDetail>(),
  });
}

/**
 * One admin account.
 *
 * `ADMIN_NOT_FOUND` is the real code, taken from the service's own
 * `NotFoundException`, and passing it matters: `useDetailQuery` uses this list
 * to tell "that account was revoked" — its own empty state, with a way back to
 * the list — from "the request failed", which gets an error state and a retry.
 * Without it a 404 would fall through to `classifyListFailure` and render "That
 * list doesn't exist yet", which is the right answer for an unbuilt endpoint
 * and quite the wrong one for an admin somebody just revoked.
 */
export function useAdminAccount(userId: string): {
  view: DetailView<AdminAccountDetail>;
  refetch: () => void;
} {
  const { view, refetch } = useDetailQuery<AdminAccountDetail>({
    key: ["admin", "admins", "detail", userId],
    path: `/admin/admins/${encodeURIComponent(userId)}`,
    notFoundCodes: ADMIN_NOT_FOUND_CODES,
  });

  return { view, refetch };
}
