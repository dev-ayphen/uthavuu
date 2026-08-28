import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import type { AdminIdentity } from './admin-rbac';

/**
 * Platform -> Support. Gated on `platform:manage`, matching the rest of the
 * Platform section.
 *
 * Thin by design: no `db` import, no business logic.
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

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateTicketStatusDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.supportService.updateStatus(id, admin, body, meta);
  }
}
