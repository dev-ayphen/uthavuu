// Turns provider signals into PASS / REVIEW / REJECT.
//
// THIS IS THE ONLY PLACE A VERDICT IS DECIDED. The provider reports what it saw;
// the mobile app reports nothing at all. Every rule lives here, is pure, and is
// tested against fabricated signal sets rather than against a live provider —
// which is what makes the policy reviewable without an AWS account.
//
// TWO PRINCIPLES THE RULES BELOW ENCODE:
//
//   1. Absence of evidence is not evidence of safety. Every failure to analyse —
//      timeout, throttle, misconfiguration, malformed response — produces REVIEW.
//      There is no path through this function where "we could not check" yields
//      PASS.
//
//   2. This app carries photographs of injuries. A moderation policy tuned for a
//      social feed rejects the exact images Uthavu exists to deliver. The gore
//      carve-out is not a loophole; it is the product requirement.
//
// WHAT THIS FUNCTION DOES NOT CLAIM. It never asserts an incident is genuine.
// Rekognition answers "is this image safe and roughly relevant"; nothing here,
// and nothing downstream, may present that as verification that an emergency
// really happened, or diagnose a medical condition.

import type {
  ModerationOutcome,
  ModerationUnavailableReason,
} from './image-moderation-provider.interface';
import {
  EMERGENCY_EXPECTED_LABELS,
  L1,
  L2,
  NON_PHOTOGRAPHIC_CONTENT_TYPES,
  moderationThresholds,
} from './moderation-thresholds';

export type Verdict = 'pass' | 'review' | 'reject';
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Machine-readable cause of a non-PASS verdict.
 *
 * Codes, never prose. The admin console renders its own wording and the mobile
 * app renders its own, in two languages — a sentence stored here would be a
 * third copy that drifts from both. Same discipline as libs-common's error codes.
 */
export type DecisionReason =
  | 'explicit-content'
  | 'hate-symbols'
  | 'unusable-quality'
  | 'partial-nudity'
  | 'swimwear-or-underwear'
  | 'graphic-violence'
  | 'visually-disturbing'
  | 'weapons'
  | 'drugs'
  | 'not-photographic'
  | 'category-mismatch'
  | 'duplicate-image'
  | 'verification-unavailable';

/**
 * The stored structured result.
 *
 * Deliberately a summary rather than the provider's raw response. The raw
 * payload can carry hundreds of labels and, through OCR-adjacent scene labels,
 * incidental detail about people in the photograph; persisting all of it would
 * be a privacy liability with no operational use. What a moderator needs is the
 * band each category landed in and the confidence that drove the verdict.
 */
export type VerificationSignals = {
  imageQuality: 'pass' | 'poor' | 'unknown';
  nudity: 'none' | 'partial' | 'explicit';
  sexualContent: 'none' | 'detected';
  violence: 'none' | 'low' | 'medium' | 'high';
  drugs: 'none' | 'possible';
  weapons: 'none' | 'possible';
  categoryRelevance: 'high' | 'low' | 'unchecked';
  /**
   * "Is this a photograph at all" — animated or illustrated media.
   * NOT manipulation or AI-generation detection: the provider offers none, and
   * naming this field for something it cannot measure would be a false claim.
   */
  notPhotographic: boolean;
  duplicate: boolean;
  /**
   * NULL when nothing analysed the photo.
   *
   * Not `medium`. A band is a MEASUREMENT, and there is no measurement for an
   * image no provider ever looked at — writing `medium` there made
   * `?risk=medium` in the moderation queue return unexamined photos alongside
   * genuinely mid-risk ones, and `list-report-photos.dto.ts` already documented
   * the intended behaviour ("Null risk (never analysed) matches none") while the
   * engine contradicted it.
   */
  overallRisk: RiskLevel | null;
  decision: Verdict;
};

export type VerificationDecision = {
  verdict: Verdict;
  /** Null when nothing analysed the photo — see VerificationSignals.overallRisk. */
  riskLevel: RiskLevel | null;
  reasons: DecisionReason[];
  signals: VerificationSignals;
  /** Present only when the verdict came from a failure to analyse. */
  unavailableReason: ModerationUnavailableReason | null;
};

export type DecisionInput = {
  outcome: ModerationOutcome;
  /**
   * Hamming distance to the closest previously-seen photo, or null when there is
   * no candidate. Computed by the caller against stored hashes.
   */
  duplicateDistance: number | null;
  /** Exact-hash match against an existing upload. Stronger than a near match. */
  exactDuplicate: boolean;
  /**
   * Scene labels the report's category expects, or null to skip the check.
   *
   * Null is the correct value for a broad category like Community Help, where
   * "does the picture match" has no meaningful answer and enforcing one would
   * hold legitimate reports.
   */
  expectedLabels: string[] | null;
};

/** Case-insensitive match on either the label or its parent. */
function labelConfidence(
  labels: { name: string; parentName: string | null; confidence: number }[],
  target: string,
): number {
  const wanted = target.toLowerCase();
  return labels
    .filter(
      (label) =>
        label.name.toLowerCase() === wanted ||
        label.parentName?.toLowerCase() === wanted,
    )
    .reduce((highest, label) => Math.max(highest, label.confidence), 0);
}

export function decideVerification(input: DecisionInput): VerificationDecision {
  const thresholds = moderationThresholds();

  // ── Nothing was analysed ──────────────────────────────────────────────────
  if (input.outcome.status === 'unavailable') {
    return {
      verdict: 'review',
      // Null, not 'medium'. Nothing measured this image, so it has no band.
      riskLevel: null,
      reasons: ['verification-unavailable'],
      unavailableReason: input.outcome.reason,
      signals: {
        imageQuality: 'unknown',
        nudity: 'none',
        sexualContent: 'none',
        violence: 'none',
        drugs: 'none',
        weapons: 'none',
        categoryRelevance: 'unchecked',
        notPhotographic: false,
        duplicate: input.exactDuplicate,
        overallRisk: null,
        decision: 'review',
      },
    };
  }

  const { analysis } = input.outcome;
  const { labels, contentTypes, sceneLabels, quality } = analysis;
  const at = (target: string) => labelConfidence(labels, target);

  const reasons: DecisionReason[] = [];
  const rejections: DecisionReason[] = [];

  // ── Rejections ────────────────────────────────────────────────────────────
  const explicit = at(L1.EXPLICIT);
  if (explicit >= thresholds.reject.explicit)
    rejections.push('explicit-content');

  const hate = at(L1.HATE_SYMBOLS);
  if (hate >= thresholds.reject.hateSymbols) rejections.push('hate-symbols');

  // Both axes must be bad. A dark photograph can still be sharp and readable,
  // and a soft one can still be bright enough to show what is wrong — refusing
  // on either alone would reject usable emergency photographs taken at night or
  // in a hurry, which is most of them.
  const unusable =
    quality !== null &&
    quality.sharpness < thresholds.reject.unusableQuality &&
    quality.brightness < thresholds.reject.unusableQuality;
  if (unusable) rejections.push('unusable-quality');

  // ── Reviews ───────────────────────────────────────────────────────────────
  const partialNudity = at(L1.NON_EXPLICIT_NUDITY);
  if (partialNudity >= thresholds.review.nonExplicitNudity) {
    reasons.push('partial-nudity');
  }

  const swimwear = at(L1.SWIMWEAR_OR_UNDERWEAR);
  if (swimwear >= thresholds.review.swimwearOrUnderwear) {
    reasons.push('swimwear-or-underwear');
  }

  // The emergency carve-out. Rekognition returns the whole ancestor chain, so
  // `Blood & Gore` at 95 also reports `Graphic Violence` at 95. Judging on the
  // parent alone would hold every injury photograph. So: find which children
  // actually fired, and if the only one is expected gore, raise the bar.
  const graphicViolence = at(L2.GRAPHIC_VIOLENCE);
  if (graphicViolence > 0) {
    const firedChildren = labels
      .filter(
        (label) =>
          label.parentName?.toLowerCase() === L2.GRAPHIC_VIOLENCE.toLowerCase(),
      )
      .map((label) => label.name);

    const onlyExpectedGore =
      firedChildren.length > 0 &&
      firedChildren.every((child) =>
        EMERGENCY_EXPECTED_LABELS.some(
          (expected) => expected.toLowerCase() === child.toLowerCase(),
        ),
      );

    const bar = onlyExpectedGore
      ? thresholds.review.graphicViolenceGoreOnly
      : thresholds.review.graphicViolence;

    if (graphicViolence >= bar) reasons.push('graphic-violence');
  }

  const disturbing = at(L1.VISUALLY_DISTURBING);
  if (disturbing >= thresholds.review.visuallyDisturbing) {
    reasons.push('visually-disturbing');
  }

  const weapons = at(L2.WEAPONS);
  if (weapons >= thresholds.review.weapons) reasons.push('weapons');

  const drugs = at(L1.DRUGS_AND_TOBACCO);
  if (drugs >= thresholds.review.drugs) reasons.push('drugs');

  const notPhotographic = contentTypes.some(
    (type) =>
      NON_PHOTOGRAPHIC_CONTENT_TYPES.some(
        (name) => name.toLowerCase() === type.name.toLowerCase(),
      ) && type.confidence >= thresholds.review.nonPhotographic,
  );
  if (notPhotographic) reasons.push('not-photographic');

  // Category relevance. Skipped entirely when the category declares no
  // expectations — see DecisionInput.expectedLabels.
  let categoryRelevance: VerificationSignals['categoryRelevance'] = 'unchecked';
  if (input.expectedLabels && input.expectedLabels.length > 0) {
    const expected = new Set(
      input.expectedLabels.map((label) => label.toLowerCase()),
    );
    // A label satisfies an expectation through its ancestors too: "Dog" matches
    // an expectation of "Animal" only because Parents carries it.
    const matched = sceneLabels.some(
      (label) =>
        label.confidence >= thresholds.review.sceneLabelConfidence &&
        (expected.has(label.name.toLowerCase()) ||
          label.parents.some((parent) => expected.has(parent.toLowerCase()))),
    );
    categoryRelevance = matched ? 'high' : 'low';
    if (!matched) reasons.push('category-mismatch');
  }

  const nearDuplicate =
    input.duplicateDistance !== null &&
    input.duplicateDistance <= thresholds.review.duplicateDistance;
  if (input.exactDuplicate || nearDuplicate) reasons.push('duplicate-image');

  // ── Verdict ───────────────────────────────────────────────────────────────
  const verdict: Verdict =
    rejections.length > 0 ? 'reject' : reasons.length > 0 ? 'review' : 'pass';

  const allReasons = [...rejections, ...reasons];
  const riskLevel: RiskLevel =
    verdict === 'reject' ? 'high' : verdict === 'review' ? 'medium' : 'low';

  const sexual = Math.max(at(L2.EXPLICIT_SEXUAL_ACTIVITY), explicit);

  return {
    verdict,
    riskLevel,
    reasons: allReasons,
    unavailableReason: null,
    signals: {
      imageQuality: quality === null ? 'unknown' : unusable ? 'poor' : 'pass',
      nudity:
        explicit >= thresholds.reject.explicit
          ? 'explicit'
          : partialNudity >= thresholds.review.nonExplicitNudity
            ? 'partial'
            : 'none',
      sexualContent: sexual >= thresholds.reject.explicit ? 'detected' : 'none',
      violence: violenceBand(
        graphicViolence,
        weapons,
        thresholds.review.weapons,
      ),
      drugs: drugs >= thresholds.review.drugs ? 'possible' : 'none',
      weapons: weapons >= thresholds.review.weapons ? 'possible' : 'none',
      categoryRelevance,
      notPhotographic,
      duplicate: input.exactDuplicate || nearDuplicate,
      overallRisk: riskLevel,
      decision: verdict,
    },
  };
}

/**
 * Coarse violence band for the stored signal summary.
 *
 * Reported independently of the verdict on purpose: a moderator looking at a
 * held photograph needs to know it scored `high` on violence even when the gore
 * carve-out is why it is in front of them rather than published.
 */
function violenceBand(
  graphicViolence: number,
  weapons: number,
  weaponsThreshold: number,
): VerificationSignals['violence'] {
  const highest = Math.max(
    graphicViolence,
    weapons >= weaponsThreshold ? weapons : 0,
  );
  if (highest === 0) return 'none';
  if (highest < 60) return 'low';
  if (highest < 85) return 'medium';
  return 'high';
}
