// Provider selection + the production hard-block, mirroring
// push-provider.factory.ts exactly (which in turn mirrors auth.ts and
// ADR 0007): real credentials always win, and booting without them while
// NODE_ENV=production is a fatal error rather than a silent degradation.
//
// WHY FATAL HERE. The push module's reasoning was "a silently no-op push in
// production is worse than a crash, because nobody is ever notified". The
// equivalent for moderation is worse still: without a provider every photo
// routes to REVIEW, which is *safe* but means the entire citizen-facing report
// flow quietly stops publishing and starts filling a queue no one may be
// watching. An operator would experience that as "the app is broken" with no
// error anywhere pointing at the cause. Refusing to boot names the cause.
//
// Note the failure direction is the opposite of push's. An unconfigured push
// silently under-protects (nothing is sent); an unconfigured moderation
// over-protects (nothing is published). Both are wrong in production, and both
// are caught here rather than discovered later.
//
// The environment is a PARAMETER with a process.env default, for the same reason
// push-provider.factory.ts does it: it makes the production block testable
// without jest.resetModules gymnastics.

import type { ImageModerationProvider } from './image-moderation-provider.interface';
import {
  RekognitionModerationProvider,
  hasRekognitionCredentials,
} from './rekognition-moderation.provider';
import { UnconfiguredModerationProvider } from './unconfigured-moderation.provider';

/** Provider keys this factory understands. */
const REKOGNITION = 'rekognition';

export function createImageModerationProvider(
  env: NodeJS.ProcessEnv = process.env,
): ImageModerationProvider {
  // An explicit `none` is a deliberate operator choice — "I know moderation is
  // off" — and is honoured outside production. It still does NOT approve
  // anything; it selects the provider that routes everything to a human.
  const requested = (env.AI_MODERATION_PROVIDER ?? '').trim().toLowerCase();
  const wantsRekognition = requested === REKOGNITION || requested === '';
  const available = wantsRekognition && hasRekognitionCredentials(env);

  if (!available && env.NODE_ENV === 'production') {
    throw new Error(
      'No image moderation provider is configured, and NODE_ENV=production. ' +
        'Every report photo would be held for manual review and none would ever ' +
        'publish automatically. Set AI_MODERATION_PROVIDER=rekognition and ' +
        'AWS_REGION (plus credentials, or an instance role) before deploying.',
    );
  }

  if (!available) return new UnconfiguredModerationProvider();

  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;

  return new RekognitionModerationProvider(
    env.AWS_REGION!,
    // Both or neither. Passing a half-filled credential object would override
    // the SDK's default chain with something unusable, turning a working
    // instance role into an auth failure — and it would look like bad
    // credentials rather than like a typo in one variable.
    accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
  );
}
