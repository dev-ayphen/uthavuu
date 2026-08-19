import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { MissionsService } from './missions.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('reports/:id')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Post('volunteers')
  accept(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.accept(id, session.user.id);
  }

  @Patch('volunteers/me')
  confirm(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.confirm(id, session.user.id);
  }

  @Delete('volunteers/me')
  leave(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.leave(id, session.user.id);
  }

  @Get('volunteers')
  roster(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.getRoster(id, session.user.id);
  }

  @Get('messages')
  messages(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.listMessages(id, session.user.id);
  }

  @Post('messages')
  send(
    @Session() session: UserSession<typeof auth>,
    @Param('id') id: string,
    @Body() body: SendMessageDto
  ) {
    return this.missionsService.sendMessage(id, session.user.id, body.body);
  }
}
