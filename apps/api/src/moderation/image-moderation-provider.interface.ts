// The analysis seam for image content moderation.
//
// Two implementations sit behind it — RekognitionModerationProvider (real) and
// UnconfiguredModerationProvider (reports that it cannot analyse anything) —
// chosen by credential presence in moderation-provider.factory.ts. That is the
// pattern ADR 0007 established for OTP and push/ carried forward: build the real
// thing, keep an honest stand-in for credentials that do not exist yet, and
// hard-block the stand-in in production so it can never silently reach a citizen.
//
// ⚠️ A PROVIDER NEVER DECIDES ANYTHING. It reports what it observed, or reports
// that it could not observe. PASS / REVIEW / REJECT is computed downstream in
// verification-decision.ts, from signals plus configured thresholds. Keeping the
// judgement out of the provider is what makes a second vendor a drop-in rather
// than a rewrite, and it is what stops "the provider was unreachable" from ever
// being mistaken for "the provider found nothing wrong".
//
// ⚠️ A PROVIDER NEVER THROWS. Same load-bearing property as PushService: an
// unreachable moderation API must not surface to a citizen as a 500 while they
// are reporting an emergency. Every failure comes back as an `unavailable`
// outcome carrying the reason, and the decision engine routes those to a human.

import type { ReportPhotoFormat } from '../uploads/report-photo-limits';

/**
 * One detected moderation label, in the provider's own vocabulary.
 *
 * Deliberately NOT normalised into some cross-vendor enum. Rekognition's
 * taxonomy is hierarchical and specific ("Explicit" → "Explicit Nudity" →
 * "Exposed Female Nipple"), and flattening it into a generic `nudity: high`
 * would throw away exactly the granularity the thresholds need — in particular
 * the ability to treat `Blood & Gore` differently from the `Graphic Violence`
 * branch it sits under, which is the difference between accepting and refusing a
 * photograph of an injured animal.
 */
export type ModerationLabel = {
  /** Provider label name, verbatim. e.g. "Graphic Violence". */
  name: string;
  /** Immediate parent in the taxonomy, or null at the top level. */
  parentName: string | null;
  /** 1, 2 or 3 for Rekognition. Null if the provider has no hierarchy. */
  taxonomyLevel: number | null;
  /** 0–100. */
  confidence: number;
};

/**
 * "This is a cartoon / a drawing", not "this is AI-generated".
 *
 * Rekognition returns ContentTypes covering *animated* and *illustrated* media.
 * It has NO synthetic-image or manipulation detection of any kind. This field is
 * the closest honest signal available and is used for exactly one thing: noticing
 * that a supposed emergency photograph is not a photograph. It must never be
 * surfaced or stored as an AI-generation verdict.
 */
export type ContentTypeSignal = {
  name: string;
  confidence: number;
};

/** Whole-image quality, 0–100 each. Drives the "unusable photo" rejection. */
export type ImageQualitySignal = {
  brightness: number;
  sharpness: number;
  contrast: number;
};

/** A general object/scene label, used only for category relevance. */
export type SceneLabel = {
  name: string;
  confidence: number;
  /** Ancestors and categories, so "Dog" can satisfy an expectation of "Animal". */
  parents: string[];
};

export type ModerationAnalysis = {
  labels: ModerationLabel[];
  contentTypes: ContentTypeSignal[];
  sceneLabels: SceneLabel[];
  /** Null when the provider returned no quality block. */
  quality: ImageQualitySignal | null;
  /** Model versions, kept for auditability — a verdict is only interpretable against them. */
  moderationModelVersion: string | null;
  labelModelVersion: string | null;
};

/**
 * Why an analysis could not be produced.
 *
 * Every one of these routes to REVIEW rather than PASS. That is the whole point
 * of enumerating them: "we could not check" and "we checked and it is fine" must
 * never collapse into the same outcome, which is precisely the silent-bypass
 * failure the product decision forbids.
 */
export type ModerationUnavailableReason =
  /** No credentials configured. The photo has not been examined by anything. */
  | 'not-configured'
  /** The call exceeded the configured deadline. */
  | 'timeout'
  /** Rate limited or over quota. */
  | 'throttled'
  /** The provider refused the image itself — too large, or not a format it reads. */
  | 'rejected-image'
  /** Any other provider-side failure, including auth and network. */
  | 'provider-error'
  /** A 200 whose body did not have the shape the contract promises. */
  | 'invalid-response';

export type ModerationOutcome =
  | { status: 'analysed'; analysis: ModerationAnalysis }
  | { status: 'unavailable'; reason: ModerationUnavailableReason };

export type ModerationRequest = {
  bytes: Buffer;
  /** Already magic-byte verified upstream; passed so a provider can label the payload. */
  format: ReportPhotoFormat;
};

export interface ImageModerationProvider {
  /** Identifies which implementation is live, for logs, audit rows and tests. */
  readonly name: string;

  /**
   * True when this provider can actually reach a moderation service.
   *
   * Exists so callers can distinguish "moderation is switched off in this
   * environment" from "moderation ran" without inspecting environment variables
   * themselves, and so the API can report configuration state honestly.
   */
  readonly configured: boolean;

  /** Best-effort by contract. Never throws; failures come back as `unavailable`. */
  analyzeImage(request: ModerationRequest): Promise<ModerationOutcome>;
}

/** DI token — see moderation.module.ts. */
export const IMAGE_MODERATION_PROVIDER = 'IMAGE_MODERATION_PROVIDER';
