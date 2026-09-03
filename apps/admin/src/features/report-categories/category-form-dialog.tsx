"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";

import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  LockedField,
} from "@/components/ui";
import { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { runCategoryAction } from "./api";
import { CODE_TO_FIELD, categoryErrorMessage } from "./category-errors";
import {
  EXPIRY_MAX,
  categoryFormSchema,
  categoryToFormValues,
  formValuesToCreatePayload,
  formValuesToUpdatePayload,
  isCategoryFieldName,
  type CategoryFormValues,
} from "./schema";
import { formatExpiry } from "./use-report-categories";
import type { ReportCategoryRow } from "./types";

/**
 * Create or edit a report category.
 *
 * WHY A DIALOG RATHER THAN A /new AND /[id] PAGE
 * ───────────────────────────────────────────────────────────────────────────
 * Announcements is the console's other full-CRUD section and it uses full
 * pages — but read WHY it does: "there are six fields, two of them long-form
 * bodies in different scripts, and the whole point of the layout is showing
 * English and Tamil side by side. A modal narrow enough to sit over a table
 * cannot do that."
 *
 * None of that applies here. This is five short fields with no nested sections,
 * which `references/page-templates.md` §5 puts squarely in the dialog column
 * ("≤ ~8 fields… the user keeps their place in the list"). And keeping their
 * place matters more than usual on this table: it is nine rows of master data
 * an operator reads AS A SET, comparing one category's expiry against its
 * neighbours'. Navigating away to change a label and coming back is a worse
 * version of the same job. Following the reasoning is what matching the idiom
 * means; copying the shape past the point the reasoning holds is not.
 *
 * THE FOUR FORM RULES THIS FILE EXISTS TO GET RIGHT
 * ───────────────────────────────────────────────────────────────────────────
 * 1. `defaultValues` COMES FROM A useMemo, NEVER FROM useEffect + reset.
 *    React Query refetches on window focus, and this dialog sits over a table
 *    that refetches with it. An effect that reset the form when the fetched row
 *    changed would wipe a half-typed label the moment the operator alt-tabbed
 *    to check something. There is no "arrives later" case for an effect to
 *    paper over either: `<Dialog>` unmounts its children while closed, so this
 *    component is constructed fresh, with the record already in hand, on every
 *    open. That is also why nothing here is reset on close.
 *
 * 2. SERVER `validationErrors` LAND ON FIELDS. `ApiError.fieldErrors` already
 *    flattens the API's Zod envelope into `{ path, message }`; each one is
 *    routed to its field with `setError`, and anything unrecognised falls to
 *    the form-level banner rather than being dropped. A field error shown as a
 *    toast leaves an operator with a form they cannot see how to fix.
 *
 * 3. NOTHING NULLABLE REACHES AN INPUT. `categoryToFormValues` coalesces, so a
 *    `null` can never flip a controlled input to uncontrolled and start
 *    silently dropping what is typed.
 *
 * 4. SUBMIT IS DISABLED WHILE PENDING. Otherwise a double-click on Create makes
 *    two categories — and the second one's key collides, so the operator gets a
 *    confusing 409 for something they only meant to do once.
 */
export function CategoryFormDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` creates a new category; a record edits that one. */
  record: ReportCategoryRow | null;
}) {
  // Lives out here because `<Dialog>` needs it to refuse Escape and backdrop
  // clicks: an operator must not be able to dismiss a request they have already
  // sent and be left unsure whether it landed.
  const [pending, setPending] = useState(false);

  const close = () => {
    if (pending) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onClose={close} dismissible={!pending}>
      <CategoryFormBody
        record={record}
        pending={pending}
        onPendingChange={setPending}
        onRequestClose={close}
        onSaved={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

function CategoryFormBody({
  record,
  pending,
  onPendingChange,
  onRequestClose,
  onSaved,
}: {
  record: ReportCategoryRow | null;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const formId = useId();
  const editing = record !== null;

  // Rule 1.
  const defaultValues = useMemo<CategoryFormValues>(
    () => categoryToFormValues(record),
    [record],
  );

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues,
  });

  // `useWatch`, not `watch()`: it subscribes to these three fields only, and
  // `watch()` returns a fresh function React Compiler refuses to memoize
  // around, which it reports as a skipped compilation on the component.
  const emoji = useWatch({ control, name: "emoji" });
  const label = useWatch({ control, name: "label" });
  const minutes = useWatch({ control, name: "defaultExpiryMinutes" });

  const onSubmit = handleSubmit(async (values) => {
    // The resolver replaces per-field errors on every pass, but a `root` error
    // is set by hand and stays until it is cleared by hand. Without this, a
    // banner from a failed attempt sits above a form that has since saved.
    clearErrors("root");
    onPendingChange(true);

    try {
      if (record) {
        await runCategoryAction<ReportCategoryRow>({
          queryClient,
          path: `/admin/report-categories/${encodeURIComponent(record.id)}`,
          method: "PATCH",
          body: formValuesToUpdatePayload(values),
          success: "Category updated.",
        });
      } else {
        await runCategoryAction<ReportCategoryRow>({
          queryClient,
          path: "/admin/report-categories",
          method: "POST",
          body: formValuesToCreatePayload(values),
          success: "Category created.",
        });
      }
      onSaved();
    } catch (error) {
      // Rule 2, part one: a hand-raised code that is really about ONE field.
      // `CATEGORY_KEY_TAKEN` arrives as a bare `{ code, message }` because the
      // service checks for the collision itself before the insert, so there is
      // no `errors[]` array to read. Without this branch a problem with the key
      // would land in the form-level banner and leave the operator guessing
      // which of five fields to change.
      if (error instanceof ApiError && error.code !== null && CODE_TO_FIELD[error.code]) {
        setError(CODE_TO_FIELD[error.code]!, {
          type: "server",
          message: categoryErrorMessage(error),
        });
        return;
      }

      // Rule 2, part two: the API's Zod envelope, already flattened to
      // `{ path, message }` pairs by `ApiError`. Verified live — a bad POST
      // returns one entry per field, pathed exactly to these field names.
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        let matched = false;
        for (const fieldError of error.fieldErrors) {
          if (isCategoryFieldName(fieldError.path)) {
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

      // Everything else — including the benign `NO_EFFECTIVE_CHANGE` that
      // `categoryErrorMessage` rewords so a Save with nothing changed does not
      // read as a fault.
      setError("root", { message: categoryErrorMessage(error) });
    } finally {
      onPendingChange(false);
    }
  });

  const expiryPreview = /^\d+$/.test(minutes.trim()) ? formatExpiry(Number(minutes)) : null;

  return (
    <>
      <DialogHeader
        title={editing ? "Edit category" : "New category"}
        titleId={titleId}
        description={
          editing
            ? "Saved changes reach the mobile app immediately — the API reads these values on every report, with no deploy."
            : "A new kind of request citizens can post. It reaches the mobile app as soon as it is created."
        }
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
          {errors.root?.message ? <Alert>{errors.root.message}</Alert> : null}

          {editing ? (
            // The key is immutable, and the honest way to show that is the real
            // value with the real reason — not a disabled input, which implies
            // it could be enabled, and not hiding it, which leaves an operator
            // wondering where the identifier went.
            <ReadOnlyKey value={record.key} />
          ) : (
            <TextField
              label="Key"
              error={errors.key?.message}
              hint="lowerCamelCase, e.g. animalRescue. This is how the mobile app addresses the category — it can never be changed afterwards, so get it right now."
              registration={register("key")}
              placeholder="animalRescue"
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <TextField
              label="Label"
              error={errors.label?.message}
              hint="The name a citizen reads on the category chip."
              registration={register("label")}
              placeholder="Animal Rescue"
              disabled={pending}
            />
            <TextField
              label="Emoji"
              error={errors.emoji?.message}
              registration={register("emoji")}
              placeholder="🐶"
              autoComplete="off"
              className="text-center text-base"
              disabled={pending}
            />
          </div>

          {/* What the operator is actually shipping, drawn the way the app draws
              it. Two short fields whose combined effect is invisible until you
              see them together — a label that reads fine beside the wrong emoji
              is the mistake this catches before it reaches a citizen. */}
          <ChipPreview emoji={emoji} label={label} />

          <TextField
            label="Stays live for (minutes)"
            error={errors.defaultExpiryMinutes?.message}
            hint={
              expiryPreview
                ? `That is ${expiryPreview}. A reporter may shorten this on their own request, but never extend it.`
                : `Whole minutes, 1 to ${EXPIRY_MAX} (30 days). The seeded categories run from 4 hours to 3 days.`
            }
            registration={register("defaultExpiryMinutes")}
            // NOT `type="number"`: on a focused number input the scroll wheel
            // silently changes the value, and here that would quietly re-time
            // when every future request in this category expires.
            inputMode="numeric"
            autoComplete="off"
            placeholder="360"
            disabled={pending}
          />

          <CitizenSelectableField
            registration={register("citizenSelectable")}
            error={errors.citizenSelectable?.message}
            disabled={pending}
          />

          {editing ? <SeedOverwriteNote /> : null}
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
            {pending
              ? editing
                ? "Saving…"
                : "Creating…"
              : editing
                ? "Save changes"
                : "Create category"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/** The immutable key, shown with the reason it cannot be edited. */
function ReadOnlyKey({ value }: { value: string }) {
  return (
    <LockedField
      label="Key"
      reason={
        <>
          Fixed for the life of the category. The mobile app posts reports against this key, the
          API&rsquo;s seed matches on it, and the citizen category list is ordered by it — renaming
          it would orphan every client still sending the old one. A category whose key is wrong has
          to be replaced, not renamed.
        </>
      }
    >
      <code className="truncate font-mono text-xs text-fg">{value}</code>
    </LockedField>
  );
}

/** How the pair will look in the app's category picker. */
function ChipPreview({ emoji, label }: { emoji: string; label: string }) {
  const trimmedEmoji = emoji.trim();
  const trimmedLabel = label.trim();
  const empty = !trimmedEmoji && !trimmedLabel;

  return (
    <div className="space-y-1.5">
      <span className="micro-label block text-fg-muted">Preview</span>
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-pill border border-border bg-surface-2 px-3 py-1.5",
          empty && "text-fg-faint",
        )}
      >
        {trimmedEmoji ? (
          <span className="text-base leading-none" role="img" aria-label="Category emoji">
            {trimmedEmoji}
          </span>
        ) : null}
        <span className="truncate text-xs font-semibold text-fg">
          {trimmedLabel || (trimmedEmoji ? "Untitled category" : "Nothing to preview yet")}
        </span>
      </span>
    </div>
  );
}

/**
 * The one control on this form that decides whether citizens ever see the
 * category at all, so it gets prose rather than a bare "Citizen selectable".
 */
function CitizenSelectableField({
  registration,
  error,
  disabled,
}: {
  registration: UseFormRegisterReturn;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-2.5 rounded-control border border-border px-3 py-2.5 transition-colors hover:bg-surface-2"
      >
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 accent-[var(--primary)]"
          {...registration}
        />
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-fg">Citizens can post to it</span>
          <span className="block text-[11px] text-fg-faint">
            Unticked, the category is admin-only: it disappears from the mobile app&rsquo;s picker
            and no citizen can file a request under it. Existing reports keep working — this is
            how a category is retired without losing its history, and it is the seeded state of
            Disaster Relief.
          </span>
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A hazard the API documents in its own service and cannot warn about at
 * request time, because nothing goes wrong until someone runs an unrelated
 * command later.
 *
 * `pnpm db:seed` upserts categories ON CONFLICT (key) and its `set` clause
 * overwrites label, emoji, defaultExpiryMinutes and citizenSelectable — so an
 * edit to one of the nine SEEDED categories is silently reverted the next time
 * a developer seeds. Whether seeding should become insert-only once an admin UI
 * exists is unresolved product question #7; this console does not get to decide
 * it. What it can do is stop the reversion being discovered by watching a
 * change disappear.
 *
 * It deliberately does NOT name which categories are seeded. The console has no
 * endpoint that knows, so the only way to say it would be a hardcoded copy of
 * `db/seed.ts`'s nine keys — a duplicate that drifts silently, which is exactly
 * the failure mode already flagged on the support filters. Stating the rule
 * without claiming to know which rows it hits is the honest version.
 */
function SeedOverwriteNote() {
  return (
    <Alert tone="warning" icon={AlertTriangle} className="text-[11px]">
      If this category also exists in the API&rsquo;s seed data, running{" "}
      <code className="font-mono">pnpm db:seed</code> will overwrite these four values with the
      seeded ones. Categories created here are never touched by it.
    </Alert>
  );
}

/**
 * `Field` + `Input`, wired to RHF.
 *
 * `useId` per field rather than a hand-written string, so two of these can
 * never collide and point both labels at one input.
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

export type { ReactNode };
