"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Users, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

import { invalidateAll } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Select } from "@/components/ui";

import { runTicketAction, SUPPORT_TICKET_KEYS, ticketPath } from "./api";
import { TICKET_WORKING_STATUS_KEYS } from "./catalogue";
import { MESSAGE_MAX } from "./schema";
import { isTicketStaleConflict, supportErrorMessage } from "./support-errors";
import { Textarea } from "./textarea";
import type { SupportTicketDetail, TicketPatch } from "./types";
import { useAssignableAdmins } from "./use-support-tickets";
import { useTicketCatalogue } from "./use-ticket-catalogue";

/**
 * Status, Priority, Assigned to — and the two actions that end a ticket.
 *
 * STATUS IS SERVER-OWNED, AND THESE CONTROLS ARE BUILT TO PROVE IT
 * ───────────────────────────────────────────────────────────────────────────
 * Every `<select>` here is CONTROLLED BY THE RECORD, with no local mirror of
 * its own value. Changing one fires the PATCH and nothing else; the control
 * only moves when the refetched ticket says it moved. That has three
 * consequences worth stating, because each is a bug avoided:
 *
 *   - A refused change SNAPS BACK by itself. There is no optimistic value to
 *     roll back and no `useEffect` re-syncing anything, because the only value
 *     that ever existed came from the server.
 *   - The console can never show a transition the API did not perform. In a
 *     console whose whole job is to be believed about state, a status that
 *     lies for 200ms is worse than one that waits a round trip.
 *   - A side effect the backend adds later (resolving stamping `resolved_at`,
 *     closing refusing new messages) appears here for free, because the whole
 *     record is refetched rather than patched field by field.
 *
 * RESOLVED AND CLOSED ARE NOT IN THE STATUS DROPDOWN
 * ───────────────────────────────────────────────────────────────────────────
 * They are the two consequential transitions, and both have their own confirmed
 * action below. Leaving them in the dropdown would put an unconfirmed one-click
 * Close next to a confirmed one — and the unconfirmed one would win, because it
 * is nearer and quieter. The dropdown still moves a ticket the other way: it is
 * the reopen path, which is why a resolved or closed ticket keeps a working
 * status list rather than getting a separate "Reopen" button meaning the same
 * thing.
 *
 * A FAILED CONTROL CHANGE IS A TOAST, not an ErrorState and not an inline field
 * error. It is a failed ACTION — the page is still perfectly readable and
 * nothing needs retrying to see the ticket. That is the console's rule (field
 * errors inline, failed loads as an error state with retry, failed actions as a
 * toast), and a select is the one place all three are tempting.
 */
export function TicketControls({ ticket }: { ticket: SupportTicketDetail }) {
  const queryClient = useQueryClient();
  const { admins, isLoading: adminsLoading, failed: adminsFailed } = useAssignableAdmins();
  const catalogue = useTicketCatalogue();

  /** Which control is mid-flight, so only that one disables. */
  const [pending, setPending] = useState<null | "status" | "priority" | "assigned">(null);
  const [action, setAction] = useState<null | "resolve" | "close">(null);

  /**
   * The optional citizen-visible note attached to a resolve or a close.
   *
   * CLEARED ON EVERY OPEN AND EVERY CLOSE, explicitly. `ConfirmActionDialog`
   * gets away with resetting nothing because everything below its `<Dialog>` is
   * unmounted while closed — this value lives out here, in the parent, so it
   * would survive. A sentence typed for Resolve, abandoned, and then silently
   * re-sent to a citizen from the Close dialog is exactly the kind of leak this
   * feature is built to prevent, so the reset is one line rather than a
   * subtlety to remember.
   */
  const [message, setMessage] = useState("");

  const openAction = (next: null | "resolve" | "close") => {
    setMessage("");
    setAction(next);
  };

  const statusId = useId();
  const priorityId = useId();
  const assignedId = useId();

  const statusKey = ticket.status.key;
  const resolved = statusKey === "resolved";
  const closed = statusKey === "closed";
  const citizen = ticket.user.name?.trim() || "the citizen who filed this";

  const patch = async (field: "status" | "priority" | "assigned", body: TicketPatch) => {
    setPending(field);
    try {
      await runTicketAction({
        queryClient,
        path: ticketPath(ticket.id),
        method: "PATCH",
        body,
        success: "Ticket updated.",
      });
    } catch (error) {
      // A refusal meaning the record already moved is answered by refetching,
      // so the control stops disagreeing with the database. Without it an agent
      // sees the old value, tries the same change again, and gets the same
      // refusal.
      if (isTicketStaleConflict(error)) void invalidateAll(queryClient, SUPPORT_TICKET_KEYS);
      toast.error(supportErrorMessage(error));
    } finally {
      setPending(null);
    }
  };

  /**
   * The status list always contains the ticket's CURRENT value, even when that
   * value is one this dropdown will not offer as a destination. A `<select>`
   * whose `value` matches no option silently displays its first one instead —
   * a closed ticket would render as "Open" and an agent would believe it.
   */
  const statusOptions = catalogue.statuses.filter(
    (option) => TICKET_WORKING_STATUS_KEYS.includes(option.value) || option.value === statusKey,
  );

  const priorityOptions = catalogue.priorities.some(
    (option) => option.value === ticket.priority?.key,
  )
    ? catalogue.priorities
    : // Same rule as above: a priority the API returned that the catalogue does
      // not list — because the catalogue is still on its fallback, or the row
      // was removed — still has to be selectable, or the control would claim
      // the ticket is "Low" the moment it renders.
      [
        ...catalogue.priorities,
        ...(ticket.priority ? [{ value: ticket.priority.key, label: ticket.priority.label }] : []),
      ];

  const onStale = () => void invalidateAll(queryClient, SUPPORT_TICKET_KEYS);

  /** Invalidate on a stale refusal, then rethrow so the dialog reports it. */
  const refetchOnStale = (error: unknown): never => {
    if (isTicketStaleConflict(error)) onStale();
    throw error;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Handling</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <Field
          label="Status"
          htmlFor={statusId}
          hint={
            closed
              ? "Closed. Set this back to Open or In Progress to reply again."
              : "Resolved and Closed are set with the buttons below, not here."
          }
        >
          <Select
            id={statusId}
            className="w-full"
            value={statusKey}
            disabled={pending !== null}
            onChange={(event) => void patch("status", { status: event.target.value })}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Priority"
          htmlFor={priorityId}
          hint="Set by staff. A citizen cannot mark their own ticket urgent."
        >
          <Select
            id={priorityId}
            className="w-full"
            // `""` when the API has not sent a priority. The placeholder option
            // below carries the same value so the control has something honest
            // to display, rather than defaulting to a triage decision nobody made.
            value={ticket.priority?.key ?? ""}
            disabled={pending !== null}
            onChange={(event) => void patch("priority", { priority: event.target.value })}
          >
            {ticket.priority ? null : (
              <option value="" disabled>
                Not set
              </option>
            )}
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Assigned to"
          htmlFor={assignedId}
          hint={
            adminsFailed
              ? "The admin directory couldn't be loaded, so this can't be changed right now. The ticket's current owner is still shown."
              : undefined
          }
        >
          <Select
            id={assignedId}
            className="w-full"
            value={ticket.assignedAdmin?.id ?? ""}
            // Degrades rather than lying: with no directory there is nothing
            // honest to offer, so the control is disabled with the reason
            // beside it instead of showing an empty list that reads as "there
            // are no admins".
            disabled={pending !== null || adminsLoading || adminsFailed}
            onChange={(event) =>
              void patch("assigned", {
                // `null`, not `""`. The DTO makes `assignedAdminId` nullable
                // precisely so "hand it back to the queue" is expressible;
                // an empty string would be a user id that does not exist.
                assignedAdminId: event.target.value === "" ? null : event.target.value,
              })
            }
          >
            <option value="">Unassigned</option>
            {/* The current owner may have left the directory (their console
                access was revoked) while still owning the ticket — the FK is
                to `user`, not `admin_users`, exactly so that keeps working.
                Listing them keeps the control showing the truth. */}
            {ticket.assignedAdmin && !admins.some((a) => a.id === ticket.assignedAdmin?.id) ? (
              <option value={ticket.assignedAdmin.id}>
                {ticket.assignedAdmin.name ?? ticket.assignedAdmin.id}
              </option>
            ) : null}
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.name}
              </option>
            ))}
          </Select>
        </Field>

        {/* Both actions, or neither. A closed ticket is finished — the way out
            of it is the Status control above, not a third button here. */}
        {closed ? null : (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {resolved ? null : (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending !== null}
                onClick={() => openAction("resolve")}
              >
                <CheckCircle2 />
                Resolve
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={pending !== null}
              onClick={() => openAction("close")}
            >
              <XCircle />
              Close
            </Button>
          </div>
        )}
      </CardBody>

      {/*
        RESOLVE AND CLOSE ARE DIFFERENT THINGS, AND EACH DIALOG SAYS WHICH.
        Every sentence below is about what happens to the CITIZEN, because that
        is the part an agent cannot see from this screen and the part they are
        actually deciding. Each dialog also names the other action and when to
        use it instead — the two are only confusable when described alone.

        `reason="none"` is deliberate rather than default. Both routes DO accept
        an audit-only `reason` (`CloseSupportTicketSchema`), and this console
        collects the citizen-visible `message` instead — one box, not two. The
        reasoning is in `ClosingMessageField` below, and it is the same reasoning
        the composer is built on: two textareas in one dialog, one private and
        one public, is the confusion this feature exists to eliminate,
        reintroduced at the moment an agent is least likely to read carefully.
      */}
      <ConfirmActionDialog
        open={action === "resolve"}
        onOpenChange={(open) => openAction(open ? "resolve" : null)}
        title="Mark this ticket resolved?"
        description={
          <>
            This says support believes the problem is fixed. The ticket leaves the working queue,
            but <strong className="font-bold">the conversation stays open</strong> — {citizen} can
            still reply here, and a reply is expected to bring it back.
            <br />
            <br />
            Use <strong className="font-bold">Close</strong> instead when the conversation is
            finished and no further reply is wanted.
          </>
        }
        confirmLabel="Mark resolved"
        pendingLabel="Resolving…"
        reason="none"
        onStale={onStale}
        onConfirm={() =>
          runTicketAction({
            queryClient,
            path: ticketPath(ticket.id, "/resolve"),
            body: bodyFor(message),
            success: "Ticket marked resolved.",
          })
            .then(() => undefined)
            .catch(refetchOnStale)
        }
      >
        <ClosingMessageField
          value={message}
          onChange={setMessage}
          citizen={citizen}
          placeholder="What was done, and what to do if it happens again."
        />
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={action === "close"}
        onOpenChange={(open) => openAction(open ? "close" : null)}
        title="Close this ticket?"
        description={
          <>
            This ends the conversation.{" "}
            <strong className="font-bold">
              Neither you nor {citizen} can add a message afterwards
            </strong>{" "}
            — the composer on this page is disabled, and the ticket is finished on their side too.
            Nothing is deleted: the whole thread stays readable here.
            <br />
            <br />
            Use <strong className="font-bold">Resolve</strong> instead if the problem looks fixed
            but they might still come back. A closed ticket can be reopened from the Status control,
            but that is a decision someone has to make rather than something they can simply reply
            into.
          </>
        }
        confirmLabel="Close ticket"
        pendingLabel="Closing…"
        tone="danger"
        reason="none"
        onStale={onStale}
        onConfirm={() =>
          runTicketAction({
            queryClient,
            path: ticketPath(ticket.id, "/close"),
            body: bodyFor(message),
            success: "Ticket closed.",
          })
            .then(() => undefined)
            .catch(refetchOnStale)
        }
      >
        <ClosingMessageField
          value={message}
          onChange={setMessage}
          citizen={citizen}
          placeholder="A last word before the thread is shut — they cannot reply to it."
        />
      </ConfirmActionDialog>
    </Card>
  );
}

/**
 * `{ message }` when there is one, and nothing at all when there is not.
 *
 * `CloseSupportTicketSchema` makes every field optional and parses an empty
 * `{}`, so omitting the key is a legal "no message" — and it is the right
 * spelling, because `""` would be a message the citizen receives as a blank
 * reply. Same distinction the announcements form draws between `null` and `""`.
 */
function bodyFor(message: string): { message: string } | undefined {
  const trimmed = message.trim();
  return trimmed === "" ? undefined : { message: trimmed };
}

/**
 * The optional sentence that goes out WITH a resolve or a close.
 *
 * WHY THIS FIELD EXISTS AT ALL
 * ───────────────────────────────────────────────────────────────────────────
 * `POST .../resolve` and `.../close` both accept `message`, and the API posts
 * it as a normal citizen-visible reply inside the same transaction as the
 * status change — one act, one audit row, no half-done state where the ticket
 * moved but the explanation did not. Its DTO says why in as many words:
 * making an agent write the explanation as a separate reply first is how
 * tickets get resolved in silence.
 *
 * WHY IT IS THE ONLY BOX IN THESE DIALOGS
 * ───────────────────────────────────────────────────────────────────────────
 * Both endpoints also accept an audit-only `reason`, and `ConfirmActionDialog`
 * has a built-in field for exactly that — which is why `reason="none"` is
 * passed rather than left at its default. Two textareas in one dialog, one
 * private and one public, is the same confusion the composer spends five
 * signals eliminating, reintroduced at the moment an agent is least likely to
 * read carefully. The audit row still records who acted, when, and the
 * before/after status; what is given up is a written motive on an action that
 * is reversible from the Status control either way.
 *
 * So this box is citizen-visible, and it says so in the same words and the same
 * blue the composer's reply banner uses — an agent who has learned the
 * composer's colours already knows what this one means.
 */
function ClosingMessageField({
  value,
  onChange,
  citizen,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  citizen: string;
  placeholder: string;
}) {
  const id = useId();
  const over = value.length > MESSAGE_MAX;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="micro-label block text-fg-muted">
        Message to {citizen}
        <span className="ml-1 font-normal text-fg-faint">(optional)</span>
      </label>

      <p className="flex items-start gap-2 rounded-control border border-info-soft-border bg-info-soft px-3 py-2 text-xs text-info-fg">
        <Users aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Sent as a normal reply, at the same moment. <strong className="font-bold">{citizen}</strong>{" "}
          sees it in the app. Leave it blank to change the status silently.
        </span>
      </p>

      <Textarea
        id={id}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={over}
        className="text-xs"
      />

      {/* Only speaks up near the limit. The API caps this at MESSAGE_MAX and
          would refuse a longer one inside the dialog, next to the button that
          caused it — but meeting a visible number beats meeting a 400. */}
      {value.length > MESSAGE_MAX * 0.8 ? (
        <p className={cn("tabular text-right text-[11px]", over ? "font-semibold text-danger-fg" : "text-fg-faint")}>
          {value.length} / {MESSAGE_MAX}
        </p>
      ) : null}
    </div>
  );
}
