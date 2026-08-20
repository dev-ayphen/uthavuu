# Feature: `mission-completion`

- **Status:** agreed
- **Milestone:** v0.1
- **Owner:** TBD

## Problem

A volunteer who's been actively helping needs a way to mark the work done — including proof that
something real happened — so the report can close and other people stop treating it as needing
help. Without this, "helping" has no endpoint: reports stay open forever, and there's no record of
who did what, which the future Impact Story feature will need to read from.

## Users & roles

| Role | What they can do here |
|---|---|
| Active volunteer | Submits completion (photo + note) for a mission they're currently `active` on |
| Reporter | Sees the mission complete, sees the submitted photo/note; cannot submit completion themselves |
| Other volunteers on the roster | Keep their own participation history untouched; lose the ability to send new Mission Chat messages once the mission completes |

## User stories

### US-1 — Submit mission completion

As an **active volunteer**, I can **submit a completion photo and note** so that **the report
reflects that help was actually delivered**.

- **AC1:** Given I'm currently `active` on this mission, when I open Complete Mission, then I'm
  prompted for a live camera photo (no gallery picker) and a required note.
- **AC2:** Given I try to submit without a photo or without a note, when I attempt it, then it's
  rejected client- and server-side.
- **AC3:** Given I'm the reporter, or I'm not an active volunteer on this mission (never accepted,
  still only `joined`, or already `released`), when I try to submit, then it's rejected.
- **AC4:** Given this mission already has a completion, when anyone tries to submit again, then
  it's rejected — completion is a one-time event per mission.

### US-2 — Verification

As **the system**, I **verify a submitted completion** so that **only genuine submissions result
in a completed report**.

- **AC1:** Given a completion is submitted with a photo URL and note, when it's processed, then
  the photo URL is checked against this app's own upload store — a URL that didn't come from a
  real upload here is rejected.
- **AC2:** Given verification passes, when it completes, then the `mission_completions` row is
  stamped both `submittedAt` and `verifiedAt`, and the report's status becomes `completed` with
  `closedAt` stamped, in the same operation.
- **AC3:** Given verification is entirely synchronous today (no async job, no ML content check),
  when a volunteer submits, then they see the result (success or rejection) immediately — there's
  no "pending" state a user waits through in this build, even though the data model supports one
  being added later without a redesign.

### US-3 — Mission Chat locks

As a **participant**, I can **still read Mission Chat history after completion, but can no longer
send new messages**, so that **coordination clearly ends when the work is done**.

- **AC1:** Given the report is `completed`, when I try to send a message, then it's rejected
  server-side.
- **AC2:** Given the report is `completed`, when I open Mission Chat, then existing messages are
  still visible to whoever already had access.

### US-4 — Reporter sees the completion

As the **reporter**, I can **see the submitted proof photo and note once the mission completes**,
so that **I know how it was resolved**.

- **AC1:** Given the mission is completed, when I view Request Details, then I see the completion
  photo and note alongside the closed status.

## Business rules

- **BR-1:** Only a volunteer with status `active` (not `joined`, not `released`) on this mission
  can submit completion. The reporter cannot complete their own report — mirrors
  `accept-and-mission-chat.md`'s "can't accept your own report" precedent.
- **BR-2:** Both a photo and a note are required to submit — no partial submission.
- **BR-3:** Verification is a real, synchronous, honest check: the submitted `photoUrl` must
  correspond to a file that was actually uploaded through this app's existing `POST /uploads`
  endpoint. This is **not** content/ML analysis — no duplicate-image detection, no image-quality
  or content-safety scanning. Explicit product-owner decision: none of that infrastructure exists
  in this codebase, and building it now would mean either significant new scope or a fabricated
  check — this project has already caught and rejected exactly that anti-pattern once (the old
  prototype's fake "AI Safety Verification" score, `docs/mobile/12-profile-screen.md`'s gap #12).
- **BR-4:** `mission_completions` and its status (`submitted` → `waiting_verification` →
  `verified`) are modeled as real, distinct, timestamped states — even though today's verification
  step is synchronous and always resolves within the same request — so a future pass can make
  verification genuinely asynchronous (real content analysis, or human review) without redesigning
  the state machine or the API contract.
- **BR-5:** On verified completion: `reports.statusId` moves to a **new** `completed` key (not
  reusing `closed`), so a genuinely-helped report stays distinguishable from one closed by
  cancellation or expiry — this is what the future Impact Story feature will query against.
  `closedAt` is stamped.
- **BR-6:** Completion is idempotent — a report already `completed` rejects further completion
  attempts. Enforced by construction: `mission_completions.mission_id` is a unique FK, not just an
  application-level check.
- **BR-7:** Other volunteers' own `mission_volunteers` rows are not modified by someone else's
  completion — their `joined`/`active`/`released` status stays exactly as it was, preserving
  accurate participation history.
- **BR-8:** Mission Chat read access is unchanged after completion (same reporter-or-was-joined/
  active gate as before, `accept-and-mission-chat.md` BR-4). Sending is blocked once
  `reports.statusId` is `completed`.
- **BR-9:** `neededVolunteers`, the roster, and everything else from `accept-and-mission-chat.md`
  are untouched by this feature — completion is additive.

## Data touched

| Table | New / changed | Notes |
|---|---|---|
| `report_statuses` | new row | `key='completed'`, `label='Completed'` |
| `mission_completion_statuses` | new lookup | `submitted` → `waiting_verification` → `verified` (CLAUDE.md: lookup table, not a hardcoded enum) |
| `mission_completions` | new | `id`, `mission_id` (**unique** FK → `missions`), `completed_by_id` (FK → `user`), `photo_url`, `note`, `status_id` (FK), `submitted_at`, `verified_at` |

**Invariant this introduces:** at most one `mission_completions` row per mission — enforced by the
unique FK on `mission_id`, which is also what makes completion idempotent/one-time by construction
rather than by an application-level check alone.

## API surface (implied, not yet built)

- `POST /reports/:id/complete` — body `{ photoUrl: string, note: string }`. Auth via the existing
  session; BR-1 (must be `active`, can't be the reporter) enforced in the service. Returns the
  updated report/roster shape — exact response shape decided in the implementation plan.
- Existing `POST /uploads` is reused unchanged for the photo itself — no new upload endpoint.
- Existing `POST /reports/:id/messages` (Mission Chat) gains one more check: reject if
  `reports.statusId` is `completed`. `GET /reports/:id/messages` is unchanged.

## Screens

| Screen | Route | Notes |
|---|---|---|
| Request Details (existing) | `/requests/:id` | Gains a "Complete Mission" action for active volunteers, a completion composer (camera + note), and a completion display (photo + note) once completed |

The completion composer is a section/flow within Request Details, not a new route — mirrors how
Mission Chat itself is a section, not its own screen (`accept-and-mission-chat.md` precedent).

## Out of scope

- **Impact Story generation, public story page, sharing** (WhatsApp/Instagram/Facebook/link) — a
  fully separate future feature (GitHub issue #2, blocked on this one). This pass produces exactly
  the data (photo, note, `verifiedAt`, who helped) a future Impact Story feature will read; it
  builds no story object, page, or share flow.
- **Volunteer reputation/credit/badges** — no such system exists or was ever decided; not
  introduced here. `missionsCount` (shipped earlier this session) already counts every
  `mission_volunteers` row regardless of outcome and needs no change.
- **Real content verification** — duplicate-image detection, image-quality scoring, content-safety
  scanning. Explicitly not built (BR-3). If real automated content checks are wanted later, they
  slot into the existing `submitted` → `waiting_verification` → `verified` state machine without a
  redesign.
- **Human/reporter review-based verification** — considered and explicitly not chosen; any active
  volunteer's submission is trusted once it passes the real upload-provenance check.
- **Editing or retracting a submitted completion.**
- **Any change to the 15-minute confirm window or the accept/leave flow** from
  `accept-and-mission-chat.md`.

## Open questions

None — resolved during the brainstorming interview with the product owner (2026-08-20). One
correction made mid-interview, worth recording: the product owner's initial flow described
"automated verification" as content-level checks (duplicate images, image quality, content
safety), matching a pasted external reference document. This was explicitly walked back to a real
but basic check (upload provenance only) once it was flagged that content-level ML checks don't
exist in this codebase and building them now would mean either significant new scope or a
fabricated pass/fail gate — the exact anti-pattern `docs/mobile/12-profile-screen.md`'s "AI Safety
Verification" gap already documents as a defect in the old prototype. The five-stage state machine
(`ACTIVE` → `COMPLETION_SUBMITTED` → `WAITING_VERIFICATION` → `VERIFIED` → `COMPLETED`) was kept at
the product owner's explicit request specifically so a real, possibly-async verification step can
be added later without a redesign — even though it resolves synchronously today.

## Related docs

- Related feature: [`accept-and-mission-chat.md`](./accept-and-mission-chat.md) — the
  `mission_volunteers` roster and Mission Chat this extends; BR-1 mirrors its "can't accept your
  own report" precedent, and this feature's Out of scope entry there is what this doc fulfills.
- Product decisions: [`../PRODUCT-DECISIONS.md`](../PRODUCT-DECISIONS.md) Decision 1 (no
  fabricated trust/rating signals) — BR-3's rejection of a fake content-verification score follows
  the same principle.
- Backlog: GitHub issue #1 (this feature) and #2 (Impact Story, blocked on this).
