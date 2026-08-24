import { Controller, Get } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { SavedReportsService } from './saved-reports.service';

// A dedicated controller rather than adding a route to ReportsController —
// same reasoning alerts.controller.ts already gives for its own
// `@Controller('users/me/alerts')`: keeps this module's own files the only
// ones touched by saved-reports work.
@Controller('users/me/saved-reports')
export class SavedReportsController {
  constructor(private readonly savedReportsService: SavedReportsService) {}

  @Get()
  list(@Session() session: UserSession<typeof auth>) {
    return this.savedReportsService.list(session.user.id);
  }
}
