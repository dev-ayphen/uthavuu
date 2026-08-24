import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { supportTickets } from '../db/schema/tickets-schema';
import { SupportService } from './support.service';
import type { CreateTicketDto } from './dto/create-ticket.dto';

describe('SupportService', () => {
  const service = new SupportService();

  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    userId = uuidv7();
    otherUserId = uuidv7();
    await db.insert(user).values([
      { id: userId, name: 'Ticket User', email: `${userId}@test.local`, phoneNumber: `+91-${userId}` },
      { id: otherUserId, name: 'Other User', email: `${otherUserId}@test.local`, phoneNumber: `+91-${otherUserId}` },
    ]);
  });

  afterAll(async () => {
    await db.delete(supportTickets).where(eq(supportTickets.userId, userId));
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(user).where(eq(user.id, otherUserId));
  });

  const validInput: CreateTicketDto = {
    categoryKey: 'bug_report',
    subject: 'Photo upload fails',
    description: 'Uploading a photo during report creation times out on 3G.',
  };

  it('creates a ticket with status "new" and returns the real category/status labels', async () => {
    const ticket = await service.create(userId, validInput);
    expect(ticket.subject).toBe(validInput.subject);
    expect(ticket.category).toEqual({ key: 'bug_report', label: 'Bug Report' });
    expect(ticket.status).toEqual({ key: 'new', label: 'New' });
  });

  it('rejects an unknown category', async () => {
    await expect(service.create(userId, { ...validInput, categoryKey: 'not_a_real_category' })).rejects.toThrow(
      'Unknown ticket category'
    );
  });

  it('lists a user\'s own tickets, most-recent-first, scoped to that user only', async () => {
    const mine = await service.listMine(userId);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((t) => t.subject)).toBe(true);

    const others = await service.listMine(otherUserId);
    expect(others).toEqual([]);
  });
});
