"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, Languages, Save } from "lucide-react";
import { useEffect, useId, useMemo } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";

import {
  Alert,
  BackButton,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Textarea,
} from "@/components/ui";
import { ApiError } from "@/lib/api-error";
import { runUpdateAction } from "./api";
import { CODE_TO_FIELD, updateErrorMessage } from "./update-errors";
import { TIMEZONE_LABEL } from "./dates";
import { ANNOUNCEMENTS_INDEX, announcementEditHref } from "./routes";
import {
  formValuesToPayload,
  isUpdateFieldName,
  updateFormSchema,
  updateToFormValues,
  type UpdateFormValues,
} from "./schema";
import type { AdminUpdate } from "./types";

/**
 * Write or edit an announcement — admin-authored, broadcast to citizens.
 *
 * THE FOUR RULES THIS FILE EXISTS TO GET RIGHT
 * ───────────────────────────────────────────────────────────────────────────
 * 1. `defaultValues` COMES FROM A useMemo, NEVER FROM useEffect + reset.
 *    React Query refetches on window focus. An effect that reset the form when
 *    the fetched record changed would wipe a half-written announcement the
 *    moment the operator alt-tabbed to check a fact and came back. The record
 *    is fetched by the PARENT, which renders this component only once it has
 *    one — so there is no "arrives later" case for an effect to paper over.
 *    The single `reset()` below runs after a successful SAVE, on the values
 *    just submitted, to clear the dirty flag. It never reads server state.
 *
 * 2. SERVER `validationErrors` LAND ON FIELDS. `ApiError.fieldErrors` already
 *    flattens the API's Zod envelope into `{ path, message }`; each one is
 *    routed to its field with `setError`, and anything unrecognised falls to the
 *    form-level banner rather than being dropped. A field error shown as a
 *    toast leaves an operator with a form they cannot see how to fix.
 *
 * 3. EVERY NULLABLE FIELD IS COALESCED TO "" on the way in (see
 *    `updateToFormValues`) and back to `null` on the way out. A `null` handed to
 *    a React input flips it to uncontrolled and silently drops what is typed.
 *
 * 4. SUBMIT IS DISABLED WHILE PENDING. Otherwise a double-click on "Create"
 *    publishes two announcements to every citizen in the network.
 *
 * THE TAMIL AFFORDANCE IS THE POINT OF THE LAYOUT
 * ───────────────────────────────────────────────────────────────────────────
 * English and Tamil sit side by side, and each blank Tamil field says, in
 * words, exactly what a Tamil-reading citizen will get instead — quoting the
 * English that will be substituted. Uthavu is a Tamil Nadu product whose mobile
 * app ships both languages; an operator who cannot see the fallback will assume
 * "optional" means "nobody misses anything", and ship English to an audience
 * that reads Tamil.
 */

export function UpdateForm({
  record,
  secondaryActions,
}: {
  /** `null` creates a new update; a record edits that one. */
  record: AdminUpdate | null;
  /** Rendered beside Save — the edit page passes publish / archive / delete here. */
  secondaryActions?: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const formId = useId();

  // Rule 1. Keyed off the record's identity, so switching records remounts
  // rather than mutating a form the operator may be typing into.
  const defaultValues = useMemo<UpdateFormValues>(() => updateToFormValues(record), [record]);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateFormValues>({
    resolver: zodResolver(updateFormSchema),
    defaultValues,
  });

  // `useWatch`, not `watch()`. Two reasons, and the second is the load-bearing
  // one: it subscribes to these four fields only, so typing in the body does not
  // re-render the whole form; and `watch()` returns a fresh function React
  // Compiler refuses to memoize around, which it reports as a skipped
  // compilation on this component.
  const titleEn = useWatch({ control, name: "titleEn" });
  const bodyEn = useWatch({ control, name: "bodyEn" });
  const titleTa = useWatch({ control, name: "titleTa" });
  const bodyTa = useWatch({ control, name: "bodyTa" });

  const tamilTitleMissing = titleTa.trim() === "";
  const tamilBodyMissing = bodyTa.trim() === "";
  const halfTranslated = tamilTitleMissing !== tamilBodyMissing;

  /**
   * The browser's own "leave site?" prompt, for the one navigation React cannot
   * intercept: a closed tab or a typed URL. It is not a substitute for care —
   * an in-app `<Link>` still leaves without warning, which the App Router gives
   * no supported hook for — but losing a written announcement to a stray ⌘W is
   * the cheapest of these failures to prevent.
   */
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const onSubmit = async (values: UpdateFormValues) => {
    // The resolver replaces per-field errors on every pass, but a `root` error
    // is set by hand and stays until it is cleared by hand. Without this, a
    // banner from a failed attempt sits above a form that has since saved.
    clearErrors("root");
    const payload = formValuesToPayload(values);

    try {
      if (record) {
        await runUpdateAction<AdminUpdate>({
          queryClient,
          path: `/admin/community-updates/${encodeURIComponent(record.id)}`,
          method: "PATCH",
          body: payload,
          success: "Changes saved.",
        });
        // Rule 1's one sanctioned reset: the values the operator just submitted,
        // not a refetched record. Clears `isDirty` so the unsaved-changes guard
        // and its warning stop firing.
        reset(values);
        return;
      }

      const created = await runUpdateAction<AdminUpdate>({
        queryClient,
        path: "/admin/community-updates",
        method: "POST",
        body: payload,
        success: "Announcement created.",
      });

      // Reset before navigating so the "Unsaved changes" flag does not sit there
      // during the transition, contradicting the toast that just said it saved.
      // `replace`, not `push` — the back button should return to the list, not
      // to a create form that would make a second copy of what was just written.
      reset(values);
      router.replace(announcementEditHref(created.id));
    } catch (error) {
      // Rule 2, part one: a hand-raised code that is really about ONE field.
      // `EXPIRES_BEFORE_PUBLISH` arrives as a bare `{ code, message }` because
      // the service raises it after merging this payload with the stored row —
      // work no DTO can do, so there is no `errors[]` array to read. Without
      // this branch a per-field problem would land in the form-level banner
      // with the operator left to work out which of the two dates to change.
      if (error instanceof ApiError && error.code !== null && CODE_TO_FIELD[error.code]) {
        setError(CODE_TO_FIELD[error.code]!, {
          type: "server",
          message: updateErrorMessage(error),
        });
        return;
      }

      // Rule 2, part two: the API's Zod envelope, already flattened to
      // `{ path, message }` pairs by `ApiError`.
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        let matched = false;
        for (const fieldError of error.fieldErrors) {
          if (isUpdateFieldName(fieldError.path)) {
            setError(fieldError.path, { type: "server", message: fieldError.message });
            matched = true;
          }
        }
        if (matched) return;
        // Field errors that name nothing this form renders would otherwise
        // vanish, leaving a submit that silently did nothing.
        setError("root", {
          message: error.fieldErrors.map((fieldError) => fieldError.message).join(" "),
        });
        return;
      }

      // Everything else — including the benign 409s (`NO_EFFECTIVE_CHANGE`
      // for a Save with nothing changed) that `updateErrorMessage` rewords into
      // something that does not read as a fault.
      setError("root", {
        message:
          error instanceof ApiError && error.isNetworkFailure
            ? "The console couldn't reach the API, so nothing was saved. Check that it's running, then try again — your text is still here."
            : updateErrorMessage(error),
      });
    }
  };

  return (
    // A form may set its own measure — a readable line length is a property of
    // the form, not of the page. It must never set `mx-auto` or page padding:
    // the form owns WIDTH, the layout owns POSITION (see PageLayout).
    <div className="max-w-(--container-wide) space-y-5">
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {errors.root?.message ? <Alert size="md">{errors.root.message}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>English</CardTitle>
            <span className="micro-label text-fg-faint">Required</span>
          </CardHeader>
          <CardBody className="space-y-4">
            <TextField
              label="Title"
              error={errors.titleEn?.message}
              hint="What a citizen sees in the feed. Keep it short enough to read at a glance."
              registration={register("titleEn")}
              placeholder="Heavy rain warning for Chennai district"
            />
            <TextAreaField
              label="Body"
              rows={10}
              error={errors.bodyEn?.message}
              hint="The full announcement. Plain text — the mobile app renders it as written."
              registration={register("bodyEn")}
              placeholder="What has happened, what people should do, and where to go for help."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Languages aria-hidden className="size-4 text-fg-faint" />
              <span lang="ta">தமிழ்</span>
              <span className="text-fg-faint">/ Tamil</span>
            </CardTitle>
            <span className="micro-label text-fg-faint">Optional</span>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Said once at the top, then again per field with the actual text.
                The rule is simple enough to state in a sentence, and an operator
                who never reads it still cannot miss the per-field version. */}
            <Alert tone="info" icon={null}>
              Leave a field blank and Tamil readers see the English instead. The mobile app ships
              in English and Tamil, so anything left blank here reaches a Tamil-speaking citizen
              in a language they may not read.
            </Alert>

            <TextField
              label="Title (Tamil)"
              lang="ta"
              error={errors.titleTa?.message}
              registration={register("titleTa")}
              placeholder="சென்னை மாவட்டத்தில் கனமழை எச்சரிக்கை"
              fallback={tamilTitleMissing ? <Fallback label="title" value={titleEn} /> : null}
            />
            <TextAreaField
              label="Body (Tamil)"
              lang="ta"
              rows={10}
              error={errors.bodyTa?.message}
              registration={register("bodyTa")}
              placeholder="என்ன நடந்தது, மக்கள் என்ன செய்ய வேண்டும், உதவிக்கு எங்கு செல்ல வேண்டும்."
              fallback={tamilBodyMissing ? <Fallback label="body" value={bodyEn} /> : null}
            />

            {/* A WARNING, NOT A VALIDATION ERROR. The frozen contract lets the
                two Tamil fields be null independently, so refusing to save this
                would block something the API accepts. It is still the worst of
                the three states — a Tamil headline over an English body reads as
                a broken app rather than as a missing translation — so it is
                named rather than silently allowed. */}
            {halfTranslated ? (
              <Alert tone="warning" icon={AlertTriangle}>
                Only the {tamilTitleMissing ? "body" : "title"} is translated. A Tamil reader will
                get a mix of Tamil and English in one announcement. You can still save it.
              </Alert>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Publish window</CardTitle>
          <span className="micro-label text-fg-faint">Times in {TIMEZONE_LABEL}</span>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={`Starts showing (${TIMEZONE_LABEL})`}
            type="datetime-local"
            error={errors.publishAt?.message}
            hint="Leave blank and it goes live the moment it's published. Set a future time to schedule it — publishing keeps the date rather than overwriting it."
            registration={register("publishAt")}
          />
          <TextField
            label={`Stops showing (${TIMEZONE_LABEL})`}
            type="datetime-local"
            error={errors.expiresAt?.message}
            hint="Leave blank and it never stops showing."
            registration={register("expiresAt")}
          />
        </CardBody>
      </Card>
      </form>

      {/* Sticky so the save button is reachable from anywhere in a long body,
          without duplicating it into the page header (two buttons that do the
          same thing is one button too many). Degrades to a plain row when the
          form is shorter than the viewport.

          It is a SIBLING of the form rather than its last child, and that is
          load-bearing. `secondaryActions` is `UpdateActions`, which renders
          `<dialog>`s that each contain their own `<form>`. A form nested inside
          a form is invalid HTML, and in this React/Next build the consequence
          is not cosmetic: the inner form's `onSubmit` never fires, so the
          confirm button falls through to a native GET submission, the page
          reloads, and the action silently does not happen. That is exactly what
          Publish / Archive / Delete did on this detail page — they worked from
          the LIST page, where no surrounding form exists, which is why it went
          unnoticed.

          The submit button still works from out here via `form={formId}` — the
          same association the dialogs' own buttons use — and implicit
          submission (Enter in a text field) still works, because a submit
          button associated by `form=` is still the form's default button. */}
      <div className="sticky bottom-0 -mb-2 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-canvas/90 py-3 backdrop-blur-md">
        {isDirty ? (
          <span className="mr-auto text-xs font-medium text-warning-fg">Unsaved changes</span>
        ) : null}

        {secondaryActions}

        <BackButton href={ANNOUNCEMENTS_INDEX} label="Back to announcements" variant="outline" size="sm" />

        {/* Rule 4. */}
        <Button type="submit" form={formId} size="sm" disabled={isSubmitting}>
          <Save />
          {isSubmitting
            ? record
              ? "Saving…"
              : "Creating…"
            : record
              ? "Save changes"
              : "Create announcement"}
        </Button>
      </div>
    </div>
  );
}

/** What a Tamil reader gets in place of a field left blank — quoted, not implied. */
function Fallback({ label, value }: { label: string; value: string }) {
  const trimmed = value.trim();

  return (
    <Alert tone="neutral" dashed icon={null}>
      <span className="font-semibold text-fg-muted">Blank.</span> Tamil readers will see the
      English {label}
      {trimmed ? (
        <>
          :{" "}
          <span className="text-fg" lang="en">
            &ldquo;{truncate(trimmed)}&rdquo;
          </span>
        </>
      ) : (
        <> — which is also empty. Write the English {label} first.</>
      )}
    </Alert>
  );
}

function truncate(value: string, max = 120): string {
  return value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`;
}

/** What `register("titleEn")` hands back, widened to any of this form's names. */
type Registration = UseFormRegisterReturn;

/**
 * `Field` + `Input`, wired to RHF and to the shared error/hint slot.
 *
 * `useId` per field rather than a hand-written string: two of these render the
 * same logical field in two languages, and a duplicated `id` would silently
 * point both labels at one input.
 */
function TextField({
  label,
  error,
  hint,
  registration,
  fallback,
  ...inputProps
}: {
  label: string;
  error?: string;
  hint?: string;
  registration: Registration;
  /** Rendered under the control — the Tamil fallback notice. */
  fallback?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id">) {
  const id = useId();

  return (
    <div className="space-y-2">
      <Field label={label} htmlFor={id} error={error} hint={hint}>
        <Input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...inputProps}
          {...registration}
        />
      </Field>
      {fallback}
    </div>
  );
}

function TextAreaField({
  label,
  error,
  hint,
  registration,
  fallback,
  ...textareaProps
}: {
  label: string;
  error?: string;
  hint?: string;
  registration: Registration;
  fallback?: React.ReactNode;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  const id = useId();

  return (
    <div className="space-y-2">
      <Field label={label} htmlFor={id} error={error} hint={hint}>
        <Textarea
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...textareaProps}
          {...registration}
        />
      </Field>
      {fallback}
    </div>
  );
}
