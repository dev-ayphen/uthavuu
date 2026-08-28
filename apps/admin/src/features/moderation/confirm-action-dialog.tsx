"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui";
import { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "./dialog";
import { isPermanentRefusal, isStaleConflict, moderationErrorMessage } from "./moderation-errors";

/**
 * One dialog for every consequential action in the console.
 *
 * THE PRODUCT RULE IT ENFORCES
 * ───────────────────────────────────────────────────────────────────────────
 * Closing a request for emergency help, hiding it, or blocking someone's login
 * is audit-logged — and an audit entry is only worth having if a sentence is
 * attached saying why. The API agrees: `ModerateReportDto`, `ModerateCommentDto`
 * and `SuspendUserDto` all declare `reason` as `min(3).max(500)`, required. So
 * none of those actions is ever one unguarded click, and the schema below
 * mirrors the backend's refinements exactly, so a too-short reason is caught
 * inline rather than coming back as a 400 for the operator to decode.
 *
 * Reactivation and flag triage take an OPTIONAL reason (`ReactivateUserDto`,
 * `ResolveFlagDto`) — undoing a block, or moving a flag to "under review", is a
 * smaller act, and demanding prose for it trains people to type "." to get past
 * the field. `reason="optional"` mirrors that rather than over-applying the
 * strict rule.
 *
 * WHERE THE ERROR SURFACES
 * ───────────────────────────────────────────────────────────────────────────
 * A field problem lands on the field (`setError`), never in a toast. A refusal
 * lands inside this dialog, next to the button that caused it — closing and
 * firing a toast would drop the operator back on a list still showing the old
 * row, with the explanation already fading. The success toast is the caller's
 * job, because only the caller knows what changed.
 *
 * NO STATE IS RESET HERE, EVER
 * ───────────────────────────────────────────────────────────────────────────
 * Everything below the `<Dialog>` boundary is unmounted while closed, so the
 * form, the failure message and the field errors are new objects on each open.
 * The alternative — an effect that scrubs them on close — is a render nobody
 * asked for, and it silently keeps working until the day one field is forgotten
 * and a previous row's reason shows up pre-filled against a different record.
 */

export type ReasonMode = "required" | "optional" | "none";

const MIN_REASON = 3;
const MAX_REASON = 500;

function schemaFor(mode: ReasonMode) {
  if (mode === "none") return z.object({ reason: z.string().optional() });

  const base = z
    .string()
    .trim()
    .min(MIN_REASON, `Give at least ${MIN_REASON} characters — this goes in the audit log.`)
    .max(MAX_REASON, `Keep it under ${MAX_REASON} characters.`);

  if (mode === "required") return z.object({ reason: base });

  // Optional means "empty is fine", NOT "one character is fine". The empty
  // string has to be allowed through before the length rules apply, or the
  // field is effectively required again.
  return z.object({ reason: z.union([z.literal(""), base]).optional() });
}

export type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Extra controls above the reason box — a status picker, a quoted comment. */
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  tone?: "primary" | "danger";
  reason?: ReasonMode;
  reasonLabel?: string;
  reasonHint?: string;
  /** Resolve to close the dialog; throw to show the failure inside it. */
  onConfirm: (reason: string | undefined) => Promise<void>;
  /** Called after a refusal meaning the on-screen record is out of date. */
  onStale?: () => void;
};

export function ConfirmActionDialog(props: ConfirmActionDialogProps) {
  // `pending` lives out here because `<Dialog>` needs it to refuse Escape and
  // backdrop clicks: an operator must not be able to dismiss a request they
  // have already sent and be left unsure whether it landed. It never needs
  // resetting — the `finally` in the submit handler always clears it.
  const [pending, setPending] = useState(false);

  const close = () => {
    if (pending) return;
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onClose={close} dismissible={!pending}>
      <ConfirmActionBody
        {...props}
        pending={pending}
        onPendingChange={setPending}
        onRequestClose={close}
      />
    </Dialog>
  );
}

function ConfirmActionBody({
  title,
  description,
  children,
  confirmLabel,
  pendingLabel = "Working…",
  tone = "primary",
  reason: reasonMode = "required",
  reasonLabel = "Reason",
  reasonHint,
  onConfirm,
  onOpenChange,
  onStale,
  pending,
  onPendingChange,
  onRequestClose,
}: ConfirmActionDialogProps & {
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const titleId = useId();
  const reasonId = useId();
  const formId = useId();

  const schema = useMemo(() => schemaFor(reasonMode), [reasonMode]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<{ reason?: string }>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });

  const submit = handleSubmit(async (values) => {
    onPendingChange(true);
    setFailure(null);
    setRefused(false);

    try {
      const trimmed = values.reason?.trim();
      await onConfirm(trimmed ? trimmed : undefined);
      onOpenChange(false);
    } catch (error) {
      // Server-side validation belongs on the field that failed it. The API's
      // Zod pipe reports `errors: [{ path, message }]`, which `ApiError`
      // already flattens for exactly this.
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const onReason = error.fieldErrors.filter((field) => field.path === "reason");
        if (onReason.length > 0) {
          setError("reason", { type: "server", message: onReason[0]?.message });
          return;
        }
      }

      setFailure(moderationErrorMessage(error));
      setRefused(isPermanentRefusal(error));
      if (isStaleConflict(error)) onStale?.();
    } finally {
      onPendingChange(false);
    }
  });

  return (
    <>
      <DialogHeader
        title={title}
        titleId={titleId}
        description={description}
        onClose={onRequestClose}
        dismissible={!pending}
      />

      <DialogBody>
        <form
          id={formId}
          onSubmit={submit}
          aria-labelledby={titleId}
          className="space-y-4"
          noValidate
        >
          {children}

          {reasonMode === "none" ? null : (
            <div className="space-y-1.5">
              <label htmlFor={reasonId} className="micro-label block text-fg-muted">
                {reasonLabel}
                {reasonMode === "optional" ? (
                  <span className="ml-1 font-normal text-fg-faint">(optional)</span>
                ) : null}
              </label>
              <textarea
                id={reasonId}
                rows={3}
                autoFocus
                aria-invalid={errors.reason ? true : undefined}
                aria-describedby={errors.reason ? `${reasonId}-error` : undefined}
                disabled={pending}
                className={cn(
                  "w-full resize-y rounded-control border border-border bg-surface-inset px-3 py-2 text-xs text-fg",
                  "placeholder:text-fg-faint",
                  "outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  errors.reason && "border-danger-fg",
                )}
                {...register("reason")}
              />
              {errors.reason ? (
                <p id={`${reasonId}-error`} className="text-xs font-medium text-danger-fg">
                  {errors.reason.message}
                </p>
              ) : reasonHint ? (
                <p className="text-xs text-fg-faint">{reasonHint}</p>
              ) : null}
            </div>
          )}

          {failure ? (
            // Not `role="alert"` when the API simply said no — same rule as
            // `classifyListFailure`. A refusal announced as an alert reads as a
            // fault in the console rather than an answer from it.
            <div
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
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            // Disabled on a permanent refusal too: the answer will not change,
            // and an enabled button invites the operator to keep asking.
            disabled={pending || refused}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
