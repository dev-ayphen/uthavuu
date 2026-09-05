// Every number the decision engine uses, in one place, all overridable.
//
// WHY NOT INLINE CONSTANTS. A moderation threshold is a policy, not an
// implementation detail: the right value for "how confident must we be that this
// is gore before a human looks at it" is discovered in production, by watching
// what the queue fills up with. A number buried in a service is a number nobody
// changes, and the failure mode is silent — either a queue full of ordinary
// accident photographs, or prohibited content passing because the bar was set
// where a developer guessed rather than where the data landed.
//
// THE LABEL NAMES BELOW ARE REKOGNITION'S, VERBATIM. They come from the
// published moderation taxonomy (version 7, three levels) and are matched
// case-insensitively against `ModerationLabel.name` / `.parentName`. A typo here
// silently disables a rule, so the taxonomy names are declared once as consts
// and referenced, never re-typed at the point of use.

/** Reads an integer env var, falling back when unset, blank or not a number. */
function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  // NaN, Infinity and negatives all mean "somebody mis-set this". Falling back
  // to the documented default is safer than adopting a value that would disable
  // a rule outright — a threshold of NaN compares false against everything.
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * Rekognition L1 (top-level) categories this engine reasons about.
 *
 * Not the complete taxonomy — `Alcohol`, `Rude Gestures` and `Gambling` are
 * deliberately absent. None of them says anything about whether a photograph
 * belongs on an emergency-help feed, and a rule that routes a roadside beer
 * bottle to a moderator would waste the queue that real cases need.
 */
export const L1 = {
  EXPLICIT: 'Explicit',
  NON_EXPLICIT_NUDITY: 'Non-Explicit Nudity of Intimate parts and Kissing',
  SWIMWEAR_OR_UNDERWEAR: 'Swimwear or Underwear',
  VIOLENCE: 'Violence',
  VISUALLY_DISTURBING: 'Visually Disturbing',
  DRUGS_AND_TOBACCO: 'Drugs & Tobacco',
  HATE_SYMBOLS: 'Hate Symbols',
} as const;

/** Rekognition L2 labels the engine treats individually. */
export const L2 = {
  GRAPHIC_VIOLENCE: 'Graphic Violence',
  WEAPONS: 'Weapons',
  EXPLICIT_SEXUAL_ACTIVITY: 'Explicit Sexual Activity',
} as const;

/**
 * L3 labels that are EXPECTED in a genuine emergency report.
 *
 * This is the single most important constant in the file. Uthavu exists to carry
 * photographs of injured animals, road accidents and medical emergencies. A
 * generic moderation integration flags every one of them as graphic violence and
 * buries the product in a review queue on day one.
 *
 * WHY THIS LIST IS EXACTLY ONE LABEL. Rekognition returns the whole ancestor
 * chain, so a `Blood & Gore` detection at 95 also reports `Graphic Violence` at
 * 95 — meaning a naive "review if Graphic Violence is high" rule holds every
 * injury photograph the product exists to carry. The carve-out has to work on
 * WHICH children fired, not on the parent's confidence.
 *
 * `Physical Violence` (hitting, fighting, crowd violence) is deliberately NOT
 * here. Blood at an accident scene is expected; a fight is a thing a moderator
 * should genuinely look at.
 */
export const EMERGENCY_EXPECTED_LABELS: readonly string[] = ['Blood & Gore'];

/** Rekognition ContentTypes indicating the image is not a photograph. */
export const NON_PHOTOGRAPHIC_CONTENT_TYPES: readonly string[] = [
  'Animated',
  'Illustrated',
];

export type ModerationThresholds = {
  /** MinConfidence sent to the provider. Below this it returns nothing at all. */
  providerMinConfidence: number;

  reject: {
    explicit: number;
    hateSymbols: number;
    /** Both sharpness AND brightness must fall below this for "unusable". */
    unusableQuality: number;
  };

  review: {
    nonExplicitNudity: number;
    swimwearOrUnderwear: number;
    graphicViolence: number;
    /** Higher bar applied when the ONLY graphic-violence evidence is expected gore. */
    graphicViolenceGoreOnly: number;
    visuallyDisturbing: number;
    weapons: number;
    drugs: number;
    nonPhotographic: number;
    /** Confidence a scene label needs before it counts toward relevance. */
    sceneLabelConfidence: number;
    /** Max Hamming distance treated as a near-duplicate. */
    duplicateDistance: number;
  };

  /** Milliseconds before a provider call is abandoned. */
  timeoutMs: number;
};

/**
 * Reads the live threshold set.
 *
 * Deliberately a function, not a module-level constant: the tests need to vary
 * the environment, and a frozen-at-import object would make every case in
 * verification-decision.spec.ts depend on load order. Same reasoning as
 * `getPlatformConfig()` being uncached.
 */
export function moderationThresholds(): ModerationThresholds {
  return {
    // Rekognition's own default. Going lower floods the response with
    // low-confidence labels; going higher means the engine never sees the
    // borderline cases its REVIEW rules exist to catch.
    providerMinConfidence: envInt('AI_MODERATION_MIN_CONFIDENCE', 50),

    reject: {
      // High bar. A false REJECT here means a citizen with a real emergency is
      // told to take another photo, with no human in the loop to overrule it.
      explicit: envInt('MODERATION_REJECT_EXPLICIT', 80),
      hateSymbols: envInt('MODERATION_REJECT_HATE_SYMBOLS', 80),
      // Deliberately low. Rejecting a usable photo is far worse than accepting a
      // poor one — a volunteer can still act on a dim photograph, and the
      // reporter may be somewhere they cannot safely retake it.
      unusableQuality: envInt('MODERATION_REJECT_UNUSABLE_QUALITY', 12),
    },

    review: {
      nonExplicitNudity: envInt('MODERATION_REVIEW_NON_EXPLICIT_NUDITY', 60),
      // A water rescue is a real Uthavu case, so swimwear alone is weak
      // evidence and sits higher than partial nudity rather than lower.
      swimwearOrUnderwear: envInt('MODERATION_REVIEW_SWIMWEAR', 75),
      graphicViolence: envInt('MODERATION_REVIEW_GRAPHIC_VIOLENCE', 80),
      // The emergency carve-out, expressed as a number. When the only thing
      // Rekognition found under Graphic Violence is blood, the bar rises: an
      // injured animal at 85 publishes, something the model is near-certain is
      // gore at 92+ still gets a human. Set this to the same value as
      // `graphicViolence` to switch the carve-out off entirely.
      graphicViolenceGoreOnly: envInt(
        'MODERATION_REVIEW_GRAPHIC_VIOLENCE_GORE_ONLY',
        92,
      ),
      visuallyDisturbing: envInt('MODERATION_REVIEW_VISUALLY_DISTURBING', 70),
      // Signal only. A weapon in an emergency photograph does not make the
      // emergency less real, and this engine makes no criminal accusation.
      weapons: envInt('MODERATION_REVIEW_WEAPONS', 70),
      // Never a REJECT at any confidence: Rekognition's drug taxonomy bottoms
      // out at "Pills" and "Smoking", which cannot distinguish prescription
      // medication at an accident scene from anything illicit.
      drugs: envInt('MODERATION_REVIEW_DRUGS', 70),
      nonPhotographic: envInt('MODERATION_REVIEW_NON_PHOTOGRAPHIC', 80),
      sceneLabelConfidence: envInt('MODERATION_SCENE_LABEL_CONFIDENCE', 55),
      duplicateDistance: envInt('MODERATION_DUPLICATE_DISTANCE', 8),
    },

    // Two calls run in parallel, so this is the deadline for the slower one, not
    // their sum. Eight seconds is generous for Rekognition and still short
    // enough that a citizen reporting an emergency is not left waiting on it —
    // and a breach routes to REVIEW rather than failing the upload.
    timeoutMs: envInt('AI_MODERATION_TIMEOUT_MS', 8000),
  };
}
