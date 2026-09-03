"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Info, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Alert, Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { moderationErrorMessage } from "@/features/moderation/moderation-errors";
import { ApiError } from "@/lib/api-error";
import { RadiusChoice, SettingNumberField, SettingTextField } from "./setting-fields";
import { SettingSwitch } from "./setting-switch";
import {
  formValuesToPatch,
  isSettingsFieldName,
  phoneLooksWrong,
  settingsFormSchema,
  settingsToFormValues,
  type SettingsFormValues,
} from "./schema";
import { saveAppSettings } from "./use-app-settings";
import {
  APP_NAME_MAX,
  MAX_PHOTOS_MAX,
  MAX_PHOTOS_MIN,
  MAX_VOLUNTEERS_MAX,
  MAX_VOLUNTEERS_MIN,
  type AdminSettings,
} from "./types";

/**
 * The nine settings that are edited and saved together.
 *
 * The two app-wide kill switches are NOT here — they have their own
 * confirm-gated, single-key PATCH in `maintenance-controls.tsx`. See the header
 * of `schema.ts` for why they are kept out of a form with a Save button.
 *
 * THE FOUR RULES THIS FILE EXISTS TO GET RIGHT
 * ───────────────────────────────────────────────────────────────────────────
 * 1. `defaultValues` COMES FROM A useMemo, NEVER FROM useEffect + reset.
 *    React Query refetches these settings on window focus, and two operators
 *    can be in this console at once. An effect that reset the form when the
 *    fetched record changed would wipe a half-typed support number the moment
 *    the operator alt-tabbed to look it up — and would do it again every time
 *    the OTHER operator saved. `useForm` reads `defaultValues` once, at mount;
 *    later renders with fresh `settings` cannot touch what is on screen.
 *    The `reset()` calls below are both deliberate and both operator-initiated
 *    or post-save: one clears the dirty flag on the values just submitted, the
 *    other is the explicit "Discard changes" button.
 *
 * 2. SERVER `validationErrors` LAND ON FIELDS. `ApiError.fieldErrors` already
 *    flattens the API's Zod envelope into `{ path, message }`; each is routed
 *    to its field with `setError`, and anything unrecognised falls to the
 *    form-level banner rather than being dropped. A field error shown as a
 *    toast leaves an operator with a form they cannot see how to fix.
 *
 * 3. BOTH NULLABLE FIELDS ARE COALESCED TO "" on the way in and back to `null`
 *    on the way out (see `schema.ts`). A `null` handed to a React input flips
 *    it to uncontrolled and silently drops what is typed.
 *
 * 4. SUBMIT IS DISABLED WHILE PENDING, and while nothing has changed. The
 *    first stops a double-click sending two PATCHes; the second stops an empty
 *    one, which the contract has no reason to accept.
 *
 * ONLY WHAT CHANGED IS SENT. The PATCH body is built from `dirtyFields`, so
 * this form cannot overwrite a field another operator edited while it sat open.
 */
export function SettingsForm({ settings }: { settings: AdminSettings }) {
  const queryClient = useQueryClient();

  // Rule 1. `settings` is deliberately in the dependency list even though the
  // memo's result is only ever read on the first render — omitting it would be
  // a lie to the linter about what this depends on, and the memo is cheap.
  const defaultValues = useMemo<SettingsFormValues>(
    () => settingsToFormValues(settings),
    [settings],
  );

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues,
  });

  // `useWatch`, not `watch()`: it subscribes to these fields only, so typing in
  // the app name does not re-render the whole form, and it does not hand React
  // Compiler a fresh function on every render to refuse to memoize around.
  const supportPhone = useWatch({ control, name: "supportPhone" });
  const defaultRadiusKm = useWatch({ control, name: "defaultRadiusKm" });
  const commentsEnabled = useWatch({ control, name: "commentsEnabled" });
  const commentFlaggingEnabled = useWatch({ control, name: "commentFlaggingEnabled" });

  /**
   * The browser's own "leave site?" prompt, for the one navigation React cannot
   * intercept: a closed tab or a typed URL. Not a substitute for care — an
   * in-app `<Link>` still leaves without warning, which the App Router gives no
   * supported hook for — but losing an edit to a stray ⌘W is the cheapest of
   * these failures to prevent.
   */
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const onSubmit = async (values: SettingsFormValues) => {
    // The resolver replaces per-field errors on every pass, but a `root` error
    // is set by hand and stays until cleared by hand. Without this, a banner
    // from a failed attempt sits above a form that has since saved.
    clearErrors("root");

    const patch = formValuesToPatch(values, dirtyFields);
    if (Object.keys(patch).length === 0) {
      // Unreachable through the button (Save is disabled when nothing is
      // dirty), but a form can be submitted with Enter from a text field.
      setError("root", { message: "Nothing has changed, so there was nothing to save." });
      return;
    }

    try {
      await saveAppSettings({ queryClient, patch, success: "Settings saved." });
      // Rule 1's sanctioned reset: the values just submitted, not a refetched
      // record. Clears `isDirty`, so the unsaved-changes guard stops firing and
      // the next Save sends only what changes from here.
      reset(values);
    } catch (error) {
      // Rule 2: the API's Zod envelope, already flattened to `{ path, message }`.
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        let matched = false;
        for (const fieldError of error.fieldErrors) {
          if (isSettingsFieldName(fieldError.path)) {
            setError(fieldError.path, { type: "server", message: fieldError.message });
            matched = true;
          }
        }
        if (matched) return;
        // Field errors naming something this form does not render — the two
        // kill switches, or a field added server-side — would otherwise vanish,
        // leaving a Save that silently did nothing.
        setError("root", {
          message: error.fieldErrors.map((fieldError) => fieldError.message).join(" "),
        });
        return;
      }

      setError("root", {
        message:
          error instanceof ApiError && error.isNetworkFailure
            ? "The console couldn't reach the API, so nothing was saved. Check that it's running, then try again — your changes are still here."
            : moderationErrorMessage(error),
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      // A form may set its own measure — a readable line length is a property
      // of the form, not of the page. It must never set `mx-auto` or page
      // padding: the form owns WIDTH, the layout owns POSITION.
      className="max-w-[var(--container-default)] space-y-5"
    >
      {errors.root?.message ? <Alert size="md">{errors.root.message}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <span className="micro-label text-fg-faint">Shown to citizens</span>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <SettingTextField
            label="App name"
            className="sm:col-span-2"
            error={errors.appName?.message}
            hint={`What the mobile app calls itself. Up to ${APP_NAME_MAX} characters.`}
            registration={register("appName")}
            placeholder="Uthavu"
            autoComplete="off"
          />
          <SettingTextField
            label="Support email"
            type="email"
            inputMode="email"
            autoComplete="off"
            error={errors.supportEmail?.message}
            hint="Leave blank to remove it. Citizens are shown this address on the Help screen."
            registration={register("supportEmail")}
            placeholder="support@uthavu.org"
          />
          <SettingTextField
            label="Support phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            error={errors.supportPhone?.message}
            hint="Leave blank to remove it. Any format — the API stores it as written."
            registration={register("supportPhone")}
            placeholder="+91 44 0000 0000"
            warning={
              phoneLooksWrong(supportPhone) ? (
                <>
                  That doesn&apos;t look like a phone number. It will still save, but citizens are
                  shown it as one to dial.
                </>
              ) : null
            }
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <span className="micro-label text-fg-faint">Limits on a request for help</span>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingNumberField
              label="Photos per report"
              suffix="photos"
              error={errors.maxPhotosPerReport?.message}
              hint={`How many a citizen may attach to one request. ${MAX_PHOTOS_MIN}–${MAX_PHOTOS_MAX}.`}
              registration={register("maxPhotosPerReport")}
            />
            <SettingNumberField
              label="Volunteers per report"
              suffix="volunteers"
              error={errors.maxVolunteersPerReport?.message}
              hint={`How many people may accept one request before it stops taking more. ${MAX_VOLUNTEERS_MIN}–${MAX_VOLUNTEERS_MAX}.`}
              registration={register("maxVolunteersPerReport")}
            />
          </div>

          <RadiusChoice
            registration={register("defaultRadiusKm")}
            value={defaultRadiusKm}
            error={errors.defaultRadiusKm?.message}
          />

          <SettingSwitch
            label="Allow anonymous reports"
            description="A citizen can ask for help without their name being shown on the request. Volunteers still see it once they accept, and the account is still recorded."
            registration={register("allowAnonymousReports")}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Community</CardTitle>
          <span className="micro-label text-fg-faint">The public comment feed</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <SettingSwitch
            label="Community comments"
            description="The public, per-request feed anyone can post to and everyone can read. Turning this off hides it in the app; nothing already written is deleted."
            registration={register("commentsEnabled")}
          />
          <SettingSwitch
            label="Comment flagging"
            description="Citizens can flag a comment for a moderator to review. Flags land in Reports → Flagged."
            registration={register("commentFlaggingEnabled")}
          />

          {/* Not a validation error — the contract lets these two be set
              independently, and refusing the combination would block something
              the API accepts. It is still worth naming: flagging with no
              comments to flag is a switch that does nothing. */}
          {commentFlaggingEnabled && !commentsEnabled ? (
            <Alert tone="info" icon={Info}>
              Flagging is on but comments are off, so there is nothing for a citizen to flag. The
              moderation queue will simply stay empty.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      {/* Sticky so Save is reachable from anywhere on the page without
          duplicating it into the page header. Degrades to a plain row when the
          content is shorter than the pane. */}
      <div className="sticky bottom-0 -mb-2 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-canvas/90 py-3 backdrop-blur-md">
        {isDirty ? (
          <span className="mr-auto text-xs font-medium text-warning-fg">Unsaved changes</span>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!isDirty || isSubmitting}
          // Reads `settings` at click time, so this restores what the API holds
          // NOW — including a change another operator made since this page
          // loaded. Operator-initiated, which is the only kind of reset that is
          // allowed to replace what someone typed.
          onClick={() => reset(settingsToFormValues(settings))}
        >
          <RotateCcw />
          Discard changes
        </Button>

        {/* Rule 4. */}
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          <Save />
          {isSubmitting ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
