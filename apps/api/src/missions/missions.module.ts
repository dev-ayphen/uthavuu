import { Module } from '@nestjs/common';
import { MissionsController } from './missions.controller';
import { MyMissionsController } from './my-missions.controller';
import { MissionsService } from './missions.service';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AlertsModule],
  controllers: [MissionsController, MyMissionsController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}
