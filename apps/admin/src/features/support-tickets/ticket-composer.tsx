"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, Send, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui";
import { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/cn";

import { invalidateAll } from "@/features/moderation/actions";
import { runTicketAction, SUPPORT_TICKET_KEYS, ticketPath } from "./api";
import { isClosed } from "./catalogue";
import {
  isMessageFieldName,
  MESSAGE_MAX,
  messageFormSchema,
  type MessageFormValues,
} from "./schema";
import { isTicketStaleConflict, supportErrorMessage } from "./support-errors";
import { Textarea } from "./textarea";
import type { SupportTicketDetail } from "./types";

/**
 * The composer. Two modes, and the entire design of this file exists to make
 * which one is active impossible to misread.
 *
 * THE FAILURE THIS PREVENTS
 * ───────────────────────────────────────────────────────────────────────────
 * An internal note is staff talking to staff on a citizen's ticket — "this user
 * has filed six of these", "escalated to the police liaison". Sending one as a
 * REPLY puts that text in front of the citizen it is about. It cannot be
 * unsent: `support_ticket_messages` has no `updated_at` and no `deleted_at`,
 * deliberately, because a support conversation is a record of what was said.
 * There is no undo to fall back on, so the interface has to be right the first
 * time.
 *
 * FIVE INDEPENDENT SIGNALS, NOT ONE CHECKBOX
 * ───────────────────────────────────────────────────────────────────────────
 * A checkbox is one small square that is easy to misread and easier to ignore.
 * Instead, mode changes five things at once, and an agent has to miss all five:
 *
 *   1. THE WHOLE COMPOSER CHANGES COLOUR. Reply is the ordinary surface;
 *      internal note is the amber `warning-soft` surface with a dashed border.
 *      This is visible from across the room and before any text is typed.
 *   2. A BANNER STATES THE AUDIENCE IN WORDS, every render, both ways — never
 *      only on the dangerous one. "Internal note — not visible to the user" and
 *      "Reply — <name> sees this in the app" are both always on screen, so the
 *      absence of a warning never has to be interpreted as safety.
 *   3. THE ICON CHANGES — a padlock for staff-only, people for the citizen.
 *   4. THE PLACEHOLDER CHANGES, so the empty box already says what it is for.
 *   5. THE BUTTON NAMES THE ACT AND THE AUDIENCE — "Send to Suresh" vs "Save
 *      internal note". The last thing an agent reads before clicking is who is
 *      about to receive this.
 *
 * WHY MODE IS NOT PART OF THE FORM, AND WHY IT DOES NOT RESET
 * ───────────────────────────────────────────────────────────────────────────
 * It is not a value being validated; it is which of two different actions is
 * being taken. Folding it into the form's values would put it inside the
 * `reset()` after a successful send, and a reset that silently changes the
 * AUDIENCE of the next message is precisely the bug this component is built to
 * make impossible.
 *
 * It is also deliberately STICKY across sends. Neither policy removes the
 * risk — reset-to-reply gets it wrong for a second note, sticky gets it wrong
 * for a reply after a note — so the choice is made on a different basis:
 * stickiness means fewer mode changes, each mode change is a chance to be
 * wrong, and the mode is loudly visible before typing starts rather than only
 * at the moment of sending.
 *
 * Switching modes KEEPS THE DRAFT. An agent who realises halfway through that
 * they are in the wrong mode must be able to flip without retyping — otherwise
 * the cheap fix is "send it anyway", which is the failure again.
 */

type ComposerMode = "reply" | "note";

export function TicketComposer({ ticket }: { ticket: SupportTicketDetail }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ComposerMode>("reply");
  const groupName = useId();
  const bodyId = useId();

  const isNote = mode === "note";
  const closed = isClosed(ticket.status.key);
  const recipient = ticket.user.name?.trim() || "the citizen who filed this";

  // `useMemo`, never a `useEffect` + `reset` on fetched data: React Query
  // refetches on window focus, and an effect-driven reset would wipe a
  // half-written reply the moment an agent alt-tabbed to check a fact. The
  // parent keys this component on the ticket id, so switching tickets remounts
  // rather than mutating a form somebody is typing into.
  const defaultValues = useMemo<MessageFormValues>(() => ({ body: "" }), []);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MessageFormValues>({
    resolver: zodResolver(messageFormSchema),
    defaultValues,
  });

  // `useWatch`, not `watch()`: it subscribes to this one field, and `watch()`
  // returns a fresh function React Compiler refuses to memoize around.
  const body = useWatch({ control, name: "body" });
  const used = body?.length ?? 0;

  const onSubmit = async (values: MessageFormValues) => {
    // The resolver replaces per-field errors on every pass, but a `root` error
    // is set by hand and stays until it is cleared by hand.
    clearErrors("root");

    try {
      await runTicketAction({
        queryClient,
        path: ticketPath(ticket.id, "/messages"),
        method: "POST",
        body: { body: values.body.trim(), isInternalNote: isNote },
        // No toast. The message appearing at the end of the thread IS the
        // confirmation, and it says more than a toast can — including, in the
        // note's case, that it landed marked staff-only.
        success: null,
      });

      // The one sanctioned reset: clears the box the agent just sent from.
      // It reads no server state, and it does not touch `mode`.
      reset(defaultValues);
    } catch (error) {
      // A refusal meaning the ticket already moved (someone else closed it
      // while this was open) leaves the composer enabled over a ticket that no
      // longer accepts messages. Refetch first, so the disabled state and the
      // explanation below arrive with the error rather than after it.
      if (isTicketStaleConflict(error)) void invalidateAll(queryClient, SUPPORT_TICKET_KEYS);

      // Server-side validation belongs on the field that failed it, never in a
      // toast — a toast leaves an agent with a box they cannot see how to fix.
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        let matched = false;
        for (const fieldError of error.fieldErrors) {
          if (isMessageFieldName(fieldError.path)) {
            setError(fieldError.path, { type: "server", message: fieldError.message });
            matched = true;
          }
        }
        if (matched) return;
        // Field errors naming nothing this form renders would otherwise vanish,
        // leaving a send that silently did nothing.
        setError("root", {
          message: error.fieldErrors.map((fieldError) => fieldError.message).join(" "),
        });
        return;
      }

      setError("root", { message: supportErrorMessage(error) });
    }
  };

  if (closed) return <ClosedNotice />;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label={isNote ? "Add an internal note" : "Reply to the citizen"}
      className={cn(
        // Sticky rather than a bounded inner scroller. The conversation above
        // scrolls with the page, so there is no second scroll box to get wrong
        // — no `overflow-y-auto` without its `min-h-0`, no viewport maths, and
        // no `vh`. The composer simply stays reachable from anywhere in a long
        // thread, the same way `UpdateForm`'s save bar does.
        "sticky bottom-0 space-y-3 rounded-card border p-3 shadow-card backdrop-blur-md transition-colors",
        // SIGNAL 1: the surface itself.
        isNote
          ? "border-dashed border-warning-soft-border bg-warning-soft"
          : "border-border bg-surface/95",
      )}
    >
      <ModeSwitch groupName={groupName} mode={mode} onChange={setMode} recipient={recipient} />

      {/* SIGNAL 2 + 3: the audience, in words, with an icon — for BOTH modes.
          Warning only the dangerous one would train agents to read "no banner"
          as "safe", and a missing element is not something anyone notices. */}
      <p
        className={cn(
          "flex items-start gap-2 rounded-control px-3 py-2 text-xs",
          isNote
            ? "bg-warning-soft text-warning-fg"
            : "border border-info-soft-border bg-info-soft text-info-fg",
        )}
      >
        {isNote ? (
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        ) : (
          <Users aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        )}
        <span>
          {isNote ? (
            <>
              <strong className="font-bold">Internal note — not visible to the user.</strong> Only
              staff with access to this queue can read it. It stays on the ticket permanently and
              cannot be edited or deleted.
            </>
          ) : (
            <>
              <strong className="font-bold">Reply — {recipient} sees this in the app.</strong> It
              is sent as support&rsquo;s answer and cannot be edited or unsent.
            </>
          )}
        </span>
      </p>

      <div className="space-y-1.5">
        <label htmlFor={bodyId} className="sr-only">
          {isNote ? "Internal note" : "Reply"}
        </label>
        <Textarea
          id={bodyId}
          rows={4}
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? `${bodyId}-error` : undefined}
          disabled={isSubmitting}
          // SIGNAL 4: even the empty box says what it is for.
          placeholder={
            isNote
              ? "A note for other staff — context, escalation, what you tried. The citizen never sees this."
              : `Your answer to ${recipient}. Plain text — the app renders it as written.`
          }
          className={cn(isNote && "border-warning-soft-border bg-canvas")}
          {...register("body")}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {errors.body ? (
            <p id={`${bodyId}-error`} className="text-xs font-medium text-danger-fg">
              {errors.body.message}
            </p>
          ) : (
            <span />
          )}
          {/* The bound made visible rather than enforced only at submit — see
              the note on MESSAGE_MAX. Only speaks up near the limit, so it is
              not one more thing on screen for the 99% of replies nowhere near it. */}
          <span
            className={cn(
              "tabular text-[11px]",
              used > MESSAGE_MAX ? "font-semibold text-danger-fg" : "text-fg-faint",
            )}
          >
            {used > MESSAGE_MAX * 0.8 ? `${used} / ${MESSAGE_MAX}` : null}
          </span>
        </div>
      </div>

      {errors.root?.message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger-soft-border bg-danger-soft px-3 py-2 text-xs text-danger-fg"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{errors.root.message}</span>
        </p>
      ) : null}

      <div className="flex justify-end">
        {/* SIGNAL 5: the last thing read before clicking names the audience.
            Disabled while pending, or a double-click sends the message twice —
            and there is no way to take either copy back. */}
        <Button
          type="submit"
          size="sm"
          variant={isNote ? "secondary" : "primary"}
          disabled={isSubmitting}
        >
          {isNote ? <Lock /> : <Send />}
          {isSubmitting
            ? isNote
              ? "Saving note…"
              : "Sending…"
            : isNote
              ? "Save internal note"
              : `Send to ${recipient}`}
        </Button>
      </div>
    </form>
  );
}

/**
 * Two native radios, styled as segments.
 *
 * Native `<input type="radio">` rather than buttons with `aria-pressed`,
 * because this is one mutually-exclusive choice and the platform already
 * implements it correctly: arrow keys move between options, the group is
 * announced as a group with a count, and the checked one is announced as
 * checked. A hand-rolled `role="radiogroup"` would be a second, worse
 * implementation of all three — on the one control in this feature where being
 * misunderstood by an assistive technology has a citizen-visible consequence.
 */
function ModeSwitch({
  groupName,
  mode,
  onChange,
  recipient,
}: {
  groupName: string;
  mode: ComposerMode;
  onChange: (mode: ComposerMode) => void;
  recipient: string;
}) {
  const options: Array<{ value: ComposerMode; label: string; hint: string }> = [
    { value: "reply", label: "Reply to user", hint: `Sent to ${recipient}` },
    { value: "note", label: "Internal note", hint: "Staff only" },
  ];

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Who should see this message?</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-control border border-border bg-surface-inset p-1">
        {options.map((option) => {
          const checked = mode === option.value;
          const isNoteOption = option.value === "note";

          return (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-control px-3 py-1.5 text-xs font-semibold transition-colors",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas",
                checked
                  ? isNoteOption
                    ? "bg-warning-fg text-canvas"
                    : "bg-primary text-primary-fg"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="flex items-center gap-1.5">
                {isNoteOption ? <Lock aria-hidden className="size-3" /> : null}
                {option.label}
              </span>
              <span className="sr-only"> — {option.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * A closed ticket's composer is DISABLED WITH THE REASON, never hidden.
 *
 * Hiding it leaves an agent looking for a reply box that is not there and
 * concluding the console is broken. Saying why, and saying what to do instead,
 * turns a dead end into one click — and the way back is the Status control,
 * which is named here rather than described vaguely, so nobody has to hunt for
 * it.
 */
function ClosedNotice() {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface-2 p-4">
      <p className="flex items-start gap-2 text-xs text-fg-subtle">
        <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-faint" />
        <span>
          <strong className="font-bold text-fg">This ticket is closed.</strong> The conversation is
          finished, so no reply or internal note can be added — the citizen cannot write here
          either. To continue it, set <strong className="font-semibold text-fg">Status</strong> back
          to Open or In Progress.
        </span>
      </p>
    </div>
  );
}
