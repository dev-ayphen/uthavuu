import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { FlagCommentDto } from './dto/flag-comment.dto';

/**
 * Every `:id` here is parsed with ParseUUIDPipe. `reports.id` and
 * `report_comments.id` are real uuid columns, so a malformed id must fail as a
 * 400 at the edge — without it the raw string reaches Postgres and comes back
 * as error 22P02, which Nest surfaces as an unhandled 500. Same rule, same
 * reason, as the admin controllers (see admin-reports.controller.ts); user ids
 * are deliberately NOT parsed anywhere, because Better Auth's `user.id` is text.
 */
@Controller('reports/:id/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  list(@Param('id', ParseUUIDPipe) reportId: string) {
    return this.commentsService.list(reportId);
  }

  @Post()
  create(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) reportId: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.commentsService.create(reportId, session.user.id, body.body);
  }

  @Post(':commentId/flag')
  flag(
    @Session() session: UserSession<typeof auth>,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() body: FlagCommentDto,
  ) {
    return this.commentsService.flag(commentId, session.user.id, body.reason);
  }
}
