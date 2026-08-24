import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { SavedReportsController } from './saved-reports.controller';
import { SavedReportsService } from './saved-reports.service';

@Module({
  imports: [ReportsModule],
  controllers: [SavedReportsController],
  providers: [SavedReportsService],
})
export class SavedReportsModule {}
