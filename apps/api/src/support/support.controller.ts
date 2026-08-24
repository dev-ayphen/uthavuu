import { Body, Controller, Get, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Controller()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('support/tickets')
  create(@Session() session: UserSession<typeof auth>, @Body() body: CreateTicketDto) {
    return this.supportService.create(session.user.id, body);
  }

  @Get('users/me/tickets')
  listMine(@Session() session: UserSession<typeof auth>) {
    return this.supportService.listMine(session.user.id);
  }
}
