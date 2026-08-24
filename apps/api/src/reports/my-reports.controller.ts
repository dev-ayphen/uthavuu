import { Controller, Get } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { ReportsService } from './reports.service';

// Separate from ReportsController (@Controller('reports')) for the same
// reason MyMissionsController is separate from MissionsController — this
// route has no report id in its path.
@Controller('users/me/reports')
export class MyReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  listMine(@Session() session: UserSession<typeof auth>) {
    return this.reportsService.listMine(session.user.id);
  }
}
