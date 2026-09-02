import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateTicketMessageDto } from './dto/create-ticket-message.dto';

/**
 * The citizen half of Help & Support.
 *
 * EVERY ROUTE HERE IS SCOPED TO THE CALLER'S OWN TICKETS, and the scoping is not
 * in this file. The controller passes `session.user.id` into the service, and the
 * service puts it in the WHERE clause (SupportService.ownedTicket) — there is no
 * route that takes a user id from the request, so there is nothing to forge.
 *
 * Thin by design: no `db` import, no business logic, and in particular no status
 * argument anywhere. The backend owns status (support/ticket-status.ts).
 */
@Controller()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  /**
   * The `categoryId` options for the POST below. Follows `GET /reports/categories`,
   * the convention this API already uses for exposing a lookup table.
   */
  @Get('support/categories')
  listCategories() {
    return this.supportService.listCategories();
  }

  @Post('support/tickets')
  create(@Session() session: UserSession<typeof auth>, @Body() body: CreateTicketDto) {
    return this.supportService.create(session.user.id, body);
  }

  @Get('users/me/tickets')
  listMine(@Session() session: UserSession<typeof auth>) {
    return this.supportService.listMine(session.user.id);
  }

  // Declared after 'support/categories' so the literal path is never eaten by a
  // parameter. ParseUUIDPipe would reject 'categories' anyway; the ordering means
  // the caller gets the categories rather than a 400 explaining why they cannot.
  @Get('support/tickets/:id')
  findOne(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportService.findOne(id, session.user.id);
  }

  @Post('support/tickets/:id/messages')
  addMessage(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateTicketMessageDto,
  ) {
    return this.supportService.addMessage(id, session.user.id, body);
  }
}
