"use client";

import { useQuery, type QueryKey } from "@tanstack/react-query";
import { FileQuestion } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { ListFailureState } from "@/components/data";
import { EmptyState, Button } from "@/components/ui";
import { apiFetch } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { classifyListFailure, type ListFailure } from "@/lib/list-failure";
import { shouldRetryListError } from "@/hooks/use-list-query";
import Link from "next/link";
import type { Route } from "next";

/**
 * The detail-page counterpart to `useListQuery`.
 *
 * Same discriminated-union discipline, for the same reason: a detail page that
 * checks `if (!data)` before `if (isError)` renders "not found" for a request
 * that failed, and "this user does not exist" is a very different thing to tell
 * a moderator than "the API is down". One `view.kind` at a time, resolved here
 * in the fixed order loading → failure → not-found → ready.
 *
 * NOT-FOUND IS ITS OWN BRANCH, NOT AN ERROR
 * ───────────────────────────────────────────────────────────────────────────
 * `USER_NOT_FOUND` / `REPORT_NOT_FOUND` arrive as a 404, and
 * `classifyListFailure` renders a 404 as "that list doesn't exist yet" — right
 * for a missing endpoint, wrong for a record someone hard-deleted. It is also
 * deliberately NOT Next's `notFound()`: that renders `app/not-found.tsx`, which
 * sits outside the console shell, so an operator who followed a stale link
 * would lose the sidebar and have no way back into the section they were
 * working in.
 */
export type DetailView<T> =
  | { kind: "loading" }
  | { kind: "failure"; failure: ListFailure; retry: () => void }
  | { kind: "not-found" }
  | { kind: "ready"; record: T };

export function useDetailQuery<T>({
  key,
  path,
  notFoundCodes,
}: {
  key: QueryKey;
  path: string;
  /** API codes that mean "no such record", e.g. `["REPORT_NOT_FOUND"]`. */
  notFoundCodes: readonly string[];
}): { view: DetailView<T>; record: T | null; isFetching: boolean; refetch: () => void } {
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<T>(path, { signal }),
    retry: shouldRetryListError,
  });

  const { isPending, isError, error, data, isFetching, refetch } = query;

  const view = useMemo<DetailView<T>>(() => {
    // The order below IS the rule. Do not reorder.
    if (isPending) return { kind: "loading" };
    if (isError) {
      if (error instanceof ApiError && error.code !== null && notFoundCodes.includes(error.code)) {
        return { kind: "not-found" };
      }
      return {
        kind: "failure",
        failure: classifyListFailure(error),
        retry: () => void refetch(),
      };
    }
    if (data === undefined) return { kind: "loading" };
    return { kind: "ready", record: data };
    // `notFoundCodes` is a module-level constant at every call site; listing it
    // would re-run this memo on every render for no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, isError, error, data, refetch]);

  return { view, record: data ?? null, isFetching, refetch: () => void refetch() };
}

/** Shared rendering for the two non-ready branches that are not `loading`. */
export function DetailFallback({
  view,
  notFoundTitle,
  notFoundDescription,
  backHref,
  backLabel,
}: {
  view: Extract<DetailView<unknown>, { kind: "failure" | "not-found" }>;
  notFoundTitle: string;
  notFoundDescription: string;
  backHref: Route;
  backLabel: string;
}): ReactNode {
  if (view.kind === "failure") {
    return <ListFailureState failure={view.failure} onRetry={view.retry} />;
  }

  return (
    <EmptyState
      icon={<FileQuestion className="size-10" />}
      title={notFoundTitle}
      description={notFoundDescription}
      action={
        <Button variant="secondary" size="sm" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      }
    />
  );
}
