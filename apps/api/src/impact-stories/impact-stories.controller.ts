import { Controller, Get } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { ImpactStoriesService } from './impact-stories.service';

@Controller('users/me/impact-stories')
export class ImpactStoriesController {
  constructor(private readonly impactStoriesService: ImpactStoriesService) {}

  @Get()
  list(@Session() session: UserSession<typeof auth>) {
    return this.impactStoriesService.list(session.user.id);
  }
}
