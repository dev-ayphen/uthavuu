import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { MyReportsController } from './my-reports.controller';
import { ReportsService } from './reports.service';
import { MissionsModule } from '../missions/missions.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [MissionsModule, AlertsModule],
  controllers: [ReportsController, MyReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
