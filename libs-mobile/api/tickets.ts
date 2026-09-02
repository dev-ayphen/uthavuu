// The ONLY place mobile talks to the support-ticket endpoints. Help & Support is
// a two-way conversation, not a one-shot form, so this module covers the whole
// lifecycle: list the categories a ticket can be filed under, create one, list
// mine, open one with its thread, and reply into it.
//
//   POST /support/tickets              { categoryId, subject, description, relatedReportId? }
//                                        -> { id, ticketNumber, status }
//   GET  /users/me/tickets             -> list
//   GET  /support/tickets/:id          -> ticket + messages
//   POST /support/tickets/:id/messages { body }
//   GET  /support/categories           -> the categoryId options for the POST above
//
// The types below mirror the real projections in apps/api/src/support/
// support.service.ts (`toResponse`, `citizenMessages`, `listCategories`), and the
// five paths are the five routes declared in support.controller.ts. Both landed
// in a parallel lane while this was being written, so everything network-facing
// stays confined to this file: if a field name moves, this is the only file that
// changes and no screen does.
//
// Nothing here invents a ticket, a message, or a status. The normalisers exist to
// survive a shape mismatch without dropping real server data on the floor — the
// same defensive posture as api/config.ts, for the same reason.
//
// Two things this client deliberately does NOT model:
//
// - INTERNAL NOTES. The service filters `is_internal_note` in the WHERE clause of
//   every citizen projection, so a staff-only note is never fetched, never mapped
//   and never serialised. There is no field and no branch for one here. Seeing one
//   would be a backend bug to report, not a case to render.
// - STATUS TRANSITIONS. The backend computes them (support/ticket-status.ts). This
//   client reads `status` and `canReply` and never advances either.
//
// SERVER ERROR CODES worth handling by name: 404 TICKET_NOT_FOUND (also what
// somebody else's ticket returns — ids are not enumerable), 409 TICKET_CLOSED
// (a reply into a closed ticket), 400 UNKNOWN_TICKET_CATEGORY.
import { apiRequest } from '../lib/api';

/**
 * The five statuses in the frozen contract. The BACKEND OWNS STATUS — the client
 * never sets it, never advances it optimistically, and renders whatever comes
 * back. This list exists only so the UI can look up a translated label and a
 * colour tone; an unrecognised key is rendered using the server's own label
 * rather than being coerced into one of these.
 */
export const TICKET_STATUS_KEYS = [
  'open',
  'in_progress',
  'waiting_for_user',
  'resolved',
  'closed',
] as const;

export type TicketStatusKey = (typeof TICKET_STATUS_KEYS)[number];

/**
 * A `closed` ticket is the only one that stops accepting replies. Mirrors
 * `acceptsMessages()` in apps/api/src/support/ticket-status.ts, and is only the
 * fallback: the server sends `canReply` on every ticket and that is what the UI
 * actually reads.
 */
export function acceptsReply(statusKey: string): boolean {
  return statusKey !== 'closed';
}

/**
 * A reply to a `resolved` ticket reopens it (server-side — the client does not
 * move the status, it just tells the user this is what will happen).
 */
export function replyReopens(statusKey: string): boolean {
  return statusKey === 'resolved';
}

/** Everything that is neither resolved nor closed counts as still open. */
export function isOpenStatus(statusKey: string): boolean {
  return statusKey !== 'resolved' && statusKey !== 'closed';
}

export type TicketStatus = {
  /** e.g. 'waiting_for_user'. */
  key: string;
  /** The server's own human label, used verbatim when the key is unrecognised. */
  label: string;
};

export type TicketCategory = {
  id: string;
  key: string;
  label: string;
};

/**
 * Who wrote a message. `unknown` is deliberate: if the payload carries no
 * author marker the UI says nothing about who wrote it rather than guessing,
 * because attributing a support reply to the user (or vice versa) is worse than
 * an unlabelled entry.
 *
 * There is no internal-note branch here on purpose. Internal notes are filtered
 * out server-side by construction; if one ever reaches this client that is a
 * backend bug to report, not a case to render.
 */
export type TicketAuthor = 'user' | 'support' | 'unknown';

export type TicketMessage = {
  id: string;
  body: string;
  author: TicketAuthor;
  /**
   * Whatever name the server attached, if any. Always null for a support reply:
   * the API attributes staff replies to "Support" and withholds the admin's
   * name on purpose, so the UI must not expect one.
   */
  authorName: string | null;
  createdAt: string;
};

export type Ticket = {
  id: string;
  /** The human-facing reference, e.g. 'UT-1042'. */
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  category: TicketCategory | null;
  createdAt: string;
  updatedAt: string;
  /**
   * The server's own answer to "may this person reply?", false only for a closed
   * ticket. Preferred over re-deriving it from the status key: the composer's
   * enabled state is a backend decision like the status itself.
   */
  canReply: boolean;
  /** Citizen-visible replies only — internal notes are never counted. */
  messageCount: number;
};

export type TicketDetail = Ticket & { messages: TicketMessage[] };

export type CreateTicketInput = {
  categoryId: string;
  subject: string;
  description: string;
  /** Set when the ticket is filed from a specific report. */
  relatedReportId?: string;
};

// Mirrors apps/api/src/support/dto/create-ticket.dto.ts. Client-side length
// checks are a courtesy so the user finds out before a round trip — the server
// check is the real one, and its 400 is still surfaced.
export const TICKET_SUBJECT_MAX = 150;
export const TICKET_DESCRIPTION_MAX = 2000;
/** Mirrors CreateTicketMessageSchema — `body` trimmed, 1..2000. */
export const TICKET_MESSAGE_MAX = 2000;

// ── Query keys ───────────────────────────────────────────────────────────────
// Shared so a reply can invalidate both the thread it landed in and the list
// that shows its updated time, from anywhere.
export const TICKETS_QUERY_KEY = ['myTickets'] as const;
export const TICKET_CATEGORIES_QUERY_KEY = ['ticketCategories'] as const;
export const ticketQueryKey = (ticketId: string) => ['ticket', ticketId] as const;

// ── Normalisers ──────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * ISO timestamps arrive as strings over JSON, but Drizzle's `timestamp` columns
 * are typed as Date, so a serialiser change could hand us either. Both end up as
 * an ISO string the UI can format; anything else becomes '' and the UI omits the
 * time rather than printing "Invalid Date".
 */
function isoOr(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return fallback;
}

/**
 * The contract writes `status: open | in_progress | ...`, a bare key; the
 * existing endpoint returns `{ key, label }`. Accept either — the key is what
 * drives every decision, the label is only a fallback for a key we don't know.
 */
function normalizeStatus(raw: unknown): TicketStatus {
  if (typeof raw === 'string') return { key: raw, label: '' };
  const o = asRecord(raw);
  if (!o) return { key: '', label: '' };
  return { key: str(o.key ?? o.status), label: str(o.label ?? o.name) };
}

function normalizeCategory(raw: unknown): TicketCategory | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = str(o.id);
  const key = str(o.key);
  const label = str(o.label ?? o.name);
  if (!id && !key && !label) return null;
  return { id, key, label };
}

/**
 * Author detection accepts the handful of shapes a backend plausibly sends for
 * "this one is from support". If none of them is present the author is
 * `unknown` and the UI stays silent about it.
 */
function normalizeAuthor(o: Record<string, unknown>): TicketAuthor {
  // `senderType` is what the API actually sends ('user' | 'admin'); `isMine` is
  // its companion flag. The rest are tolerated spellings, kept because this
  // module is the single seam between the two lanes.
  const author = asRecord(o.author);
  const role = str(o.senderType ?? o.authorType ?? o.authorRole ?? author?.role ?? author?.type);
  if (role) {
    const normalized = role.toLowerCase();
    if (normalized === 'admin' || normalized === 'support' || normalized === 'staff') return 'support';
    if (normalized === 'user' || normalized === 'citizen' || normalized === 'reporter') return 'user';
  }

  if (typeof o.isMine === 'boolean') return o.isMine ? 'user' : 'support';
  const flag = o.isSupport ?? o.isStaff ?? o.fromSupport;
  if (typeof flag === 'boolean') return flag ? 'support' : 'user';

  return 'unknown';
}

function normalizeMessage(raw: unknown, index: number): TicketMessage | null {
  const o = asRecord(raw);
  if (!o) return null;
  const body = str(o.body ?? o.message ?? o.text);
  if (!body.trim()) return null;
  const author = asRecord(o.author);
  return {
    id: str(o.id) || `message-${index}`,
    body,
    author: normalizeAuthor(o),
    authorName: nullableStr(o.authorName ?? author?.name),
    createdAt: isoOr(o.createdAt ?? o.sentAt, ''),
  };
}

function normalizeTicket(raw: unknown): Ticket | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = str(o.id);
  if (!id) return null;
  const createdAt = isoOr(o.createdAt, '');
  return {
    id,
    // Falls back to the id's leading characters only so a reference is always
    // showable — never a made-up sequential number.
    ticketNumber: str(o.ticketNumber ?? o.number) || id.slice(0, 8).toUpperCase(),
    subject: str(o.subject ?? o.title),
    description: str(o.description ?? o.body),
    status: normalizeStatus(o.status ?? o.statusKey),
    category: normalizeCategory(o.category),
    createdAt,
    updatedAt: isoOr(o.updatedAt, createdAt),
    // Falls back to the status rule only when the server didn't say — never the
    // other way round.
    canReply:
      typeof o.canReply === 'boolean'
        ? o.canReply
        : acceptsReply(normalizeStatus(o.status ?? o.statusKey).key),
    messageCount: typeof o.messageCount === 'number' ? o.messageCount : 0,
  };
}

function normalizeTicketDetail(raw: unknown): TicketDetail | null {
  const ticket = normalizeTicket(raw);
  if (!ticket) return null;
  const o = asRecord(raw);
  const rawMessages = unwrapList(o?.messages ?? o?.thread);
  return {
    ...ticket,
    messages: rawMessages
      .map(normalizeMessage)
      .filter((m): m is TicketMessage => m !== null),
  };
}

/**
 * Accepts a bare array, `{ items }`, or `{ data: { items } }`. The rest of this
 * client's endpoints return bare arrays, but this one is being written against a
 * contract whose envelope isn't settled; tolerating all three costs six lines
 * and avoids the whole feature reading as empty over a wrapper mismatch.
 */
function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = asRecord(raw);
  if (!o) return [];
  if (Array.isArray(o.items)) return o.items;
  const data = asRecord(o.data);
  if (data && Array.isArray(data.items)) return data.items;
  if (Array.isArray(o.data)) return o.data;
  return [];
}

// ── Requests ─────────────────────────────────────────────────────────────────

/** The `categoryId` options for createTicket(). */
export async function listTicketCategories(): Promise<TicketCategory[]> {
  const raw = await apiRequest<unknown>('/support/categories', { method: 'GET', auth: true });
  return unwrapList(raw)
    .map(normalizeCategory)
    .filter((c): c is TicketCategory => c !== null && c.id !== '');
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const raw = await apiRequest<unknown>('/support/tickets', {
    method: 'POST',
    auth: true,
    body: input,
  });
  const ticket = normalizeTicket(raw);
  // A create that comes back unreadable is a real failure, not an empty state —
  // the caller navigates into the new ticket and needs its id.
  if (!ticket) throw new Error('The server did not return the created ticket.');
  return ticket;
}

export async function listMyTickets(): Promise<Ticket[]> {
  const raw = await apiRequest<unknown>('/users/me/tickets', { method: 'GET', auth: true });
  return unwrapList(raw)
    .map(normalizeTicket)
    .filter((t): t is Ticket => t !== null);
}

export async function getTicket(ticketId: string): Promise<TicketDetail> {
  const raw = await apiRequest<unknown>(`/support/tickets/${ticketId}`, {
    method: 'GET',
    auth: true,
  });
  const detail = normalizeTicketDetail(raw);
  if (!detail) throw new Error('The server did not return this ticket.');
  return detail;
}

/**
 * Returns the whole ticket, because that is what the server returns: a reply can
 * move the ticket's status (a reply to a `resolved` ticket reopens it), so the
 * response carries the server's answer about where the ticket now stands rather
 * than just an echo of the message. The caller writes it straight into the
 * thread's cache — it never advances the status itself.
 */
export async function postTicketMessage(ticketId: string, body: string): Promise<TicketDetail> {
  const raw = await apiRequest<unknown>(`/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    auth: true,
    body: { body },
  });
  const detail = normalizeTicketDetail(raw);
  if (!detail) throw new Error('The server did not return the updated ticket.');
  return detail;
}
