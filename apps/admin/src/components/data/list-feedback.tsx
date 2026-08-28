"use client";

import { Inbox, LockKeyhole, PlugZap, SearchX, UserX } from "lucide-react";
import type { ReactNode } from "react";

import { Button, EmptyState, ErrorState } from "@/components/ui";
import type { ListFailure } from "@/lib/list-failure";

/**
 * The three ways a list can show nothing, kept visually distinct on purpose.
 *
 *   NOTHING YET      dashed outline, neutral icon, an invitation
 *   NOTHING MATCHED  dashed outline, search icon, a way OUT of the filters
 *   REFUSED/BROKEN   see ListFailureState below
 *
 * Audit Logs, Support Tickets and Flagged Comments all return `total: 0` today,
 * so the empty state is not an edge case — it is the first thing anyone opening
 * those sections will see. It has to read as "the system is fine and there is
 * genuinely nothing here", which is a different sentence from "we couldn't load
 * it" and from "you may not see it".
 */

export type ListEmptyCopy = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function ListEmptyState({
  narrowed,
  onClearAll,
  empty,
  filteredTitle = "Nothing matches these filters",
  filteredDescription = "No rows match what you're filtering on. Widen the filters or clear them to see everything again.",
}: {
  narrowed: boolean;
  onClearAll: () => void;
  empty: ListEmptyCopy;
  filteredTitle?: string;
  filteredDescription?: string;
}) {
  // Filtered-to-zero MUST offer the way out. Hiding the escape hatch is how an
  // operator concludes the records were deleted: they cannot see the filter
  // that removed them, only the absence it caused.
  if (narrowed) {
    return (
      <EmptyState
        icon={<SearchX className="size-10" />}
        title={filteredTitle}
        description={filteredDescription}
        action={
          <Button variant="secondary" size="sm" onClick={onClearAll}>
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={empty.icon ?? <Inbox className="size-10" />}
      title={empty.title}
      description={empty.description}
      action={empty.action}
    />
  );
}

/**
 * A list that did not load.
 *
 * The branch that matters: an EXPECTED REFUSAL renders as a calm explanation,
 * not as a red error. An ops admin hitting a super-only route is the RBAC
 * working; showing them "Something went wrong" invites a bug report against
 * correct behaviour and teaches them to distrust real errors. This mirrors what
 * `(console)/admins/page.tsx` does by hand, so every list inherits it.
 */
export function ListFailureState({
  failure,
  onRetry,
}: {
  failure: ListFailure;
  onRetry?: () => void;
}) {
  if (failure.kind === "forbidden" || failure.kind === "not-admin") {
    return (
      <EmptyState
        icon={
          failure.kind === "forbidden" ? (
            <LockKeyhole className="size-10" />
          ) : (
            <UserX className="size-10" />
          )
        }
        title={failure.title}
        description={failure.message}
      />
    );
  }

  if (failure.kind === "signed-out") {
    // The redirect to /login is already in flight (see useListQuery). This is
    // what fills the gap, so the pane never sits blank mid-navigation.
    return (
      <EmptyState
        icon={<LockKeyhole className="size-10" />}
        title={failure.title}
        description={failure.message}
      />
    );
  }

  if (failure.kind === "unreachable") {
    // Reachability is not a data problem, and saying "couldn't load reports"
    // sends the operator hunting through filters for a fault in the API.
    return (
      <ErrorState
        title={failure.title}
        message={failure.message}
        onRetry={onRetry}
        className="[&_svg]:shrink-0"
      />
    );
  }

  return (
    <ErrorState
      title={failure.title}
      message={failure.message}
      digest={failure.digest}
      onRetry={failure.canRetry ? onRetry : undefined}
    />
  );
}

/** Small inline variant for a detail pane, where a full-height state is too loud. */
export function ListFailureInline({ failure }: { failure: ListFailure }) {
  const Icon = failure.kind === "unreachable" ? PlugZap : LockKeyhole;
  return (
    <p className="flex items-start gap-2 text-xs text-fg-subtle">
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-faint" />
      <span>{failure.message}</span>
    </p>
  );
}
