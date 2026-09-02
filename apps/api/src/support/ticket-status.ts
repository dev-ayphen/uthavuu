/**
 * THE SUPPORT TICKET LIFECYCLE — one file, both surfaces.
 *
 * SupportService (citizen) and AdminSupportService (console) both import from
 * here. That is the point: "a reply moves the ticket to in_progress" is a rule
 * about the ticket, not about the endpoint, and a rule written twice is a rule
 * that will be true in one place and false in the other by the third change.
 *
 * THE BACKEND OWNS STATUS. Nothing a citizen sends names a status — the mobile
 * client has no status field on any request, and `POST /support/tickets/:id/messages`
 * takes a body and nothing else. Status moves as a *consequence* of what
 * happened, computed here.
 *
 * The keys below are the source of truth for the code; the rows in
 * `ticket_statuses` are the source of truth for the database (db/seed.ts writes
 * them, migration 0023 renamed the three that predate this file). Both lists
 * exist because they answer different questions — "which branch does the code
 * take" and "what may status_id point at" — and a spec asserts they agree.
 */

export const TICKET_STATUS_KEYS = [
  'open',
  'in_progress',
  'waiting_for_user',
  'resolved',
  'closed',
] as const;

export type TicketStatusKey = (typeof TICKET_STATUS_KEYS)[number];

export const TICKET_PRIORITY_KEYS = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export type TicketPriorityKey = (typeof TICKET_PRIORITY_KEYS)[number];

/** Which side of the conversation a message came from. */
export const TICKET_SENDER_TYPE_KEYS = ['user', 'admin'] as const;

export type TicketSenderTypeKey = (typeof TICKET_SENDER_TYPE_KEYS)[number];

/** Every ticket starts here. Citizens cannot open one in any other state. */
export const INITIAL_TICKET_STATUS_KEY: TicketStatusKey = 'open';

/** Priority is a staff judgement; a citizen filing a ticket gets the default. */
export const DEFAULT_TICKET_PRIORITY_KEY: TicketPriorityKey = 'normal';

/** The state a reply moves a ticket into, wherever a reply moves it at all. */
const ACTIVE_STATUS_KEY: TicketStatusKey = 'in_progress';

export function isTicketStatusKey(key: string): key is TicketStatusKey {
  return (TICKET_STATUS_KEYS as readonly string[]).includes(key);
}

export function isTicketPriorityKey(key: string): key is TicketPriorityKey {
  return (TICKET_PRIORITY_KEYS as readonly string[]).includes(key);
}

/**
 * RESOLVED ≠ CLOSED, and this function is where the difference is real.
 *
 * `resolved` means support believes the problem is fixed. The thread stays
 * writable, and a citizen who replies reopens it (see statusAfterMessage) —
 * because "we think we fixed it" is a claim the person who reported it is
 * entitled to disagree with.
 *
 * `closed` means the conversation is over. New messages are refused from BOTH
 * sides, so a closed ticket is a stable record rather than a thread that quietly
 * grows after everyone stopped reading it. Reopening one is a deliberate admin
 * act (PATCH the status), not a side effect of somebody typing.
 */
export function acceptsMessages(statusKey: string): boolean {
  return statusKey !== 'closed';
}

export interface TicketMessageEvent {
  /** The ticket's status *before* the message lands. */
  statusKey: string;
  sender: TicketSenderTypeKey;
  /** Staff-only note. Never visible to the citizen — see supportTicketMessages. */
  isInternalNote: boolean;
}

/**
 * The status a ticket should hold after a message lands, or `null` for "leave it
 * exactly where it is".
 *
 * Three transitions, and the reasoning for each:
 *
 *   admin replies to `open`             -> in_progress  someone has picked it up
 *   citizen replies to `waiting_for_user` -> in_progress  the ball is back with support
 *   citizen replies to `resolved`       -> in_progress  it was not actually fixed
 *
 * Everything else is deliberately left alone. In particular:
 *
 * - An INTERNAL NOTE NEVER MOVES THE TICKET. A note is staff talking to staff;
 *   treating it as a reply would tell the queue that a citizen has been answered
 *   when nobody has answered them. This is the case most likely to be
 *   reintroduced by someone "simplifying" the branch below, so it is checked
 *   first and tested on its own.
 * - An admin reply to `waiting_for_user` leaves it waiting: support chasing its
 *   own question does not mean the citizen answered it.
 * - A `closed` ticket never reaches this function — acceptsMessages() rejects
 *   the write before a message exists to react to.
 */
export function statusAfterMessage(
  event: TicketMessageEvent,
): TicketStatusKey | null {
  if (event.isInternalNote) return null;

  if (event.sender === 'admin') {
    return event.statusKey === 'open' ? ACTIVE_STATUS_KEY : null;
  }

  return event.statusKey === 'waiting_for_user' ||
    event.statusKey === 'resolved'
    ? ACTIVE_STATUS_KEY
    : null;
}
