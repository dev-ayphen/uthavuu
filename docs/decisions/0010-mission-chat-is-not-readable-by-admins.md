# ADR 0010: Mission Chat is not readable by admins in V1

- **Status**: Accepted
- **Date**: 2026-08-28
- **Deciders**: Product owner. This is a *product* decision, not a pattern captured from code —
  the code had deliberately not decided it yet.

## Context

Mission Chat is the private conversation between a person who has asked for help and the
volunteer(s) who accepted. It is gated server-side on `hasActiveAccess()`: the reporter, or a
volunteer whose `mission_volunteers` row is not `released`, and nobody else. Both the read and the
write path refuse before touching the database —
`apps/api/src/missions/missions.service.ts:645-650` (`listMessages`) and `:674-679` (`sendMessage`)
— and `hasActiveAccess()` itself is `missions.service.ts:241-256`. CLAUDE.md § Known Gotchas calls
this "a security boundary, not just a UI filter" and names the prototype's client-only version as an
explicit anti-pattern.

The admin console needs a mission detail view. The moment somebody writes `GET /admin/missions/:id`,
they have to decide what goes in the projection, and `mission_messages` is right there next to
`mission_volunteers` and `mission_completions` in the same schema file
(`apps/api/src/db/schema/missions-schema.ts:89-103`). Adding it is one line and costs nothing at the
keyboard.

The previous architecture pass refused to make that call in code and escalated it instead — it is
question #1 in [`../_audit/open-questions.md`](../_audit/open-questions.md) and the "needs a human
decision" section of
[`../architecture/admin-console-integration.md`](../architecture/admin-console-integration.md#the-one-that-needs-a-human-decision-mission-chat),
which laid out three positions: (a) admins never read chat, (b) `super_admin` only with a recorded
reason and an audit entry, (c) it just appears in the projection because the projection happened to
include it.

This ADR answers that question.

## Decision

**Admins must not read `mission_messages` in V1. Position (a).**

Concretely:

- **No admin endpoint may return message bodies.** Not in a mission detail projection, not in a
  user detail projection, not in a support-ticket context, not as a count-plus-preview, not behind a
  `super_admin` permission check.
- **`hasActiveAccess()` stays the only authority on chat access**, and stays free of an admin
  branch. This is the same rule [ADR 0009](./0009-admin-scoped-api-surface.md) draws for the
  citizen redaction functions generally: the escape hatch must not live inside the function that
  implements the gate.
- **Everything else about a mission remains fully manageable by admins**: the report, the mission,
  the volunteer roster and their statuses, the completion and its Impact Story, comment flags,
  moderation actions, and support tickets. The restriction is on *message bodies*, not on missions.

Chat moderation, if it is ever needed, becomes a **separate feature with its own explicit privacy
rule** — its own ADR superseding this one, its own consent/disclosure language, and its own audit
action. It does not arrive as a widened projection on an endpoint built for something else.

## Consequences

**Positive**

- The product's promise and the system's behaviour say the same thing. Uthavu tells users that chat
  is private between the reporter and accepted volunteers; there is no quiet asterisk where staff
  can read it.
- There is exactly one definition of "who may see these messages", and it is the same function the
  mobile app is gated by. A reviewer checking chat privacy has one place to look.
- No new attack surface. An admin account compromise does not become a mass disclosure of private
  emergency conversations, because the endpoint that would have leaked them does not exist.
- **The decision is enforced by a test, not just by review.**
  `apps/api/src/admin/admin-reports.service.spec.ts:259-265` seeds a mission message containing a
  distinctive string, then serialises the *entire* admin report-detail projection and asserts the
  string is absent. Its own comment explains the choice: serialising the whole payload is the
  assertion that survives someone later adding a field, where a key-by-key check would not. That is
  the right shape for this constraint — the failure mode being guarded against is an accidental
  inclusion, not a deliberate one.

**Negative**

- **A harassment report about something said in chat is not investigable from the console.** This is
  a real cost and it is accepted knowingly. Support can act on the mission (release a volunteer,
  close the report) and on the account (suspend — [ADR 0011](./0011-user-suspension-blocks-login-not-content.md)),
  but staff cannot read what was said to justify it. Moderation decisions about chat will rest on
  the complainant's account of it plus the participants' history.
- If chat abuse turns out to be common, this needs revisiting — and the revisit is a feature build,
  not a config change. That is deliberate friction, but it is friction.

**Neutral**

- This constraint has to survive future "the admin should see everything" instincts, which is the
  main reason it is written down rather than left as a habit. The concrete guard is:
  **no admin endpoint or projection may include `mission_messages`.** Anyone adding an admin
  mission view should expect that line to be quoted back at them in review.
- Community Comments (`report_comments`) are the opposite case and are **not** covered by this ADR.
  They are public to any authenticated user by design (`apps/api/src/db/schema/comments-schema.ts:1-5`)
  and are fully moderatable — `comment.remove` / `comment.restore` / `comment_flag.resolve` are
  already in the audit catalogue (`apps/api/src/admin/admin-audit-catalogue.ts:56-73`), and 0018
  added `report_comments.deleted_at` / `deleted_by` for exactly that
  (`apps/api/drizzle/0018_famous_multiple_man.sql`). The privacy line runs between public community
  content and private mission conversation, not between "citizen" and "admin".
- The related, smaller question — may an admin see the real identity behind an `anonymous` report
  (`apps/api/src/reports/reports.service.ts:551-554`) — is **not** decided here and remains open
  question #2.

## Alternatives considered

- **(b) `super_admin` only, with a recorded reason and a mandatory audit entry.** The most tempting
  option, and genuinely bounded — the audit infrastructure to support it now exists
  ([ADR 0012](./0012-admin-audit-log-before-the-first-mutating-endpoint.md); `reason` is already a
  column, `apps/api/src/db/schema/audit-schema.ts:129`). Rejected for V1 on two grounds. First,
  normal moderation does not require reading everyone's private conversations — the actions the
  console actually needs (hide a report, remove a comment, resolve a flag, suspend an account) are
  all reachable without it, so this would buy an edge case at the price of the guarantee. Second, an
  audit trail records that a disclosure happened; it does not make it not a disclosure. A user who
  was told the conversation was private is not much comforted by a log entry proving staff read it.
  If the harassment case becomes real and frequent, this is the option to reopen — with disclosure
  in the privacy policy first, not after.
- **(c) Include messages in the admin projection because they are on the same table join.** Rejected
  outright, and named here precisely because it is the failure mode that happens by accident rather
  than by argument. It converts a marketed, user-facing promise into an implementation detail that
  nobody consciously decided.
- **Return message *metadata* only — counts, timestamps, participants, no bodies.** Rejected for
  now as unnecessary rather than as harmful: nothing in the eight console sections currently needs
  "how chatty was this mission", and a metadata field is the natural place a body field later gets
  added "since we already surface the messages". If a support workflow ever genuinely needs
  "did they talk at all", add it deliberately then.
- **Let the reporter export or forward their own chat when filing a complaint.** Not rejected —
  noted as the honest way to make chat abuse actionable without breaking the gate, since the
  participant already has lawful access to their own conversation. Out of scope for this ADR; it is
  a mobile feature, not an admin one.

## Evidence in code

- `apps/api/src/missions/missions.service.ts:645-650` — `listMessages()` throws `ForbiddenException`
  before any query when `hasActiveAccess()` is false.
- `apps/api/src/missions/missions.service.ts:674-679` — `sendMessage()` applies the identical gate.
- `apps/api/src/missions/missions.service.ts:241-256` — `hasActiveAccess()`: the reporter, or a
  volunteer whose status is not `released`.
- `apps/api/src/db/schema/missions-schema.ts:89-103` — the `mission_messages` table this ADR keeps
  out of every admin projection.
- `apps/api/src/admin/admin-reports.service.ts:46-53` — the constraint written into the service that
  would most plausibly have violated it: *"MISSION CHAT IS NEVER PROJECTED HERE. `mission_messages`
  is not imported by this file and must not be."*
- `apps/api/src/admin/admin-reports.service.spec.ts:259-265` — the `NEVER exposes Mission Chat` test.
- `apps/api/src/admin/` — verified 2026-08-28 across the full admin surface (8 controllers,
  `/admin/reports`, `/admin/users`, `/admin/analytics`, `/admin/audit-logs`,
  `/admin/report-categories`, `/admin/support-tickets`, comments and the root controller): the only
  references to `missionMessages` are the service comment above and the test that asserts its
  absence. No production admin code imports the table.
- `apps/api/src/admin/admin-audit-catalogue.ts:15-98` — the eleven audit actions currently defined
  cover reports, comments, comment flags, categories and support tickets. **None of them is a chat
  action**, which is the catalogue agreeing with this decision.

---

*Decided by the product owner 2026-08-28. Captured against working tree at commit `d035cfd`; the
`apps/api/src/admin/` code referenced above was uncommitted in the shared working copy when this was
written, and the admin surface grew from 3 endpoints to 8 controllers during the writing of it — the
"no `mission_messages`" property was re-verified against the larger surface at the end. Answers open
question #1 in [`../_audit/open-questions.md`](../_audit/open-questions.md).*
