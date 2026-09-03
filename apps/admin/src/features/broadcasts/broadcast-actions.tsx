"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { formatDate } from "@/components/data";
import { Button } from "@/components/ui";
import { invalidateAll } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import {
  BROADCAST_KEYS,
  broadcastMutate,
  broadcastPath,
  deleteBroadcast,
  runBroadcastAction,
} from "./api";
import { isBroadcastStaleConflict } from "./broadcast-errors";
import { SendBroadcastDialog } from "./send-broadcast-dialog";
import {
  canCancelBroadcast,
  canDeleteBroadcast,
  canSendBroadcast,
  type AdminBroadcast,
} from "./types";

/**
 * Send, cancel and delete — the three state changes on a broadcast.
 *
 * WHICH BUTTONS EXIST, AND WHY THEY ARE DERIVED HERE
 * ───────────────────────────────────────────────────────────────────────────
 * `UpdateActions` deliberately does NOT derive its buttons from status, because
 * the announcements contract never wrote its preconditions down and inventing
 * them would hide a legal action behind a console-invented rule. This contract
 * DOES write them down — `assertSendable`, `cancel()` and `delete()` each state
 * their allowed statuses and raise a distinct code otherwise — so the
 * predicates in `./types.ts` are transcribed, and offering only what the API
 * accepts is the honest reading rather than a guess.
 *
 * It is still a mirror and not a gate. The row on screen can be a minute stale,
 * every refusal surfaces next to the button that caused it, and a refusal
 * meaning "the record already moved" refetches first so the status stops
 * disagreeing with the database (`refetchOnStale`). That refetch is what makes
 * the derivation safe: after it, the buttons match reality again.
 *
 * WHY THE REFUSALS ARE CAUGHT HERE RATHER THAN LEFT TO THE DIALOG
 * ───────────────────────────────────────────────────────────────────────────
 * `ConfirmActionDialog` refetches on a refusal it recognises as stale using
 * `isStaleConflict`, whose code set lives in `features/moderation` and covers
 * reports, users and comments — not `BROADCAST_ALREADY_SENT`. Unrecognised,
 * those would display correctly and leave the badge behind them still claiming
 * the old status, which is the exact state that gets an operator clicking the
 * same button twice. Catching here invalidates first and RETHROWS, so the
 * dialog still shows the API's own sentence next to the button that caused it.
 *
 * The API's prose is deliberately not overridden for these two. It is written
 * for this exact moment ("Only a draft broadcast can be deleted. This one is
 * scheduled — cancel it first.") and carries the product rule with it; this
 * feature's `MESSAGES` map exists for the surfaces where no such sentence
 * arrives.
 *
 * NOTHING HERE IS OPTIMISTIC. A send moves the status, stamps `sentAt` and
 * writes two counts the console cannot predict. A status that flashed "Sent"
 * and snapped back would, in a console whose whole job is to be believed about
 * state, be worse than one that waits a round trip.
 */

type Action = "send" | "cancel" | "delete" | null;

export function BroadcastActions({
  record,
  size = "sm",
  onDeleted,
}: {
  record: AdminBroadcast;
  size?: "sm" | "md";
  /** Called after a successful delete — the detail page uses it to navigate away. */
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action>(null);

  const onStale = () => void invalidateAll(queryClient, BROADCAST_KEYS);

  /** Invalidate on a stale refusal, then rethrow so the dialog reports it. */
  const refetchOnStale = (error: unknown): never => {
    if (isBroadcastStaleConflict(error)) onStale();
    throw error;
  };

  /**
   * The send. Not routed through `runBroadcastAction` because the toast has to
   * be chosen from the RESULT: a send that reached nobody is a successful
   * request and a failed broadcast, and a green "Sent." over
   * `recipientCount: 0` would be the console's most expensive lie. The API
   * returns the updated record, so the reach is a fact rather than a guess.
   */
  const send = async () => {
    const result = await broadcastMutate<AdminBroadcast>(
      broadcastPath(record.id, "/send"),
      "POST",
    ).catch(refetchOnStale);

    await invalidateAll(queryClient, BROADCAST_KEYS);

    const reached = result.recipientCount ?? 0;
    if (reached === 0) {
      toast.warning("Sent — but it reached nobody.", {
        description:
          record.audience.key === "district"
            ? `No account has its district set to exactly “${record.district ?? ""}”.`
            : "No account was eligible to receive it.",
      });
      return;
    }

    toast.success(
      reached === 1
        ? "Sent to 1 person."
        : `Sent to ${new Intl.NumberFormat("en-IN").format(reached)} people.`,
    );
  };

  const scheduledFor = formatDate(record.scheduledAt, true);

  return (
    <>
      {canSendBroadcast(record) ? (
        // `danger`, not `primary`. This is the console's only irreversible
        // action, and the colour is the first thing an operator reads.
        <Button variant="danger" size={size} onClick={() => setAction("send")}>
          <Send />
          Send
        </Button>
      ) : null}

      {canCancelBroadcast(record) ? (
        <Button variant="secondary" size={size} onClick={() => setAction("cancel")}>
          <Ban />
          Cancel
        </Button>
      ) : null}

      {canDeleteBroadcast(record) ? (
        <Button variant="ghost" size={size} onClick={() => setAction("delete")}>
          <Trash2 />
          Delete
        </Button>
      ) : null}

      {/* Rendered unconditionally, OUTSIDE the button conditions. A refusal
          refetches, the status changes, and the button that opened the dialog
          disappears — unmounting the dialog mid-explanation and leaving the
          operator with nothing but a closed modal. */}
      <SendBroadcastDialog
        open={action === "send"}
        onOpenChange={(open) => setAction(open ? "send" : null)}
        record={record}
        onConfirm={send}
      />

      <ConfirmActionDialog
        open={action === "cancel"}
        onOpenChange={(open) => setAction(open ? "cancel" : null)}
        title="Cancel this scheduled broadcast?"
        description={
          <>
            It stays here with its planned time{scheduledFor ? ` of ${scheduledFor}` : ""}, so the
            record still says what was intended and when. Nobody has received it and nobody will.
            {/* Terminal, and worth saying plainly: the obvious mental model is
                that cancelling puts it back in the drafts pile. It does not. */}{" "}
            <strong className="font-bold">
              Cancelling is final — a cancelled broadcast cannot be revived, edited or sent.
            </strong>{" "}
            Write a new one if the plan changes again.
          </>
        }
        confirmLabel="Cancel broadcast"
        pendingLabel="Cancelling…"
        // The API declares no body on this route; a reason box would go nowhere.
        // The audit row records the act, the actor and the previous status.
        reason="none"
        onStale={onStale}
        onConfirm={() =>
          runBroadcastAction({
            queryClient,
            path: broadcastPath(record.id, "/cancel"),
            success: "Broadcast cancelled. Nobody received it.",
          })
            .then(() => undefined)
            .catch(refetchOnStale)
        }
      />

      <ConfirmActionDialog
        open={action === "delete"}
        onOpenChange={(open) => setAction(open ? "delete" : null)}
        title="Delete this draft?"
        // Named as a soft delete because that is what it is. Telling an operator
        // "this cannot be undone" when the row survives is the kind of small lie
        // that gets a real deletion waved through later.
        description="Only a draft can be deleted, so this one has notified nobody. It disappears from this list; the record is retained in the database and can be recovered by an engineer, but nothing in this console will bring it back."
        confirmLabel="Delete draft"
        pendingLabel="Deleting…"
        tone="danger"
        // OPTIONAL, and that is the API's own design rather than a shortcut.
        // ADR 0012 wants a reason on destructive actions; this endpoint takes
        // one as `?reason=` so a client that has it can record it, and one that
        // does not still works. See `deleteBroadcast` in ./api.ts.
        reason="optional"
        reasonLabel="Reason"
        reasonHint="Recorded in the audit log beside the deleted copy. Leave it blank if there is nothing to say."
        onStale={onStale}
        onConfirm={(reason) =>
          deleteBroadcast(record.id, reason)
            .then(async () => {
              await invalidateAll(queryClient, BROADCAST_KEYS);
              toast.success("Draft deleted.");
              onDeleted?.();
            })
            .catch(refetchOnStale)
        }
      />
    </>
  );
}
