"use client";

import { AlertTriangle, Send } from "lucide-react";
import { useId, useState } from "react";

import { Button, Input } from "@/components/ui";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/features/moderation/dialog";
import { tamilCoverage } from "@/features/announcements/tamil-coverage";
import { cn } from "@/lib/cn";
import {
  broadcastErrorMessage,
  isBroadcastPermanentRefusal,
  isBroadcastStaleConflict,
} from "./broadcast-errors";
import type { AdminBroadcast } from "./types";

/**
 * The one irreversible action in this console, and the only one that reaches
 * citizens' phones.
 *
 * WHY THIS IS NOT `ConfirmActionDialog`
 * ───────────────────────────────────────────────────────────────────────────
 * Every other consequential action in the console goes through
 * `features/moderation/confirm-action-dialog.tsx`, and that is the right
 * default — it is the console's one dialog, it collects the audit reason the
 * moderation DTOs demand, and reusing it is how nine features stay consistent.
 * Three things about a send are different enough to justify its own:
 *
 *   1. THE API TAKES NO BODY. `POST /admin/broadcasts/:id/send` declares no
 *      DTO, so there is no reason to collect — the audit row records the
 *      decision, the actor, the audience and the district at claim time
 *      (`claimForSending`). A reason box here would be a field that goes
 *      nowhere.
 *   2. THE REFUSAL SET IS THIS FEATURE'S. `ConfirmActionDialog` classifies
 *      failures with `features/moderation`'s code set, which knows nothing of
 *      `BROADCAST_ALREADY_SENT` — so it would leave "Send anyway" enabled after
 *      the API had said the broadcast is already on people's phones, inviting
 *      exactly the second press that must never happen.
 *   3. A CHECKBOX IS NOT ENOUGH FRICTION. Publishing an announcement can be
 *      undone by archiving it. Suspending an account can be reversed. This
 *      cannot: `alerts` rows are committed per recipient and FCM messages
 *      persist nowhere, so there is no undo to build. The type-to-confirm gate
 *      below is the cheapest available way to make sure the operator has read
 *      WHO this goes to before it goes.
 *
 * THE PHRASE THEY TYPE IS NOT DECORATION. For a district broadcast it is the
 * district itself, because `broadcasts.district` is matched with an equality
 * comparison against free text the mobile client reverse-geocoded — one wrong
 * character selects NOBODY, and the send reports success anyway. Retyping it is
 * the moment an operator notices that what they meant is not what is stored.
 * (The comparison here is case-insensitive: the gate is about intent, and the
 * exactness of the stored value is called out in words instead.)
 */

/** What the operator has to type, and why that string and not another. */
function confirmationPhrase(record: AdminBroadcast): string {
  return record.audience.key === "district" && record.district
    ? record.district
    : "SEND TO EVERYONE";
}

export function SendBroadcastDialog({
  open,
  onOpenChange,
  record,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AdminBroadcast;
  /** Resolve to close the dialog; throw to show the failure inside it. */
  onConfirm: () => Promise<void>;
  }) {
  // Lives out here because `<Dialog>` needs it to refuse Escape and backdrop
  // clicks: an operator must never be able to dismiss a send they have already
  // fired and be left unsure whether fifty thousand phones just buzzed.
  const [pending, setPending] = useState(false);

  const close = () => {
    if (pending) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onClose={close} dismissible={!pending}>
      <SendBody
        record={record}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        pending={pending}
        onPendingChange={setPending}
        onRequestClose={close}
      />
    </Dialog>
  );
}

/**
 * Split out so every piece of state below — the typed phrase, the failure, the
 * refusal flag — is created fresh on each open. `<Dialog>` unmounts its children
 * while closed, which is what makes a reset-on-close effect unnecessary; the
 * alternative is a render nobody asked for that keeps working right up until one
 * field is forgotten and a previous broadcast's confirmation is already filled in.
 */
function SendBody({
  record,
  onConfirm,
  onOpenChange,
  pending,
  onPendingChange,
  onRequestClose,
}: {
  record: AdminBroadcast;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const titleId = useId();
  const confirmId = useId();
  const formId = useId();

  const phrase = confirmationPhrase(record);
  const matches = typed.trim().toLocaleLowerCase() === phrase.toLocaleLowerCase();
  const targeted = record.audience.key === "district";
  const untranslated = tamilCoverage(record) !== "full";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!matches || pending || refused) return;

    onPendingChange(true);
    setFailure(null);
    setRefused(false);

    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      setFailure(broadcastErrorMessage(error));
      // A refusal that can never become an acceptance disables the button. The
      // caller has already refetched on a stale conflict, so what is on screen
      // behind this dialog is right by the time it is read.
      setRefused(isBroadcastPermanentRefusal(error) || isBroadcastStaleConflict(error));
    } finally {
      onPendingChange(false);
    }
  };

  return (
    <>
      <DialogHeader
        title={targeted ? "Send this to a whole district?" : "Send this to every citizen?"}
        titleId={titleId}
        description="This is the only action in the console that cannot be undone."
        onClose={onRequestClose}
        dismissible={!pending}
      />

      <DialogBody>
        <form id={formId} onSubmit={submit} aria-labelledby={titleId} className="space-y-4" noValidate>
          {/* WHO. First, largest, and quoting the stored district verbatim —
              this is the field a typo makes useless, silently. */}
          <div className="rounded-control border border-border bg-surface-2 px-3.5 py-3">
            <p className="micro-label text-fg-muted">Goes to</p>
            <p className="mt-1 text-sm font-bold text-fg">
              {targeted && record.district
                ? `Everyone whose district is “${record.district}”`
                : "Every citizen who can sign in"}
            </p>
            <p className="mt-1.5 text-xs text-fg-faint">
              {targeted
                ? "Matched exactly against the district each citizen's app reported. A spelling that differs by one character reaches nobody, and the send still reports success."
                : "Every account in the network. Suspended accounts are excluded — they cannot sign in to read it."}
            </p>
          </div>

          {/* WHAT THEY GET. Quoted, so nobody sends the wrong draft. */}
          <div className="rounded-control border border-border px-3.5 py-3">
            <p className="micro-label text-fg-muted">They will see</p>
            <p className="mt-1 text-sm font-medium text-fg">{record.titleEn}</p>
            <p className="mt-1 line-clamp-3 text-xs text-fg-subtle">{record.bodyEn}</p>
          </div>

          {untranslated ? (
            <p className="flex items-start gap-2 rounded-control border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-fg">
              <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                This has no complete Tamil translation, so Tamil-reading citizens get the English
                above. You can still send it — a warning that arrives is better than one that
                waits for a translator.
              </span>
            </p>
          ) : null}

          {/* WHAT IT DOES, in the plainest words available. */}
          <ul className="space-y-1.5 text-xs text-fg-subtle">
            <li className="flex gap-2">
              <span aria-hidden className="text-fg-faint">
                &bull;
              </span>
              <span>
                An alert is written into each person&apos;s alert list, and a push notification is
                sent to every device they have registered.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-fg-faint">
                &bull;
              </span>
              <span>
                <strong className="font-bold text-danger-fg">There is no un-send.</strong> Once it
                has gone out it cannot be edited, cancelled, deleted or sent again — the copy is on
                people&apos;s phones and in alert lists this console does not own.
              </span>
            </li>
          </ul>

          {/* THE GATE. */}
          <div className="space-y-1.5">
            <label htmlFor={confirmId} className="micro-label block text-fg-muted">
              Type <span className="font-mono text-fg">{phrase}</span> to confirm
            </label>
            <Input
              id={confirmId}
              value={typed}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={pending || refused}
              onChange={(event) => setTyped(event.target.value)}
              aria-describedby={`${confirmId}-hint`}
            />
            <p id={`${confirmId}-hint`} className="text-xs text-fg-faint">
              {targeted
                ? "Retyping the district is the last chance to notice a spelling that reaches nobody."
                : "Deliberate friction. Nothing else in this console asks for it, because nothing else in this console is permanent."}
            </p>
          </div>

          {failure ? (
            <div
              // Not `role="alert"` when the API simply said no — a refusal
              // announced as an alert reads as a fault in the console rather
              // than an answer from it.
              role={refused ? undefined : "alert"}
              className={cn(
                "flex items-start gap-2 rounded-control border px-3 py-2 text-xs",
                refused
                  ? "border-border bg-surface-2 text-fg-subtle"
                  : "border-danger-soft-border bg-danger-soft text-danger-fg",
              )}
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>{failure}</span>
            </div>
          ) : null}
        </form>
      </DialogBody>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRequestClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            size="sm"
            disabled={!matches || pending || refused}
          >
            <Send />
            {pending
              ? "Sending…"
              : targeted && record.district
                ? `Send to ${record.district}`
                : "Send to everyone"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
