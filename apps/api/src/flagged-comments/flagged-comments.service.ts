import { Injectable } from '@nestjs/common';
import { CommentsService } from '../comments/comments.service';

@Injectable()
export class FlaggedCommentsService {
  constructor(private readonly commentsService: CommentsService) {}

  list(userId: string) {
    return this.commentsService.listMyFlags(userId);
  }
}
