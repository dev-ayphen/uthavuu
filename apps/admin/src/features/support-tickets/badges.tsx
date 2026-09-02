import { Badge } from "@/components/ui";

import { priorityTone, statusTone } from "./catalogue";
import type { TicketRef } from "./types";

/**
 * A ticket's status and priority, rendered from what the API sent.
 *
 * Same rule as `UpdateStatusBadge` and `ReportStatusBadge`: NEVER compute
 * these. The temptation is sharper here because the record also carries
 * `resolvedAt` and `closedAt`, and it looks trivial to decide "has closedAt, so
 * show Closed". Don't. The API owns the `ticket_statuses` lookup table and the
 * transitions between its rows; a second implementation in the browser is a
 * second thing to keep in sync, with the clock, with the resolve/close actions,
 * and with whatever the backend adds next.
 *
 * Only the COLOUR is chosen locally, and the label comes from the API verbatim,
 * so a status or priority added server-side renders with its real name instead
 * of making the row look broken until this console is redeployed.
 */

export function TicketStatusBadge({ status }: { status: TicketRef }) {
  return (
    <Badge tone={statusTone(status.key)} title={status.key}>
      {status.label}
    </Badge>
  );
}

/**
 * Priority is nullable in `types.ts` because the shipped projection did not
 * carry it when this was written. A ticket with no priority renders nothing at
 * all rather than a default — "Normal" would be this console asserting a
 * triage decision no human made.
 */
export function TicketPriorityBadge({ priority }: { priority: TicketRef | null }) {
  if (!priority) return <span className="text-fg-faint">—</span>;

  return (
    <Badge tone={priorityTone(priority.key)} title={priority.key}>
      {priority.label}
    </Badge>
  );
}

/**
 * The citizen's ACCOUNT status — `active` / `suspended` (ADR 0011), not the
 * ticket's. It sits in the user-context panel because a complaint from someone
 * whose account is suspended reads very differently, and an agent who cannot
 * see that will answer the wrong question.
 */
export function UserStatusBadge({ status }: { status: TicketRef | null }) {
  if (!status) return <span className="text-fg-faint">—</span>;

  return (
    <Badge tone={status.key === "suspended" ? "danger" : "neutral"} title={status.key}>
      {status.label}
    </Badge>
  );
}
