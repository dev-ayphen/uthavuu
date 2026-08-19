# Feature: `accept-and-mission-chat`

- **Status:** agreed
- **Milestone:** v0.1
- **Owner:** TBD

## Problem

Discovering a nearby request isn't enough — someone has to actually take it on, and the reporter
and helper(s) need a private channel to coordinate ("I'm 5 minutes away, bring the rope") without
exposing a phone number to everyone who glances at the request. Accepting also needs a real
commitment signal: a volunteer who taps "I'll help" and then does nothing shouldn't silently block
the request from anyone else picking it up.

## Users & roles

There is no separate volunteer account — any authenticated citizen can accept a request they
didn't post themselves.

| Role | What they can do here |
|---|---|
| Reporter | Sees who has accepted, coordinates via Mission Chat, sees phone only if they opted in |
| Volunteer (any citizen, not the reporter) | Accepts an open slot, confirms within 15 minutes, coordinates via Mission Chat, can leave |
| Bystander (not accepted) | Sees the roster count on Request Details; no chat, no phone |

## User stories

### US-1 — View request details

As a **citizen**, I can **open a request to see its full details and mission roster** so that **I
can decide whether to help**.

- **AC1:** Given I tap a request in the category list, when it opens, then I see its photo,
  title, description, location, reporter card, and roster (`X of Y volunteers`).
- **AC2:** Given I haven't accepted this request, when I view it, then I don't see Mission Chat or
  the reporter's phone number, regardless of the reporter's `phoneVisible` choice.
- **AC3:** Given the roster is already full (`Y of Y`), when I view it, then Accept is disabled
  with a clear "volunteer limit reached" message instead of failing silently on tap.

### US-2 — Accept a request

As a **citizen**, I can **accept an open request** so that **the reporter and other volunteers
know I'm coming**.

- **AC1:** Given a request has an open slot and I'm not its reporter, when I tap Accept, then I'm
  added to the roster with a 15-minute window to confirm.
- **AC2:** Given I try to accept my own report, when I attempt it, then it's rejected.
- **AC3:** Given I already have an active acceptance on this request, when I try to accept again,
  then it's rejected rather than creating a duplicate.
- **AC4:** Given the roster is full, when I try to accept, then it's rejected with the same
  "volunteer limit reached" message as US-1 AC3.

### US-3 — Confirm within the window

As an **accepted volunteer**, I can **confirm I'm starting to help within 15 minutes** so that
**my spot is secured rather than silently blocking someone else**.

- **AC1:** Given I accepted less than 15 minutes ago, when I tap "Start Helping," then my status
  becomes active and stays active regardless of what happens to the timer afterward.
- **AC2:** Given 15 minutes pass without me confirming, when the request is next viewed by anyone
  (including me), then my acceptance is released and the slot is available again — no action
  required from me, no background process either (BR-3).

### US-4 — Leave a mission

As an **accepted or active volunteer**, I can **leave** so that **my slot frees up for someone
else if I can't continue**.

- **AC1:** Given I'm currently joined or active on a request, when I tap "I can't continue," then
  my slot releases immediately and I lose chat/phone access for this request.

### US-5 — Coordinate via Mission Chat

As the **reporter or an active volunteer**, I can **send and read messages scoped to this
request** so that **we can coordinate the help in private**.

- **AC1:** Given I'm the reporter or currently joined/active, when I open Mission Chat, then I can
  read and post messages.
- **AC2:** Given I'm not the reporter and not currently joined/active (never accepted, or my slot
  was released), when I try to read or post, then the server rejects it — not just a hidden UI
  element (BR-4).
- **AC3:** Given there's no realtime transport (ADR 0005), when I have chat open, then new
  messages appear on manual refresh / re-open, not automatically pushed.

## Business rules

- **BR-1:** `neededVolunteers` (1–20, default 1) is set once at report creation and is fixed for
  v0.1 — no edit flow after publish, same "immutable unless a future edit flow exists" treatment
  as everything else `report-a-request.md`'s BR-6 already locks down.
- **BR-2:** Multiple volunteers may accept the same request, up to `neededVolunteers`. Capacity is
  enforced server-side at accept time (US-2 AC4) — never trust a client-side count.
- **BR-3:** A volunteer has a 15-minute window after accepting to confirm ("Start Helping").
  Missing it releases only that volunteer's slot, not the whole roster or the other volunteers'
  progress. The deadline is checked **lazily** — whenever the request/roster is read or acted on —
  not by a scheduled job. Explicit v1 scope decision: no new queue/worker infrastructure for this;
  revisit only if staleness between "deadline passed" and "someone happens to look" proves to be a
  real problem in practice.
- **BR-4:** Mission Chat and the reporter's phone number (when `phoneVisible`) are visible only to
  the reporter and to volunteers currently in `joined` or `active` status — enforced server-side
  on every read/write, the same class of security boundary as the phone-reveal gate in
  `auth.md`, not a client-side filter (CLAUDE.md's Known Gotchas calls this out explicitly: the
  old prototype got exactly this wrong).
- **BR-5:** A volunteer can voluntarily leave (release their own slot) at any time before the
  request closes — no confirmation dialog required beyond the leave action itself.
- **BR-6:** Accepting a request never changes `reports.status` — a request stays `open` regardless
  of how many volunteers have joined. Only the existing manual-close path (or future
  expiry/completion work, out of scope here) changes it.
- **BR-7:** Volunteers are never anonymous — only a reporter can post anonymously (US-4,
  `report-a-request.md`). The roster always shows a volunteer's real name/avatar.

## Data touched

| Table | New / changed | Notes |
|---|---|---|
| `reports` | new column | `needed_volunteers` (int, default 1) |
| `missions` | new | `id`, `report_id` (unique FK → `reports`), `created_at`. Auto-created on the first accept. **No status column in this build, deliberately** — mission-level lifecycle status (accepted/helping/completed) is intentionally deferred to the mission-completion feature; what `mission_volunteers.status` tracks below is only each volunteer's own participation state, not the mission's. |
| `mission_volunteer_statuses` | new lookup | `joined` → `active` → `released` (CLAUDE.md: lookup table, not a hardcoded enum) |
| `mission_volunteers` | new | `mission_id` (FK), `volunteer_id` (FK → `user`), `status_id` (FK), `confirm_deadline`, `joined_at`, `confirmed_at`, `released_at`, `release_reason` ('timeout' \| 'voluntary') |
| `mission_messages` | new | `mission_id` (FK), `sender_id` (FK → `user`), `body`, `created_at`. **Not** where flags/reports on a message live — moderation (flagging a message, a comment, a report) is a separate feature and touches none of these tables in this build; see Out of scope. |

**Invariants this introduces:** at most one **active** (`joined`/`active`) `mission_volunteers` row
per `(mission_id, volunteer_id)` at a time — enforced in application logic (a volunteer can have
multiple historical `released` rows from earlier accept/leave cycles, so this isn't a DB unique
constraint). `neededVolunteers` is a soft cap checked at accept time; a race between two
simultaneous accepts for the last slot is possible and accepted as a known v1 limitation, not
solved with row locking in this pass.

## Screens

| Screen | Route | Page doc (after build) |
|---|---|---|
| Request Details (new) | `/requests/:id` | `pages/request-details.md` |

Mission Chat is a section/modal within Request Details, not its own route or tab — matching the
one part of the old prototype's design that was already right: temporary, mission-scoped
coordination, not a persistent messaging product.

## Out of scope

- **Mission completion** — proof photo, reporter approval/verification, `COMPLETED` state, Impact
  Story generation. A separate follow-up doc once this feature is built and working (explicit
  product-owner decision, 2026-08-19).
- **Community Updates** (the public, anyone-can-post feed on a request) — a separate feature per
  `PRODUCT-DECISIONS.md` Decision 2/3; not touched by this build.
- **Flagging/reporting content, share sheets** — separate features; still real product scope, just
  not part of this build (same treatment `report-a-request.md` gave moderation).
- **Quick status broadcast pills** ("On the way," "Reached location," etc.) — a nice-to-have from
  the old prototype's design; the roster + chat already cover real coordination for v1.
- **Editing `neededVolunteers` after publish** (BR-1).
- **Realtime chat** (websockets/push) — REST poll/refresh only, per ADR 0005 (no realtime
  transport yet).
- **A background job for the 15-minute deadline** — explicit v1 scope decision (BR-3); lazy
  enforcement only.

## Open questions

None — resolved during the brainstorming interview with the product owner (2026-08-19). Note:
several claims proposed mid-interview (a `PUBLISHED/ACCEPTED/HELPING/WAITING_VERIFICATION/
COMPLETED/CANCELLED/EXPIRED/ARCHIVED` state machine, "Rule 14," an "Expiry worker," a "Phase 1
roadmap") were checked against every file in `docs/` and don't exist anywhere in this repo —
they were not adopted. See the session transcript for the verification.

## Related docs

- Product: [`../01_Product_Summary.md`](../01_Product_Summary.md) § 2 (Accept/Help steps of the
  core loop), § "Mission Chat" row
- Related feature: [`report-a-request.md`](./report-a-request.md) — the `reports` schema this
  extends, and BR-6's "immutable after publish" precedent this mirrors for `neededVolunteers`
- Related feature: [`auth.md`](./auth.md) — the phone-reveal gating precedent BR-4 extends
- ADRs: [`../decisions/0005-no-realtime-transport-yet.md`](../decisions/0005-no-realtime-transport-yet.md)
- Product decisions: [`../PRODUCT-DECISIONS.md`](../PRODUCT-DECISIONS.md) Decision 2 (Community
  Comments vs Mission Chat)
