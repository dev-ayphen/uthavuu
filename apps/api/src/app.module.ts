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
import { auth } from './auth/auth';

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
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class AppModule {}
