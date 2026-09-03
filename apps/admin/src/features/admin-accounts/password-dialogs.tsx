"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import { useId, useState } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { toast } from "sonner";

import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
} from "@/components/ui";
import { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { adminAccountMutate } from "./api";
import { CODE_TO_FIELD, adminAccountErrorMessage } from "./admin-errors";
import {
  PASSWORD_MIN,
  changeOwnPasswordSchema,
  isChangePasswordField,
  isResetPasswordField,
  resetPasswordSchema,
  type ChangeOwnPasswordValues,
  type ResetPasswordValues,
} from "./schema";
import type { AdminAccountDetail } from "./types";

/**
 * The two credential dialogs — and they are two dialogs, not one with a flag.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NEITHER OF THESE IS A FIELD ON THE EDIT FORM
 * ─────────────────────────────────────────────────────────────────────────────
 * Changing a name and changing a password are different acts. One is a
 * correction; the other locks a colleague out until they are told the new
 * secret, and — for `reset` — is something only a super admin may do at all.
 * Putting a password box on the edit form merges a low-stakes action with a
 * high-stakes one behind a single "Save changes", which is how a routine
 * spelling fix becomes an unannounced credential rotation. `./schema.ts` is
 * where that separation is actually enforced: `adminEditSchema` has three
 * fields and `formValuesToUpdatePayload` builds the PATCH body from those three
 * names, so a password cannot reach the edit endpoint even by accident.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY "CHANGE" AND "RESET" ARE NOT THE SAME DIALOG
 * ─────────────────────────────────────────────────────────────────────────────
 *   CHANGE (your own)      current + new + confirm, `POST /admin/me/change-password`.
 *                          The current-password field is the point: it is what
 *                          stops an unattended session becoming a permanent
 *                          account takeover.
 *
 *   RESET (someone else's) new + confirm, `POST /admin/admins/:id/reset-password`.
 *                          NO current-password field. A super admin does not
 *                          know another person's password. A box asking for it
 *                          would be theatre — either ignored by the server or
 *                          filled in with a guess — and it would imply the
 *                          console can verify something it cannot.
 *
 * One component with an `isSelf` prop would put those two field sets one
 * boolean apart, which is precisely the distance at which they get merged again
 * by a later edit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT NEVER HAPPENS TO A PASSWORD IN THIS FILE
 * ─────────────────────────────────────────────────────────────────────────────
 *   - It is never logged. There is no `console.*` here, and the failure path
 *     surfaces `adminAccountErrorMessage(error)` — a message about the request,
 *     never the body that was sent.
 *   - It is never put in a URL. Both calls are POST bodies; a query string ends
 *     up in proxy logs, browser history and `Referer` headers.
 *   - It is never in a toast. The success message names the person, never the
 *     secret — and never "the new password is …", which would leave a
 *     credential sitting on screen for anyone walking past.
 *   - It never reaches React Query. These two call `adminAccountMutate`
 *     directly rather than `runAdminAccountAction`, so no cache, serialiser or
 *     devtools panel ever sees it. Nothing observable changes in the list
 *     either, so there is nothing to invalidate.
 *   - It is never held after the dialog closes. `<Dialog>` unmounts its
 *     children while closed (see `@uthavu/libs-web`'s `Dialog`), so the form
 *     state is discarded with the component rather than scrubbed by an effect
 *     someone can forget to update.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Change your own password
// ─────────────────────────────────────────────────────────────────────────────

export function ChangeOwnPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);

  const close = () => {
    // An operator must not be able to dismiss a request they have already sent
    // and be left unsure whether their password changed.
    if (pending) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onClose={close} dismissible={!pending}>
      <ChangeOwnPasswordBody
        pending={pending}
        onPendingChange={setPending}
        onRequestClose={close}
        onDone={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

function ChangeOwnPasswordBody({
  pending,
  onPendingChange,
  onRequestClose,
  onDone,
}: {
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
  onDone: () => void;
}) {
  const titleId = useId();
  const formId = useId();

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<ChangeOwnPasswordValues>({
    resolver: zodResolver(changeOwnPasswordSchema),
    // Static, so there is no `useMemo` to write and nothing for a background
    // refetch to clobber: a password form is never populated from server state.
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });

  // `useWatch`, not `watch()`: it subscribes to these two fields only, so
  // typing the current password does not re-render the requirements list — and
  // `watch()` returns a fresh function React Compiler refuses to memoize around.
  const newPassword = useWatch({ control, name: "newPassword" });
  const confirmNewPassword = useWatch({ control, name: "confirmNewPassword" });

  const onSubmit = handleSubmit(async (values) => {
    clearErrors("root");
    onPendingChange(true);

    try {
      await adminAccountMutate("/admin/me/change-password", "POST", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Names the act, not the secret.
      toast.success("Your password has been changed.");
      onDone();
    } catch (error) {
      // A hand-raised code that is really about ONE field.
      // `INVALID_CURRENT_PASSWORD` is a 403 carrying a bare `{ code, message }`
      // — the service asks Better Auth's verifier directly, so there is no Zod
      // `errors[]` array — and it is entirely about the top box. Left to the
      // generic path it would land in the form-level banner, next to two boxes
      // that are perfectly fine.
      const field = error instanceof ApiError && error.code ? CODE_TO_FIELD[error.code] : undefined;
      if (field && isChangePasswordField(field)) {
        setError(field as keyof ChangeOwnPasswordValues, {
          type: "server",
          message: adminAccountErrorMessage(error),
        });
        return;
      }

      const handled = routeFieldErrors(error, isChangePasswordField, (path, message) => {
        setError(path as keyof ChangeOwnPasswordValues, { type: "server", message });
      });
      if (handled) return;
      setError("root", { message: adminAccountErrorMessage(error) });
    } finally {
      onPendingChange(false);
    }
  });

  return (
    <>
      <DialogHeader
        title="Change your password"
        titleId={titleId}
        description="The one thing every admin can do to their own account, whatever their role."
        onClose={onRequestClose}
        dismissible={!pending}
      />

      <DialogBody>
        <form
          id={formId}
          onSubmit={onSubmit}
          aria-labelledby={titleId}
          noValidate
          className="space-y-4"
        >
          <FormBanner message={errors.root?.message} />

          <PasswordField
            label="Current password"
            error={errors.currentPassword?.message}
            hint="Proving you know this is what stops an unattended session being turned into a permanent takeover."
            registration={register("currentPassword")}
            autoComplete="current-password"
            disabled={pending}
          />

          <PasswordField
            label="New password"
            error={errors.newPassword?.message}
            hint="Must differ from your current one — the API refuses a rotation that changes nothing, because it would record a credential change that did not happen."
            registration={register("newPassword")}
            autoComplete="new-password"
            disabled={pending}
          />

          <PasswordField
            label="Confirm new password"
            error={errors.confirmNewPassword?.message}
            registration={register("confirmNewPassword")}
            autoComplete="new-password"
            disabled={pending}
          />

          <PasswordRequirements password={newPassword} confirmation={confirmNewPassword} />
        </form>
      </DialogBody>

      <DialogFooter>
        <DialogActions
          pending={pending}
          onCancel={onRequestClose}
          formId={formId}
          label="Change password"
          pendingLabel="Changing…"
        />
      </DialogFooter>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset someone else's password
// ─────────────────────────────────────────────────────────────────────────────

export function ResetPasswordDialog({
  open,
  onOpenChange,
  admin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admin: AdminAccountDetail;
}) {
  const [pending, setPending] = useState(false);

  const close = () => {
    if (pending) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onClose={close} dismissible={!pending}>
      <ResetPasswordBody
        admin={admin}
        pending={pending}
        onPendingChange={setPending}
        onRequestClose={close}
        onDone={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

function ResetPasswordBody({
  admin,
  pending,
  onPendingChange,
  onRequestClose,
  onDone,
}: {
  admin: AdminAccountDetail;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
  onDone: () => void;
}) {
  const titleId = useId();
  const formId = useId();

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const newPassword = useWatch({ control, name: "newPassword" });
  const confirmPassword = useWatch({ control, name: "confirmPassword" });

  const onSubmit = handleSubmit(async (values) => {
    clearErrors("root");
    onPendingChange(true);

    try {
      await adminAccountMutate(
        `/admin/admins/${encodeURIComponent(admin.userId)}/reset-password`,
        "POST",
        { newPassword: values.newPassword },
      );
      // Deliberately does NOT echo the password back. A toast that reads "the
      // new password is …" leaves a live credential on screen for whoever walks
      // past, and in a screenshot afterwards.
      toast.success(`${admin.name}'s password has been reset.`);
      onDone();
    } catch (error) {
      const handled = routeFieldErrors(error, isResetPasswordField, (path, message) => {
        setError(path as keyof ResetPasswordValues, { type: "server", message });
      });
      if (handled) return;
      setError("root", { message: adminAccountErrorMessage(error) });
    } finally {
      onPendingChange(false);
    }
  });

  return (
    <>
      <DialogHeader
        title={`Reset ${admin.name}'s password`}
        titleId={titleId}
        description={admin.email}
        onClose={onRequestClose}
        dismissible={!pending}
      />

      <DialogBody>
        <form
          id={formId}
          onSubmit={onSubmit}
          aria-labelledby={titleId}
          noValidate
          className="space-y-4"
        >
          <FormBanner message={errors.root?.message} />

          {/* The single most important thing an operator needs to know before
              pressing the button: the console cannot deliver this for them. */}
          <Alert tone="warning" icon={ShieldAlert}>
            Nothing is emailed. {admin.name} cannot sign in until you tell them this password
            yourself, through a channel you trust — and the console will not show it to you again
            afterwards.
          </Alert>

          <PasswordField
            label="New password"
            error={errors.newPassword?.message}
            registration={register("newPassword")}
            // `new-password`, so a browser or manager offers to GENERATE one
            // rather than autofilling the operator's own saved credential into
            // a colleague's account.
            autoComplete="new-password"
            disabled={pending}
          />

          <PasswordField
            label="Confirm password"
            error={errors.confirmPassword?.message}
            registration={register("confirmPassword")}
            autoComplete="new-password"
            disabled={pending}
          />

          <PasswordRequirements password={newPassword} confirmation={confirmPassword} />

          {/* Says, in words, what this dialog is NOT asking for — because its
              absence is the surprising part, and an operator hunting for the
              missing field is one who assumes the form is broken. */}
          <Alert tone="neutral" icon={KeyRound} className="text-[11px]">
            <span>
              This form does not ask for {admin.name}&rsquo;s current password, and it never will —
              you do not know it, and pretending otherwise would just be a box to guess into. That
              is also why this action is restricted to super admins and recorded.
            </span>
          </Alert>
        </form>
      </DialogBody>

      <DialogFooter>
        <DialogActions
          pending={pending}
          onCancel={onRequestClose}
          formId={formId}
          label="Reset password"
          pendingLabel="Resetting…"
          tone="danger"
        />
      </DialogFooter>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route the API's `validationErrors` onto the fields they name.
 *
 * `ApiError.fieldErrors` already flattens the API's Zod envelope into
 * `{ path, message }`. A field problem shown as a toast leaves the operator
 * with a form they cannot see how to fix, so anything that names a field this
 * form renders lands on that field; anything else is returned as unhandled so
 * the caller can put it in the form-level banner rather than dropping it, which
 * would leave a submit that silently did nothing.
 *
 * @returns true when the error was fully handled here.
 */
function routeFieldErrors(
  error: unknown,
  isField: (path: string) => boolean,
  setField: (path: string, message: string) => void,
): boolean {
  if (!(error instanceof ApiError) || error.fieldErrors.length === 0) return false;

  let matched = false;
  for (const fieldError of error.fieldErrors) {
    if (isField(fieldError.path)) {
      setField(fieldError.path, fieldError.message);
      matched = true;
    }
  }
  return matched;
}

function FormBanner({ message }: { message?: string }) {
  if (!message) return null;
  return <Alert>{message}</Alert>;
}

function DialogActions({
  pending,
  onCancel,
  formId,
  label,
  pendingLabel,
  tone = "primary",
}: {
  pending: boolean;
  onCancel: () => void;
  formId: string;
  label: string;
  pendingLabel: string;
  tone?: "primary" | "danger";
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      {/* Disabled while pending: a double-click would send two credential
          changes, and the second one wins silently. */}
      <Button
        type="submit"
        form={formId}
        size="sm"
        variant={tone === "danger" ? "danger" : "primary"}
        disabled={pending}
      >
        {pending ? pendingLabel : label}
      </Button>
    </div>
  );
}

/**
 * A password box with a reveal toggle.
 *
 * The toggle is not a nicety. Typing a long generated password blind, twice,
 * into a box that will not accept it if one character is wrong is how an
 * operator ends up choosing something short instead. It defaults to hidden, and
 * `aria-pressed` is what tells a screen-reader user which state it is in.
 */
function PasswordField({
  label,
  error,
  hint,
  registration,
  disabled,
  autoComplete,
}: {
  label: string;
  error?: string;
  hint?: string;
  registration: UseFormRegisterReturn;
  disabled?: boolean;
  autoComplete: "current-password" | "new-password";
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <span className="relative block">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          // A password is not prose. Spellcheck ships what is typed to a remote
          // service in some browsers, and autocapitalise silently changes it.
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="pr-11"
          {...registration}
        />
        <button
          type="button"
          onClick={() => setRevealed((value) => !value)}
          aria-pressed={revealed}
          aria-label={revealed ? "Hide password" : "Show password"}
          // Not disabled while the field is: an operator waiting on a request
          // may still want to check what they typed.
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-fg-faint transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {revealed ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </span>
    </Field>
  );
}

/**
 * The rules, on screen, checking themselves off as they are met.
 *
 * EXACTLY TWO, BECAUSE `AdminPasswordSchema` STATES EXACTLY TWO — a length
 * floor and (via the form) a matching confirmation. It is tempting to add "one
 * number, one symbol"; every login form has them. Here that would be the
 * console inventing a policy the API does not enforce, refusing a password the
 * server would have accepted, and — worse — teaching an operator a rule that is
 * not true. `./schema.ts` validates the same two and nothing else, so what is
 * listed here and what is enforced cannot drift apart.
 *
 * The 128-character ceiling is real too (Better Auth's `maxPasswordLength`) but
 * is not listed: a ceiling nobody approaches is noise in a checklist, and the
 * schema still catches it with a plain message if somebody pastes a key.
 */
function PasswordRequirements({
  password,
  confirmation,
}: {
  password: string;
  confirmation: string;
}) {
  return (
    <ul className="space-y-1 rounded-control border border-border bg-surface-2 px-3 py-2">
      <Requirement met={password.length >= PASSWORD_MIN}>
        At least {PASSWORD_MIN} characters
      </Requirement>
      <Requirement met={password.length > 0 && password === confirmation}>
        Both boxes match
      </Requirement>
    </ul>
  );
}

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span
        aria-hidden
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-pill border",
          met ? "border-success-soft-border bg-success-soft text-success-fg" : "border-border",
        )}
      >
        {met ? <Check className="size-2.5" /> : null}
      </span>
      <span className={met ? "text-success-fg" : "text-fg-faint"}>{children}</span>
      {/* The tick is decorative; this is what a screen reader reads. */}
      <span className="sr-only">{met ? " — met" : " — not met yet"}</span>
    </li>
  );
}
