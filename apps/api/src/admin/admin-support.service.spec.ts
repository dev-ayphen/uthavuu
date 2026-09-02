import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin-spec-db.ts: the factory is hoisted above the imports, so the
// database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_support_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminUsers } from '../db/schema/admin-schema';
import { adminAuditActions, adminAuditLogs } from '../db/schema/audit-schema';
import {
  userAccountStatus,
} from '../db/schema/user-status-schema';
import {
  supportTicketMessages,
  supportTickets,
} from '../db/schema/tickets-schema';
import { SupportService } from '../support/support.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminSupportService } from './admin-support.service';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
  type SeededLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_support_test';
const META = { ipAddress: null, userAgent: null };

/**
 * Platform -> Support, console side.
 *
 * `SupportService` is instantiated alongside the admin one on purpose. The
 * internal-note boundary is only real if BOTH halves are exercised against the
 * same rows: an assertion that the admin service returns the note proves
 * nothing, and an assertion that the citizen service hides a note some test
 * inserted by hand proves only slightly more. The test that matters writes the
 * note through the real admin endpoint and then reads the real citizen one.
 */
describe('AdminSupportService', () => {
  let service: AdminSupportService;
  let citizen: SupportService;

  const adminId = uuidv7();
  const otherAdminId = uuidv7();
  const ownerId = uuidv7();
  const suspendedOwnerId = uuidv7();

  const admin = fakeAdmin({
    userId: adminId,
    name: 'Meena Support',
    email: 'meena@uthavu.org',
  });

  let lookups: SeededLookups;

  const auditRows = () =>
    db
      .select({
        actionKey: adminAuditActions.key,
        targetId: adminAuditLogs.targetId,
        targetLabel: adminAuditLogs.targetLabel,
        before: adminAuditLogs.before,
        after: adminAuditLogs.after,
        reason: adminAuditLogs.reason,
        actorUserId: adminAuditLogs.actorUserId,
      })
      .from(adminAuditLogs)
      .innerJoin(
        adminAuditActions,
        eq(adminAuditLogs.actionId, adminAuditActions.id),
      );

  const fileTicket = (userId = ownerId, subject = 'Photo upload fails') =>
    citizen.create(userId, {
      categoryKey: 'bug_report',
      subject,
      description: 'Uploading a photo times out on 3G.',
    } as Parameters<SupportService['create']>[1]);

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      { id: adminId, name: 'Meena Support', email: 'meena@uthavu.org' },
      { id: otherAdminId, name: 'Raj Ops', email: 'raj@uthavu.org' },
      { id: ownerId, name: 'Hari', email: `${ownerId}@test.local` },
      {
        id: suspendedOwnerId,
        name: 'Suspended Person',
        email: `${suspendedOwnerId}@test.local`,
      },
    ]);

    await db.insert(adminUsers).values([
      { userId: adminId, roleId: lookups.adminRoleIds.super_admin },
      { userId: otherAdminId, roleId: lookups.adminRoleIds.ops_admin },
    ]);

    await db.insert(userAccountStatus).values({
      userId: suspendedOwnerId,
      statusId: lookups.userStatusIds.suspended,
      suspendedAt: new Date(),
      suspendedBy: adminId,
      reason: 'Abuse',
    });
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(() => {
    // A fresh instance per test: AdminAuditService memoises lookup-key -> id,
    // and a warm memo would paper over a catalogue row that is genuinely absent.
    service = new AdminSupportService(new AdminAuditService());
    citizen = new SupportService();
  });

  afterEach(async () => {
    await db.delete(adminAuditLogs);
    await db.delete(supportTickets);
  });

  describe('catalogue', () => {
    it('serves the five statuses in lifecycle order, not alphabetically', async () => {
      const { statuses, priorities, categories } = await service.catalogue();

      expect(statuses.map((s) => s.key)).toEqual([
        'open',
        'in_progress',
        'waiting_for_user',
        'resolved',
        'closed',
      ]);
      expect(priorities.map((p) => p.key)).toEqual([
        'low',
        'normal',
        'high',
        'urgent',
      ]);
      expect(categories.map((c) => c.key).sort()).toEqual([
        'bug_report',
        'complaint',
      ]);
    });
  });

  describe('list', () => {
    it('returns the queue with priority, assignee and the citizen’s account status', async () => {
      await fileTicket(suspendedOwnerId);

      const { items, pagination } = await service.list({
        page: 1,
        limit: 25,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(pagination.total).toBe(1);
      expect(items[0]).toMatchObject({
        status: { key: 'open', label: 'Open' },
        priority: { key: 'normal', label: 'Normal' },
        assignedAdmin: null,
        user: {
          id: suspendedOwnerId,
          // ADR 0011 — staff need to know the person they are replying to
          // cannot currently sign in.
          status: { key: 'suspended', label: 'Suspended' },
        },
      });
      expect(items[0].ticketNumber).toMatch(/^UT-\d+$/);
    });

    it('finds a ticket by the number a citizen reads out over the phone', async () => {
      const ticket = await fileTicket();

      const { items } = await service.list({
        page: 1,
        limit: 25,
        sort: 'createdAt',
        order: 'desc',
        q: ticket.ticketNumber,
      });
      expect(items.map((i) => i.id)).toEqual([ticket.id]);
    });

    it('filters by status, priority and category', async () => {
      const a = await fileTicket(ownerId, 'A');
      await fileTicket(ownerId, 'B');
      await service.update(a.id, admin, { priority: 'urgent' }, META);

      const byPriority = await service.list({
        page: 1,
        limit: 25,
        sort: 'createdAt',
        order: 'desc',
        priority: 'urgent',
      });
      expect(byPriority.items.map((i) => i.id)).toEqual([a.id]);

      const byStatus = await service.list({
        page: 1,
        limit: 25,
        sort: 'createdAt',
        order: 'desc',
        status: 'closed',
      });
      expect(byStatus.items).toEqual([]);

      // The frozen contract spells it `category`; the endpoint originally
      // shipped `categoryKey`. Both have to narrow, or a filter silently
      // returns the unnarrowed queue.
      for (const query of [
        { category: 'bug_report' },
        { categoryKey: 'bug_report' },
      ]) {
        const byCategory = await service.list({
          page: 1,
          limit: 25,
          sort: 'createdAt',
          order: 'desc',
          ...query,
        });
        expect(byCategory.pagination.total).toBe(2);
      }
    });

    it('filters assigned and unassigned, using the console’s own sentinel', async () => {
      const mine = await fileTicket(ownerId, 'Mine');
      await fileTicket(ownerId, 'Nobody’s');
      await service.update(mine.id, admin, { assignedAdminId: adminId }, META);

      const assigned = await service.list({
        page: 1,
        limit: 25,
        sort: 'createdAt',
        order: 'desc',
        assigned: adminId,
      });
      expect(assigned.items.map((i) => i.id)).toEqual([mine.id]);

      const unassigned = await service.list({
        page: 1,
        limit: 25,
        sort: 'createdAt',
        order: 'desc',
        assigned: 'unassigned',
      });
      expect(unassigned.pagination.total).toBe(1);
      expect(unassigned.items[0].id).not.toBe(mine.id);
    });
  });

  describe('update', () => {
    it('records one audit row per field that actually moved, all in one transaction', async () => {
      const ticket = await fileTicket();

      const updated = await service.update(
        ticket.id,
        admin,
        {
          status: 'in_progress',
          priority: 'high',
          assignedAdminId: otherAdminId,
          categoryId: lookups.ticketCategoryIds.complaint,
          reason: 'Triage',
        },
        META,
      );

      expect(updated).toMatchObject({
        status: { key: 'in_progress' },
        priority: { key: 'high' },
        category: { key: 'complaint' },
        assignedAdmin: { id: otherAdminId, name: 'Raj Ops' },
      });

      const rows = await auditRows();
      expect(rows.map((r) => r.actionKey).sort()).toEqual([
        'support_ticket.assign',
        'support_ticket.category_change',
        'support_ticket.priority_change',
        'support_ticket.status_change',
      ]);
      // Every row is attributed and labelled with the human reference, so the
      // trail is readable after the ticket itself is gone.
      expect(rows.every((r) => r.actorUserId === adminId)).toBe(true);
      expect(rows.every((r) => r.targetLabel === ticket.ticketNumber)).toBe(
        true,
      );
      expect(rows.every((r) => r.reason === 'Triage')).toBe(true);

      const assign = rows.find(
        (r) => r.actionKey === 'support_ticket.assign',
      );
      expect(assign?.before).toEqual({
        assignedAdminId: null,
        assignedAdminName: null,
      });
      expect(assign?.after).toEqual({
        assignedAdminId: otherAdminId,
        assignedAdminName: 'Raj Ops',
      });
    });

    it('records nothing for a field that was already at that value', async () => {
      const ticket = await fileTicket();

      await service.update(ticket.id, admin, { priority: 'high' }, META);
      await db.delete(adminAuditLogs);

      // priority unchanged, status changed -> exactly one row.
      await service.update(
        ticket.id,
        admin,
        { priority: 'high', status: 'waiting_for_user' },
        META,
      );

      const rows = await auditRows();
      expect(rows.map((r) => r.actionKey)).toEqual([
        'support_ticket.status_change',
      ]);
    });

    it('refuses a PATCH that would change nothing, rather than logging a change that did not happen', async () => {
      const ticket = await fileTicket();

      await expect(
        service.update(ticket.id, admin, { status: 'open' }, META),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'TICKET_UNCHANGED' },
      });
      expect(await auditRows()).toEqual([]);
    });

    it('unassigns with an explicit null', async () => {
      const ticket = await fileTicket();
      await service.update(ticket.id, admin, { assignedAdminId: adminId }, META);

      const cleared = await service.update(
        ticket.id,
        admin,
        { assignedAdminId: null },
        META,
      );
      expect(cleared.assignedAdmin).toBeNull();
    });

    it('refuses to assign a ticket to somebody who is not an admin', async () => {
      const ticket = await fileTicket();

      await expect(
        service.update(ticket.id, admin, { assignedAdminId: ownerId }, META),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'NOT_AN_ADMIN' },
      });
    });

    it('refuses an unknown status or priority key', async () => {
      const ticket = await fileTicket();

      await expect(
        service.update(ticket.id, admin, { status: 'in_review' }, META),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'UNKNOWN_TICKET_STATUS' },
      });
      await expect(
        service.update(ticket.id, admin, { priority: 'critical' }, META),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'UNKNOWN_TICKET_PRIORITY' },
      });
    });

    it('stamps resolvedAt when the status is dragged straight to resolved', async () => {
      const ticket = await fileTicket();
      const updated = await service.update(
        ticket.id,
        admin,
        { status: 'resolved' },
        META,
      );
      expect(updated.resolvedAt).not.toBeNull();
    });

    it('still serves PATCH :id/status, and it writes the same audit action', async () => {
      const ticket = await fileTicket();

      const updated = await service.updateStatus(
        ticket.id,
        admin,
        { statusKey: 'in_progress' },
        META,
      );
      expect(updated.status.key).toBe('in_progress');
      expect((await auditRows()).map((r) => r.actionKey)).toEqual([
        'support_ticket.status_change',
      ]);
    });

    it('409s on the legacy status route when the ticket is already in that status', async () => {
      const ticket = await fileTicket();
      await expect(
        service.updateStatus(ticket.id, admin, { statusKey: 'open' }, META),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'TICKET_ALREADY_IN_STATUS' },
      });
    });
  });

  describe('replies and internal notes', () => {
    it('moves an open ticket to in_progress when an admin replies, and audits the reply', async () => {
      const ticket = await fileTicket();

      const after = await service.addMessage(
        ticket.id,
        admin,
        { body: 'We are looking into it.', isInternalNote: false },
        META,
      );

      expect(after.status.key).toBe('in_progress');
      expect(after.messages).toHaveLength(1);
      expect(after.messages[0]).toMatchObject({
        senderType: 'admin',
        sender: { id: adminId, name: 'Meena Support' },
        isInternalNote: false,
      });

      const [row] = await auditRows();
      expect(row.actionKey).toBe('support_ticket.reply');
      expect(row.before).toEqual({ statusKey: 'open' });
      expect(row.after).toEqual({
        statusKey: 'in_progress',
        isInternalNote: false,
      });
      // The message body is NOT copied into the audit trail — it already lives,
      // permanently, in support_ticket_messages.
      expect(JSON.stringify(row)).not.toContain('We are looking into it.');
    });

    it('does NOT move the ticket for an internal note, and audits it as a note', async () => {
      const ticket = await fileTicket();

      const after = await service.addMessage(
        ticket.id,
        admin,
        { body: 'Third ticket this week.', isInternalNote: true },
        META,
      );

      // An internal note is not an answer. Telling the queue this citizen has
      // been replied to would leave them waiting behind a ticket that looks
      // handled.
      expect(after.status.key).toBe('open');
      expect((await auditRows()).map((r) => r.actionKey)).toEqual([
        'support_ticket.note',
      ]);
    });

    /**
     * THE TEST THIS WHOLE FILE EXISTS FOR.
     *
     * The note is written through the real admin endpoint and read back through
     * the real citizen endpoint. Both halves, same rows, no fixtures in between.
     */
    it('shows an internal note to admins and hides it from the citizen who filed the ticket', async () => {
      const ticket = await fileTicket();
      const NOTE = 'INTERNAL: possible duplicate account, do not refund';

      await service.addMessage(
        ticket.id,
        admin,
        { body: 'Thanks for reporting this.', isInternalNote: false },
        META,
      );
      await service.addMessage(
        ticket.id,
        admin,
        { body: NOTE, isInternalNote: true },
        META,
      );

      const adminView = await service.findOne(ticket.id);
      expect(adminView.messages.map((m) => m.body)).toEqual([
        'Thanks for reporting this.',
        NOTE,
      ]);
      expect(adminView.messages[1].isInternalNote).toBe(true);

      const citizenView = await citizen.findOne(ticket.id, ownerId);

      // Serialise the ENTIRE citizen payload. Counting messages would pass even
      // if the note leaked through some other field.
      expect(JSON.stringify(citizenView)).not.toContain(NOTE);
      expect(JSON.stringify(citizenView)).not.toContain('INTERNAL');
      expect(citizenView.messages.map((m) => m.body)).toEqual([
        'Thanks for reporting this.',
      ]);
      // Nor does the staff member's name travel with their reply.
      expect(JSON.stringify(citizenView)).not.toContain('Meena Support');
    });
  });

  describe('resolve and close are different things', () => {
    it('resolve stamps resolvedAt, leaves the thread writable, and a citizen reply reopens it', async () => {
      const ticket = await fileTicket();

      const resolved = await service.resolve(
        ticket.id,
        admin,
        { message: 'Fixed in the latest build.' },
        META,
      );

      expect(resolved.status.key).toBe('resolved');
      expect(resolved.resolvedAt).not.toBeNull();
      expect(resolved.closedAt).toBeNull();
      // The optional message lands as a normal, citizen-visible reply in the
      // same transaction.
      expect(resolved.messages.map((m) => m.body)).toEqual([
        'Fixed in the latest build.',
      ]);

      const [row] = await auditRows();
      expect(row.actionKey).toBe('support_ticket.resolve');
      expect(row.after).toEqual({ statusKey: 'resolved', notified: true });

      const reopened = await citizen.addMessage(ticket.id, ownerId, {
        body: 'It is not fixed.',
      });
      expect(reopened.status.key).toBe('in_progress');
    });

    it('close stamps closedAt and refuses every further message, from both sides', async () => {
      const ticket = await fileTicket();

      const closed = await service.close(ticket.id, admin, {}, META);
      expect(closed.status.key).toBe('closed');
      expect(closed.closedAt).not.toBeNull();
      expect((await auditRows()).map((r) => r.actionKey)).toEqual([
        'support_ticket.close',
      ]);

      await expect(
        citizen.addMessage(ticket.id, ownerId, { body: 'hello?' }),
      ).rejects.toMatchObject({ response: { code: 'TICKET_CLOSED' } });

      // Staff too — including internal notes. Adding to a closed ticket means
      // reopening it first, which is a visible, audited act.
      await expect(
        service.addMessage(
          ticket.id,
          admin,
          { body: 'one more note', isInternalNote: true },
          META,
        ),
      ).rejects.toMatchObject({ response: { code: 'TICKET_CLOSED' } });

      expect(await db.select().from(supportTicketMessages)).toEqual([]);
    });

    it('refuses to resolve a ticket that is already resolved', async () => {
      const ticket = await fileTicket();
      await service.resolve(ticket.id, admin, {}, META);

      await expect(
        service.resolve(ticket.id, admin, {}, META),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'TICKET_ALREADY_IN_STATUS' },
      });
    });

    it('keeps resolvedAt after a reopen — it records that the ticket WAS resolved once', async () => {
      const ticket = await fileTicket();
      const resolved = await service.resolve(ticket.id, admin, {}, META);

      const reopened = await citizen.addMessage(ticket.id, ownerId, {
        body: 'Still broken.',
      });
      expect(reopened.status.key).toBe('in_progress');
      expect(reopened.resolvedAt).toBe(resolved.resolvedAt);
    });
  });

  describe('findOne', () => {
    it('404s for a ticket id that does not exist', async () => {
      await expect(service.findOne(uuidv7())).rejects.toMatchObject({
        status: 404,
        response: { code: 'TICKET_NOT_FOUND' },
      });
    });

    it('never reaches Mission Chat — a related report is an id and nothing more', async () => {
      const ticket = await fileTicket();
      const detail = await service.findOne(ticket.id);

      // ADR 0010. The projection carries the id it was given, with no title, no
      // excerpt and no join to mission_messages anywhere in this service.
      expect(detail.relatedReportId).toBeNull();
      expect(Object.keys(detail)).not.toContain('relatedReport');
    });
  });
});
