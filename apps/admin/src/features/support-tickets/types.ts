/**
 * Shapes returned by the admin support-ticket endpoints.
 *
 * THE CONTRACT, AS SHIPPED
 * ───────────────────────────────────────────────────────────────────────────
 * Frozen with the backend agent building this module in parallel, and now
 * implemented by `AdminSupportController`:
 *
 *   GET   /admin/support-tickets?status&category&priority&assigned&q&page&limit
 *   GET   /admin/support-tickets/catalogue    -> statuses / priorities / categories
 *   GET   /admin/support-tickets/:id          -> ticket + conversation + user context
 *   PATCH /admin/support-tickets/:id          -> { status?, priority?, assignedAdminId?, categoryId?, reason? }
 *   POST  /admin/support-tickets/:id/messages -> { body, isInternalNote }
 *   POST  /admin/support-tickets/:id/resolve  -> { message?, reason? }
 *   POST  /admin/support-tickets/:id/close    -> { message?, reason? }
 *
 * Every route requires `platform:manage` — the gate already on
 * `AdminSupportController`. Read and write share it, so there is no "can look
 * but not touch" state to render; the section is gated whole in `permission.ts`.
 *
 * VERIFIED AGAINST THE SHIPPED CONTROLLER AND SERVICE
 * ───────────────────────────────────────────────────────────────────────────
 * Written first from the frozen contract while only the database half existed,
 * then reconciled field-for-field against `AdminSupportController` and
 * `AdminSupportService.toResponse()` / `messagesFor()` once those landed. Two
 * things that reconciliation caught, both of which would have rendered blank
 * and given no clue why:
 *
 *   - The citizen's number. The contract spells it `phone`; the endpoint
 *     originally shipped `phoneNumber` and now sends BOTH, deliberately, on the
 *     same reasoning the normaliser below reads both.
 *   - `messageCount` / `lastMessageAt`, which the contract never mentioned and
 *     the service computes per row. They are the ONLY aggregate numbers in this
 *     feature, and they are rendered because the API serves them — not because
 *     the console counted something it had in hand.
 *
 * Nothing here fabricates a row. If an endpoint is unavailable the list renders
 * `classifyListFailure`'s honest branch and the detail page renders the same,
 * rather than a plausible-looking ticket nobody filed.
 *
 * NO INVENTED METRICS, ANYWHERE. There is no "average first response", no
 * "tickets closed this week", no SLA clock. No endpoint serves any of them, and
 * a support console that shows a number it computed from the page it happens to
 * be holding is worse than one that shows nothing: it looks authoritative.
 */

/** The five lifecycle keys, from `ticket_statuses` (see `./catalogue.ts`). */
export type TicketStatusKey =
  | "open"
  | "in_progress"
  | "waiting_for_user"
  | "resolved"
  | "closed";

/** From `ticket_priorities`. Staff-set — a citizen cannot self-declare urgency. */
export type TicketPriorityKey = "low" | "normal" | "high" | "urgent";

/**
 * `{ key, label }` with a `string` key throughout, matching `AdminRoleRef` and
 * `CommunityUpdateStatus`: the API owns the lookup tables and authors the
 * display text, so a status or priority added server-side renders with its real
 * name instead of making the row look broken until this console is redeployed.
 * Only the COLOUR is chosen locally, and only for keys this build knows.
 */
export type TicketRef = { key: string; label: string };

/** The citizen who filed the ticket. Admin-only projection. */
export type TicketUser = {
  id: string;
  name: string | null;
  /** Staff need it to follow up. Never reachable from a citizen route. */
  phone: string | null;
  /** `active` | `suspended`, from `user_account_status` (ADR 0011). */
  status: TicketRef | null;
  avatarUrl: string | null;
};

export type SupportTicket = {
  id: string;
  /** The reference a citizen reads out — `UT-1042`. Null only if not sent. */
  ticketNumber: string | null;
  subject: string;
  /** The citizen's opening message. A column on the ticket, not message #1. */
  description: string;
  status: TicketRef;
  priority: TicketRef | null;
  category: TicketRef;
  user: TicketUser;
  assignedAdmin: { id: string; name: string | null } | null;
  /**
   * The request this ticket is about, if any.
   *
   * A LINK AND NOTHING ELSE. The console never pulls the report's content — and
   * never, under any circumstance, its Mission Chat — into the ticket. ADR 0010
   * makes mission chat unreadable by admins, and `tickets-schema.ts` says the
   * same about this column: holding a report id here grants no access to that
   * report's conversation. Rendering an excerpt "for context" would quietly
   * relocate that boundary into a support screen.
   */
  relatedReportId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * When support last said "fixed", and when the thread was finally shut.
   *
   * "The last time the ticket entered that state", NOT "it is in that state
   * now" — `status.key` is the only answer to that, and the service says so in
   * the same words. A reopened ticket keeps its `resolvedAt`, because it really
   * was resolved once. Nothing in this console derives a status from either.
   */
  resolvedAt: string | null;
  closedAt: string | null;
  /**
   * How many messages the thread holds, and when the last one landed — both
   * computed by the API (`messageTotals()`), never by this console.
   *
   * The count INCLUDES internal notes, because the query that produces it does
   * not filter them out. That is why nothing renders this as "replies" or
   * "answered": a ticket with three messages may have had three staff notes and
   * no answer to the citizen at all. It is labelled "messages", which is what
   * it is.
   */
  messageCount: number | null;
  lastMessageAt: string | null;
};

/** One message in the thread, in either direction. */
export type TicketMessage = {
  id: string;
  senderType: "user" | "admin";
  /** Null once the author's account is deleted; the body survives them. */
  sender: { id: string; name: string | null } | null;
  body: string;
  /**
   * Staff talking to staff on the citizen's ticket.
   *
   * A PRIVACY BOUNDARY, NOT A DISPLAY FLAG (`tickets-schema.ts` says so in
   * those words). The citizen-facing projection filters these out in SQL. This
   * console renders them, loudly marked — see `ticket-conversation.tsx`.
   */
  isInternalNote: boolean;
  createdAt: string | null;
};

/** `GET /admin/support-tickets/:id` — the ticket, its thread, and who filed it. */
export type SupportTicketDetail = SupportTicket & {
  messages: TicketMessage[];
};

/** The body `PATCH /admin/support-tickets/:id` accepts. All fields optional. */
export type TicketPatch = {
  status?: string;
  priority?: string;
  assignedAdminId?: string | null;
  categoryId?: string;
};

/** The body `POST /admin/support-tickets/:id/messages` accepts. */
export type TicketMessagePayload = {
  body: string;
  isInternalNote: boolean;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Normalisers
 *
 * WHY THESE EXIST, GIVEN A FROZEN CONTRACT
 * ───────────────────────────────────────────────────────────────────────────
 * Not paranoia — evidence. The contract spells the citizen's number `phone`;
 * the endpoint originally shipped it as `phoneNumber`, and the projection now
 * sends BOTH so neither lane breaks. Two spellings of one field genuinely exist
 * on this response, so reading `user.phone` straight off it would have rendered
 * a blank phone number against the API as it stood, with no clue why.
 *
 * They also stop a cast masquerading as a check. `apiFetch<T>` asserts a shape
 * rather than verifying one — a response whose shape drifted would produce a
 * table of blanks and no error at all. Everything on screen has been through
 * one of these two functions.
 *
 * The rule these follow: TOLERATE ABSENCE, NEVER SUBSTITUTE. A field that did
 * not arrive becomes `null`, and `null` renders as "—". Nothing here defaults a
 * priority to "normal", a status to "open", or a name to anything at all.
 * ──────────────────────────────────────────────────────────────────────────── */

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function ref(value: unknown): TicketRef | null {
  if (!isRecord(value)) return null;
  const key = str(value.key);
  if (!key) return null;
  // The label falls back to the key rather than to empty: an unlabelled badge
  // is unreadable, and the key is at least true.
  return { key, label: str(value.label) ?? key };
}

function person(value: unknown): { id: string; name: string | null } | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  if (!id) return null;
  return { id, name: str(value.name) };
}

/**
 * One list row or one detail record.
 *
 * `status` and `category` are the only two the console cannot render without,
 * because a queue sorted and filtered by status has nothing to show for a row
 * whose status is unknown. A response missing either is a contract break, and
 * the honest thing is to say so rather than to invent a placeholder status —
 * `ListShapeError`'s "that response didn't make sense" is already wired to
 * exactly this case.
 */
export function normalizeTicket(raw: unknown): SupportTicket | null {
  if (!isRecord(raw)) return null;

  const id = str(raw.id);
  const status = ref(raw.status);
  const category = ref(raw.category);
  if (!id || !status || !category) return null;

  const rawUser = isRecord(raw.user) ? raw.user : {};

  return {
    id,
    ticketNumber: str(raw.ticketNumber),
    subject: str(raw.subject) ?? "",
    description: str(raw.description) ?? "",
    status,
    priority: ref(raw.priority),
    category,
    user: {
      id: str(rawUser.id) ?? "",
      name: str(rawUser.name),
      // Both spellings, for the reason at the top of this section.
      phone: str(rawUser.phone) ?? str(rawUser.phoneNumber),
      status: ref(rawUser.status),
      avatarUrl: str(rawUser.avatarUrl),
    },
    assignedAdmin: person(raw.assignedAdmin),
    relatedReportId: str(raw.relatedReportId),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    resolvedAt: str(raw.resolvedAt),
    closedAt: str(raw.closedAt),
    // `null`, not `0`, when the field is absent. Zero is a claim — "this thread
    // is empty" — and it is the wrong one to make on a response that simply did
    // not carry the number.
    messageCount: typeof raw.messageCount === "number" && Number.isFinite(raw.messageCount)
      ? raw.messageCount
      : null,
    lastMessageAt: str(raw.lastMessageAt),
  };
}

/**
 * The detail record, with its thread.
 *
 * `senderType` is read strictly. It decides which SIDE of the conversation a
 * message is drawn on, and a message drawn on the wrong side is a support agent
 * reading their own words as the citizen's. Anything that is not exactly
 * `"user"` or `"admin"` is dropped rather than defaulted — a missing message is
 * visibly missing, a mis-sided one is not.
 *
 * `isInternalNote` is read the same way, and defaults CLOSED: anything that is
 * not exactly `false` is treated as an internal note. If the flag ever arrives
 * malformed, the failure is "a reply the citizen already saw is shown to staff
 * as private", which is embarrassing — the other direction is a leak.
 */
export function normalizeTicketDetail(raw: unknown): SupportTicketDetail | null {
  const ticket = normalizeTicket(raw);
  if (!ticket || !isRecord(raw)) return null;

  const source = Array.isArray(raw.messages) ? raw.messages : [];
  const messages: TicketMessage[] = [];

  for (const entry of source) {
    if (!isRecord(entry)) continue;
    const id = str(entry.id);
    const senderType = entry.senderType;
    if (!id || (senderType !== "user" && senderType !== "admin")) continue;

    messages.push({
      id,
      senderType,
      sender: person(entry.sender),
      body: typeof entry.body === "string" ? entry.body : "",
      isInternalNote: entry.isInternalNote !== false,
      createdAt: str(entry.createdAt),
    });
  }

  return { ...ticket, messages };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
