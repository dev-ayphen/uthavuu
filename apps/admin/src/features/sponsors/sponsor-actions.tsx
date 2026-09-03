"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatDate } from "@/components/data";
import { Button } from "@/components/ui";
import { invalidateAll } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";

import { SPONSOR_KEYS, runSponsorAction, type SponsorActionOutcome } from "./api";
import { creativeUrlApplies } from "./creative";
import { placementDelivery, placementLabel } from "./placements";
import { isSponsorStaleConflict } from "./sponsor-errors";
import { primaryTransition } from "./status";
import type { AdminSponsor } from "./types";

/**
 * Pause, Activate and Delete — the three state changes on a sponsor.
 *
 * WHICH BUTTON APPEARS, AND WHY IT IS NOT "THE OPPOSITE OF THE BADGE"
 * ───────────────────────────────────────────────────────────────────────────
 * `primaryTransition` in ./status.ts owns this, and its header explains the
 * trap: `scheduled` and `expired` are DERIVED from the campaign window and are
 * both stored as `active`, so offering "Activate" on an expired campaign would
 * be offering a button whose only possible answer is "already active". The
 * mapping is on the stored value, recovered from the displayed one.
 *
 * Beyond that, the console offers the transitions that are meaningful on their
 * face and lets the API be authoritative about the rest — the same call
 * `UpdateActions` makes, and for the same reason: the frozen contract fixes the
 * ROUTES but says nothing about which transitions each status permits, and
 * inventing a precondition table would hide a legal action behind a rule this
 * console made up. A refusal surfaces inside the dialog, next to the button
 * that caused it.
 *
 * NO REASON IS COLLECTED. Every moderation action in this console demands one,
 * because each is a decision taken ABOUT a citizen and an appeal may follow.
 * These are not: a sponsor is the console's own commercial configuration, and
 * the frozen contract declares no body on any of the three routes. Sending an
 * undeclared `{ reason }` would risk a 400 from a strict DTO to satisfy a habit.
 *
 * These are NOT optimistic — see the note on `runSponsorAction`, where the
 * derived-status rule makes hand-patching the cache a re-implementation of
 * backend logic rather than merely a shortcut.
 */

type Action = "pause" | "activate" | "delete" | null;

export function SponsorActions({
  sponsor,
  size = "sm",
  onDeleted,
}: {
  sponsor: AdminSponsor;
  size?: "sm" | "md";
  /** Called after a successful delete — the detail page uses it to navigate away. */
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action>(null);

  const transition = primaryTransition(sponsor.status);
  const base = `/admin/sponsors/${encodeURIComponent(sponsor.id)}`;

  const startsAt = formatDate(sponsor.startDate);
  const endsAt = formatDate(sponsor.endDate);
  const endHasPassed = hasPassed(sponsor.endDate);

  // The two readiness rules `activate()` enforces, mirrored so the operator
  // learns about them BEFORE pressing the button rather than from a refusal.
  // Transcribed from admin-sponsors.service.ts: SPONSOR_NO_PLACEMENTS and
  // SPONSOR_CREATIVE_URL_REQUIRED. The server is still what enforces them —
  // the button stays enabled and the dialog reports the real answer.
  const noPlacements = sponsor.placements.length === 0;
  const missingCreativeUrl =
    creativeUrlApplies(sponsor.creativeType.key) && !sponsor.creativeUrl;
  const blocked = noPlacements || missingCreativeUrl;

  // A THIRD way to run nowhere, which the API does NOT guard against. Every
  // placement on this campaign may be one the mobile app mounts no slot for —
  // see `placements.ts`. `activate()` counts placements, it does not ask
  // whether any of them reaches a screen, so this one passes every server check
  // and still shows to nobody. Warned about here because the console is the
  // only place that knows.
  const delivery = placementDelivery(sponsor.placements);

  const onStale = () => void invalidateAll(queryClient, SPONSOR_KEYS);

  /** Invalidate on a stale refusal, then rethrow so the dialog reports it. */
  const refetchOnStale = (error: unknown): never => {
    if (isSponsorStaleConflict(error)) onStale();
    throw error;
  };

  const run = (path: string, method: "POST" | "DELETE", success: string) => () =>
    runSponsorAction({ queryClient, path, method, success })
      .then(() => undefined)
      .catch(refetchOnStale);

  /**
   * Activate, then report WHAT ACTUALLY HAPPENED rather than what was asked.
   *
   * The reporter reads the record the API sent back, whose `status` was derived
   * in SQL against the database's own clock. Nothing is recomputed here — the
   * console only decides which sentence describes the answer it was given.
   */
  const runActivate = () =>
    runSponsorAction<AdminSponsor>({
      queryClient,
      path: `${base}/activate`,
      method: "POST",
      success: (saved) => activationOutcome(saved),
    })
      .then(() => undefined)
      .catch(refetchOnStale);

  return (
    <>
      {transition === "pause" ? (
        <Button variant="secondary" size={size} onClick={() => setAction("pause")}>
          <Pause />
          Pause
        </Button>
      ) : (
        <Button variant="secondary" size={size} onClick={() => setAction("activate")}>
          <Play />
          Activate
        </Button>
      )}

      <Button variant="danger" size={size} onClick={() => setAction("delete")}>
        <Trash2 />
        Delete
      </Button>

      <ConfirmActionDialog
        open={action === "pause"}
        onOpenChange={(open) => setAction(open ? "pause" : null)}
        title="Pause this campaign?"
        description={
          <>
            {sponsor.status.key === "scheduled" ? (
              <>
                It hasn&rsquo;t started yet
                {startsAt ? ` — it was due to begin on ${startsAt}` : ""}. Pausing stops it from
                starting on its own.
              </>
            ) : sponsor.status.key === "expired" ? (
              <>
                Its end date{endsAt ? ` (${endsAt})` : ""} has already passed, so it isn&rsquo;t
                showing to anyone. Pausing records that it&rsquo;s stopped, so extending the end
                date later won&rsquo;t put it back on screen by itself.
              </>
            ) : (
              <>It stops showing to citizens in the mobile app straight away.</>
            )}{" "}
            Nothing is deleted, and you can activate it again at any time.
          </>
        }
        confirmLabel="Pause campaign"
        pendingLabel="Pausing…"
        reason="none"
        onStale={onStale}
        onConfirm={run(`${base}/pause`, "POST", "Campaign paused.")}
      />

      <ConfirmActionDialog
        open={action === "activate"}
        onOpenChange={(open) => setAction(open ? "activate" : null)}
        title="Activate this campaign?"
        description={
          <>
            {/* Activating does NOT override the window — the API stores intent
                and derives visibility from the dates, so a future start date
                stays a future start date. This must not promise it goes live
                now when it will not. */}
            It becomes visible to citizens in the mobile app{" "}
            {startsAt ? `from ${startsAt}` : "immediately"}
            {/* "until X" reads as "through X" and the API means the opposite:
                the window closes at the START of the end day. Spelled out here
                because this is the last screen before an advertisement goes to
                every citizen. */}
            {endsAt ? ` and stops at the start of ${endsAt}` : ", with no end date"}.
            {endHasPassed ? (
              <>
                {" "}
                <strong className="font-bold">
                  Its end date has already passed, so activating alone won&rsquo;t put it on
                  screen — change the end date as well.
                </strong>
              </>
            ) : null}
            {blocked ? (
              <>
                {" "}
                <strong className="font-bold">
                  This will be refused until it&rsquo;s ready:{" "}
                  {noPlacements && missingCreativeUrl
                    ? "it has no placements and no creative URL"
                    : noPlacements
                      ? "it has no placements, so it would run on no surface at all"
                      : `a ${sponsor.creativeType.label.toLowerCase()} card renders blank without a creative URL`}
                  .
                </strong>
              </>
            ) : null}
            {/* NOT a refusal — the API accepts this happily, which is exactly
                why it has to be said here. Every placement on the campaign is
                one the app mounts no slot for, so it would activate cleanly and
                appear to nobody. */}
            {delivery.showsNowhere ? (
              <>
                {" "}
                <strong className="font-bold">
                  This will be accepted but will show to nobody:{" "}
                  {sponsor.placements.length === 1
                    ? `${placementLabel(sponsor.placements[0]!)} isn't`
                    : `${delivery.undelivered.map(placementLabel).join(" and ")} aren't`}{" "}
                  rendered by any screen in the app yet. Add a placement that is.
                </strong>
              </>
            ) : null}
          </>
        }
        confirmLabel="Activate campaign"
        pendingLabel="Activating…"
        reason="none"
        onStale={onStale}
        onConfirm={runActivate}
      />

      <ConfirmActionDialog
        open={action === "delete"}
        onOpenChange={(open) => setAction(open ? "delete" : null)}
        title="Delete this sponsor?"
        description={
          <>
            {/* The dialog NAMES what is about to be destroyed. A confirm step
                that only says "this sponsor" is a step an operator clicks
                through on autopilot — and this is a commercial relationship
                with an outside organisation, not a row. */}
            You&rsquo;re deleting <strong className="font-bold text-fg">{sponsor.name}</strong>
            {sponsor.campaignName ? (
              <>
                {" "}
                and its campaign{" "}
                <strong className="font-bold text-fg">{sponsor.campaignName}</strong>
              </>
            ) : null}
            . It disappears from this list and from the citizens&rsquo; feed.{" "}
            {/* Named as a soft delete because that is what the schema says it
                is (`deleted_at`, and DELETE -> 204). Telling an operator "this
                cannot be undone" when it can is the kind of small lie that gets
                a real deletion waved through later. */}
            This is a soft delete — the record is retained in the database so the terms of the
            campaign stay answerable, and an engineer can recover it, but nothing in this console
            will bring it back.
          </>
        }
        confirmLabel="Delete sponsor"
        pendingLabel="Deleting…"
        tone="danger"
        reason="none"
        onStale={onStale}
        onConfirm={() =>
          runSponsorAction({
            queryClient,
            path: base,
            method: "DELETE",
            success: `${sponsor.name} deleted.`,
          })
            .then(() => {
              onDeleted?.();
            })
            .catch(refetchOnStale)
        }
      />
    </>
  );
}

/**
 * What to say after `POST /activate` came back 2xx.
 *
 * THE PROBLEM THIS SOLVES, MEASURED RATHER THAN GUESSED
 * ───────────────────────────────────────────────────────────────────────────
 * Against the running API on 2026-09-02, activating a campaign whose end date
 * is in the past answers `201 Created` and returns the record with the derived
 * status `expired`; `GET /sponsors?placement=home` then contains nothing. The
 * console's previous answer to that was a green "Campaign activated." — the
 * operator was told the advertisement was live, by the only feedback the button
 * gives them, while no citizen could see it. A sponsor may have been invoiced
 * on the strength of that sentence.
 *
 * So the sentence is chosen from the RECORD THE SERVER RETURNED. Three of the
 * outcomes are genuinely fine and read as fine; two are not, and say so.
 *
 * NOTHING HERE RE-DERIVES A STATUS. `saved.status` was computed in SQL against
 * the database's clock (`apps/api/src/sponsors/sponsor-status.ts`), and this
 * function only picks prose for the answer it was handed — the same rule
 * `SponsorStatusBadge` follows. The one local judgement is about PLACEMENTS,
 * which is a fact about `apps/mobile`, not about status, and which the server
 * does not check at all.
 */
function activationOutcome(saved: AdminSponsor): SponsorActionOutcome {
  const endsAt = formatDate(saved.endDate);
  const startsAt = formatDate(saved.startDate);
  const { showsNowhere, undelivered } = placementDelivery(saved.placements);

  // Checked first: it is true regardless of what the window says, and it is the
  // failure the API has no guard for at all.
  if (showsNowhere) {
    return {
      tone: "warning",
      message: "Activated, but it shows on no screen.",
      description: `${undelivered.map(placementLabel).join(" and ")} ${
        undelivered.length === 1 ? "is" : "are"
      } not rendered by any screen in the app yet, so no citizen will see this campaign. Add a placement that is.`,
    };
  }

  switch (saved.status.key) {
    case "expired":
      return {
        tone: "warning",
        message: "Activated, but it isn't showing to anyone.",
        description: endsAt
          ? `Its end date (${endsAt}) has already passed, so it went straight to Expired. Change the end date to put it on screen.`
          : "Its campaign window has already closed, so it went straight to Expired. Change the end date to put it on screen.",
      };

    case "scheduled":
      return {
        message: "Campaign activated.",
        description: startsAt
          ? `It starts on ${startsAt} — nothing shows to citizens before then.`
          : "It starts on its booked date — nothing shows to citizens before then.",
      };

    case "active":
      return {
        message: "Campaign activated.",
        description: endsAt
          ? `It's showing in the app now, until ${endsAt}.`
          : "It's showing in the app now, with no end date.",
      };

    // Not reachable through `activate()` today. Reporting the API's own label
    // beats asserting a state it did not return.
    default:
      return { message: `Campaign activated — it now reads ${saved.status.label}.` };
  }
}

/**
 * Is this date already behind us?
 *
 * Note what this is NOT: a status. It answers a question about a DATE, and the
 * dialog phrases it as one ("its end date has already passed"), never as a
 * claim that the campaign is expired — that word belongs to the API, which
 * derives it in SQL against the database's clock. A browser comparison is fine
 * for warning about a date days in the past and would not be fine for deciding
 * what the badge says.
 */
function hasPassed(iso: string | null): boolean {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= Date.now();
}
