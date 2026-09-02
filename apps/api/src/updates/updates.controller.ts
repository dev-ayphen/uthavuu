import { Controller, Get } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { UpdatesService } from './updates.service';

/**
 * The citizen feed of community announcements.
 *
 * Authenticated — the global AuthGuard from @thallesp/nestjs-better-auth covers
 * it with no decorator needed, and there is deliberately no @Public() here.
 * These are announcements to the community, not marketing copy for the open
 * internet, and the reader's identity is also what selects the language.
 *
 * No role branch, per ADR 0009: the admin surface is
 * AdminCommunityUpdatesController under /admin, and an admin calling this route
 * gets exactly what a citizen gets.
 */
@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get()
  list(@Session() session: UserSession<typeof auth>) {
    return this.updatesService.list(session.user.id);
  }
}
