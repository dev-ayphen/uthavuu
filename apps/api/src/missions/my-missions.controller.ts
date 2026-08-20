import { Controller, Get } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { MissionsService } from './missions.service';

// Separate from MissionsController (@Controller('reports/:id')) since this
// route has no report id in its path — a fixed prefix on the same
// controller class would force every route to require one.
@Controller('users/me/missions')
export class MyMissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get()
  listMine(@Session() session: UserSession<typeof auth>) {
    return this.missionsService.listMyMissions(session.user.id);
  }
}
