"use client";

import { useQuery, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminMutate } from "@/features/moderation/api";
import { apiFetch } from "@/lib/api-client";
import type { AdminSettings, AdminSettingsPatch } from "./types";

/**
 * THE ONE SEAM BETWEEN THIS PAGE AND THE API.
 *
 * Every network call this feature makes is in this file, and both go to the
 * real contract path. Nothing is mocked and no placeholder record is invented:
 * the API's implementation exists in the tree but the running container still
 * answers 404, so this page starts working the moment that container restarts,
 * with no console change at all. Until then `settings-view.tsx` says so in
 * words rather than filling the gap with plausible numbers.
 *
 * WHY NOT A NEW FETCH WRAPPER. `src/lib/api-client.ts` types its `method` as
 * `"GET" | "POST"`, which cannot express PATCH — so the read goes through
 * `apiFetch` and the write reuses `features/moderation/api.ts`'s `adminMutate`,
 * which already widened it for exactly this reason and keeps the same
 * contract: `credentials: "include"`, an `ApiError` for every failure, and
 * `status === null` reserved for "never got a reply". Announcements already
 * imports across the same boundary. A third fetch idiom would be one more
 * place for the cookie flag to be forgotten.
 */

export const APP_SETTINGS_PATH = "/admin/settings";
export const APP_SETTINGS_KEY: QueryKey = ["admin", "settings"];

export function useAppSettings() {
  return useQuery({
    queryKey: APP_SETTINGS_KEY,
    queryFn: ({ signal }) => apiFetch<AdminSettings>(APP_SETTINGS_PATH, { signal }),
    // Two operators can be in here at once, and the "last changed by" strip is
    // only worth showing if it is current. Refetching on focus is also what
    // surfaces someone else's change — see the note on `defaultValues` in
    // `settings-form.tsx` for why that can never clobber what is being typed.
    staleTime: 15_000,
    // Re-asking cannot turn a permission refusal into permission, and cannot
    // conjure a route the API does not serve. Both are the failures this page
    // actually sees today.
    retry: false,
  });
}

/**
 * Save a subset of the settings.
 *
 * `patch` is deliberately partial: the contract accepts any subset, which is
 * what lets a kill switch be flipped on its own without shipping the rest of
 * the form's values along with it — and therefore without an operator's
 * half-finished edit to `appName` riding into production on the back of an
 * emergency switch.
 *
 * NOT OPTIMISTIC, and not hand-patched either. `PATCH` answers with the whole
 * new record, so the cache is set from the SERVER'S OWN ANSWER rather than
 * from a guess about what the server did — including `updatedAt` and
 * `updatedBy`, which only the API can know. The invalidate behind it is the
 * cheap guarantee that anything derived later still reconciles.
 *
 * A completed ACTION is a toast. A failed LOAD is not — that is `ErrorState`.
 */
export async function saveAppSettings({
  queryClient,
  patch,
  success,
}: {
  queryClient: QueryClient;
  patch: AdminSettingsPatch;
  success: string;
}): Promise<AdminSettings> {
  const saved = await adminMutate<AdminSettings>(APP_SETTINGS_PATH, "PATCH", patch);
  queryClient.setQueryData(APP_SETTINGS_KEY, saved);
  await queryClient.invalidateQueries({ queryKey: APP_SETTINGS_KEY });
  toast.success(success);
  return saved;
}
