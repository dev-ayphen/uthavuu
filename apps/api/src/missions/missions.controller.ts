import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { MissionsService } from './missions.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CompleteMissionDto } from './dto/complete-mission.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';

/**
 * Every `:id` here is parsed with ParseUUIDPipe. `reports.id` and
 * `report_comments.id` are real uuid columns, so a malformed id must fail as a
 * 400 at the edge — without it the raw string reaches Postgres and comes back
 * as error 22P02, which Nest surfaces as an unhandled 500. Same rule, same
 * reason, as the admin controllers (see admin-reports.controller.ts); user ids
 * are deliberately NOT parsed anywhere, because Better Auth's `user.id` is text.
 */
@Controller('reports/:id')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Post('volunteers')
  accept(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.missionsService.accept(id, session.user.id);
  }

  @Patch('volunteers/me')
  confirm(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.missionsService.confirm(id, session.user.id);
  }

  @Delete('volunteers/me')
  leave(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.missionsService.leave(id, session.user.id);
  }

  @Patch('volunteers/me/progress')
  updateProgress(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProgressDto,
  ) {
    return this.missionsService.updateProgress(
      id,
      session.user.id,
      body.status,
    );
  }

  @Post('complete')
  complete(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteMissionDto,
  ) {
    return this.missionsService.complete(
      id,
      session.user.id,
      body.photoUrl,
      body.note,
    );
  }

  @Get('volunteers')
  roster(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.missionsService.getRoster(id, session.user.id);
  }

  @Get('messages')
  messages(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.missionsService.listMessages(id, session.user.id);
  }

  @Post('messages')
  send(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.missionsService.sendMessage(id, session.user.id, body.body);
  }
}
