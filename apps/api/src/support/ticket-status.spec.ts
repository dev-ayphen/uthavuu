import {
  TICKET_PRIORITY_KEYS,
  TICKET_STATUS_KEYS,
  acceptsMessages,
  isTicketPriorityKey,
  isTicketStatusKey,
  statusAfterMessage,
} from './ticket-status';

/**
 * The lifecycle rules, with no database in the way.
 *
 * These are the rules both services delegate to, so getting them wrong is wrong
 * on the citizen side AND the console side simultaneously — which is exactly why
 * they live in one file and are tested here rather than inferred from an
 * end-to-end assertion in each service's suite.
 */
describe('ticket lifecycle rules', () => {
  it('has exactly the five statuses the product specifies, in lifecycle order', () => {
    expect([...TICKET_STATUS_KEYS]).toEqual([
      'open',
      'in_progress',
      'waiting_for_user',
      'resolved',
      'closed',
    ]);
    expect([...TICKET_PRIORITY_KEYS]).toEqual([
      'low',
      'normal',
      'high',
      'urgent',
    ]);
  });

  it('recognises its own keys and nothing else', () => {
    expect(isTicketStatusKey('waiting_for_user')).toBe(true);
    // The two pre-migration keys. They no longer exist as statuses, and code
    // that still believes in them should fail this check rather than silently
    // match nothing.
    expect(isTicketStatusKey('new')).toBe(false);
    expect(isTicketStatusKey('in_review')).toBe(false);
    expect(isTicketPriorityKey('urgent')).toBe(true);
    expect(isTicketPriorityKey('critical')).toBe(false);
  });

  describe('acceptsMessages — resolved is not closed', () => {
    it('accepts messages on a resolved ticket, so a citizen can disagree', () => {
      expect(acceptsMessages('resolved')).toBe(true);
    });

    it('refuses them on a closed one, from either side', () => {
      expect(acceptsMessages('closed')).toBe(false);
    });

    it.each(['open', 'in_progress', 'waiting_for_user'])(
      'accepts them while %s',
      (statusKey) => {
        expect(acceptsMessages(statusKey)).toBe(true);
      },
    );
  });

  describe('statusAfterMessage', () => {
    const reply = (statusKey: string, sender: 'user' | 'admin') =>
      statusAfterMessage({ statusKey, sender, isInternalNote: false });

    it('moves an open ticket to in_progress when an admin replies', () => {
      expect(reply('open', 'admin')).toBe('in_progress');
    });

    it('moves a waiting_for_user ticket to in_progress when the citizen replies', () => {
      expect(reply('waiting_for_user', 'user')).toBe('in_progress');
    });

    it('REOPENS a resolved ticket when the citizen replies', () => {
      expect(reply('resolved', 'user')).toBe('in_progress');
    });

    it('leaves waiting_for_user alone when the ADMIN replies — support chasing its own question is not an answer', () => {
      expect(reply('waiting_for_user', 'admin')).toBeNull();
    });

    it('leaves an open ticket alone when the CITIZEN adds to it', () => {
      expect(reply('open', 'user')).toBeNull();
    });

    it('leaves an in_progress ticket alone in both directions', () => {
      expect(reply('in_progress', 'user')).toBeNull();
      expect(reply('in_progress', 'admin')).toBeNull();
    });

    /**
     * The case most likely to be reintroduced by someone tidying the branch:
     * an internal note is staff talking to staff, and treating it as a reply
     * would tell the queue a citizen has been answered when nobody answered
     * them.
     */
    it('NEVER moves the ticket for an internal note, whatever the status', () => {
      for (const statusKey of TICKET_STATUS_KEYS) {
        expect(
          statusAfterMessage({
            statusKey,
            sender: 'admin',
            isInternalNote: true,
          }),
        ).toBeNull();
      }
    });
  });
});
