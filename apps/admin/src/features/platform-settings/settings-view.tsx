"use client";

import { DatabaseZap, Hammer } from "lucide-react";

import { ListFailureState } from "@/components/data";
import { Button, EmptyState, ErrorState } from "@/components/ui";
import { ApiError } from "@/lib/api-error";
import { classifyListFailure } from "@/lib/list-failure";
import { LastChanged } from "./last-changed";
import { MaintenanceBanner, MaintenanceCard, useKillSwitches } from "./maintenance-controls";
import { SettingsForm } from "./settings-form";
import { SettingsSkeleton } from "./settings-skeleton";
import { useAppSettings } from "./use-app-settings";
import { isUsableSettings } from "./types";

/**
 * Platform -> App Settings.
 *
 * BRANCH ORDER IS THE RULE: loading -> failure -> unusable -> content. Checking
 * the data before the error is how a page ends up telling an operator their
 * settings are missing when it is the API that is missing.
 *
 * There is no "empty" state here in the list sense — a settings singleton
 * either exists or the request failed. The nearest thing, and the one this page
 * actually shows today, is the 404 branch below: the endpoint is not built yet,
 * and the console says exactly that rather than rendering a form over invented
 * defaults. The third branch covers the other half of the same honesty: a 200
 * whose body is not a settings record.
 *
 * WHY THE MAINTENANCE CARD SITS ABOVE THE FORM
 * ───────────────────────────────────────────────────────────────────────────
 * Convention would put a destructive block last, and for a "danger zone" of
 * irreversible deletes that is right. These are not deletes: they are the
 * control an operator reaches for while something is actively going wrong, and
 * they are fully reversible. Ranking the page by urgency rather than by risk
 * puts the switch you need in seconds above the fields you change in minutes.
 * A confirmation dialog, not distance down the page, is what protects it from
 * a mis-click.
 */
export function SettingsView() {
  const { data, isPending, isError, error, isFetching, refetch } = useAppSettings();

  // One instance, shared by the banner and the card, so a write started in
  // either place disables the buttons in both.
  const controls = useKillSwitches();

  if (isPending) return <SettingsSkeleton />;

  if (isError) return <SettingsFailure error={error} onRetry={() => void refetch()} />;

  if (!isUsableSettings(data)) {
    return (
      <ErrorState
        title="That response didn't make sense"
        message="The API answered, but not with a settings record the console recognises. This is a mismatch between the console and the API, not something you did wrong — nothing has been changed."
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <MaintenanceBanner settings={data} controls={controls} />
      <LastChanged settings={data} onRefresh={() => void refetch()} refreshing={isFetching} />
      <MaintenanceCard settings={data} controls={controls} />
      <SettingsForm settings={data} />
    </div>
  );
}

/**
 * Why the settings did not load.
 *
 * `classifyListFailure` already separates "you may not see this" from "the API
 * is down" from "it broke", and `ListFailureState` renders each at its own
 * volume — a correctly-enforced refusal as a calm explanation, never as a red
 * error. The one case it words for lists rather than for this page is the 404,
 * which is the case this page hits today, so that one gets its own copy.
 */
function SettingsFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // A 503 the API raises by name when the singleton row is missing. Distinct
  // from every other failure on this page in that it has a one-command fix, and
  // distinct from "not built yet" in that the endpoint is clearly there. Left
  // to the generic branch it would read as "couldn't load this list", which
  // sends an operator to the wrong person.
  if (error instanceof ApiError && error.code === "PLATFORM_SETTINGS_NOT_SEEDED") {
    return (
      <EmptyState
        icon={<DatabaseZap className="size-10" />}
        title="The settings row hasn't been seeded"
        description="The API is serving this endpoint, but the single platform_settings row it reads doesn't exist in this database yet. Someone with database access needs to run `pnpm db:seed`. Nothing is broken and nothing is lost — the row has never been created."
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Check again
          </Button>
        }
      />
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={<Hammer className="size-10" />}
        title="App settings aren't served by the API yet"
        description="This page is built and wired to GET/PATCH /admin/settings, but the API doesn't answer that route yet. Nothing is shown here rather than a form over invented values — every control on this page has to be a real one. It will start working the moment the endpoint ships; no console change is needed."
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Check again
          </Button>
        }
      />
    );
  }

  return <ListFailureState failure={classifyListFailure(error)} onRetry={onRetry} />;
}
