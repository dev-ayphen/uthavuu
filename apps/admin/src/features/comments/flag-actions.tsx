"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Gavel } from "lucide-react";
import { useState } from "react";

import { Badge, Button } from "@/components/ui";
import { invalidateAll, runModerationAction } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import { cn } from "@/lib/cn";
import { CommentQuote } from "./comment-actions";
import type { AdminFlaggedCommentRow, ResolvableFlagStatusKey } from "./types";

const FLAG_KEYS = [["admin", "flagged-comments"], ["admin", "comments"]];

/**
 * Where a flag can be moved to, and what each destination means.
 *
 * `submitted` is deliberately not offered. It is the state a flag is CREATED
 * in, meaning "no admin has looked at this yet" — a fact about history, not a
 * state anyone can put a flag back into. `ResolveFlagSchema` refuses it, and
 * the reason given there is the right one: allowing it would let a moderator
 * quietly erase the evidence that a flag had been reviewed.
 */
const DESTINATIONS: ReadonlyArray<{
  value: ResolvableFlagStatusKey;
  label: string;
  hint: string;
}> = [
  {
    value: "under_review",
    label: "Under review",
    hint: "Triage only — you have picked it up but haven't decided.",
  },
  {
    value: "action_taken",
    label: "Action taken",
    hint: "You removed the comment, suspended the author, or otherwise acted.",
  },
  {
    value: "dismissed",
    label: "Dismissed",
    hint: "The comment is fine. The flag was wrong or malicious.",
  },
];

export function FlagStatusBadge({ status }: { status: { key: string; label: string } }) {
  const tone =
    status.key === "submitted"
      ? "warning"
      : status.key === "under_review"
        ? "info"
        : status.key === "action_taken"
          ? "success"
          : "neutral";
  return <Badge tone={tone}>{status.label}</Badge>;
}

/** A flag nobody has picked up needs triage; one already under review needs a verdict. */
function defaultDestination(flag: AdminFlaggedCommentRow): ResolvableFlagStatusKey {
  return flag.status.key === "under_review" ? "action_taken" : "under_review";
}

export function ResolveFlagAction({ flag }: { flag: AdminFlaggedCommentRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ResolvableFlagStatusKey>(defaultDestination(flag));

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        // The default is chosen when the dialog is OPENED, in the handler that
        // opens it — not synced by an effect afterwards. A flag already under
        // review needs a verdict; one nobody has touched needs triage first.
        // Doing it here also guarantees a decision made about the previous flag
        // is never sitting pre-selected against this one.
        onClick={() => {
          setTarget(defaultDestination(flag));
          setOpen(true);
        }}
      >
        <Gavel />
        Resolve
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Resolve this flag"
        description={`Raised by ${flag.flaggedBy.name}: “${flag.reason}”`}
        confirmLabel="Save decision"
        pendingLabel="Saving…"
        // `ResolveFlagSchema` makes the reason optional on purpose — moving a
        // flag to "under review" is triage with nothing yet to justify, and
        // demanding prose for it teaches people to type "." to get past it.
        reason="optional"
        reasonLabel="Note for the audit log"
        reasonHint="Worth writing for “action taken” and “dismissed”; skip it for triage."
        onStale={() => void invalidateAll(queryClient, FLAG_KEYS)}
        onConfirm={(reason) =>
          runModerationAction({
            queryClient,
            path: `/admin/flagged-comments/${encodeURIComponent(flag.id)}`,
            method: "PATCH",
            body: reason ? { statusKey: target, reason } : { statusKey: target },
            invalidate: FLAG_KEYS,
            success: `Flag marked ${DESTINATIONS.find((d) => d.value === target)?.label.toLowerCase()}.`,
          }).then(() => undefined)
        }
      >
        <CommentQuote body={flag.comment.body} removed={flag.comment.removed} />

        <fieldset className="space-y-1.5">
          <legend className="micro-label mb-1.5 text-fg-muted">Decision</legend>
          {DESTINATIONS.map((destination) => {
            const current = flag.status.key === destination.value;
            return (
              <label
                key={destination.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-control border px-3 py-2 transition-colors",
                  target === destination.value
                    ? "border-primary-soft-border bg-primary-soft"
                    : "border-border hover:bg-surface-2",
                  // The API answers FLAG_ALREADY_IN_STATUS for a no-op move,
                  // so the current state is shown but not selectable.
                  current && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="flag-destination"
                  value={destination.value}
                  checked={target === destination.value}
                  disabled={current}
                  onChange={() => setTarget(destination.value)}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-fg">
                    {destination.label}
                    {current ? (
                      <span className="ml-1.5 font-normal text-fg-faint">(current)</span>
                    ) : null}
                  </span>
                  <span className="block text-[11px] text-fg-faint">{destination.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </ConfirmActionDialog>
    </>
  );
}
