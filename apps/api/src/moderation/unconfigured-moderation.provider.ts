// The provider that runs when no moderation credentials exist.
//
// IT DOES NOT APPROVE ANYTHING. This is the entire reason the class exists, and
// it is worth being blunt about, because the tempting shape here — "no provider
// configured, so let the photo through" — is the exact silent bypass the product
// decision forbids. A photo that nothing has examined is not a safe photo; it is
// an unexamined one, and the two must never produce the same outcome.
//
// So this returns `unavailable: not-configured`, the decision engine routes that
// to REVIEW, and every photo lands in the moderator queue until real credentials
// are supplied. That is deliberately inconvenient: an operator running without
// credentials should feel it immediately, in the queue, rather than discover
// months later that moderation was never running at all.
//
// Contrast with DevConsolePushProvider, which logs what it *would* have sent.
// There is no equivalent useful stand-in here — there is nothing to print, and
// fabricating a plausible-looking analysis would be worse than useless.

import type {
  ImageModerationProvider,
  ModerationOutcome,
} from './image-moderation-provider.interface';

export class UnconfiguredModerationProvider implements ImageModerationProvider {
  readonly name = 'unconfigured';
  readonly configured = false;

  private warned = false;

  analyzeImage(): Promise<ModerationOutcome> {
    // Once per process, not per upload: this is a standing configuration state,
    // and a line per photo would bury the logs of whatever else is happening
    // while telling the operator nothing new after the first time.
    if (!this.warned) {
      this.warned = true;
      console.warn(
        '[moderation] No image moderation provider is configured. Every report ' +
          'photo will be routed to the admin review queue and NONE will be ' +
          'automatically approved. Set AI_MODERATION_PROVIDER and its ' +
          'credentials to enable real verification.',
      );
    }

    return Promise.resolve({
      status: 'unavailable',
      reason: 'not-configured',
    });
  }
}
