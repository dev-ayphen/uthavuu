"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, Languages, Save, Users } from "lucide-react";
import { useEffect, useId, useMemo } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";

import {
  BackButton,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { TIMEZONE_LABEL } from "@/features/announcements/dates";
import { ApiError } from "@/lib/api-error";
import { runBroadcastAction } from "./api";
import { CODE_TO_FIELD, broadcastErrorMessage } from "./broadcast-errors";
import { BROADCASTS_INDEX, broadcastEditHref } from "./routes";
import {
  broadcastFormSchema,
  broadcastToFormValues,
  formValuesToPayload,
  isBroadcastFieldName,
  type BroadcastFormValues,
} from "./schema";
import type { AdminBroadcast } from "./types";

/**
 * Write or edit a broadcast. It does NOT send one — that is a separate act with
 * its own audit row and its own dialog (`send-broadcast-dialog.tsx`), because
 * an endpoint that could both compose and notify would make "who decided to
 * wake fifty thousand people" answerable only by diffing JSON.
 *
 * THE FOUR RULES THIS FILE EXISTS TO GET RIGHT
 * ───────────────────────────────────────────────────────────────────────────
 * 1. `defaultValues` COMES FROM A useMemo, NEVER FROM useEffect + reset.
 *    React Query refetches on window focus. An effect that reset the form when
 *    the fetched record changed would wipe a half-written flood warning the
 *    moment the operator alt-tabbed to check which schools were open. The
 *    record is fetched by the PARENT, which renders this only once it has one,
 *    so there is no "arrives later" case for an effect to paper over. The one
 *    `reset()` below runs after a successful SAVE, on the values just
 *    submitted, purely to clear the dirty flag. It never reads server state.
 *
 * 2. SERVER `validationErrors` LAND ON FIELDS. `ApiError.fieldErrors` already
 *    flattens the API's Zod envelope into `{ path, message }`; each is routed
 *    with `setError`, and anything unrecognised falls to the form-level banner
 *    rather than being dropped. A field error shown as a toast leaves an
 *    operator with a form they cannot see how to fix.
 *
 * 3. EVERY NULLABLE FIELD IS COALESCED TO "" on the way in and back to `null`
 *    on the way out (see `./schema.ts`). A `null` handed to a React input flips
 *    it to uncontrolled and silently drops what is typed.
 *
 * 4. SUBMIT IS DISABLED WHILE PENDING. Otherwise a double-click creates two
 *    drafts of the same emergency notice, and the second one is the copy
 *    somebody sends a week later.
 *
 * THE TWO THINGS THIS FORM SAYS OUT LOUD
 * ───────────────────────────────────────────────────────────────────────────
 * A district is matched as free text and a typo reaches nobody; and a schedule
 * does not fire on its own. Both are properties of the system as built, both
 * are invisible from the controls, and both fail silently — which is exactly
 * the class of thing a form has to name rather than imply.
 */

export function BroadcastForm({
  record,
  secondaryActions,
}: {
  /** `null` composes a new broadcast; a record edits that one. */
  record: AdminBroadcast | null;
  /** Rendered beside Save — the edit page passes send / cancel / delete here. */
  secondaryActions?: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const formId = useId();

  // Rule 1. Keyed off the record's identity by the caller, so switching records
  // remounts rather than mutating a form the operator may be typing into.
  const defaultValues = useMemo<BroadcastFormValues>(
    () => broadcastToFormValues(record),
    [record],
  );

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BroadcastFormValues>({
    resolver: zodResolver(broadcastFormSchema),
    defaultValues,
  });

  // `useWatch`, not `watch()`: it subscribes to these fields only, so typing in
  // the body does not re-render the whole form, and `watch()` returns a fresh
  // function React Compiler refuses to memoize around.
  const titleEn = useWatch({ control, name: "titleEn" });
  const bodyEn = useWatch({ control, name: "bodyEn" });
  const titleTa = useWatch({ control, name: "titleTa" });
  const bodyTa = useWatch({ control, name: "bodyTa" });
  const audience = useWatch({ control, name: "audience" });
  const scheduledAt = useWatch({ control, name: "scheduledAt" });

  const tamilTitleMissing = titleTa.trim() === "";
  const tamilBodyMissing = bodyTa.trim() === "";
  const halfTranslated = tamilTitleMissing !== tamilBodyMissing;
  const targeted = audience === "district";

  /**
   * The browser's own "leave site?" prompt, for the one navigation React cannot
   * intercept: a closed tab or a typed URL. Not a substitute for care — an
   * in-app `<Link>` still leaves without warning, which the App Router gives no
   * supported hook for — but losing a written emergency notice to a stray ⌘W is
   * the cheapest of these failures to prevent.
   */
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const onSubmit = async (values: BroadcastFormValues) => {
    // The resolver replaces per-field errors on every pass, but a `root` error
    // is set by hand and stays until it is cleared by hand. Without this, a
    // banner from a failed attempt sits above a form that has since saved.
    clearErrors("root");
    const payload = formValuesToPayload(values);

    try {
      if (record) {
        await runBroadcastAction<AdminBroadcast>({
          queryClient,
          path: `/admin/broadcasts/${encodeURIComponent(record.id)}`,
          method: "PATCH",
          body: payload,
          success: "Changes saved. Nothing has been sent.",
        });
        // Rule 1's one sanctioned reset: the values just submitted, not a
        // refetched record. Clears `isDirty` so the unsaved-changes flag and
        // its warning stop firing.
        reset(values);
        return;
      }

      const created = await runBroadcastAction<AdminBroadcast>({
        queryClient,
        path: "/admin/broadcasts",
        body: payload,
        // Said explicitly because the button is the last thing they pressed and
        // the next one is irreversible: creating is not sending.
        success: "Draft saved. Nothing has been sent yet.",
      });

      // Reset before navigating so the "Unsaved changes" flag does not sit there
      // during the transition, contradicting the toast that just said it saved.
      // `replace`, not `push` — the back button should return to the list, not
      // to a compose form that would make a second copy of the same notice.
      reset(values);
      router.replace(broadcastEditHref(created.id));
    } catch (error) {
      // Rule 2, part one: a hand-raised code that is really about ONE field.
      // `BROADCAST_AUDIENCE_MISMATCH` arrives as a bare `{ code, message }`
      // when the service raises it after merging this payload with the stored
      // row — work no DTO can do, so there is no `errors[]` array to read.
      if (error instanceof ApiError && error.code !== null && CODE_TO_FIELD[error.code]) {
        setError(CODE_TO_FIELD[error.code]!, {
          type: "server",
          message: broadcastErrorMessage(error),
        });
        return;
      }

      // Rule 2, part two: the API's Zod envelope, already flattened to
      // `{ path, message }` pairs by `ApiError`.
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        let matched = false;
        for (const fieldError of error.fieldErrors) {
          if (isBroadcastFieldName(fieldError.path)) {
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

      // Everything else — including the benign 409 `NO_EFFECTIVE_CHANGE` for a
      // Save with nothing changed, which `broadcastErrorMessage` rewords into
      // something that does not read as a fault.
      setError("root", {
        message:
          error instanceof ApiError && error.isNetworkFailure
            ? "The console couldn't reach the API, so nothing was saved. Check that it's running, then try again — your text is still here."
            : broadcastErrorMessage(error),
      });
    }
  };

  return (
    // A form may set its own measure — a readable line length is a property of
    // the form, not of the page. It must never set `mx-auto` or page padding:
    // the form owns WIDTH, the layout owns POSITION (PageLayout).
    <div className="max-w-(--container-wide) space-y-5">
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {errors.root?.message ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-card border border-danger-soft-border bg-danger-soft px-3.5 py-3 text-sm text-danger-fg"
          >
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{errors.root.message}</span>
          </p>
        ) : null}

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
                hint="The notification headline. It has to be readable on a locked phone at a glance."
                registration={register("titleEn")}
                placeholder="Heavy rain warning — move to higher ground"
              />
              <TextAreaField
                label="Body"
                rows={9}
                error={errors.bodyEn?.message}
                hint="What has happened, what people should do, and where to go for help. Plain text."
                registration={register("bodyEn")}
                placeholder="Relief centres are open at the schools listed in the app. Take medicines and ID if you can."
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
              <p className="rounded-control border border-info-soft-border bg-info-soft px-3 py-2 text-xs text-info-fg">
                Leave a field blank and Tamil readers get the English instead. The mobile app ships
                in English and Tamil, so anything blank here arrives on a Tamil-speaking
                citizen&apos;s phone in a language they may not read.
              </p>

              <TextField
                label="Title (Tamil)"
                lang="ta"
                error={errors.titleTa?.message}
                registration={register("titleTa")}
                placeholder="கனமழை எச்சரிக்கை"
                fallback={tamilTitleMissing ? <Fallback label="title" value={titleEn} /> : null}
              />
              <TextAreaField
                label="Body (Tamil)"
                lang="ta"
                rows={9}
                error={errors.bodyTa?.message}
                registration={register("bodyTa")}
                placeholder="பாதுகாப்பான இடத்திற்குச் செல்லுங்கள்."
                fallback={tamilBodyMissing ? <Fallback label="body" value={bodyEn} /> : null}
              />

              {/* A WARNING, NOT A VALIDATION ERROR. The API lets the two Tamil
                  fields be null independently, so refusing to save this would
                  block something it accepts — and this is an emergency product
                  where a warning has to be sendable before its translation
                  exists. It is still the worst of the three states, so it is
                  named rather than silently allowed. */}
              {halfTranslated ? (
                <p className="flex items-start gap-2 rounded-control border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-fg">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Only the {tamilTitleMissing ? "body" : "title"} is translated. A Tamil reader
                    gets a mix of Tamil and English in one notification. You can still save and send
                    it.
                  </span>
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <Users aria-hidden className="size-4 text-fg-faint" />
              Who this goes to
            </CardTitle>
            <span className="micro-label text-fg-faint">Decided before sending</span>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Audience"
              error={errors.audience?.message}
              hint="Only these two exist. Each one names a recipient query in the API; there is no third option to add here."
              registration={register("audience")}
            >
              <option value="all_users">Everyone in the network</option>
              <option value="district">A single district</option>
            </SelectField>

            {targeted ? (
              <TextField
                label="District"
                error={errors.district?.message}
                // The single most useful sentence on this page.
                hint="Matched exactly against the district each citizen's app reported. There is no district list to pick from, so a spelling that differs by one character reaches nobody — and the send still reports success."
                registration={register("district")}
                placeholder="Chennai"
                autoComplete="off"
                spellCheck={false}
              />
            ) : (
              <p className="self-end rounded-control border border-dashed border-border bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
                This reaches <span className="font-semibold text-fg-muted">every account</span> that
                can sign in. Suspended accounts are excluded — they cannot open the app to read it.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Clock aria-hidden className="size-4 text-fg-faint" />
              Schedule
            </CardTitle>
            <span className="micro-label text-fg-faint">Times in {TIMEZONE_LABEL}</span>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={`Planned send time (${TIMEZONE_LABEL})`}
              type="datetime-local"
              error={errors.scheduledAt?.message}
              hint="Setting a time marks this Scheduled; clearing it returns it to Draft. The API couples the two — there is no separate status to set."
              registration={register("scheduledAt")}
            />

            {/* ─── THE HONEST NOTICE ────────────────────────────────────────
                Nothing sweeps `scheduled_at`. There is no cron in the API
                (`@nestjs/schedule` is not a dependency) and no queue (BullMQ is
                not installed). "Scheduled" today means an admin wrote a time
                down; the send is still the button below.

                This has to be said on the control itself, in words, because the
                failure is silent and total: an operator who assumes a scheduled
                flood warning will fire gets no error, no toast and no
                notification — just a broadcast that quietly never went out. It
                is the same class of correction as the "no mobile screen reads
                announcements yet" notice in `features/announcements`, and it
                comes out the day a sweeper ships. ── */}
            <p className="flex items-start gap-2 self-end rounded-control border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-fg">
              <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong className="font-bold">A schedule does not send itself.</strong> Nothing in
                the system sweeps this time — it records an intention, and someone still has to press
                Send. Treat it as a note to the next person on shift, not as an alarm clock.
              </span>
            </p>

            {isPastSchedule(scheduledAt) ? (
              <p className="text-xs text-fg-subtle sm:col-span-2">
                That time has already passed. Nothing went out at it — see above — so either send
                this now or set a new time.
              </p>
            ) : null}
          </CardBody>
        </Card>

      </form>

      {/* ─── THE ACTION BAR SITS OUTSIDE THE <form>, DELIBERATELY ──────────
          Sticky so Save is reachable from anywhere in a long body, without
          duplicating it into the page header (two buttons doing one thing is
          one button too many). Degrades to a plain row on a short form.

          It is a SIBLING of the form rather than its last child because
          `secondaryActions` is `BroadcastActions`, which renders three
          `<dialog>`s — and each of those contains its own `<form>`. Nesting a
          form inside a form is invalid HTML, and in this React/Next build the
          consequence is not cosmetic: **the inner form's `onSubmit` never
          fires**, so the confirm button falls through to a native GET
          submission, the page reloads, and the action silently does not
          happen. Measured in a real browser here: from the LIST page (no
          surrounding form) the send dialog works and reports "Sent to N
          people"; from this DETAIL page, with the dialogs nested inside the
          form, the same click produced `?` on the URL, a full reload, and no
          request to the API at all.

          The submit button keeps working from out here via `form={formId}` —
          the same association the dialogs' own buttons use — and implicit
          submission (Enter in a text field) still works, because a submit
          button associated by `form=` is still the form's default button.

          `features/announcements` had the identical bug — `UpdateActions`
          passed into `UpdateForm` as `secondaryActions` rendered INSIDE its
          `<form>`, so Publish / Archive / Delete on the announcement DETAIL
          page reloaded instead of acting. It now uses this same structure. Any
          new form taking a `secondaryActions` slot should too.
          ── */}
      <div className="sticky bottom-0 -mb-2 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-canvas/90 py-3 backdrop-blur-md">
        {isDirty ? (
          <span className="mr-auto text-xs font-medium text-warning-fg">Unsaved changes</span>
        ) : null}

        {secondaryActions}

        <BackButton href={BROADCASTS_INDEX} label="Back to broadcasts" variant="outline" size="sm" />

        {/* Rule 4. */}
        <Button type="submit" form={formId} size="sm" disabled={isSubmitting}>
          <Save />
          {isSubmitting
            ? record
              ? "Saving…"
              : "Saving…"
            : record
              ? "Save changes"
              : "Save draft"}
        </Button>
      </div>
    </div>
  );
}

/**
 * A scheduled time in the past.
 *
 * Parsed with the browser's own `Date` on the raw `datetime-local` value rather
 * than through the IST helpers, because this comparison only needs to be right
 * to the minute and only ever produces a soft note — never a validation error,
 * and never anything the API is asked to agree with.
 */
function isPastSchedule(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

/** What a Tamil reader gets in place of a field left blank — quoted, not implied. */
function Fallback({ label, value }: { label: string; value: string }) {
  const trimmed = value.trim();

  return (
    <p className="rounded-control border border-dashed border-border bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
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
    </p>
  );
}

function truncate(value: string, max = 120): string {
  return value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`;
}

/** What `register("titleEn")` hands back, widened to any of this form's names. */
type Registration = UseFormRegisterReturn;

/**
 * `Field` + `Input`, wired to RHF and the shared error/hint slot.
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

function SelectField({
  label,
  error,
  hint,
  registration,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  registration: Registration;
  children: React.ReactNode;
}) {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <Select
        id={id}
        className="h-11 w-full text-sm"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...registration}
      >
        {children}
      </Select>
    </Field>
  );
}
