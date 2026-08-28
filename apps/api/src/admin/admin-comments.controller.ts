import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { RequestMeta } from './admin-request-meta';
import type { AdminRequestMeta } from './admin-request-meta';
import type { AdminIdentity } from './admin-rbac';
import { AdminCommentsService } from './admin-comments.service';
import { ListAdminCommentsDto } from './dto/list-admin-comments.dto';
import { ListFlaggedCommentsDto } from './dto/list-flagged-comments.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { ResolveFlagDto } from './dto/resolve-flag.dto';

/**
 * Reports -> Comments and Reports -> Flagged Comments.
 *
 * One @AdminOnly() on the class, so every route below is gated by construction
 * (ADR 0009). Every route additionally requires `comments:manage`, which both
 * roles hold — the permission is declared anyway so that revoking it from
 * ops_admin in the database actually takes moderation away, without a redeploy.
 */
@Controller('admin')
@AdminOnly()
export class AdminCommentsController {
  constructor(private readonly commentsService: AdminCommentsService) {}

  /** GET /admin/comments — the cross-report moderation table. */
  @Get('comments')
  @RequireAdminPermissions('comments:manage')
  list(@Query() query: ListAdminCommentsDto) {
    return this.commentsService.list(query);
  }

  /** GET /admin/flagged-comments — the review queue; pending-only by default. */
  @Get('flagged-comments')
  @RequireAdminPermissions('comments:manage')
  listFlags(@Query() query: ListFlaggedCommentsDto) {
    return this.commentsService.listFlags(query);
  }

  /** POST /admin/comments/:id/remove — soft-delete, reason required. */
  @Post('comments/:id/remove')
  @RequireAdminPermissions('comments:manage')
  remove(
    @CurrentAdmin() admin: AdminIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerateCommentDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.commentsService.removeComment(admin, id, body, meta);
  }

  /** POST /admin/comments/:id/restore — undo a removal. */
  @Post('comments/:id/restore')
  @RequireAdminPermissions('comments:manage')
  restore(
    @CurrentAdmin() admin: AdminIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerateCommentDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.commentsService.restoreComment(admin, id, body, meta);
  }

  /** PATCH /admin/flagged-comments/:id — move a flag through its lifecycle. */
  @Patch('flagged-comments/:id')
  @RequireAdminPermissions('comments:manage')
  resolveFlag(
    @CurrentAdmin() admin: AdminIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveFlagDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.commentsService.resolveFlag(admin, id, body, meta);
  }
}
