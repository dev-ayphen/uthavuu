import { Badge, type BadgeProps } from "@/components/ui";

/**
 * A report's status, rendered EXACTLY as the API sent it.
 *
 * ==========================================================================
 * THE ONE RULE: never compute this. Not from `expiryAt`, not from `closedAt`,
 * not from `storedStatus`.
 * ==========================================================================
 *
 * `apps/api/src/admin/report-effective-status.ts` derives the status at read
 * time because nothing in the codebase ever writes 'expired'. Measured on this
 * database on 2026-08-28: the stored column says 66 reports are `open`; the
 * truth is 11 open and 21 already past `expiry_at`. A console that rendered the
 * column would show 66 live emergencies where there are 11.
 *
 * The temptation is to "help" by re-deriving expiry in the browser — the client
 * has `expiryAt` right there in the row. Don't. The API's rule has an ordering
 * the client would have to duplicate (deleted beats expired; a COMPLETED report
 * past its expiry is completed, not expired — collapsing those would relabel
 * every one of this database's 34 completions), and a second implementation of
 * a rule is a second implementation to keep in sync. `status` is authoritative;
 * this component only picks a colour for it.
 *
 * `storedStatus` is deliberately not rendered anywhere in the list. It appears
 * once, on the detail page, labelled as the raw column and explained — because
 * "why does the database say open?" is a fair question and the answer should be
 * findable, not surfaced as if it were the truth.
 */

const TONE: Record<string, BadgeProps["tone"]> = {
  // Live and findable in the mobile Discover feed.
  open: "success",
  // Verification held a photo; awaiting a moderator. Not public.
  pending_review: "warning",
  // Past its window. Nobody can accept it any more; nothing wrote this.
  expired: "warning",
  // The reporter cancelled it, or an admin closed it.
  closed: "neutral",
  // Help arrived and was confirmed.
  completed: "info",
  // Moderation refused a photo. The report exists for its reporter and never
  // becomes public.
  rejected: "danger",
  // Soft-deleted — hidden by an admin, or removed by its reporter.
  deleted: "danger",
};

const LABEL: Record<string, string> = {
  open: "Open",
  pending_review: "Pending review",
  expired: "Expired",
  closed: "Closed",
  completed: "Completed",
  rejected: "Rejected",
  deleted: "Hidden",
};

export function ReportStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={TONE[status] ?? "neutral"} className="capitalize">
      {LABEL[status] ?? status}
    </Badge>
  );
}

export const REPORT_STATUS_LABEL = LABEL;
