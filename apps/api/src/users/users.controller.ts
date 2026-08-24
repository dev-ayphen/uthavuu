import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { UsersService } from './users.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { UpdateRadiusDto } from './dto/update-radius.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Auth guard is registered globally by @thallesp/nestjs-better-auth — these
  // routes are authenticated by default, no decorator needed to require it.
  @Get('me')
  async getMe(@Session() session: UserSession<typeof auth>) {
    return session.user;
  }

  @Patch('me')
  async completeProfile(
    @Session() session: UserSession<typeof auth>,
    @Body() body: CompleteProfileDto
  ) {
    return this.usersService.completeProfile(session.user.id, body);
  }

  @Patch('me/radius')
  async updateRadius(@Session() session: UserSession<typeof auth>, @Body() body: UpdateRadiusDto) {
    return this.usersService.updateRadius(session.user.id, body);
  }

  @Patch('me/locale')
  async updateLocale(@Session() session: UserSession<typeof auth>, @Body() body: UpdateLocaleDto) {
    return this.usersService.updateLocale(session.user.id, body);
  }

  @Get('me/stats')
  async getStats(@Session() session: UserSession<typeof auth>) {
    return this.usersService.getStats(session.user.id);
  }

  @Get('me/invite')
  async getInvite(@Session() session: UserSession<typeof auth>) {
    return this.usersService.getOrCreateInvite(session.user.id);
  }
}
