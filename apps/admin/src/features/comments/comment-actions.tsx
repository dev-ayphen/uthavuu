"use client";

import { useQueryClient } from "@tanstack/react-query";
import { EyeOff, Undo2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import { invalidateAll, runModerationAction } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";

/**
 * Remove and restore a public comment.
 *
 * Both directions require a written reason — `ModerateCommentDto` declares
 * `reason` as required on the restore path too, and that is the right call:
 * "why did we put this back" is the question a second moderator asks when the
 * same comment gets flagged again.
 *
 * REMOVAL IS A SOFT DELETE AND STAYS READABLE. `deletedAt` is set; the row
 * survives, and the console keeps rendering the text struck through behind a
 * "Removed" badge. That is deliberate — a moderation log whose entries are
 * blank is a log nobody can review.
 */
export function CommentActions({
  commentId,
  removed,
  preview,
  invalidateKeys,
  size = "sm",
}: {
  commentId: string;
  removed: boolean;
  /** The comment body, shown in the dialog so the decision is made on the text. */
  preview: string;
  /** Which lists this action invalidates. Flagged queue passes both. */
  invalidateKeys: string[][];
  size?: "sm" | "md";
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const run = (reason: string | undefined) =>
    runModerationAction({
      queryClient,
      path: `/admin/comments/${encodeURIComponent(commentId)}/${removed ? "restore" : "remove"}`,
      body: { reason },
      invalidate: invalidateKeys,
      success: removed ? "Comment restored." : "Comment removed.",
    }).then(() => undefined);

  return (
    <>
      <Button
        variant={removed ? "secondary" : "danger"}
        size={size}
        onClick={() => setOpen(true)}
      >
        {removed ? <Undo2 /> : <EyeOff />}
        {removed ? "Restore" : "Remove"}
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title={removed ? "Restore this comment?" : "Remove this comment?"}
        description={
          removed
            ? "It becomes visible again to everyone reading the report."
            : "It stops being visible to citizens. It stays readable here, struck through, so the decision can be reviewed."
        }
        confirmLabel={removed ? "Restore comment" : "Remove comment"}
        pendingLabel={removed ? "Restoring…" : "Removing…"}
        tone={removed ? "primary" : "danger"}
        reason="required"
        reasonLabel={removed ? "Why is this being restored?" : "Why is this being removed?"}
        reasonHint="Goes in the audit log. This is what makes the decision reviewable later."
        onStale={() => void invalidateAll(queryClient, invalidateKeys)}
        onConfirm={run}
      >
        <CommentQuote body={preview} removed={removed} />
      </ConfirmActionDialog>
    </>
  );
}

/** The text being acted on, so nobody moderates a row they only half-read. */
export function CommentQuote({ body, removed }: { body: string; removed: boolean }) {
  return (
    <blockquote className="max-h-40 overflow-y-auto scrollbar-slim rounded-control border border-border bg-surface-inset px-3 py-2 text-xs whitespace-pre-wrap text-fg">
      {removed ? (
        <span className="mb-1 block text-[10px] font-bold text-danger-fg uppercase">
          Currently removed
        </span>
      ) : null}
      {body}
    </blockquote>
  );
}
