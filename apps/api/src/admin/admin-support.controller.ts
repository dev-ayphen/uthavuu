import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { RequestMeta } from './admin-request-meta';
import type { AdminRequestMeta } from './admin-request-meta';
import { AdminSupportService } from './admin-support.service';
import { ListSupportTicketsDto } from './dto/list-support-tickets.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { CreateTicketReplyDto } from './dto/create-ticket-reply.dto';
import { CloseSupportTicketDto } from './dto/close-support-ticket.dto';
import type { AdminIdentity } from './admin-rbac';

/**
 * Platform -> Support. Gated on `platform:manage`, matching the rest of the
 * Platform section — read and write share the gate, so there is no "can look but
 * not touch" state for the console to render.
 *
 * Thin by design: no `db` import, no business logic. Note in particular that no
 * route here takes an actor id from the request — `@CurrentAdmin()` is populated
 * only by AdminGuard, so the identity written into every audit row and onto
 * every staff reply is one the guard resolved from a verified session.
 */
@Controller('admin/support-tickets')
@AdminOnly()
@RequireAdminPermissions('platform:manage')
export class AdminSupportController {
  constructor(private readonly supportService: AdminSupportService) {}

  @Get()
  list(@Query() query: ListSupportTicketsDto) {
    return this.supportService.list(query);
  }

  // Declared before ':id' — otherwise 'catalogue' matches as an id. ParseUUIDPipe
  // would reject it anyway, but with a 400 explaining nothing useful.
  @Get('catalogue')
  catalogue() {
    return this.supportService.catalogue();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.findOne(id);
  }

  /** status / priority / assignee / category, in any combination. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateSupportTicketDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.supportService.update(id, admin, body, meta);
  }

  /**
   * The status-only route this controller shipped with. Kept — ADR 0012 records
   * it by name and a client may still be calling it — and implemented as a thin
   * delegation to PATCH :id rather than as a second write path.
   */
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateTicketStatusDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.supportService.updateStatus(id, admin, body, meta);
  }

  /** A reply to the citizen, or an internal note — `isInternalNote` decides. */
  @Post(':id/messages')
  addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: CreateTicketReplyDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.supportService.addMessage(id, admin, body, meta);
  }

  /** "We believe this is fixed" — the citizen may still reply, and that reopens it. */
  @Post(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: CloseSupportTicketDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.supportService.resolve(id, admin, body, meta);
  }

  /** "This conversation is over" — no further messages from either side. */
  @Post(':id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: CloseSupportTicketDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.supportService.close(id, admin, body, meta);
  }
}
