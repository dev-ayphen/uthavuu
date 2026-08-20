import { Controller, Get, Patch } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { AlertsService } from './alerts.service';

// A dedicated controller rather than adding routes to UsersController —
// keeps this module's own files the only ones touched by alerts work.
@Controller('users/me/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  list(@Session() session: UserSession<typeof auth>) {
    return this.alertsService.list(session.user.id);
  }

  @Patch('read')
  markAllRead(@Session() session: UserSession<typeof auth>) {
    return this.alertsService.markAllRead(session.user.id);
  }
}
