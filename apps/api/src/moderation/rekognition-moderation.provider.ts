// Amazon Rekognition, via two calls per photo.
//
// WHY TWO. DetectModerationLabels answers "is this prohibited" and nothing else
// — it has no concept of image quality and no idea what the picture is OF.
// DetectLabels with Features [GENERAL_LABELS, IMAGE_PROPERTIES] supplies both:
// real-world object labels for category relevance, and Sharpness / Brightness /
// Contrast for the unusable-photo check. They are independent, so they run
// concurrently and the deadline applies to the pair rather than their sum.
//
// VERIFIED AGAINST THE PUBLISHED API REFERENCE, not recalled:
//   - Image.Bytes accepts raw bytes; no S3 bucket is required.
//   - PNG and JPEG only. Callers must have magic-byte checked already.
//   - Raw bytes cap 5 MB; min dimension 80 px; max 10,000 px.
//   - MinConfidence defaults to 50 for moderation, 55 for labels.
//   - Response carries ModerationLabels[{Name,ParentName,TaxonomyLevel,
//     Confidence}], ContentTypes[], ModerationModelVersion, and for DetectLabels
//     Labels[{Name,Confidence,Parents,Categories}] plus ImageProperties.Quality.
//
// ⚠️ WHAT REKOGNITION CANNOT DO, so that nothing downstream claims otherwise:
// it has NO manipulation or AI-generated-image detection. ContentTypes flags
// animated and illustrated media, which is a useful "this is not a photograph"
// signal and is NOT synthetic-image detection. AWS also states plainly that the
// API does not detect illegal content such as CSAM.

import {
  DetectLabelsCommand,
  DetectModerationLabelsCommand,
  ImageTooLargeException,
  InvalidImageFormatException,
  ProvisionedThroughputExceededException,
  RekognitionClient,
  ThrottlingException,
} from '@aws-sdk/client-rekognition';
import type {
  ImageModerationProvider,
  ModerationAnalysis,
  ModerationOutcome,
  ModerationRequest,
  ModerationUnavailableReason,
} from './image-moderation-provider.interface';
import { moderationThresholds } from './moderation-thresholds';

export class RekognitionModerationProvider implements ImageModerationProvider {
  readonly name = 'aws-rekognition';
  readonly configured = true;

  private readonly client: RekognitionClient;

  constructor(
    region: string,
    credentials?: { accessKeyId: string; secretAccessKey: string },
  ) {
    // Credentials are optional on purpose. Passing them explicitly supports a
    // plain key pair in .env; omitting them lets the SDK's default provider
    // chain find an instance role or a shared profile, which is how this should
    // actually run in production. Baking the key pair in as mandatory would make
    // the better deployment shape impossible.
    this.client = new RekognitionClient({
      region,
      ...(credentials ? { credentials } : {}),
    });
  }

  async analyzeImage(request: ModerationRequest): Promise<ModerationOutcome> {
    const thresholds = moderationThresholds();
    const image = { Bytes: request.bytes };

    // One deadline covering both calls. AbortSignal.timeout is the SDK's
    // supported cancellation path, so a breach aborts the HTTP request rather
    // than leaving it running while we stop waiting for it.
    const abort = AbortSignal.timeout(thresholds.timeoutMs);

    try {
      const [moderation, labels] = await Promise.all([
        this.client.send(
          new DetectModerationLabelsCommand({
            Image: image,
            MinConfidence: thresholds.providerMinConfidence,
          }),
          { abortSignal: abort },
        ),
        this.client.send(
          new DetectLabelsCommand({
            Image: image,
            Features: ['GENERAL_LABELS', 'IMAGE_PROPERTIES'],
            MinConfidence: thresholds.review.sceneLabelConfidence,
          }),
          { abortSignal: abort },
        ),
      ]);

      const quality = labels.ImageProperties?.Quality;

      const analysis: ModerationAnalysis = {
        labels: (moderation.ModerationLabels ?? []).flatMap((label) =>
          // A label with no name or no confidence is not something the contract
          // permits; dropping it beats propagating an undefined into a
          // numeric comparison, where it would silently never match.
          label.Name && typeof label.Confidence === 'number'
            ? [
                {
                  name: label.Name,
                  parentName: label.ParentName || null,
                  taxonomyLevel: label.TaxonomyLevel ?? null,
                  confidence: label.Confidence,
                },
              ]
            : [],
        ),
        contentTypes: (moderation.ContentTypes ?? []).flatMap((type) =>
          type.Name && typeof type.Confidence === 'number'
            ? [{ name: type.Name, confidence: type.Confidence }]
            : [],
        ),
        sceneLabels: (labels.Labels ?? []).flatMap((label) =>
          label.Name && typeof label.Confidence === 'number'
            ? [
                {
                  name: label.Name,
                  confidence: label.Confidence,
                  // Parents and Categories both widen a specific label into
                  // something an expectation can match: "Dog" satisfies
                  // "Animal" only because Parents carries it.
                  parents: [
                    ...(label.Parents ?? []),
                    ...(label.Categories ?? []),
                  ].flatMap((parent) => (parent.Name ? [parent.Name] : [])),
                },
              ]
            : [],
        ),
        quality:
          quality &&
          typeof quality.Brightness === 'number' &&
          typeof quality.Sharpness === 'number' &&
          typeof quality.Contrast === 'number'
            ? {
                brightness: quality.Brightness,
                sharpness: quality.Sharpness,
                contrast: quality.Contrast,
              }
            : null,
        moderationModelVersion: moderation.ModerationModelVersion ?? null,
        labelModelVersion: labels.LabelModelVersion ?? null,
      };

      return { status: 'analysed', analysis };
    } catch (error) {
      const reason = classifyFailure(error);
      // The reason, never the error. A provider error can carry request ids and
      // fragments of the payload, and this line goes wherever logs are
      // aggregated. The photo id is the caller's to log.
      console.warn(`[moderation] Rekognition call failed (${reason}).`);
      return { status: 'unavailable', reason };
    }
  }
}

/**
 * Maps a thrown error to the reason the decision engine reasons about.
 *
 * The distinction that matters is permanent versus transient. `rejected-image`
 * means this photo will never analyse and retrying is pointless; `throttled` and
 * `timeout` mean the same photo would likely succeed later. Both still route to
 * REVIEW — nothing here is allowed to approve — but only one of them is worth a
 * retry, and conflating them would either retry forever or never.
 */
function classifyFailure(error: unknown): ModerationUnavailableReason {
  if (
    error instanceof ImageTooLargeException ||
    error instanceof InvalidImageFormatException
  ) {
    return 'rejected-image';
  }
  if (
    error instanceof ThrottlingException ||
    error instanceof ProvisionedThroughputExceededException
  ) {
    return 'throttled';
  }
  // AbortSignal.timeout rejects with a TimeoutError DOMException; the SDK may
  // also surface its own AbortError. Matched by name because neither is an
  // instanceof anything importable here.
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return 'timeout';
    }
  }
  return 'provider-error';
}

/** True when enough configuration exists to construct a real client. */
export function hasRekognitionCredentials(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // A region is the one genuinely non-optional value: the SDK's default chain
  // can supply credentials from an instance role, but it cannot guess which
  // region to call.
  return Boolean(env.AWS_REGION);
}
