import { Module } from '@nestjs/common';
import { IMAGE_MODERATION_PROVIDER } from './image-moderation-provider.interface';
import { createImageModerationProvider } from './moderation-provider.factory';
import { PhotoVerificationService } from './photo-verification.service';

// Mirrors PushModule's registration exactly, for the same reason: Nest
// instantiates an imported module's providers eagerly during
// NestFactory.create(), so the `useFactory` below runs at BOOT. That is what
// turns moderation-provider.factory.ts's production hard-block into a genuine
// startup failure rather than a first-upload failure.
//
// The distinction matters more here than it does for push. A misconfigured push
// fails on the first alert, which is noticeable. A misconfigured moderation
// provider does not fail at all — it quietly routes every photo to REVIEW, so
// the app keeps accepting reports and simply stops publishing them. Discovering
// that on the first upload after a deploy is bad; discovering it a week later
// from a moderator asking why the queue has four thousand items in it is worse.
//
// Whichever module ends up owning report-photo verification must IMPORT this
// one, not re-create the provider — two providers would mean two clients, two
// warning lines and, if the environment ever changed between them, two
// different answers about whether moderation is configured at all.
@Module({
  providers: [
    {
      provide: IMAGE_MODERATION_PROVIDER,
      useFactory: () => createImageModerationProvider(),
    },
    PhotoVerificationService,
  ],
  exports: [IMAGE_MODERATION_PROVIDER, PhotoVerificationService],
})
export class ModerationModule {}
