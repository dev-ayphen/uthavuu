import { BadRequestException, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { supportTickets, ticketCategories, ticketStatuses } from '../db/schema/tickets-schema';
import type { CreateTicketDto } from './dto/create-ticket.dto';

@Injectable()
export class SupportService {
  async create(userId: string, dto: CreateTicketDto) {
    const [category] = await db
      .select()
      .from(ticketCategories)
      .where(eq(ticketCategories.key, dto.categoryKey));
    if (!category) throw new BadRequestException('Unknown ticket category');

    const [newStatus] = await db.select().from(ticketStatuses).where(eq(ticketStatuses.key, 'new'));

    const id = uuidv7();
    await db.insert(supportTickets).values({
      id,
      userId,
      categoryId: category.id,
      statusId: newStatus.id,
      subject: dto.subject,
      description: dto.description,
    });

    return this.findOne(id, userId);
  }

  async listMine(userId: string) {
    const rows = await db
      .select({
        id: supportTickets.id,
        subject: supportTickets.subject,
        description: supportTickets.description,
        createdAt: supportTickets.createdAt,
        categoryKey: ticketCategories.key,
        categoryLabel: ticketCategories.label,
        statusKey: ticketStatuses.key,
        statusLabel: ticketStatuses.label,
      })
      .from(supportTickets)
      .innerJoin(ticketCategories, eq(supportTickets.categoryId, ticketCategories.id))
      .innerJoin(ticketStatuses, eq(supportTickets.statusId, ticketStatuses.id))
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt));

    return rows.map((r) => this.toResponse(r));
  }

  private async findOne(id: string, userId: string) {
    const [row] = await db
      .select({
        id: supportTickets.id,
        subject: supportTickets.subject,
        description: supportTickets.description,
        createdAt: supportTickets.createdAt,
        categoryKey: ticketCategories.key,
        categoryLabel: ticketCategories.label,
        statusKey: ticketStatuses.key,
        statusLabel: ticketStatuses.label,
      })
      .from(supportTickets)
      .innerJoin(ticketCategories, eq(supportTickets.categoryId, ticketCategories.id))
      .innerJoin(ticketStatuses, eq(supportTickets.statusId, ticketStatuses.id))
      .where(eq(supportTickets.id, id));
    if (!row) throw new BadRequestException('Ticket not found');
    // userId is always the creator here (create() just inserted it), kept as
    // a param for symmetry with the rest of this codebase's findOne(id, userId) shape.
    void userId;
    return this.toResponse(row);
  }

  private toResponse(row: {
    id: string;
    subject: string;
    description: string;
    createdAt: Date;
    categoryKey: string;
    categoryLabel: string;
    statusKey: string;
    statusLabel: string;
  }) {
    return {
      id: row.id,
      subject: row.subject,
      description: row.description,
      createdAt: row.createdAt,
      category: { key: row.categoryKey, label: row.categoryLabel },
      status: { key: row.statusKey, label: row.statusLabel },
    };
  }
}
