"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  CircleSlash,
  Info,
  Loader2,
  PauseOctagon,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import { moderationErrorMessage } from "@/features/moderation/moderation-errors";
import { cn } from "@/lib/cn";
import { saveAppSettings } from "./use-app-settings";
import type { AdminSettings, AdminSettingsPatch, KillSwitch } from "./types";

/**
 * The two app-wide kill switches.
 *
 * WHY THESE ARE NOT IN THE FORM
 * ───────────────────────────────────────────────────────────────────────────
 * Everything else on this page is edited, reviewed and saved together. These
 * two are reached for in an incident, and an incident control must not be
 * downstream of a Save button that also ships whatever half-finished edit is
 * sitting in the app-name field. The contract accepts any subset, so each of
 * these is its own single-key PATCH: `{ maintenanceMode: true }` and nothing
 * else. That also means the switch cannot fail validation on a field nobody
 * touched.
 *
 * WHY THEY ARE BUTTONS AND NOT SWITCHES
 * ───────────────────────────────────────────────────────────────────────────
 * A switch that does not move until a dialog is confirmed is a switch that
 * lies for as long as the dialog is open, and this screen is a rebuild of one
 * whose defining failure was switches that did not mean what they showed
 * (`docs/webadmin/07-platform-settings.md` §2A). A labelled button plus a
 * separate state badge cannot have that ambiguity: the badge says what IS, the
 * button says what WILL HAPPEN.
 *
 * THE ASYMMETRY IS DELIBERATE
 * ───────────────────────────────────────────────────────────────────────────
 * Turning one ON asks for confirmation, because it stops citizens asking for
 * emergency help. Turning one OFF is a single click with no dialog, because it
 * restores service — the operator doing it is already in an incident, and a
 * confirmation step between them and "the app works again" is a cost paid at
 * the worst possible moment. The same reasoning puts a turn-off button in the
 * banner at the top of the page, so it is reachable without scrolling or
 * hunting for the card.
 */

/**
 * WHAT THESE SWITCHES ACTUALLY DO, VERIFIED AGAINST THE API
 * ───────────────────────────────────────────────────────────────────────────
 * Read from `apps/api/src/config/maintenance-mode.ts` and `maintenance.guard.ts`
 * rather than assumed, because this page's whole reason for existing is that
 * the screen it replaces showed controls over rules nothing enforced.
 *
 *   - BOTH switches block exactly the same thing: every mutating citizen
 *     request (POST/PUT/PATCH/DELETE), refused globally with 403. They differ
 *     only in the code and message the citizen's app receives.
 *   - NEITHER blocks reading. GET is never checked, so a citizen keeps a
 *     working, browsable app rather than a wall of errors.
 *   - NEITHER blocks `/admin/*` or the auth routes — deliberately, so this
 *     console and signing in still work while a switch is on. That is what
 *     makes the switch reversible from here rather than by hand-run SQL.
 *   - If both are on, maintenance wins: it is the more specific message.
 *
 * So this IS a stop button, and the copy below says what it stops in the words
 * the citizen will actually be given.
 */

/**
 * NOTE (corrected 2026-08-29): an earlier revision of this file warned that no
 * mobile build read the MAINTENANCE_MODE / READ_ONLY_MODE codes. That was true
 * when written and became false the same day — the mobile lane landed the
 * handling while this page was being built. It is now handled end to end:
 * `libs-mobile/lib/api.ts:158` branches on both codes,
 * `apps/mobile/src/navigation/RootNavigator.tsx:126` shows a dedicated alert
 * (deliberately NOT the 401/session path — the session is fine and the user can
 * still read), and the copy is catalogued in English and Tamil
 * (`libs-mobile/i18n/locales/{en,ta}/common.json`).
 *
 * The caveat was therefore removed rather than reworded: telling an operator
 * that citizens see an undesigned error, when they do not, is the same class of
 * defect as the fabricated login statistics and the Announcements publish
 * dialog that promised a mobile reader which did not exist.
 */

type SwitchCopy = {
  label: string;
  icon: typeof PauseOctagon;
  /** What the ON state does to a citizen. Used in the card and the dialog. */
  consequence: ReactNode;
  /** The badge caption while the switch is ON. */
  onBadge: string;
  confirmTitle: string;
  confirmLabel: string;
  pendingLabel: string;
  onSuccess: string;
  offSuccess: string;
};

const SWITCHES: Record<KillSwitch, SwitchCopy> = {
  maintenanceMode: {
    label: "Maintenance mode",
    icon: PauseOctagon,
    consequence: (
      <>
        Stops every citizen write. Nobody can ask for help, accept a request, comment, or send a
        mission message — each attempt is refused with{" "}
        <span className="text-fg-muted">
          &ldquo;Uthavu is down for maintenance right now. You can still browse, but posting is
          paused.&rdquo;
        </span>{" "}
        Reading still works: the app stays browsable rather than going dark.
      </>
    ),
    onBadge: "Citizens can browse, but nobody can ask for or offer help",
    // Names the switch AND the consequence. "Are you sure?" tells an operator
    // nothing they did not already know from clicking the button.
    confirmTitle: "Pause the product for maintenance?",
    confirmLabel: "Turn on maintenance mode",
    pendingLabel: "Turning on…",
    onSuccess: "Maintenance mode is ON — citizen writes are blocked.",
    offSuccess: "Maintenance mode is off. Citizens can post again.",
  },
  readOnlyMode: {
    label: "Read-only mode",
    icon: CircleSlash,
    consequence: (
      <>
        Blocks exactly the same writes as maintenance mode — no new requests, no accepting one, no
        comments, no mission messages — but tells the citizen{" "}
        <span className="text-fg-muted">
          &ldquo;Uthavu is in read-only mode right now.&rdquo;
        </span>{" "}
        Use it when the pause is not a fault: a migration, a freeze, a planned window.
      </>
    ),
    onBadge: "Citizens can browse, but nobody can ask for or offer help",
    confirmTitle: "Pause the product in read-only mode?",
    confirmLabel: "Turn on read-only mode",
    pendingLabel: "Turning on…",
    onSuccess: "Read-only mode is ON — citizen writes are blocked.",
    offSuccess: "Read-only mode is off. Citizens can post again.",
  },
};

export type KillSwitchControls = {
  /** The switch currently being written, or null. Disables every button. */
  pending: KillSwitch | null;
  /** Throws on failure, so a caller inside a dialog can surface it in place. */
  setSwitch: (field: KillSwitch, next: boolean) => Promise<void>;
  /** Fire-and-forget turn-off. Reports its own failure as a toast. */
  turnOff: (field: KillSwitch) => void;
};

/**
 * The shared write path for both switches and both directions.
 *
 * Called ONCE, by `settings-view.tsx`, and handed to both the banner and the
 * card. Two instances would mean two `pending` flags: the banner's turn-off
 * would leave the card's identical button enabled, and an operator in an
 * incident could fire the same PATCH twice from two places on one screen.
 */
export function useKillSwitches(): KillSwitchControls {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<KillSwitch | null>(null);

  /** Throws on failure, so a caller inside a dialog can surface it in place. */
  const setSwitch = async (field: KillSwitch, next: boolean) => {
    setPending(field);
    // A single-key patch, built by assignment rather than as a computed
    // literal: `{ [field]: next }` with a union key widens to a string index
    // signature, which is not assignable to the contract's partial.
    const patch: AdminSettingsPatch = {};
    patch[field] = next;

    try {
      await saveAppSettings({
        queryClient,
        patch,
        success: next ? SWITCHES[field].onSuccess : SWITCHES[field].offSuccess,
      });
    } finally {
      setPending(null);
    }
  };

  /**
   * Turn-off has no dialog to show a failure in, so a refusal becomes a toast.
   * That is the one place on this page where a failed ACTION is a toast — and
   * it is an action, not a load: the alternative is a red block appearing under
   * a banner that is already red, which reads as the banner itself breaking.
   */
  const turnOff = (field: KillSwitch) => {
    void setSwitch(field, false).catch((error: unknown) => {
      toast.error(moderationErrorMessage(error));
    });
  };

  return { pending, setSwitch, turnOff };
}

/**
 * The "one of these is ON" banner.
 *
 * Rendered at the top of the page, above everything, because this is the state
 * an operator must be able to see without reading — and reverse without
 * scrolling. Returns nothing at all when both switches are off: a permanent
 * "everything is fine" banner is a banner people stop seeing.
 */
export function MaintenanceBanner({
  settings,
  controls,
}: {
  settings: AdminSettings;
  controls: KillSwitchControls;
}) {
  const { pending, turnOff } = controls;

  const active: KillSwitch[] = [];
  if (settings.maintenanceMode) active.push("maintenanceMode");
  if (settings.readOnlyMode) active.push("readOnlyMode");
  if (active.length === 0) return null;

  return (
    <div
      // An alert, because this IS the alert: something an operator did not
      // necessarily do themselves is currently blocking citizens.
      role="alert"
      className="rounded-card border border-danger-soft-border bg-danger-soft p-4"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-fg" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-extrabold text-danger-fg">
              {active.length === 2
                ? "Both kill switches are ON right now"
                : `${SWITCHES[active[0]!].label} is ON right now`}
            </h3>
            <p className="mt-1 text-xs text-danger-fg/90">
              Nobody can ask for or offer help. Citizens can still browse the app. Turn this off
              the moment the reason for it is over.
              {active.length === 2 ? (
                // Both on is not double the block — they block identically. The
                // only thing that changes is which sentence a citizen is given,
                // and an operator turning one off may reasonably expect the
                // block to lift. It will not.
                <>
                  {" "}
                  Both block the same requests, so turning off only one leaves citizens blocked —
                  by the other.
                </>
              ) : null}
            </p>
          </div>

          <ul className="space-y-2">
            {active.map((field) => {
              const copy = SWITCHES[field];
              return (
                <li
                  key={field}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger-soft-border bg-surface px-3.5 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-fg">{copy.label}</span>
                    <span className="block text-xs text-fg-subtle">{copy.onBadge}</span>
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() => turnOff(field)}
                  >
                    {pending === field ? <Loader2 className="animate-spin" /> : <copy.icon />}
                    {pending === field ? "Turning off…" : "Turn off now"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** The two switches, with their state and the action that changes it. */
export function MaintenanceCard({
  settings,
  controls,
}: {
  settings: AdminSettings;
  controls: KillSwitchControls;
}) {
  const { pending, setSwitch, turnOff } = controls;
  const [confirming, setConfirming] = useState<KillSwitch | null>(null);

  return (
    <Card
      className={cn(
        "max-w-[var(--container-default)]",
        // The card itself changes colour when something is on, so the state is
        // legible from across the room rather than from one small badge.
        (settings.maintenanceMode || settings.readOnlyMode) &&
          "border-danger-soft-border bg-danger-soft/30",
      )}
    >
      <CardHeader>
        <CardTitle>
          <ShieldAlert className="size-4 text-danger-fg" />
          Maintenance
        </CardTitle>
        <span className="micro-label text-fg-faint">Blocks citizens app-wide</span>
      </CardHeader>

      <CardBody className="space-y-3">
        <p className="text-xs text-fg-subtle">
          These two are not settings so much as switches on the product itself. Each one takes
          effect for every citizen at once, and neither is scheduled or gradual.
        </p>

        {(Object.keys(SWITCHES) as KillSwitch[]).map((field) => {
          const copy = SWITCHES[field];
          const on = settings[field];

          return (
            <div
              key={field}
              className={cn(
                "flex flex-wrap items-start justify-between gap-4 rounded-control border px-3.5 py-3",
                on ? "border-danger-soft-border bg-surface" : "border-border bg-surface-2",
              )}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-fg">{copy.label}</span>
                  {/* The badge says what IS. The button says what will happen.
                      Never one control doing both. */}
                  <Badge tone={on ? "danger" : "neutral"}>{on ? "ON" : "Off"}</Badge>
                </div>
                <p className="text-xs text-fg-subtle">{copy.consequence}</p>
                {on ? (
                  <p className="text-xs font-semibold text-danger-fg">{copy.onBadge}.</p>
                ) : null}
              </div>

              {on ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => turnOff(field)}
                >
                  {pending === field ? <Loader2 className="animate-spin" /> : <copy.icon />}
                  {pending === field ? "Turning off…" : `Turn off ${copy.label.toLowerCase()}`}
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => setConfirming(field)}
                >
                  <copy.icon />
                  {copy.confirmLabel}
                </Button>
              )}
            </div>
          );
        })}

        <PresentationCaveat />
      </CardBody>

      {(Object.keys(SWITCHES) as KillSwitch[]).map((field) => {
        const copy = SWITCHES[field];
        return (
          <ConfirmActionDialog
            key={field}
            open={confirming === field}
            onOpenChange={(open) => setConfirming(open ? field : null)}
            title={copy.confirmTitle}
            description={
              <span className="space-y-2 block">
                <span className="block">{copy.consequence}</span>
              </span>
            }
            confirmLabel={copy.confirmLabel}
            pendingLabel={copy.pendingLabel}
            tone="danger"
            // The contract declares no `reason` on PATCH /admin/settings, and
            // sending an undeclared field to satisfy a habit risks a 400 from a
            // strict DTO. The audit trail here is `updatedBy` / `updatedAt`,
            // which the API writes itself.
            reason="none"
            onConfirm={async () => {
              await setSwitch(field, true);
            }}
          />
        );
      })}
    </Card>
  );
}

/**
 * Info, not warning. The control works; only its citizen-facing presentation is
 * unfinished. An amber "careful" box here would train an operator to distrust a
 * switch that does exactly what it says.
 */
function PresentationCaveat() {
  return (
    <Alert tone="info" icon={Info} />
  );
}
