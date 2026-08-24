import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { MissionsModule } from '../missions/missions.module';
import { ImpactStoriesController } from './impact-stories.controller';
import { ImpactStoriesService } from './impact-stories.service';

@Module({
  imports: [ReportsModule, MissionsModule],
  controllers: [ImpactStoriesController],
  providers: [ImpactStoriesService],
})
export class ImpactStoriesModule {}
