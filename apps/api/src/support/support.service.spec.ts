import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_support_test';
  // max: 3 — this suite is deliberately a small consumer of connections. Several
  // sessions run Jest against this Postgres at once (COORDINATION.md), and
  // postgres.js's default pool of 10 per suite is what turns that into "sorry,
  // too many clients already" — a failure that looks like a broken test and is
  // not one. Three is more than the two this suite ever holds concurrently.
  return {
    db: drizzleModule.drizzle(postgresModule(url.toString(), { max: 3 })),
  };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import {
  supportTicketMessages,
  supportTickets,
  ticketMessageSenderTypes,
  ticketStatuses,
} from '../db/schema/tickets-schema';
import {
  createSpecDatabase,
  seedLookups,
  type SeededLookups,
} from '../admin/testing/admin-spec-db';
import { SupportService } from './support.service';

const DATABASE = 'uthavu_support_test';

/**
 * The citizen half of Help & Support.
 *
 * Its own database, rebuilt from migration 0000 on every run — the same pattern
 * the admin specs use, and for a reason that matters more here than usual: the
 * five-state `ticket_statuses` and the `ticket_priorities` lookup only exist
 * because migration 0023 created them, so a suite that ran against a
 * hand-evolved dev database would prove nothing about whether the migration
 * series actually produces them.
 *
 * The two tests that would matter most if this file were deleted are
 * "another user's ticket is a 404" and "an internal note is not in the payload".
 * Both are written to fail loudly rather than subtly.
 */
describe('SupportService', () => {
  const service = new SupportService();

  const ownerId = uuidv7();
  const strangerId = uuidv7();
  const staffId = uuidv7();
  let lookups: SeededLookups;
  let reportId: string;

  type TicketInput = Parameters<SupportService['create']>[1];

  const fileTicket = (overrides: Partial<TicketInput> = {}) =>
    service.create(ownerId, {
      categoryKey: 'bug_report',
      subject: 'Photo upload fails',
      description: 'Uploading a photo during report creation times out on 3G.',
      ...overrides,
    });

  /** Writes a message straight to the table, bypassing every service rule. */
  const insertMessage = async (
    ticketId: string,
    senderTypeKey: 'user' | 'admin',
    body: string,
    isInternalNote = false,
  ) => {
    const [senderType] = await db
      .select({ id: ticketMessageSenderTypes.id })
      .from(ticketMessageSenderTypes)
      .where(eq(ticketMessageSenderTypes.key, senderTypeKey));

    await db.insert(supportTicketMessages).values({
      id: uuidv7(),
      ticketId,
      senderTypeId: senderType.id,
      senderUserId: senderTypeKey === 'admin' ? staffId : ownerId,
      body,
      isInternalNote,
    });
  };

  const setStatus = async (ticketId: string, statusKey: string) => {
    const [status] = await db
      .select({ id: ticketStatuses.id })
      .from(ticketStatuses)
      .where(eq(ticketStatuses.key, statusKey));
    await db
      .update(supportTickets)
      .set({ statusId: status.id })
      .where(eq(supportTickets.id, ticketId));
  };

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      { id: ownerId, name: 'Hari', email: `${ownerId}@test.local` },
      { id: strangerId, name: 'Priya', email: `${strangerId}@test.local` },
      { id: staffId, name: 'Meena Support', email: `${staffId}@test.local` },
    ]);

    reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId: ownerId,
      categoryId: lookups.categoryIds.medicalHelp,
      statusId: lookups.reportStatusIds.open,
      title: 'Ambulance needed',
      description: 'Roadside collision near the bus stand.',
      lat: 13.08,
      lng: 80.27,
      expiryAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  });

  afterAll(async () => {
    await db.$client.end();
  });

  afterEach(async () => {
    await db.delete(supportTickets);
  });

  describe('create', () => {
    it('opens the ticket as `open` with a UT- number and the default priority', async () => {
      const ticket = await fileTicket();

      expect(ticket.status).toEqual({ key: 'open', label: 'Open' });
      expect(ticket.priority).toEqual({ key: 'normal', label: 'Normal' });
      // Allocated by the database's sequence default, not by this service.
      expect(ticket.ticketNumber).toMatch(/^UT-\d+$/);
      expect(ticket.category.key).toBe('bug_report');
      expect(ticket.canReply).toBe(true);
      expect(ticket.messages).toEqual([]);
    });

    it('gives consecutive tickets different numbers', async () => {
      const first = await fileTicket();
      const second = await fileTicket({ subject: 'Second' });
      expect(first.ticketNumber).not.toBe(second.ticketNumber);
    });

    it('accepts categoryId as well as categoryKey — the mobile client sends the id', async () => {
      const ticket = await fileTicket({
        categoryKey: undefined,
        categoryId: lookups.ticketCategoryIds.complaint,
      });
      expect(ticket.category.key).toBe('complaint');
      expect(ticket.category.id).toBe(lookups.ticketCategoryIds.complaint);
    });

    it('rejects an unknown category', async () => {
      await expect(
        fileTicket({ categoryKey: 'not_a_real_category' }),
      ).rejects.toThrow('Unknown ticket category');
    });

    it('stores a relatedReportId when the report is real and visible', async () => {
      const ticket = await fileTicket({ relatedReportId: reportId });
      expect(ticket.relatedReportId).toBe(reportId);
    });

    /**
     * Without this check a ticket would be a way to assert the existence of any
     * uuid, and — worse — to hold a reference to a report a moderator has
     * removed. It reuses the reports module's own gate rather than a second
     * copy of the rule.
     */
    it('refuses a relatedReportId that does not exist', async () => {
      await expect(fileTicket({ relatedReportId: uuidv7() })).rejects.toThrow(
        /not found/i,
      );
    });

    it('refuses a relatedReportId whose report has been removed', async () => {
      await db
        .update(reports)
        .set({ deletedAt: new Date() })
        .where(eq(reports.id, reportId));

      await expect(fileTicket({ relatedReportId: reportId })).rejects.toThrow(
        /removed/i,
      );

      await db
        .update(reports)
        .set({ deletedAt: null })
        .where(eq(reports.id, reportId));
    });
  });

  describe('ownership — the worst failure this module could have', () => {
    it('lists only the caller’s own tickets', async () => {
      await fileTicket();
      expect((await service.listMine(ownerId)).length).toBe(1);
      expect(await service.listMine(strangerId)).toEqual([]);
    });

    it('404s — not 403s — when a stranger reads someone else’s ticket', async () => {
      const ticket = await fileTicket();

      await expect(
        service.findOne(ticket.id, strangerId),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: 'TICKET_NOT_FOUND' },
      });
    });

    it('404s when a stranger replies to someone else’s ticket, and writes nothing', async () => {
      const ticket = await fileTicket();

      await expect(
        service.addMessage(ticket.id, strangerId, { body: 'let me in' }),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: 'TICKET_NOT_FOUND' },
      });

      // The refusal has to happen BEFORE the write, not after it.
      const messages = await db.select().from(supportTicketMessages);
      expect(messages).toEqual([]);
    });

    it('gives the same 404 for a ticket id that never existed, so ids are not enumerable', async () => {
      await expect(service.findOne(uuidv7(), ownerId)).rejects.toMatchObject({
        status: 404,
        response: { code: 'TICKET_NOT_FOUND' },
      });
    });
  });

  describe('internal notes never reach the citizen', () => {
    it('omits an internal note from the whole serialised payload', async () => {
      const ticket = await fileTicket();
      const NOTE =
        'INTERNAL: this user has filed six of these, watch for abuse';
      await insertMessage(ticket.id, 'admin', 'We are looking into it.');
      await insertMessage(ticket.id, 'admin', NOTE, true);

      const detail = await service.findOne(ticket.id, ownerId);

      // Serialise the WHOLE payload and assert the text is not in it — the same
      // discipline ADR 0010's Mission Chat assertion uses. Checking
      // `messages.length` would pass even if the note leaked through some other
      // field.
      expect(JSON.stringify(detail)).not.toContain('INTERNAL');
      expect(JSON.stringify(detail)).not.toContain(NOTE);
      expect(detail.messages.map((m) => m.body)).toEqual([
        'We are looking into it.',
      ]);
      // And the count the client renders excludes it too, or the UI would show
      // "3 messages" over a list of two.
      expect(detail.messageCount).toBe(1);
    });

    it('excludes internal notes from the list’s message count as well', async () => {
      const ticket = await fileTicket();
      await insertMessage(ticket.id, 'admin', 'Visible reply');
      await insertMessage(ticket.id, 'admin', 'Hidden note', true);

      const [listed] = await service.listMine(ownerId);
      expect(listed.messageCount).toBe(1);
    });

    it('never names the member of staff who replied', async () => {
      const ticket = await fileTicket();
      await insertMessage(ticket.id, 'admin', 'We are looking into it.');

      const detail = await service.findOne(ticket.id, ownerId);
      const reply = detail.messages[0];

      expect(reply.senderType).toBe('admin');
      // A citizen unhappy about a moderation decision must not learn which
      // admin to go after from their own support thread.
      expect(reply.authorName).toBeNull();
      expect(JSON.stringify(detail)).not.toContain('Meena Support');
      expect(reply.isMine).toBe(false);
    });

    it('does attribute the citizen’s own messages to them', async () => {
      const ticket = await fileTicket();
      const detail = await service.addMessage(ticket.id, ownerId, {
        body: 'Still happening.',
      });

      expect(detail.messages[0]).toMatchObject({
        senderType: 'user',
        authorName: 'Hari',
        isMine: true,
      });
    });
  });

  describe('replying moves the status, and the backend decides', () => {
    it('leaves an open ticket open when the citizen adds to it', async () => {
      const ticket = await fileTicket();
      const after = await service.addMessage(ticket.id, ownerId, {
        body: 'One more detail.',
      });
      expect(after.status.key).toBe('open');
    });

    it('moves waiting_for_user to in_progress', async () => {
      const ticket = await fileTicket();
      await setStatus(ticket.id, 'waiting_for_user');

      const after = await service.addMessage(ticket.id, ownerId, {
        body: 'Here is the screenshot you asked for.',
      });
      expect(after.status.key).toBe('in_progress');
    });

    it('REOPENS a resolved ticket — resolved is a claim the citizen may dispute', async () => {
      const ticket = await fileTicket();
      await setStatus(ticket.id, 'resolved');

      const after = await service.addMessage(ticket.id, ownerId, {
        body: 'This is still broken.',
      });
      expect(after.status.key).toBe('in_progress');
      expect(after.canReply).toBe(true);
    });

    it('refuses a reply to a closed ticket, and writes nothing', async () => {
      const ticket = await fileTicket();
      await setStatus(ticket.id, 'closed');

      await expect(
        service.addMessage(ticket.id, ownerId, { body: 'hello?' }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'TICKET_CLOSED' },
      });

      expect(await db.select().from(supportTicketMessages)).toEqual([]);
      expect((await service.findOne(ticket.id, ownerId)).canReply).toBe(false);
    });
  });

  describe('listCategories', () => {
    it('returns the id the create endpoint accepts, alongside the key', async () => {
      const categories = await service.listCategories();
      const bug = categories.find((c) => c.key === 'bug_report');
      expect(bug).toEqual({
        id: lookups.ticketCategoryIds.bug_report,
        key: 'bug_report',
        label: 'Bug Report',
      });
    });
  });
});
