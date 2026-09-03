"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, Save } from "lucide-react";
import { useEffect, useId, useMemo } from "react";
import {
  useController,
  useForm,
  useWatch,
  type Control,
  type UseFormRegisterReturn,
} from "react-hook-form";

import {
  BackButton,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { ApiError } from "@/lib/api-error";

import { runSponsorAction } from "./api";
import { creativeTypeHint, creativeTypeOptions, creativeUrlApplies } from "./creative";
import { TIMEZONE_LABEL } from "./dates";
import { PLACEMENTS, placementDelivery, placementLabel } from "./placements";
import { SPONSORS_INDEX, sponsorEditHref } from "./routes";
import {
  creativeUrlMissing,
  formValuesToPayload,
  isSponsorFieldName,
  sponsorFormSchema,
  sponsorToFormValues,
  type SponsorFormValues,
} from "./schema";
import { CODE_TO_FIELD, sponsorErrorMessage } from "./sponsor-errors";
import { Textarea } from "./textarea";
import type { AdminSponsor } from "./types";

/**
 * Create or edit a sponsor.
 *
 * ONE GROUPED FORM, NOT THE PROTOTYPE'S SIX-STEP WIZARD — AND WHY
 * ───────────────────────────────────────────────────────────────────────────
 * `docs/webadmin/08-monetization.md` §3.4 describes a six-step wizard, and §6
 * praises how well it was built. It is still the wrong shape for this feature,
 * for four reasons that all survive the wizard being well made:
 *
 *  1. THE STEP IT EXISTED FOR WAS THE FAKE ONE. Step 2 hosted the video upload
 *     — the simulated progress bar of §5 gap #3. Remove the thing that isn't
 *     real and the remaining twelve fields spread across six screens average
 *     two fields a screen, which is a slideshow, not a flow.
 *  2. THE EDIT PATH WAS ALREADY A SINGLE FORM (§3.5, the edit modal). So the
 *     wizard was create-only, and the product carried two different editors for
 *     one record — the classic source of "why can I set this here but not
 *     there?".
 *  3. NOTHING PERSISTS PER STEP. The frozen contract has one POST and one
 *     PATCH. Steps that cannot save are pagination pretending to be progress,
 *     and they hide validation until the operator walks forward into it.
 *  4. THE WHOLE CAMPAIGN SHOULD BE VISIBLE BEFORE IT RUNS. This publishes an
 *     advertisement to every citizen in the network. Seeing creative,
 *     placements and dates on one screen is what makes "is this right?"
 *     answerable; six screens makes it a memory test.
 *
 * So: one form, four grouped cards, in the order the wizard's own steps implied
 * — Sponsor, Creative, Placement, Schedule. An operator who knows the wizard
 * will recognise the sections; nobody has to click Next four times to fix a
 * date.
 *
 * THE FOUR RULES THIS FILE EXISTS TO GET RIGHT
 * ───────────────────────────────────────────────────────────────────────────
 * 1. `defaultValues` COMES FROM A useMemo, NEVER FROM useEffect + reset.
 *    React Query refetches on window focus. An effect that reset the form when
 *    the fetched record changed would wipe a half-written campaign the moment
 *    the operator alt-tabbed to copy a URL and came back. The record is fetched
 *    by the PARENT, which renders this component only once it has one — so
 *    there is no "arrives later" case for an effect to paper over. The single
 *    `reset()` below runs after a successful SAVE, on the values just
 *    submitted, to clear the dirty flag. It never reads server state.
 *
 * 2. SERVER `validationErrors` LAND ON FIELDS. `ApiError.fieldErrors` already
 *    flattens the API's Zod envelope into `{ path, message }`; EVERY entry is
 *    routed to its field with `setError` — the loop does not stop at the first,
 *    so a submit that broke three rules shows all three at once — and anything
 *    unrecognised falls to the form-level banner rather than being dropped. A
 *    field error shown as a toast leaves an operator with a form they cannot
 *    see how to fix.
 *
 * 3. EVERY NULLABLE FIELD IS COALESCED TO "" on the way in (see
 *    `sponsorToFormValues`) and back to `null` on the way out. A `null` handed
 *    to a React input flips it to uncontrolled and silently drops what is typed.
 *
 * 4. SUBMIT IS DISABLED WHILE PENDING. Otherwise a double-click on "Create"
 *    puts the same sponsor in the citizens' feed twice.
 */

export function SponsorForm({
  record,
  secondaryActions,
}: {
  /** `null` creates a new sponsor; a record edits that one. */
  record: AdminSponsor | null;
  /** Rendered beside Save — the edit page passes pause / activate / delete here. */
  secondaryActions?: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const formId = useId();

  // Rule 1. Keyed off the record's identity, so switching records remounts
  // rather than mutating a form the operator may be typing into.
  const defaultValues = useMemo<SponsorFormValues>(() => sponsorToFormValues(record), [record]);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SponsorFormValues>({
    resolver: zodResolver(sponsorFormSchema),
    defaultValues,
  });

  // `useWatch`, not `watch()`. Two reasons, and the second is load-bearing: it
  // subscribes to these fields only, so typing in the description does not
  // re-render the whole form; and `watch()` returns a fresh function React
  // Compiler refuses to memoize around, which it reports as a skipped
  // compilation on this component.
  const creativeType = useWatch({ control, name: "creativeType" });
  const creativeUrl = useWatch({ control, name: "creativeUrl" });
  const placements = useWatch({ control, name: "placements" });

  const needsCreativeUrl = creativeUrlApplies(creativeType);
  const noPlacements = placements.length === 0;
  // Every chosen placement is one the mobile app mounts no slot for. Unlike the
  // two rules below, the API does NOT refuse this — see the warning it feeds.
  const { showsNowhere, undelivered } = placementDelivery(placements);
  // Both of these SAVE fine and are refused only by `activate()` — see the
  // schema header. So they are warnings, and they say which action they block.
  const missingCreativeUrl = creativeUrlMissing({ creativeType, creativeUrl });

  /**
   * The browser's own "leave site?" prompt, for the one navigation React cannot
   * intercept: a closed tab or a typed URL. Not a substitute for care — an
   * in-app `<Link>` still leaves without warning, which the App Router gives no
   * supported hook for — but losing a half-configured campaign to a stray ⌘W is
   * the cheapest of these failures to prevent.
   */
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const onSubmit = async (values: SponsorFormValues) => {
    // The resolver replaces per-field errors on every pass, but a `root` error
    // is set by hand and stays until it is cleared by hand. Without this, a
    // banner from a failed attempt sits above a form that has since saved.
    clearErrors("root");
    const payload = formValuesToPayload(values);

    try {
      if (record) {
        await runSponsorAction<AdminSponsor>({
          queryClient,
          path: `/admin/sponsors/${encodeURIComponent(record.id)}`,
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

      const created = await runSponsorAction<AdminSponsor>({
        queryClient,
        path: "/admin/sponsors",
        method: "POST",
        body: payload,
        success: "Sponsor created.",
      });

      // Reset before navigating so the "Unsaved changes" flag does not sit there
      // during the transition, contradicting the toast that just said it saved.
      // `replace`, not `push` — the back button should return to the list, not
      // to a create form that would make a second copy of what was just written.
      reset(values);
      router.replace(sponsorEditHref(created.id));
    } catch (error) {
      // Rule 2, part one: a hand-raised code that is really about ONE field.
      // Both codes in CODE_TO_FIELD arrive as a bare `{ code, message }`,
      // because the service raises them after merging this payload with the
      // stored row — work no DTO can do. Without this branch a per-field problem
      // would land in the form-level banner with the operator left to work out
      // which control to change.
      if (error instanceof ApiError && error.code !== null && CODE_TO_FIELD[error.code]) {
        setError(CODE_TO_FIELD[error.code]!, {
          type: "server",
          message: sponsorErrorMessage(error),
        });
        return;
      }

      // Rule 2, part two: the API's Zod envelope, already flattened to
      // `{ path, message }` pairs by `ApiError`. EVERY entry is applied, so a
      // submit that failed three rules shows all three at once rather than
      // making the operator fix them one round trip at a time.
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        let matched = false;
        for (const fieldError of error.fieldErrors) {
          if (isSponsorFieldName(fieldError.path)) {
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

      // Everything else — including the benign 409s (`NO_EFFECTIVE_CHANGE` for a
      // Save with nothing changed) that `sponsorErrorMessage` rewords into
      // something that does not read as a fault.
      setError("root", {
        message:
          error instanceof ApiError && error.isNetworkFailure
            ? "The console couldn't reach the API, so nothing was saved. Check that it's running, then try again — everything you've typed is still here."
            : sponsorErrorMessage(error),
      });
    }
  };

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      // A form may set its own measure — a readable line length is a property of
      // the form, not of the page. It must never set `mx-auto` or page padding:
      // the form owns WIDTH, the layout owns POSITION (see PageLayout).
      className="max-w-(--container-wide) space-y-5"
    >
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
            <CardTitle>Sponsor</CardTitle>
            <span className="micro-label text-fg-faint">Who is paying</span>
          </CardHeader>
          <CardBody className="space-y-4">
            <TextField
              label="Sponsor name"
              error={errors.name?.message}
              hint="The organisation. This is the only field the API requires — everything else can be filled in later."
              registration={register("name")}
              placeholder="ABC Foods"
            />
            <TextField
              label="Campaign name"
              error={errors.campaignName?.message}
              hint="What this particular run is called. Shown under the sponsor in the list, so two campaigns from one organisation can be told apart."
              registration={register("campaignName")}
              placeholder="Feed Tamil Nadu 2026"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {/* THE HINT IS NOT DECORATION — IT CORRECTS A REASONABLE
                  ASSUMPTION. A field called "Category", on a screen whose other
                  fields all change where and when the campaign runs, reads as
                  targeting. It is not. Verified against the running API on
                  2026-09-02: `GET /sponsors?placement=home&category=Food`
                  returns a sponsor whose category is "Medical" — the citizen
                  endpoint accepts the parameter and does not filter on it, so a
                  campaign appears on every category screen regardless of what
                  is typed here. What the value DOES do is feed this console's
                  search box. Saying so is the difference between an operator
                  choosing a label and an operator believing they bought
                  category-scoped placement. */}
              <TextField
                label="Category"
                error={errors.category?.message}
                hint="A label for finding this sponsor in the console's search. It does not restrict which screens the campaign appears on."
                registration={register("category")}
                placeholder="Food donation"
              />
              <TextField
                label="Location"
                error={errors.location?.message}
                registration={register("location")}
                placeholder="Chennai"
              />
            </div>
            <TextField
              label="Website"
              type="url"
              inputMode="url"
              error={errors.website?.message}
              hint="Where the card links when a citizen taps it."
              registration={register("website")}
              placeholder="https://example.org"
            />
            <TextField
              label="Logo URL"
              type="url"
              inputMode="url"
              error={errors.logoUrl?.message}
              hint="A link to a logo image that is already hosted somewhere."
              registration={register("logoUrl")}
              placeholder="https://example.org/logo.png"
            />
            <TextAreaField
              label="Description"
              rows={4}
              error={errors.description?.message}
              hint="One or two lines about the sponsor. A Logo + text card is built from this and the logo."
              registration={register("description")}
              placeholder="Supporting community kitchens across Tamil Nadu."
            />
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Creative</CardTitle>
              <span className="micro-label text-fg-faint">What citizens see</span>
            </CardHeader>
            <CardBody className="space-y-4">
              {/* ⚠ THE HONEST STATEMENT THE PROTOTYPE OWED ITS OPERATORS.
                  §5 gap #3: an animated 0→100% progress bar with no file picker
                  and no storage, so "an operator can complete the wizard
                  believing a creative was uploaded". There is no upload here and
                  the copy says so in the first sentence, rather than leaving it
                  to be inferred from the field being a text box. */}
              <p className="flex items-start gap-2 rounded-control border border-info-soft-border bg-info-soft px-3 py-2 text-xs text-info-fg">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  This console doesn&rsquo;t host files. Upload the creative wherever it lives and
                  paste the link here — nothing is stored by pasting a URL, and nothing is
                  uploaded by this form.
                </span>
              </p>

              <SelectField
                label="Creative type"
                error={errors.creativeType?.message}
                hint={creativeTypeHint(creativeType)}
                registration={register("creativeType")}
              >
                {creativeTypeOptions(record?.creativeType ?? null).map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </SelectField>

              {/* Shown only for the types that need an asset. `logo_text` has no
                  file by definition, so rendering a disabled or empty URL box
                  there would invite an operator to fill in a field the API will
                  null out anyway (see formValuesToPayload). */}
              {needsCreativeUrl ? (
                <TextField
                  label="Creative URL"
                  type="url"
                  inputMode="url"
                  error={errors.creativeUrl?.message}
                  hint="A direct link to the hosted file. You can save without it — a campaign can't be ACTIVATED without it."
                  registration={register("creativeUrl")}
                  placeholder="https://cdn.example.org/campaign.mp4"
                />
              ) : null}

              {missingCreativeUrl ? (
                /* A WARNING, NOT A VALIDATION ERROR — and the wording names the
                   action it actually blocks. The service checks this in
                   activate(), not on save, precisely so a half-negotiated draft
                   can be recorded. Blocking Save here would refuse something the
                   API accepts. */
                <p className="flex items-start gap-2 rounded-control border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-fg">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    A {creativeType === "video" ? "video" : "banner"} card renders blank without a
                    creative URL. You can save this as a draft, but activating it will be refused
                    until the URL is here.
                  </span>
                </p>
              ) : null}

              {needsCreativeUrl ? null : (
                <p className="rounded-control border border-dashed border-border bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
                  <span className="font-semibold text-fg-muted">No file needed.</span> A Logo +
                  text card is composed from the logo and description on the left.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Placement</CardTitle>
              <span className="micro-label text-fg-faint">Where it appears</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <PlacementPicker control={control} error={errors.placements?.message} />

              {/* A WARNING, NOT A VALIDATION ERROR. The backend's only NOT NULL
                  column is the name, so a sponsor with no placements saves
                  fine — refusing it here would block something the API accepts.
                  It is still a campaign that renders to nobody, which is the
                  quietest way for this feature to fail, so it is named. */}
              {noPlacements ? (
                <p className="flex items-start gap-2 rounded-control border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-fg">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    No placements selected, so this campaign would appear on no screen in the app.
                    You can still save it — but activating it will be refused until at least one
                    placement is chosen.
                  </span>
                </p>
              ) : null}

              {/* THE WORSE VERSION OF THE WARNING ABOVE, because the API does
                  NOT catch this one. `activate()` checks that the list is
                  non-empty, never that anything renders it, so a campaign with
                  only undeliverable placements activates cleanly and shows to
                  nobody — with a green toast, until this was fixed. The console
                  is the only place that knows, so it is the only place that can
                  say it. */}
              {showsNowhere ? (
                <p className="flex items-start gap-2 rounded-control border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-fg">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {undelivered.map(placementLabel).join(" and ")}{" "}
                    {undelivered.length === 1 ? "is" : "are"} the only placement
                    {undelivered.length === 1 ? "" : "s"} selected, and no screen in the app renders{" "}
                    {undelivered.length === 1 ? "it" : "them"} yet. This will save AND activate
                    without complaint, and still reach no citizen. Add a placement the app renders.
                  </span>
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <span className="micro-label text-fg-faint">Dates in {TIMEZONE_LABEL}</span>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={`Starts (${TIMEZONE_LABEL})`}
            type="date"
            error={errors.startDate?.message}
            hint="Leave blank and it runs from the moment it's activated. Set a future date to book it ahead — activating keeps the date rather than overwriting it."
            registration={register("startDate")}
          />
          {/* THE END DATE IS EXCLUSIVE AND THE START DATE IS NOT, WHICH NOBODY
              WOULD GUESS. The console writes each picked day as midnight IST
              (./dates.ts) and the API's predicate is
              `start_date <= now() AND end_date > now()`
              (apps/api/src/sponsors/sponsor-status.ts). So the campaign stops
              the instant the end day BEGINS. Verified against the running API
              on 2026-09-02: a campaign given today's date as its end date came
              back already `Expired` and served nothing to the citizen endpoint.
              An operator setting "Ends 30 Sep" for a month-end campaign loses
              the 30th, and the failure is invisible afterwards — the badge just
              says Expired a day early. Said here, where the date is chosen. */}
          <TextField
            label={`Ends (${TIMEZONE_LABEL})`}
            type="date"
            error={errors.endDate?.message}
            hint="The campaign stops at the START of this day, so the last day it runs is the day before. Leave blank and it runs until somebody pauses it."
            registration={register("endDate")}
          />
        </CardBody>
      </Card>

      {/* Sticky so Save is reachable from anywhere in a long form, without
          duplicating it into the page header (two buttons that do the same
          thing is one button too many). Degrades to a plain row when the form
          is shorter than the viewport. */}
      <div className="sticky bottom-0 -mb-2 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-canvas/90 py-3 backdrop-blur-md">
        {isDirty ? (
          <span className="mr-auto text-xs font-medium text-warning-fg">Unsaved changes</span>
        ) : null}

        {secondaryActions}

        <BackButton href={SPONSORS_INDEX} label="Back to sponsors" variant="outline" size="sm" />

        {/* Rule 4. */}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          <Save />
          {isSubmitting
            ? record
              ? "Saving…"
              : "Creating…"
            : record
              ? "Save changes"
              : "Create sponsor"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The four placements, as a checkbox group.
 *
 * `useController` rather than four `register()` calls sharing a name. RHF can
 * collect same-named checkboxes into an array, but the behaviour depends on how
 * many are registered and what `value` each carries, and it degrades to a
 * boolean when only one is present — a shape this schema would reject. An
 * explicit controlled array has one representation at every moment, which is
 * also what makes `formValuesToPayload` able to send the keys verbatim.
 *
 * Each option renders its LABEL and carries its KEY. See ./placements.ts for
 * why that direction is load-bearing.
 */
function PlacementPicker({
  control,
  error,
}: {
  control: Control<SponsorFormValues>;
  error?: string;
}) {
  const { field } = useController({ control, name: "placements" });
  const selected = field.value;
  const errorId = useId();

  const toggle = (key: string) => {
    field.onChange(
      selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key],
    );
  };

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="micro-label mb-2 text-fg-muted">Surfaces</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {PLACEMENTS.map((placement) => {
          const checked = selected.includes(placement.key);
          return (
            <label
              key={placement.key}
              className="flex cursor-pointer items-start gap-2.5 rounded-control border border-border bg-surface-inset px-3 py-2.5 transition-colors hover:border-border-strong has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(placement.key)}
                onBlur={field.onBlur}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-fg">{placement.label}</span>
                  {/* OFFERED, BUT LABELLED. The API accepts this key and
                      `activate()` counts it as a real placement, so removing the
                      box would refuse something the server allows — and would
                      silently drop the key from records that already carry it
                      the next time Save is pressed. Marking it lets an operator
                      make the choice knowing the outcome. */}
                  {placement.renderedByApp ? null : (
                    <Badge tone="warning">Not rendered yet</Badge>
                  )}
                </span>
                <span className="block text-[11px] text-fg-faint">{placement.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="mt-2 text-xs font-medium text-danger-fg">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** What `register("name")` hands back, widened to any of this form's names. */
type Registration = UseFormRegisterReturn;

/**
 * `Field` + `Input`, wired to RHF and to the shared error/hint slot.
 *
 * `useId` per field rather than a hand-written string, so two fields can never
 * silently share an `id` and point both labels at one input.
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
  registration: Registration;
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

function TextAreaField({
  label,
  error,
  hint,
  registration,
  ...textareaProps
}: {
  label: string;
  error?: string;
  hint?: string;
  registration: Registration;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <Textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...textareaProps}
        {...registration}
      />
    </Field>
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
