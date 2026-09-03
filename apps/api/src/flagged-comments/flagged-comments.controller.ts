import { Controller, Get } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { FlaggedCommentsService } from './flagged-comments.service';

// A dedicated controller rather than adding a route to CommentsController —
// same reasoning alerts.controller.ts and saved-reports.controller.ts
// already give for their own `users/me/*` routes: keeps this module's own
// files the only ones touched by "comments I've flagged" work.
@Controller('users/me/flagged-comments')
export class FlaggedCommentsController {
  constructor(
    private readonly flaggedCommentsService: FlaggedCommentsService,
  ) {}

  @Get()
  list(@Session() session: UserSession<typeof auth>) {
    return this.flaggedCommentsService.list(session.user.id);
  }
}
