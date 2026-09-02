import { Badge, type BadgeProps } from "@/components/ui";

import type { SponsorStatus } from "./types";

/**
 * A sponsor's status, rendered from what the API sent.
 *
 * NEVER COMPUTE THIS. The temptation is sharper here than anywhere else in the
 * console, because the row carries `startDate` and `endDate` and it looks
 * trivial to decide "active, but the end date has passed, so show Expired".
 * Don't. `apps/api/src/sponsors/sponsor-status.ts` derives exactly that, in SQL,
 * against the DATABASE's clock — and says why in its header: comparing a
 * browser's `new Date()` against timestamps Postgres wrote would let a few
 * seconds of clock drift show an ended campaign as running. A third
 * implementation of that rule, in a timezone the server does not share, is the
 * one guaranteed to disagree.
 *
 * Only the COLOUR is chosen here, and the label comes from the API verbatim, so
 * a status added server-side renders with its real name instead of making the
 * row look broken until this console is redeployed.
 */

const TONE: Record<string, BadgeProps["tone"]> = {
  // On a citizen's screen right now.
  active: "success",
  // Stored active, waiting for its start date.
  scheduled: "info",
  // Stopped by a person. The one status that is somebody's decision.
  paused: "warning",
  // Ran its course. Terminal, but not a fault.
  expired: "neutral",
  // Written, never started.
  draft: "neutral",
};

export function SponsorStatusBadge({ status }: { status: SponsorStatus }) {
  return <Badge tone={TONE[status.key] ?? "neutral"}>{status.label}</Badge>;
}
