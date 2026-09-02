"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";

import { Button, Field, Input, Select } from "@/components/ui";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/features/moderation/dialog";
import { ApiError } from "@/lib/api-error";
import type { AdminRoleRef } from "@/lib/roles";
import { CODE_TO_FIELD, adminAccountErrorMessage } from "./admin-errors";
import { runAdminAccountAction } from "./api";
import {
  adminEditSchema,
  adminToEditValues,
  formValuesToUpdatePayload,
  humanizeRoleKey,
  isAdminEditField,
  type AdminEditValues,
} from "./schema";
import type { AdminAccountDetail } from "./types";

/**
 * Edit an admin's identity: name, email, role.
 *
 * ⛔ THERE IS NO PASSWORD FIELD HERE, AND THERE NEVER WILL BE
 * ───────────────────────────────────────────────────────────────────────────
 * Editing an identity and changing a credential are separate actions with
 * different risk, different permissions and different endpoints. This form
 * PATCHes `/admin/admins/:id`; a password goes to `/reset-password` or
 * `/admin/me/change-password`, each behind its own dialog in
 * `./password-dialogs.tsx`. Merging them behind one "Save changes" is how a
 * routine spelling correction becomes an unannounced credential rotation that
 * locks a colleague out with nobody having meant to.
 *
 * The rule is enforced structurally, not by remembering it: `adminEditSchema`
 * has exactly three fields and `formValuesToUpdatePayload` builds the body from
 * those three names, so a password cannot reach this endpoint even if someone
 * later adds an input to the JSX below.
 *
 * THIS DIALOG NEVER EDITS YOUR OWN ACCOUNT
 * ───────────────────────────────────────────────────────────────────────────
 * `AdminAccountsService.update()` opens with `assertNotSelf(...)` and answers
 * 403 `CANNOT_MODIFY_SELF` — there is no self-edit path on this endpoint and no
 * `PATCH /admin/me` beside it. So `admin-actions.tsx` renders "Edit profile" on
 * your own row DISABLED, with the reason, rather than opening a form whose
 * every submit is already refused. There is consequently no `isSelf` prop here:
 * a branch that can never be taken is a branch that will eventually be wrong.
 *
 * WHY A DIALOG RATHER THAN AN /edit PAGE
 * ───────────────────────────────────────────────────────────────────────────
 * Three short fields, no nested sections — squarely in `page-templates.md`'s
 * dialog column, and the same call `features/report-categories` made for the
 * same reasons. It also means ONE implementation serves both entry points: the
 * row's `⋮` menu and the detail page's button bar. Announcements uses full
 * pages, and its own file says why — six fields, two long-form bodies in two
 * scripts, side by side. None of that applies to a name and an email.
 *
 * THE FOUR FORM RULES
 * ───────────────────────────────────────────────────────────────────────────
 * 1. `defaultValues` COMES FROM A useMemo, NEVER FROM useEffect + reset. React
 *    Query refetches on window focus and this dialog sits over a list that
 *    refetches with it; an effect that reset the form when the fetched record
 *    changed would wipe a half-typed email the moment the operator alt-tabbed.
 *    There is no "arrives later" case either: `<Dialog>` unmounts its children
 *    while closed, so this body is constructed fresh, record in hand, on every
 *    open — which is also why nothing here is reset on close.
 * 2. SERVER `validationErrors` LAND ON FIELDS, via `setError`. A field error in
 *    a toast leaves an operator with a form they cannot see how to fix. The
 *    likeliest one here is a duplicate email, which is entirely about one field.
 * 3. NOTHING NULLABLE REACHES AN INPUT (`adminToEditValues` coalesces), so a
 *    `null` can never flip a controlled input to uncontrolled and start
 *    silently dropping what is typed.
 * 4. SUBMIT IS DISABLED WHILE PENDING, or a double-click sends two PATCHes.
 */
export function EditAdminDialog({
  open,
  onOpenChange,
  admin,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admin: AdminAccountDetail;
  /** Built by `roleOptions()` — the API's own labels, never a local map. */
  roles: readonly AdminRoleRef[];
}) {
  const [pending, setPending] = useState(false);

  const close = () => {
    // An operator must not be able to dismiss a request already in flight and
    // be left unsure whether it landed.
    if (pending) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onClose={close} dismissible={!pending}>
      <EditAdminBody
        admin={admin}
        roles={roles}
        pending={pending}
        onPendingChange={setPending}
        onRequestClose={close}
        onSaved={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

function EditAdminBody({
  admin,
  roles,
  pending,
  onPendingChange,
  onRequestClose,
  onSaved,
}: {
  admin: AdminAccountDetail;
  roles: readonly AdminRoleRef[];
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const formId = useId();
  const roleId = useId();

  /**
   * The server refuses to move the last super admin out of the role, because
   * doing so would leave the console with nobody able to manage it. Mirrored
   * here as a LOCKED FIELD rather than a hidden one: the role is the most
   * important fact on this form, and removing it would leave an operator
   * wondering where it went.
   */
  const roleLocked = admin.isLastSuperAdmin === true;

  // Rule 1.
  const defaultValues = useMemo<AdminEditValues>(() => adminToEditValues(admin), [admin]);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<AdminEditValues>({
    resolver: zodResolver(adminEditSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit(async (values) => {
    // The resolver replaces per-field errors on every pass, but a `root` error
    // is set by hand and stays until it is cleared by hand — otherwise a banner
    // from a failed attempt sits above a form that has since saved.
    clearErrors("root");
    onPendingChange(true);

    try {
      await runAdminAccountAction<AdminAccountDetail>({
        queryClient,
        path: `/admin/admins/${encodeURIComponent(admin.userId)}`,
        method: "PATCH",
        // Rule: three fields in, three fields out. `role` is the key the locked
        // branch never gave the operator a chance to change, so a locked form
        // submits the value it was opened with.
        body: formValuesToUpdatePayload(values),
        success: `${values.name.trim()} has been updated.`,
      });
      onSaved();
    } catch (error) {
      // Rule 2, part one: a hand-raised code that is really about ONE field.
      // `ADMIN_EMAIL_TAKEN` arrives as a bare `{ code, message }` because the
      // service checks for the collision itself before the update, so there is
      // no `errors[]` array to read. Without this branch a problem with the
      // email would land in the form-level banner with the operator left to
      // guess which of three fields to change.
      const field = error instanceof ApiError && error.code ? CODE_TO_FIELD[error.code] : undefined;
      if (field && isAdminEditField(field)) {
        setError(field, { type: "server", message: adminAccountErrorMessage(error) });
        return;
      }

      // Rule 2, part two: the API's Zod envelope, already flattened to
      // `{ path, message }` pairs by `ApiError`. The DTO's field names are
      // `name`, `email` and `roleKey` — which is exactly what this form calls
      // them, so every entry lands.
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        let matched = false;
        for (const fieldError of error.fieldErrors) {
          if (isAdminEditField(fieldError.path)) {
            setError(fieldError.path, { type: "server", message: fieldError.message });
            matched = true;
          }
        }
        if (matched) return;
        // Field errors naming nothing this form renders would otherwise vanish,
        // leaving a submit that silently did nothing.
        setError("root", {
          message: error.fieldErrors.map((fieldError) => fieldError.message).join(" "),
        });
        return;
      }

      setError("root", { message: adminAccountErrorMessage(error) });
    } finally {
      onPendingChange(false);
    }
  });

  return (
    <>
      <DialogHeader
        title={`Edit ${admin.name}`}
        titleId={titleId}
        description="Their name and email as they appear across the console and the audit log. Passwords are changed separately."
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
          {errors.root?.message ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-control border border-danger-soft-border bg-danger-soft px-3 py-2 text-xs text-danger-fg"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>{errors.root.message}</span>
            </p>
          ) : null}

          <TextField
            label="Full name"
            error={errors.name?.message}
            hint="What appears beside every moderation action this person takes."
            registration={register("name")}
            autoComplete="off"
            disabled={pending}
          />

          <TextField
            label="Email"
            error={errors.email?.message}
            hint="Also the sign-in identifier for the console."
            registration={register("email")}
            type="email"
            // `off`, not `email`: the browser would helpfully offer the
            // OPERATOR'S own address while they are editing a colleague's row.
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />

          {roleLocked ? (
            <LockedRole role={admin.role} />
          ) : (
            <Field
              label="Role"
              htmlFor={roleId}
              error={errors.roleKey?.message}
              hint="What this person may do in the console. The API is what enforces it; this only changes what it grants them."
            >
              <Select
                id={roleId}
                // Matches `Input`'s height and the console's other form select
                // (`features/sponsors/sponsor-form.tsx`); the component's own
                // default is sized for a filter bar, not a form.
                className="h-11 w-full text-sm"
                aria-invalid={Boolean(errors.roleKey)}
                aria-describedby={errors.roleKey ? `${roleId}-error` : undefined}
                disabled={pending}
                {...register("roleKey")}
              >
                {roles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label || humanizeRoleKey(role.key)}
                  </option>
                ))}
              </Select>
            </Field>
          )}

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
          {/* Rule 4. */}
          <Button type="submit" form={formId} size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/**
 * The role of the last super admin, shown with the reason it cannot move.
 *
 * Read-only TEXT rather than a disabled `<select>`, for two reasons. It is what
 * `features/report-categories` already does for its immutable key, so the
 * console has one way of saying "this cannot change". And a disabled select is
 * ambiguous — it reads as "temporarily unavailable", where this is a rule that
 * holds until somebody else is promoted.
 *
 * It also removes a real hazard: React Hook Form treats a field registered with
 * `disabled` as having no value, so a disabled role select could submit
 * `undefined` and blank the role on a PATCH. Not rendering the control at all
 * means the form submits the value it was opened with, which is the value the
 * server already has.
 */
function LockedRole({ role }: { role: AdminRoleRef | undefined }) {
  return (
    <div className="space-y-1.5">
      <span className="micro-label block text-fg-muted">Role</span>
      <p className="flex items-center gap-2 rounded-control border border-dashed border-border bg-surface-2 px-3 py-2.5">
        <Lock aria-hidden className="size-3.5 shrink-0 text-fg-faint" />
        <span className="truncate text-xs font-semibold text-fg">
          {role?.label || humanizeRoleKey(role?.key ?? "")}
        </span>
      </p>
      <p className="text-xs text-fg-faint">
        This is the last super admin. Moving them to another role would leave the console with
        nobody who can manage admin accounts, restore a role, or unlock a suspension — so the API
        refuses it, and so does this form. Promote someone else to Super Admin first, and this
        field unlocks by itself.
      </p>
    </div>
  );
}

/**
 * `Field` + `Input`, wired to RHF. `useId` per field rather than a hand-written
 * string, so two of these can never collide and point both labels at one input.
 */
function TextField({
  label,
  error,
  hint,
  registration,
  ...inputProps
}: {
  label: string;
  error?: string;
  hint?: string;
  registration: UseFormRegisterReturn;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id">) {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
        {...registration}
      />
    </Field>
  );
}
