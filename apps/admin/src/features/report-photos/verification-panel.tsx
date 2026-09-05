"use client";

import { ChevronRight, Cpu, Info, ScanLine, UserCheck } from "lucide-react";

import { DetailSection, formatDate } from "@/components/data";
import { Alert, Badge, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  AI_CAVEAT,
  automatedCheck,
  providerState,
  reasonCopy,
  reasonLabel,
  reasonTone,
  UNCHECKED_SIGNALS_NOTE,
  type AutomatedCheck,
} from "./reason-copy";
import type { PhotoSignals, ReportPhotoDetail } from "./types";

/**
 * What the machine decided, and — kept visibly apart from it — what a person
 * decided.
 *
 * ==========================================================================
 * THE TWO VERDICTS ARE NEVER SHOWN AS ONE.
 * ==========================================================================
 * `photo_uploads` stores the engine's `decision` and the moderator's
 * `reviewedBy`/`reviewedAt`/`reviewReason` in separate columns, deliberately,
 * so that "the model said review, a human approved it" stays legible — writing
 * the human answer over `decision` would erase why the photo was ever queued.
 * This panel keeps that separation on screen: two headed blocks, two different
 * icons, and wording that cannot be confused ("Cleared automatically" is not
 * "Approved"). An admin who reads a machine verdict as a colleague's sign-off
 * has been misled by the UI, not by the data.
 *
 * NO RAW JSON. The collapsible below renders the stored signal summary as named
 * bands with plain-English values. Dumping `signals` as JSON would look precise
 * and be unreadable — and it would invite an operator to reason about numbers
 * this console has deliberately not been given. The API stores bands, not the
 * provider's raw response, for privacy reasons it states in its own schema.
 *
 * NOTHING HERE RE-DERIVES A THRESHOLD. Every label comes from `reasons`, which
 * is what the backend says actually fired.
 *
 * ==========================================================================
 * AND A PHOTO NOTHING EXAMINED GETS NO VERDICT BLOCK AT ALL.
 * ==========================================================================
 * When the provider never answered, the API still stored a full-looking row:
 * verdict `review`, risk `medium`, and a signal summary reading nudity "none",
 * violence "none", drugs "none", weapons "none". Every one of those is a
 * RESTING DEFAULT written so the photo would queue — not a reading. Rendered
 * as-is, this panel would tell a moderator "medium risk, no signals detected"
 * about an image nothing has ever looked at, which is worse than telling them
 * nothing: it is reassurance manufactured out of placeholder values.
 *
 * So the `ran: false` branch of `automatedCheck` replaces the verdict, the risk
 * badge and the whole signal-bands disclosure with what is actually true —
 * that nothing ran, which failure the API recorded, and that the decision is
 * theirs unaided. The bands are not collapsed or greyed out; they are absent,
 * and their absence is explained.
 */
export function VerificationPanel({ photo }: { photo: ReportPhotoDetail }) {
  const check = automatedCheck(photo);
  const reviewed = photo.reviewedAt !== null || photo.reviewedBy !== null;

  return (
    <DetailSection
      title="Verification"
      description="The automated check and the human decision, kept separate because they are different things."
    >
      <div className="space-y-3">
        {/* ── The machine ─────────────────────────────────────────────── */}
        <Card>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm font-bold text-fg">
                {check.ran ? (
                  <Cpu aria-hidden className="size-4 text-fg-faint" />
                ) : (
                  <ScanLine aria-hidden className="size-4 text-fg-faint" />
                )}
                Automated check
              </span>

              {check.ran ? (
                <>
                  <Badge tone={check.decision.tone}>{check.decision.label}</Badge>
                  <Badge tone={check.risk.tone}>Risk: {check.risk.label}</Badge>
                </>
              ) : (
                // No risk badge. There is no risk band on this branch of the
                // union precisely so that one cannot be printed here.
                <Badge tone={check.tone}>{check.label}</Badge>
              )}
            </div>

            {check.ran ? (
              <AnalysedBody check={check} />
            ) : (
              <UncheckedBody check={check} />
            )}

            <ProviderLine photo={photo} />

            {check.ran ? (
              <Alert tone="neutral" size="sm" icon={Info} dashed announce={false}>
                {AI_CAVEAT}
              </Alert>
            ) : null}
          </div>
        </Card>

        {/* ── The human ───────────────────────────────────────────────── */}
        <Card>
          <div className="space-y-2 p-4">
            <span className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <UserCheck aria-hidden className="size-4 text-fg-faint" />
              Moderator decision
            </span>

            {reviewed ? (
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <div>
                  <dt className="micro-label">Decided by</dt>
                  <dd className="mt-0.5 text-fg">
                    {photo.reviewedBy?.name ?? "Account since deleted"}
                  </dd>
                </div>
                <div>
                  <dt className="micro-label">Decided at</dt>
                  <dd className="tabular mt-0.5 text-fg">
                    {formatDate(photo.reviewedAt, true) ?? "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="micro-label">Reason given</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-fg">
                    {photo.reviewReason ?? (
                      <span className="text-fg-faint">
                        No note was written. Approval takes an optional reason.
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-fg-subtle">
                Nobody has decided about this photo yet.{" "}
                {check.ran
                  ? "Whatever the automated check said above, it is not an approval — the report stays held until a moderator acts."
                  : "Nothing has examined it either, so there is no machine opinion to agree or disagree with — the report stays held until a moderator acts."}
              </p>
            )}
          </div>
        </Card>

        {/* ⚠️ NOT rendered when nothing examined the photo. The stored bands
            for an unchecked upload read nudity "none", violence "none", drugs
            "none", weapons "none" — resting defaults from the decision engine's
            `unavailable` branch, not readings. Showing them greyed out or
            collapsed would still put "no signals detected" on screen. */}
        {check.ran ? (
          <SignalDetails signals={photo.signals} />
        ) : (
          <p className="text-[11px] text-fg-faint">{UNCHECKED_SIGNALS_NOTE}</p>
        )}
      </div>
    </DetailSection>
  );
}

/** What the engine found, when it actually ran. */
function AnalysedBody({ check }: { check: Extract<AutomatedCheck, { ran: true }> }) {
  return (
    <>
      <p className="text-xs text-fg-subtle">{check.decision.detail}</p>

      <div>
        <p className="micro-label mb-1.5 text-fg-muted">Triggered labels</p>
        {check.reasons.length === 0 ? (
          <p className="text-xs text-fg-faint">
            Nothing fired. The engine found no signal above a threshold.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {check.reasons.map((reason) => {
              const copy = reasonCopy(reason);
              return (
                <li key={reason} className="flex flex-wrap items-start gap-2">
                  <Badge tone={reasonTone(reason)} className="mt-0.5 shrink-0">
                    {reasonLabel(reason)}
                  </Badge>
                  <span className="min-w-0 flex-1 text-[11px] text-fg-faint">
                    {/* An unrecognised code still shows: a photo held for a
                        cause the console cannot name is far better than a photo
                        held for no visible cause at all. */}
                    {copy?.detail ??
                      "A reason code this build has no wording for. It is shown exactly as the API recorded it."}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * What is true when nothing examined the photograph.
 *
 * Three sentences and no verdict: what happened, why, and what the moderator
 * does about it. There is no "Triggered labels" heading here at all — an empty
 * list under that heading reads as "the engine checked and found none", which
 * is the exact false reassurance this branch exists to remove.
 */
function UncheckedBody({ check }: { check: Extract<AutomatedCheck, { ran: false }> }) {
  return (
    <>
      <Alert tone="warning" icon={ScanLine} title="Verification did not run">
        {check.summary}
      </Alert>

      <dl className="space-y-2">
        <div>
          <dt className="micro-label">Why it did not run</dt>
          <dd className="mt-0.5 text-xs text-fg-subtle">{check.cause}</dd>
        </div>
        <div>
          <dt className="micro-label">What that means for you</dt>
          <dd className="mt-0.5 text-xs text-fg-subtle">{check.guidance}</dd>
        </div>
      </dl>
    </>
  );
}

/**
 * Which provider produced the verdict, and the standing caveat about it.
 *
 * "Configured" is the only claim this console can make. There are no
 * Rekognition credentials in this environment and the integration has never
 * been exercised against live AWS — it is unit-tested against fabricated signal
 * sets, which is what makes the POLICY reviewable without an AWS account and is
 * exactly why "configured" and "verified" are two different words here.
 */
function ProviderLine({ photo }: { photo: ReportPhotoDetail }) {
  const provider = providerState(photo.provider);
  const versions = [photo.moderationModelVersion, photo.labelModelVersion].filter(Boolean);

  return (
    <div className="rounded-control border border-border bg-surface-inset px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="micro-label text-fg-muted">Provider</span>
        <span className="text-xs font-semibold text-fg">{provider.label}</span>
        <Badge tone={provider.configured ? "info" : "neutral"}>
          {provider.configured ? "Configured, not verified" : "Not configured"}
        </Badge>
      </div>
      <p className="mt-1 text-[11px] text-fg-faint">{provider.note}</p>
      {versions.length > 0 ? (
        <p className="mt-1 text-[11px] text-fg-faint">
          {/* A verdict is only interpretable against the model that produced it,
              which is why the API stores these at all. */}
          Model versions:{" "}
          <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px] text-fg-muted">
            {versions.join(" / ")}
          </code>
        </p>
      ) : null}
    </div>
  );
}

/** One band of the stored signal summary: a label, a value, and what it means. */
type Band = { label: string; value: string; tone: "flag" | "quiet"; note?: string };

/**
 * The stored signals as named bands.
 *
 * `<details>` rather than a state-driven disclosure: it is one element, it is
 * keyboard-operable and announced correctly with no work, and it costs no
 * client state on a page that already has plenty.
 *
 * ONLY EVER CALLED FOR A PHOTO THE CHECK ACTUALLY RAN ON — see the call site.
 * Every band here is presented as a measurement, and for an unchecked upload
 * none of them is one.
 */
function SignalDetails({ signals }: { signals: PhotoSignals | null }) {
  if (!signals) {
    return (
      <p className="text-[11px] text-fg-faint">
        No signal summary was recorded against this photo — it predates verification, or the
        decision engine never ran.
      </p>
    );
  }

  const bands = describeSignals(signals);

  return (
    <details className="group rounded-card border border-border bg-surface">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-fg",
          "rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-fg-faint transition-transform group-open:rotate-90"
        />
        AI verification details
        <span className="ml-auto text-[11px] font-normal text-fg-faint">
          {bands.filter((band) => band.tone === "flag").length} of {bands.length} bands raised
        </span>
      </summary>

      <div className="border-t border-border p-4">
        <p className="mb-3 text-[11px] text-fg-faint">
          The bands the API stored, not the provider’s raw response — it keeps a summary on
          purpose, because the full payload carries hundreds of labels and incidental detail about
          the people in the photograph.
        </p>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {bands.map((band) => (
            <div key={band.label} className="min-w-0">
              <dt className="micro-label">{band.label}</dt>
              <dd
                className={cn(
                  "mt-0.5 text-xs font-semibold",
                  band.tone === "flag" ? "text-warning-fg" : "text-fg-subtle",
                )}
              >
                {band.value}
              </dd>
              {band.note ? (
                <p className="mt-0.5 text-[11px] text-fg-faint">{band.note}</p>
              ) : null}
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

/**
 * Turn the stored bands into readable rows.
 *
 * `tone: "flag"` marks a band that is anything other than its resting value —
 * it is a READING of what was stored, never a re-application of a threshold.
 * The thresholds live in the API and are the only place a verdict is decided.
 */
function describeSignals(signals: PhotoSignals): Band[] {
  const bands: Band[] = [];
  const add = (label: string, value: string | undefined, quiet: string[], note?: string) => {
    bands.push({
      label,
      value: value === undefined ? "Not recorded" : humanise(value),
      tone: value !== undefined && !quiet.includes(value) ? "flag" : "quiet",
      note,
    });
  };

  add("Image quality", signals.imageQuality, ["pass"], "Refused only when dark AND soft.");
  add("Nudity", signals.nudity, ["none"]);
  add("Sexual content", signals.sexualContent, ["none"]);
  add("Violence", signals.violence, ["none", "low"], "Reported even when the gore carve-out let the photo through.");
  add("Drugs", signals.drugs, ["none"], "Never a refusal at any confidence.");
  add("Weapons", signals.weapons, ["none"], "A signal, not an accusation.");
  add("Category relevance", signals.categoryRelevance, ["high", "unchecked"], "Broad categories skip this check.");

  bands.push({
    label: "Photographic",
    value:
      signals.notPhotographic === undefined
        ? "Not recorded"
        : signals.notPhotographic
          ? "Animated or illustrated"
          : "Looks like a photograph",
    tone: signals.notPhotographic ? "flag" : "quiet",
    note: "Not an AI-generation check — the provider has no such signal.",
  });

  bands.push({
    label: "Duplicate",
    value:
      signals.duplicate === undefined
        ? "Not recorded"
        : signals.duplicate
          ? "Matches an earlier upload"
          : "No match",
    tone: signals.duplicate ? "flag" : "quiet",
  });

  add("Overall risk", signals.overallRisk, ["low"]);

  return bands;
}

function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
