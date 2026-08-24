import { Injectable } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class SavedReportsService {
  constructor(private readonly reportsService: ReportsService) {}

  list(userId: string) {
    return this.reportsService.listSaved(userId);
  }
}
