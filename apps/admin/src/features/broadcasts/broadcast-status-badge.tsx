import { Badge, type BadgeProps } from "@/components/ui";

import type { BroadcastStatusRef } from "./types";

/**
 * A broadcast's status, rendered from what the API sent.
 *
 * Same rule as `ReportStatusBadge` and `UpdateStatusBadge`: NEVER compute this.
 * The temptation is sharper here than anywhere else in the console, because the
 * row carries `scheduledAt` and it looks trivial to decide "scheduled, and the
 * time has passed, so show Sent". That would be a lie — nothing sweeps
 * `scheduled_at` (see the schedule notice in `broadcast-form.tsx`), so a
 * scheduled broadcast whose time has passed has still notified nobody, and
 * telling an operator otherwise during an emergency is the worst failure this
 * page has available to it.
 *
 * Only the COLOUR is chosen here. The label comes from the API verbatim, so a
 * status added server-side renders with its real name rather than making the
 * row look broken until this console is redeployed.
 */

const TONE: Record<string, BadgeProps["tone"]> = {
  // Written, notified nobody, editable and deletable.
  draft: "info",
  // A time is recorded. It does NOT fire by itself — see TITLE below.
  scheduled: "primary",
  // Claimed by a fan-out. Either in flight right now, or left behind by one
  // that died partway. The console cannot tell those apart, so: warning.
  sending: "warning",
  // On people's phones. Terminal.
  sent: "success",
  // Terminal, and deliberately not deleted — the record of what was planned
  // survives.
  cancelled: "neutral",
};

/**
 * The one-line meaning of each status, on hover.
 *
 * `scheduled` carries the caveat because that is the status whose plain-English
 * reading is wrong: "scheduled" normally implies something will happen.
 */
const TITLE: Record<string, string> = {
  draft: "Written. Nobody has been notified, and nothing is scheduled.",
  scheduled:
    "A time has been recorded. It does NOT send itself — sending is still a manual step in this console.",
  sending:
    "A fan-out claimed this broadcast. If it stays here, the fan-out did not finish — some people already have it.",
  sent: "Delivered to people's alert lists. Irreversible.",
  cancelled: "Cancelled before it was sent. Terminal — nobody received it.",
};

export function BroadcastStatusBadge({ status }: { status: BroadcastStatusRef }) {
  return (
    <Badge tone={TONE[status.key] ?? "neutral"} title={TITLE[status.key]}>
      {status.label}
    </Badge>
  );
}
