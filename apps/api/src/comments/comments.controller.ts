import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { FlagCommentDto } from './dto/flag-comment.dto';

@Controller('reports/:id/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  list(@Param('id') reportId: string) {
    return this.commentsService.list(reportId);
  }

  @Post()
  create(
    @Session() session: UserSession<typeof auth>,
    @Param('id') reportId: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.commentsService.create(reportId, session.user.id, body.body);
  }

  @Post(':commentId/flag')
  flag(
    @Session() session: UserSession<typeof auth>,
    @Param('commentId') commentId: string,
    @Body() body: FlagCommentDto,
  ) {
    return this.commentsService.flag(commentId, session.user.id, body.reason);
  }
}
