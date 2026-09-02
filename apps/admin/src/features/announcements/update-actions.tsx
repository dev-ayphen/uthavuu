"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Archive, Send, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import { invalidateAll } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import { formatDate } from "@/components/data";
import { COMMUNITY_UPDATE_KEYS, runUpdateAction } from "./api";
import { tamilCoverage } from "./tamil-coverage";
import { isUpdateStaleConflict } from "./update-errors";
import type { AdminUpdate } from "./types";

/**
 * Publish, archive and delete — the three state changes on an update.
 *
 * WHICH BUTTONS EXIST
 * ───────────────────────────────────────────────────────────────────────────
 * `ReportActions` derives its buttons from the API's own documented
 * preconditions. That is the right pattern, and it is not available here: the
 * frozen contract fixes the ROUTES but says nothing about which transitions
 * each status allows. Inventing a precondition table would be worse than having
 * none — it would hide a legal action behind a rule this console made up.
 *
 * So the console offers the transitions that are meaningful on their face:
 *
 *   not published  -> Publish     (a draft going live, an archived one returning)
 *   published      -> Archive     (retiring it from the feed)
 *   any status     -> Delete      (SOFT — see below)
 *
 * and lets the API be authoritative about the rest. A refusal surfaces inside
 * the dialog, next to the button that caused it, and `isStaleConflict` in
 * `ConfirmActionDialog` refetches when the refusal means the row on screen was
 * already out of date. Tighten this the moment the backend's preconditions are
 * written down.
 *
 * NO REASON IS COLLECTED. Every moderation action in this console demands one,
 * because each is a decision taken ABOUT a citizen and an appeal may follow.
 * These are not: an update is the console's own content, and the frozen
 * contract declares no body on any of the three routes. Sending an undeclared
 * `{ reason }` would risk a 400 from a strict DTO to satisfy a habit.
 *
 * These are NOT optimistic, for the same reason `runModerationAction` isn't:
 * a status that flashes "Published" and snaps back is worse, in a console whose
 * whole job is to be believed about state, than one that waits a round trip.
 *
 * WHY THE REFUSALS ARE CAUGHT HERE RATHER THAN LEFT TO THE DIALOG
 * ───────────────────────────────────────────────────────────────────────────
 * `ConfirmActionDialog` refetches on a refusal it recognises as stale, using
 * `isStaleConflict` — whose code set lives in `features/moderation` and covers
 * reports, users and comments, not `UPDATE_ALREADY_PUBLISHED` /
 * `UPDATE_ALREADY_ARCHIVED`. Unrecognised, those two would display correctly
 * and leave the badge behind them still claiming the old status, which is the
 * exact state that gets an operator clicking the same button twice. Catching
 * here invalidates first and rethrows, so the dialog still shows the API's own
 * sentence next to the button that caused it.
 */

type Action = "publish" | "archive" | "delete" | null;

export function UpdateActions({
  update,
  size = "sm",
  onDeleted,
}: {
  update: AdminUpdate;
  size?: "sm" | "md";
  /** Called after a successful delete — the detail page uses it to navigate away. */
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action>(null);

  const published = update.status.key === "published";
  const base = `/admin/community-updates/${encodeURIComponent(update.id)}`;
  const untranslated = tamilCoverage(update) !== "full";
  const startsAt = formatDate(update.publishAt, true);
  const endsAt = formatDate(update.expiresAt, true);

  const onStale = () => void invalidateAll(queryClient, COMMUNITY_UPDATE_KEYS);

  /** Invalidate on a stale refusal, then rethrow so the dialog reports it. */
  const refetchOnStale = (error: unknown): never => {
    if (isUpdateStaleConflict(error)) onStale();
    throw error;
  };

  const run = (path: string, method: "POST" | "DELETE", success: string) => () =>
    runUpdateAction({ queryClient, path, method, success })
      .then(() => undefined)
      .catch(refetchOnStale);

  return (
    <>
      {published ? (
        <Button variant="secondary" size={size} onClick={() => setAction("archive")}>
          <Archive />
          Archive
        </Button>
      ) : (
        <Button variant="secondary" size={size} onClick={() => setAction("publish")}>
          <Send />
          Publish
        </Button>
      )}

      <Button variant="danger" size={size} onClick={() => setAction("delete")}>
        <Trash2 />
        Delete
      </Button>

      <ConfirmActionDialog
        open={action === "publish"}
        onOpenChange={(open) => setAction(open ? "publish" : null)}
        title="Publish this announcement?"
        description={
          <>
            {/* The two nulls mean different things, and the schema says which:
                no publishAt is "visible as soon as it is published", no
                expiresAt is "never stops being visible". Publishing does NOT
                overwrite a future publishAt — a notice scheduled for tomorrow
                stays scheduled — so this must not promise it goes live now. */}
            It is published and served by the API{" "}
            {startsAt ? `from ${startsAt}` : "immediately"}
            {endsAt ? ` until ${endsAt}` : ", with no end date"}.
            {/* HONESTY FIX: this previously read "becomes visible to citizens
                in the mobile app". GET /updates is live and correct, but NO
                mobile screen reads it yet — there is no libs-mobile/api
                updates client and no screen. Telling an operator that citizens
                will see it would be a promise the product cannot keep, which
                is the exact failure this console keeps correcting elsewhere.
                Delete this note and restore the stronger wording the moment a
                mobile reader ships. */}{" "}
            <strong className="font-bold">
              No mobile screen reads announcements yet, so citizens will not see this until that
              ships.
            </strong>
            {/* The one thing an operator cannot see from the buttons, said at
                the moment it stops being reversible for the reader. */}
            {untranslated ? (
              <>
                {" "}
                <strong className="font-bold">
                  It has no complete Tamil translation, so Tamil readers will see the English
                  text.
                </strong>
              </>
            ) : null}
          </>
        }
        confirmLabel="Publish announcement"
        pendingLabel="Publishing…"
        reason="none"
        onStale={onStale}
        onConfirm={run(`${base}/publish`, "POST", "Announcement published.")}
      />

      <ConfirmActionDialog
        open={action === "archive"}
        onOpenChange={(open) => setAction(open ? "archive" : null)}
        title="Archive this announcement?"
        description="It stops showing in the citizens' feed. Nothing is deleted — it stays here, readable and editable, and can be published again."
        confirmLabel="Archive announcement"
        pendingLabel="Archiving…"
        reason="none"
        onStale={onStale}
        onConfirm={run(`${base}/archive`, "POST", "Announcement archived.")}
      />

      <ConfirmActionDialog
        open={action === "delete"}
        onOpenChange={(open) => setAction(open ? "delete" : null)}
        title="Delete this announcement?"
        // Named as a soft delete because that is what the contract says it is
        // (DELETE -> 204, the row survives). Telling an operator "this cannot be
        // undone" when it can is the kind of small lie that gets a real deletion
        // waved through later.
        description="It disappears from this list and from the citizens' feed. This is a soft delete — the record is retained in the database and can be recovered by an engineer, but nothing in this console will bring it back."
        confirmLabel="Delete announcement"
        pendingLabel="Deleting…"
        tone="danger"
        reason="none"
        onStale={onStale}
        onConfirm={() =>
          runUpdateAction({
            queryClient,
            path: base,
            method: "DELETE",
            success: "Announcement deleted.",
          })
            .then(() => {
              onDeleted?.();
            })
            .catch(refetchOnStale)
        }
      />
    </>
  );
}
