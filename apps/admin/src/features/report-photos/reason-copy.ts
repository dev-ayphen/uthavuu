import type { BadgeProps } from "@/components/ui";
import type {
  PhotoDecision,
  PhotoDecisionReason,
  PhotoRiskLevel,
  PhotoStatusRef,
  PhotoUnavailableReason,
  ReportPhotoRow,
} from "./types";
import { photoStatusRef } from "./wire";

/**
 * This console's wording for the backend's decision codes.
 *
 * ==========================================================================
 * THE RULE THIS FILE EXISTS TO ENFORCE: render the codes the backend says
 * FIRED. Never re-derive a threshold, and never expand a code into the labels
 * it "implies".
 * ==========================================================================
 *
 * Rekognition returns the whole ancestor chain, so a `Blood & Gore` detection
 * at 95 also reports `Graphic Violence` at 95. The API's decision engine
 * (`verification-decision.ts`) already does the hard part — it looks at WHICH
 * children fired and applies a higher bar when the only one is expected gore,
 * which is the carve-out that keeps every injured-animal photograph out of the
 * queue. If this console re-implemented any of that, or padded the list with
 * parents the backend deliberately withheld, it would undo the carve-out on
 * screen and show moderators "graphic violence" on photos the engine cleared.
 *
 * So: `reasons` in, prose out. One code, one line. No inference.
 *
 * WHY A CODE THIS BUILD HAS NEVER SEEN IS STILL RENDERED
 * ───────────────────────────────────────────────────────────────────────────
 * `reasonLabel` echoes an unknown code rather than dropping it. A moderator
 * looking at a held photo needs to know the backend gave a reason it could not
 * name — `some-new-signal` is ugly and it is TRUE, whereas silently rendering
 * nothing would show a photo held for no visible cause, which is the one thing
 * a review queue must never do. Same posture as `placementLabel` in Sponsors.
 */

export type ReasonCopy = {
  label: string;
  /** One sentence for the operator. Why this fired, or what it does NOT mean. */
  detail: string;
  /**
   * `reject` reasons are refusals outright; `review` merely asks for a human.
   *
   * `not-a-finding` is neither, and it exists for exactly one code. A code that
   * says the check never RAN is not a statement about the photograph, so it must
   * not be tinted like one — an amber badge in a column headed "Triggered
   * labels" reads as "the model flagged this", which is the precise misreading
   * this whole feature is arranged to prevent.
   */
  severity: "reject" | "review" | "not-a-finding";
};

const REASON_COPY: Record<PhotoDecisionReason, ReasonCopy> = {
  "explicit-content": {
    label: "Explicit content",
    detail: "Sexual content well above the refusal bar. Refused without a human in the loop.",
    severity: "reject",
  },
  "hate-symbols": {
    label: "Hate symbols",
    detail: "A hate symbol was detected with high confidence.",
    severity: "reject",
  },
  "unusable-quality": {
    label: "Unusable photo",
    detail:
      "Too dark AND too soft to act on — both had to fail, because a dim photograph of a real emergency is still worth sending.",
    severity: "reject",
  },
  "partial-nudity": {
    label: "Partial nudity",
    detail: "Intimate parts or kissing detected. Held for a person to look at, not refused.",
    severity: "review",
  },
  "swimwear-or-underwear": {
    label: "Swimwear or underwear",
    detail:
      "Weak evidence on its own — a water rescue is a real Uthavu case — so it sits at a higher bar than partial nudity.",
    severity: "review",
  },
  "graphic-violence": {
    label: "Graphic violence",
    detail:
      "Above the bar even after the emergency carve-out. Blood at an accident scene is expected and passes lower; this cleared the higher one.",
    severity: "review",
  },
  "visually-disturbing": {
    label: "Visually disturbing",
    detail: "Distressing imagery outside the graphic-violence branch.",
    severity: "review",
  },
  weapons: {
    label: "Weapons",
    detail:
      "A signal, not an accusation. A weapon in an emergency photograph does not make the emergency less real.",
    severity: "review",
  },
  drugs: {
    label: "Drugs or tobacco",
    detail:
      "Never a refusal at any confidence: the taxonomy bottoms out at “Pills” and cannot tell prescription medicine at an accident scene from anything else.",
    severity: "review",
  },
  "not-photographic": {
    label: "Not a photograph",
    detail:
      "Animated or illustrated media. This is NOT an AI-generation or manipulation check — no such signal exists in the provider.",
    severity: "review",
  },
  "category-mismatch": {
    label: "Doesn’t match the category",
    detail:
      "Nothing in the scene matched what the chosen category expects. Broad categories skip this check entirely.",
    severity: "review",
  },
  "duplicate-image": {
    label: "Duplicate image",
    detail: "Identical or near-identical to a photo already uploaded.",
    severity: "review",
  },
  "verification-unavailable": {
    label: "Not checked",
    detail:
      "Nothing examined this photo — the provider never answered. It is held, not judged: “we couldn’t check” and “we checked and it’s fine” must never collapse into one outcome.",
    severity: "not-a-finding",
  },
};

/** Prose for a code, or the code itself when this build has not heard of it. */
export function reasonLabel(code: string): string {
  return REASON_COPY[code as PhotoDecisionReason]?.label ?? code;
}

/** Full copy for a code, or null when unknown — callers then show the raw code. */
export function reasonCopy(code: string): ReasonCopy | null {
  return REASON_COPY[code as PhotoDecisionReason] ?? null;
}

export function reasonTone(code: string): BadgeProps["tone"] {
  const copy = reasonCopy(code);
  if (!copy) return "neutral";
  if (copy.severity === "reject") return "danger";
  // Grey, not amber. `not-a-finding` marks a code that reports the CHECK's
  // state, not the photograph's, and a warning tint on it is read as a warning
  // about the image.
  if (copy.severity === "not-a-finding") return "neutral";
  return "warning";
}

/**
 * The codes that are genuinely findings about the photograph.
 *
 * `verification-unavailable` is filtered out here, and it is NOT being dropped:
 * it is promoted to its own surface (`automatedCheck` below), which says
 * strictly more than a badge in a list could — that nothing ran, and why. What
 * the rule in this file's header forbids is INVENTING labels the backend
 * withheld, or re-deriving a threshold. Routing one code away from a column
 * headed "Triggered labels", where it would read as a finding, to the block
 * that explains it properly is the opposite of that.
 *
 * Every other code, known or not, passes through untouched.
 */
export function triggeredReasons(reasons: readonly string[] | null | undefined): string[] {
  return (reasons ?? []).filter((code) => code !== "verification-unavailable");
}

/**
 * THE MACHINE'S VERDICT — never the moderator's.
 *
 * Deliberately worded so it cannot be mistaken for a human decision. "Approved"
 * is a thing a person does; the engine's `pass` is "cleared automatically", and
 * conflating the two is exactly how an admin ends up trusting a machine verdict
 * as if a colleague had signed it off.
 */
export function decisionCopy(decision: PhotoDecision | null): {
  label: string;
  tone: BadgeProps["tone"];
  detail: string;
} {
  switch (decision) {
    case "pass":
      return {
        label: "Cleared automatically",
        tone: "success",
        detail: "The engine found nothing above a threshold. No human looked at it.",
      };
    case "review":
      return {
        label: "Sent for review",
        tone: "warning",
        detail: "The engine held this photo for a person. It has made no judgement about it.",
      };
    case "reject":
      return {
        label: "Refused automatically",
        tone: "danger",
        detail: "The engine refused this photo outright. A moderator can still overrule it.",
      };
    default:
      return {
        label: "No verdict yet",
        tone: "neutral",
        detail: "The decision engine has not run against this photo.",
      };
  }
}

export function riskCopy(risk: PhotoRiskLevel | null): {
  label: string;
  tone: BadgeProps["tone"];
} {
  switch (risk) {
    case "low":
      return { label: "Low", tone: "success" };
    case "medium":
      return { label: "Medium", tone: "warning" };
    case "high":
      return { label: "High", tone: "danger" };
    default:
      return { label: "Not scored", tone: "neutral" };
  }
}

/** The lookup-table statuses seeded in `photo_verification_statuses`. */
export function verificationStatusTone(key: string | null): BadgeProps["tone"] {
  switch (key) {
    case "passed":
      return "success";
    case "review_required":
      return "warning";
    case "rejected":
      return "danger";
    // `failed` means the provider never answered. NEUTRAL, and it used to be
    // danger — red on a photograph is read as a judgement about the
    // photograph, and this is the one state where the model has made no
    // judgement at all. Grey is the honest colour for "no information", and it
    // still reads as plainly different from `review_required`'s amber, which is
    // the distinction an operator watching a queue fill up actually needs:
    // "the model is flagging things" versus "Rekognition is down".
    case "failed":
      return "neutral";
    case "verifying":
      return "info";
    default:
      return "neutral";
  }
}

/**
 * The badge for the "Review state" column and the detail header.
 *
 * ==========================================================================
 * ONE DELIBERATE EXCEPTION TO "THE API'S LABEL WINS".
 * ==========================================================================
 * Everywhere else in this console a lookup table's label comes from the API,
 * because the API owns it (see `wire.ts`). `failed` is overridden here, on
 * purpose, and it is worth being explicit about why:
 *
 *   the seeded label is "Verification failed", and the queue projects the bare
 *   key, so `humaniseKey` renders it "Failed". Both of those sit inches from a
 *   photograph of somebody's emergency, in a column about that photograph, and
 *   both read as "this photo failed" — a verdict. The truth is the opposite:
 *   nothing looked at it. The label names the SYSTEM's state, but the column
 *   frames it as the PHOTO's, and a moderator reads the frame.
 *
 * So the console words this one state for its own surface, exactly as it words
 * the decision codes for its own audience. Every other key still defers.
 */
export function photoStateCopy(
  status: PhotoStatusRef | null,
): { label: string; tone: BadgeProps["tone"] } | null {
  if (!status) return null;
  if (status.key === NEVER_CHECKED_STATUS) {
    return { label: "Not checked", tone: verificationStatusTone(status.key) };
  }
  return { label: status.label, tone: verificationStatusTone(status.key) };
}

/**
 * WHY THE CHECK DID NOT RUN — six causes, six sentences, none of them about the
 * photograph.
 *
 * ==========================================================================
 * NOT ONE OF THESE MAY READ AS A FINDING.
 * ==========================================================================
 * Every sentence here describes the PROVIDER or the FILE TRANSPORT. A moderator
 * skimming a held photo must never be able to take one of these for something
 * the model observed in the image, because the model observed nothing at all —
 * `rejected-image` in particular is about bytes the provider would not decode,
 * not about content it disliked, and is worded to say so out loud.
 *
 * They are also deliberately distinct from one another. "Rekognition is down"
 * and "nobody ever configured Rekognition" send an operator to two different
 * places, and collapsing them into one polite sentence wastes the only
 * diagnostic the API gives them.
 */
const UNAVAILABLE_COPY: Record<PhotoUnavailableReason, string> = {
  "not-configured":
    "No moderation provider is configured in this environment, so nothing was ever asked to look at this photograph.",
  timeout:
    "The provider was asked and did not answer inside the deadline, so the photograph went unexamined.",
  throttled:
    "The provider turned the request away over rate limits or quota, so the photograph went unexamined.",
  "rejected-image":
    "The provider would not accept the FILE — too large, or an encoding it cannot decode. That is a fact about the upload, not about what the photograph shows; the content was never examined.",
  "provider-error":
    "The call to the provider failed outright — an authentication, network or service fault. Nothing examined the photograph.",
  "invalid-response":
    "The provider replied in a shape the contract does not allow, so the reply was discarded unread. Nothing examined the photograph.",
};

/** Why nothing analysed this photo, or null when an analysis did run. */
export function unavailableCopy(reason: PhotoUnavailableReason | string | null): string | null {
  if (!reason) return null;
  return (
    UNAVAILABLE_COPY[reason as PhotoUnavailableReason] ??
    // Still not a finding, and still not silent. An unknown cause code is
    // shown verbatim so the operator can quote it at whoever owns the provider.
    `The check did not run, and the API gave a cause this console has no wording for: “${reason}”.`
  );
}

/**
 * What the console can honestly say about the provider behind a verdict.
 *
 * ==========================================================================
 * NOTHING IN THIS ENVIRONMENT HAS EVER BEEN VALIDATED AGAINST LIVE AWS.
 * ==========================================================================
 * No Rekognition credentials exist here. The integration is written and
 * unit-tested against fabricated signal sets, which is what makes the POLICY
 * reviewable without an AWS account — and is also exactly why "configured" and
 * "verified against a live service" are two different claims. This console
 * makes only the first, and says so on every photo. Rewriting this to read
 * "verified by Amazon Rekognition" would be the console asserting something
 * nobody has observed.
 */
export type ProviderState = {
  label: string;
  /** True when a provider was configured. NEVER means "validated". */
  configured: boolean;
  note: string;
};

export function providerState(provider: string | null): ProviderState {
  if (provider === "aws-rekognition") {
    return {
      label: "Amazon Rekognition",
      configured: true,
      note: "Configured, not verified: this integration has never been run against live AWS in this environment. Treat the verdict as a signal to check, not as a confirmed result.",
    };
  }

  if (provider === "unconfigured") {
    return {
      label: "No provider",
      configured: false,
      note: "No moderation credentials were configured, so nothing examined this photo. It is unexamined, not safe — which is why it is in this queue.",
    };
  }

  if (provider) {
    return {
      label: provider,
      configured: true,
      note: "A provider this console has no wording for. The verdict is shown exactly as the API recorded it.",
    };
  }

  return {
    label: "Not recorded",
    configured: false,
    note: "The API recorded no provider against this photo — it predates verification, or the decision engine never ran.",
  };
}

/** The standing caveat, shown wherever a machine verdict is presented. */
export const AI_CAVEAT =
  "This is an automated content check. It never asserts that an emergency is genuine, and it makes no medical judgement — it answers only “is this image safe, and roughly relevant”.";

/**
 * ==========================================================================
 * `failed` IS NOT `review_required`. THE MODEL HAS NO OPINION.
 * ==========================================================================
 * Both statuses put a photograph in front of a moderator, and they mean
 * opposite things:
 *
 *   review_required  the check RAN and something about the image needs a human.
 *                    There is a verdict, a risk band and a list of labels, and
 *                    every one of them is a measurement.
 *
 *   failed           the check NEVER RAN — timeout, throttle, or (the state of
 *                    every environment today, because no AWS credentials exist)
 *                    no provider configured at all. Nothing has examined this
 *                    image.
 *
 * ⚠️ THE TRAP THIS CODE EXISTS TO CLOSE. The decision engine still writes a row
 * for a `failed` upload, and that row is FULL of plausible values: verdict
 * `review`, risk `medium`, and a complete signal summary reading nudity "none",
 * violence "none", drugs "none", weapons "none"
 * (`apps/api/src/moderation/verification-decision.ts`, the `unavailable`
 * branch). Those are RESTING DEFAULTS, written so the photo would land in this
 * queue. Rendered as they stand they say "we looked and found nothing" — which
 * is the exact opposite of the truth, on the one screen where a moderator is
 * deciding whether to publish a stranger's emergency photograph. A moderator
 * reading "no signals detected" on a `failed` row takes it as reassurance; it
 * actually means nothing looked.
 *
 * So this is a discriminated union rather than a bag of optional fields: on the
 * `ran: false` branch there is no `decision` and no `risk` to reach for. The
 * rule "never show a risk band for a photo that was never checked" is enforced
 * by the type, not by remembering to write an `if` at four call sites.
 */

/** The `photo_verification_statuses` key recorded when the provider never answered. */
const NEVER_CHECKED_STATUS = "failed";

/** The narrowest photo any of this can be decided from — a queue row satisfies it. */
export type CheckedPhoto = {
  verificationStatus?: ReportPhotoRow["verificationStatus"];
  reasons?: readonly string[] | null;
  decision?: PhotoDecision | null;
  riskLevel?: PhotoRiskLevel | null;
  /** Detail only. The queue projection does not carry it — see `wasNeverChecked`. */
  unavailableReason?: PhotoUnavailableReason | string | null;
};

/**
 * Did anything examine this photograph?
 *
 * THREE SIGNALS, ANY OF WHICH IS SUFFICIENT — because the queue row and the
 * detail response carry different subsets of them. `unavailableReason` is on
 * the detail only; the row has the status key and the reason codes. Requiring
 * all three would make the row fall through to "checked", which is the failure
 * this function exists to prevent, so it is deliberately an OR.
 *
 * The API sets `failed` exactly when the decision carries an
 * `unavailableReason`, and emits `verification-unavailable` from exactly the
 * same branch, so in practice the three agree. They are all read anyway: a
 * disagreement must resolve towards "we cannot claim this was checked".
 */
export function wasNeverChecked(photo: CheckedPhoto): boolean {
  if (photo.unavailableReason) return true;
  if (photo.reasons?.includes("verification-unavailable")) return true;
  return photoStatusRef(photo.verificationStatus ?? null)?.key === NEVER_CHECKED_STATUS;
}

/**
 * What the console may honestly say about the automated check on one photo.
 *
 * The `ran: false` branch carries no verdict and no risk — see the banner
 * above. It carries a CAUSE instead, which is the thing an operator can
 * actually act on.
 */
export type AutomatedCheck =
  | {
      ran: true;
      decision: { label: string; tone: BadgeProps["tone"]; detail: string };
      risk: { label: string; tone: BadgeProps["tone"] };
      /** The codes the engine says fired. */
      reasons: string[];
    }
  | {
      ran: false;
      /** Badge text. Says what happened to the CHECK, never to the photo. */
      label: string;
      tone: BadgeProps["tone"];
      summary: string;
      /** Which of the six `unavailableReason`s, in prose. Never a finding. */
      cause: string;
      /** What a moderator does about it, since there is no signal to weigh. */
      guidance: string;
      /** Always the non-unavailable codes, so it is [] in every real case. */
      reasons: string[];
    };

export function automatedCheck(photo: CheckedPhoto): AutomatedCheck {
  if (wasNeverChecked(photo)) {
    return {
      ran: false,
      label: "Not checked",
      tone: "neutral",
      summary:
        "Nothing examined this photograph. There is no verdict and no risk score to read — it is in this queue because nobody has looked at it, not because anything was found.",
      cause:
        unavailableCopy(photo.unavailableReason ?? null) ??
        // The queue row carries no `unavailableReason` at all, so this is the
        // normal answer there — not an error. Saying "the queue doesn't carry
        // it" beats inventing a cause or leaving the sentence empty.
        "The queue doesn’t carry the cause; open the photo to see which failure the API recorded.",
      guidance:
        "Decide from the photograph itself. Nothing has been screened out ahead of you.",
      reasons: triggeredReasons(photo.reasons),
    };
  }

  return {
    ran: true,
    decision: decisionCopy(photo.decision ?? null),
    risk: riskCopy(photo.riskLevel ?? null),
    reasons: triggeredReasons(photo.reasons),
  };
}

/**
 * Why the stored signal bands are hidden for an unchecked photo.
 *
 * Shown in place of the bands, so their absence is a stated decision rather
 * than a gap the operator has to explain to themselves.
 */
export const UNCHECKED_SIGNALS_NOTE =
  "No signal summary is shown. The bands stored against this photo are the engine’s resting defaults — written so it would queue for a person — not readings taken from the photograph.";

/** How many of these rows were never examined. Drives the queue's standing note. */
export function countNeverChecked(rows: readonly CheckedPhoto[]): number {
  return rows.reduce((total, row) => total + (wasNeverChecked(row) ? 1 : 0), 0);
}
