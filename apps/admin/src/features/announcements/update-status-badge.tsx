import { Badge, type BadgeProps } from "@/components/ui";

import type { CommunityUpdateStatus } from "./types";

/**
 * An update's status, rendered from what the API sent.
 *
 * Same rule as `ReportStatusBadge`: NEVER compute this. The temptation here is
 * sharper, because the row carries `publishAt` and `expiresAt` and it looks
 * trivial to decide "published, but the window closed, so show Expired". Don't.
 * The API owns the status lookup table and its ordering rules, and a second
 * implementation in the browser is a second thing to keep in sync — with the
 * clock, with the archive action, and with whatever the backend adds next.
 *
 * Only the COLOUR is chosen here, and the label comes from the API verbatim, so
 * a status added server-side renders with its real name instead of making the
 * row look broken until this console is redeployed.
 */

const TONE: Record<string, BadgeProps["tone"]> = {
  // Written, not yet visible to anyone.
  draft: "info",
  // Live in the citizens' feed, subject to its window.
  published: "success",
  // Retired. Not deleted — still readable and still here.
  archived: "neutral",
};

export function UpdateStatusBadge({ status }: { status: CommunityUpdateStatus }) {
  return <Badge tone={TONE[status.key] ?? "neutral"}>{status.label}</Badge>;
}
