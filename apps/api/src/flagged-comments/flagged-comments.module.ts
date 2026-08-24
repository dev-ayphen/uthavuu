import { Module } from '@nestjs/common';
import { CommentsModule } from '../comments/comments.module';
import { FlaggedCommentsController } from './flagged-comments.controller';
import { FlaggedCommentsService } from './flagged-comments.service';

@Module({
  imports: [CommentsModule],
  controllers: [FlaggedCommentsController],
  providers: [FlaggedCommentsService],
})
export class FlaggedCommentsModule {}
