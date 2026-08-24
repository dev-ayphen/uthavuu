import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReportsModule } from './reports/reports.module';
import { MissionsModule } from './missions/missions.module';
import { DevicesModule } from './devices/devices.module';
import { AlertsModule } from './alerts/alerts.module';
import { CommentsModule } from './comments/comments.module';
import { SavedReportsModule } from './saved-reports/saved-reports.module';
import { FlaggedCommentsModule } from './flagged-comments/flagged-comments.module';
import { ImpactStoriesModule } from './impact-stories/impact-stories.module';
import { DevModule } from './dev/dev.module';
import { auth } from './auth/auth';

// Mirrors auth.ts's own guard exactly — DevModule (the OTP-retrieval
// endpoint Maestro E2E flows use) only ever exists alongside the dev OTP
// fallback itself, never in production.
const hasMsg91Credentials = Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
const devOtpFallbackActive = !hasMsg91Credentials && process.env.NODE_ENV !== 'production';

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      bodyParser: {
        json: { limit: '2mb' },
        urlencoded: { limit: '2mb', extended: true },
      },
    }),
    RedisModule,
    UsersModule,
    UploadsModule,
    ReportsModule,
    MissionsModule,
    DevicesModule,
    AlertsModule,
    CommentsModule,
    SavedReportsModule,
    FlaggedCommentsModule,
    ImpactStoriesModule,
    ...(devOtpFallbackActive ? [DevModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class AppModule {}
