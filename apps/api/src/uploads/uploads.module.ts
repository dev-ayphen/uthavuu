import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { ReportPhotoController } from './report-photo.controller';
import { UploadsController } from './uploads.controller';

// ModerationModule is IMPORTED rather than its provider re-created here. Two
// factories would mean two Rekognition clients, two "not configured" warnings,
// and — if the environment ever differed between them — two different answers
// about whether moderation is running at all.
@Module({
  imports: [ModerationModule],
  controllers: [UploadsController, ReportPhotoController],
})
export class UploadsModule {}
