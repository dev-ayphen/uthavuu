"use client";

import { useMemo } from "react";

import { DateCell, DetailField, DetailFields } from "@/components/data";
import { Badge } from "@/components/ui";
import { DetailFallback, useDetailQuery } from "@/features/moderation/detail-query";

import { TicketPriorityBadge, TicketStatusBadge } from "./badges";
import { SUPPORT_INDEX } from "./routes";
import { TICKET_NOT_FOUND_CODES } from "./support-errors";
import { TicketComposer } from "./ticket-composer";
import { TicketControls } from "./ticket-controls";
import { TicketConversation } from "./ticket-conversation";
import { TicketUserPanel } from "./ticket-user-panel";
import { normalizeTicketDetail, type SupportTicketDetail } from "./types";
import { WorkbenchSkeleton } from "./workbench-skeleton";

/**
 * One ticket, worked.
 *
 * Fetched client-side rather than in the server page so replying, resolving,
 * closing and every control change can invalidate and re-render in place — the
 * same split `reports/[id]/page.tsx` and `UpdateEditor` make.
 *
 * BRANCH ORDER IS THE HOOK'S, NOT THIS COMPONENT'S. `useDetailQuery` resolves
 * loading -> failure -> not-found -> ready into a single `view.kind`, so a
 * failed request cannot render "this ticket doesn't exist" — a very different
 * thing to tell an agent than "the API is down", and the difference between
 * closing the tab and escalating an outage.
 *
 * THE LAYOUT, AND WHY THERE IS NO SECOND SCROLLER
 * ───────────────────────────────────────────────────────────────────────────
 * This page lives inside `platform/layout.tsx`, which is `SubMenuPageLayout` —
 * Mode B, whose content pane is already the one scroll box on screen. Putting a
 * bounded, independently-scrolling conversation inside it would mean nesting a
 * second scroller in the first: a height bounded by viewport maths the layout
 * tokens do not express, `min-h-0` on every flex ancestor, and a wheel event
 * that has to pick a winner. Get any of it wrong and the sub-menu scrolls away
 * with the content, which is the exact bug that layout exists to prevent.
 *
 * Instead the thread scrolls with the pane, and the two things an agent must
 * keep hold of are pinned: the composer is `sticky bottom-0` (the idiom
 * `UpdateForm`'s save bar already uses) and the right-hand column is
 * `sticky top-0`. Status, priority, assignee and the reply box stay reachable
 * from anywhere in a long thread, with no viewport maths and no `vh` anywhere.
 * It also means the newest message sits directly above the composer, so after
 * sending, the thing just written is already on screen.
 */
export function TicketWorkbench({ ticketId }: { ticketId: string }) {
  const { view } = useDetailQuery<unknown>({
    key: ["admin", "support-tickets", "detail", ticketId],
    path: `/admin/support-tickets/${encodeURIComponent(ticketId)}`,
    // `TICKET_NOT_FOUND`, transcribed from the service's own NotFoundException.
    // It matters that this is the real code and not a guess: a 404 carrying no
    // recognised code falls through to `classifyListFailure`, which renders
    // "that list doesn't exist yet" — the right answer for an unbuilt endpoint,
    // and quite the wrong one for a ticket somebody just deleted.
    notFoundCodes: TICKET_NOT_FOUND_CODES,
  });

  // Validated, not cast. `apiFetch<T>` asserts a shape; this checks one. A
  // response the console cannot read becomes `null` here and is reported as a
  // not-found rather than rendering a workbench full of blanks over a ticket
  // that may well exist.
  const record = useMemo<SupportTicketDetail | null>(
    () => (view.kind === "ready" ? normalizeTicketDetail(view.record) : null),
    [view],
  );

  if (view.kind === "loading") return <WorkbenchSkeleton />;

  if (view.kind !== "ready" || !record) {
    return (
      <DetailFallback
        view={view.kind === "ready" ? { kind: "not-found" } : view}
        notFoundTitle="That ticket no longer exists"
        notFoundDescription="It may have been deleted while this page was open, or the link may be wrong."
        backHref={SUPPORT_INDEX}
        backLabel="Back to the support queue"
      />
    );
  }

  return (
    <div className="space-y-5">
      <DetailFields columns={3}>
        <DetailField label="Status">
          <TicketStatusBadge status={record.status} />
        </DetailField>
        <DetailField label="Priority">
          <TicketPriorityBadge priority={record.priority} />
        </DetailField>
        <DetailField label="Category">
          <Badge tone="neutral" title={record.category.key}>
            {record.category.label}
          </Badge>
        </DetailField>
        <DetailField label="Raised">
          <DateCell value={record.createdAt} withTime relative />
        </DetailField>
        <DetailField label="Last updated">
          <DateCell value={record.updatedAt} withTime relative />
        </DetailField>
        <DetailField label="Assigned to">
          {record.assignedAdmin ? (
            <span className="text-fg">{record.assignedAdmin.name ?? record.assignedAdmin.id}</span>
          ) : (
            <span className="text-fg-faint">Unassigned</span>
          )}
        </DetailField>
        {/* Timestamps, not states. `status.key` is the only answer to "is it
            resolved now" — these say when it last entered that state, which is
            why a reopened ticket keeps its resolvedAt. Shown only when set, so
            an open ticket is not padded with two empty rows. */}
        {record.resolvedAt ? (
          <DetailField label="Marked resolved">
            <DateCell value={record.resolvedAt} withTime relative />
          </DetailField>
        ) : null}
        {record.closedAt ? (
          <DetailField label="Closed">
            <DateCell value={record.closedAt} withTime relative />
          </DetailField>
        ) : null}
      </DetailFields>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <TicketConversation ticket={record} />
          {/* Keyed on the ticket, so navigating between tickets remounts the
              composer rather than carrying a half-written reply onto somebody
              else's thread. */}
          <TicketComposer key={record.id} ticket={record} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <TicketControls ticket={record} />
          <TicketUserPanel ticket={record} />
        </aside>
      </div>
    </div>
  );
}
