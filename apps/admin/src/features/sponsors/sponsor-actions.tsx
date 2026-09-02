"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatDate } from "@/components/data";
import { Button } from "@/components/ui";
import { invalidateAll } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";

import { SPONSOR_KEYS, runSponsorAction } from "./api";
import { creativeUrlApplies } from "./creative";
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
            {endsAt ? ` until ${endsAt}` : ", with no end date"}.
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
          </>
        }
        confirmLabel="Activate campaign"
        pendingLabel="Activating…"
        reason="none"
        onStale={onStale}
        onConfirm={run(`${base}/activate`, "POST", "Campaign activated.")}
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
