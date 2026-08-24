# Feature: `edit-cancel-report`

- **Status:** agreed
- **Milestone:** v0.1
- **Owner:** TBD

## Problem

A reporter who made a mistake — a typo, a wrong photo, a request that's no longer needed — has no
way to fix or withdraw it once published. Worse, there's currently no lock preventing a reporter
from silently changing a report's substance (location, what's needed) after a volunteer has
already committed to help — the exact scenario this feature exists to close off: a volunteer
travelling to a reported address must never have it move or change shape under them mid-trip.

This feature adds real Add Report validation (most of which already existed and just needed
closing gaps), a locked-down Edit Report, a Cancel Report that notifies anyone already
responding, and a soft-delete-only Delete Report — deliberately **not** a permanent delete for
normal users, since a published report may already carry real related data (photos, an audit
trail, in future comments) worth keeping.

## A note on scope vs. an earlier draft of this spec

An earlier draft of this feature (given to the implementer as informal product notes, referencing
the fictional legacy prototype documented under `docs/mobile/*`) included an "Email required
before posting" validation rule and a "Draft" / "Waiting Verification" report status. Both were
dropped before implementation:

- **Email is explicitly out of scope for report creation.** CLAUDE.md's App Profile states
  plainly: "Email: not used anywhere in the product (private profile field only)." This is a
  deliberate, documented architectural decision, not an oversight — report creation has no email
  field anywhere in the real DTO/API/mobile flow, and this feature doesn't add one. Confirmed
  explicitly by the product owner during implementation — no change needed.
- **This codebase has no "Draft" or "Waiting Verification" *report* status.** A report is always
  created directly as `open` (there's no draft/unpublished intermediate state in v0.1's flow —
  the entire Add Report wizard runs client-side before the first `POST /reports` call, so there's
  nothing to "save as draft"). "Waiting Verification" already exists, but as a **mission
  completion** status (`mission_completion_statuses`, see `mission-completion.md`), not a report
  status — the permission matrix below doesn't conflate the two.

## Users & roles

| Role | What they can do here |
|---|---|
| Reporter (report owner) | Edits their own report while eligible; cancels it at any point while open; soft-deletes it while eligible |
| Volunteer already joined/active on a report | Loses nothing they've already done if the reporter edits (edit is blocked once they've joined); is notified by alert if the reporter cancels |
| Anyone else | No access to another user's edit/cancel/delete actions — enforced server-side, not just hidden client-side |

## Real status vocabulary used below

This codebase's actual report lifecycle (`reports.statusId` → `report_statuses.key`):
`open` → `closed` | `expired` | `completed`. Separately, a **mission** (created lazily on first
volunteer accept) tracks each volunteer's own status: `joined` → `active` → `released`. "Has a
volunteer joined" below always means "does this report's mission have any `mission_volunteers`
row whose status isn't `released`" — computed server-side
(`MissionsService.hasAnyActiveVolunteer()`), never trusted from the client.

`closed` is reused for Cancel Report — no separate `cancelled` status was added. The only way a
report currently reaches `closed` is the reporter-initiated close/cancel action, so a second
status key would be a distinction without a difference.

## User stories

### US-1 — Add Report validation

As a **reporter**, I get **clear, real validation before I can publish**, so that **a request
that reaches volunteers is actually actionable**.

Most of this already existed in `ReportFlowScreen.tsx` before this feature (camera-only photo
capture with required upload success, non-empty title/description). The gaps this feature closes:

- **AC1:** Given a description that's empty, whitespace-only, or under 20 characters, when I try
  to publish, then it's rejected client- and server-side with a clear message (not just a
  disabled button with no explanation).
- **AC2:** Given location permission is denied or GPS fails to resolve, when that happens, then I
  see a real inline error with a retry action — not a silently-disabled Publish button with zero
  feedback (the pre-existing bug: `onPublish` guarded on `lat`/`lng` internally, but the button
  itself wasn't disabled and the location `useEffect` swallowed its own failure).
- **AC3:** Given I haven't checked "I confirm that the information provided is accurate to the
  best of my knowledge," when I try to publish, then Publish stays disabled. This is a
  client-side-only honesty gate — no field is persisted for it.
- **AC4:** Category, photo (camera-only, upload-success required), and valid coordinates were
  already correctly enforced — this feature verifies them live rather than rebuilding them.

### US-2 — Edit Report

As a **reporter**, I can **edit my own report while it's still safe to change**, so that **I can
fix a mistake without confusing anyone already responding**.

- **AC1:** Given the report is `open` and no volunteer has joined/is active, when I edit it, then
  title, description, photos (full replace), landmark, `neededVolunteers`, `anonymous`, and
  `phoneVisible` can all change. Category and coordinates (lat/lng) are never editable — a
  category or location change is a new request, not an edit of this one.
  Server-enforced field validation mirrors `CreateReportSchema` exactly (`update-report.dto.ts`).
- **AC2:** Given any volunteer has joined (`joined` or `active`, not `released`), when I try to
  edit, then it's rejected (403) with a message pointing at Cancel Report instead — enforced
  server-side (`ReportsService.update()`), not just hidden client-side. The same rule is exposed
  as `editable: boolean` on every `Report` response so the client never has to duplicate the
  logic and risk drift.
- **AC3:** Given the report isn't `open` at all (`closed`/`expired`/`completed`), when I try to
  edit, then it's rejected the same way — `editable` is `false` for any non-`open` status.

### US-3 — Cancel Report

As a **reporter**, I can **cancel my own open report at any point**, so that **I can withdraw a
request I no longer need help with, even after someone's already responding**.

- **AC1:** Given the report is `open` with no volunteers joined, when I cancel it, then it moves
  to `closed` with a mild confirmation ("This request will no longer be visible to volunteers.").
- **AC2:** Given the report is `open` with one or more volunteers `joined`/`active`, when I cancel
  it, then I see a stronger confirmation ("Volunteers have already joined this mission. Cancelling
  will notify them that help is no longer required."), and each active volunteer receives a real
  `report_cancelled` alert ("The request you joined... has been cancelled by the reporter.") —
  not a silent status flip.
- **AC3:** Given the report isn't `open`, when I try to cancel, then it's rejected the same way
  `close()` already rejected a non-open report before this feature.
- **AC4:** Cancel is available regardless of volunteer state, unlike Edit — this is the
  intentional asymmetry: changing *what* was asked for mid-flight is dangerous, withdrawing the
  request entirely is always safe to allow (with notification).

### US-4 — Delete Report (soft delete only)

As a **reporter**, I can **remove a report I posted by mistake**, so that **it stops appearing
anywhere without destroying data that might matter later**.

- **AC1:** Given the report is `open` and zero volunteers have *ever* joined (same
  `hasAnyActiveVolunteer` check as Edit's eligibility gate), when I delete it, then `deletedAt`
  and `deletedBy` are stamped on the row — the row itself, its photos, and any related data are
  **never** hard-deleted.
- **AC2:** Given any volunteer has joined, when I try to delete, then it's rejected — the client
  shows "Delete is unavailable because volunteers have already joined this request." and points
  at Cancel Report instead.
- **AC3:** Given the report isn't `open` (active mission, completed, expired, already closed),
  when I try to delete, then it's rejected the same way.
- **AC4:** A deleted report is excluded from `GET /reports` (discovery), `GET /reports/summary`
  (category counts), and the reporter's own "Active" tab in My Reports. It is **not** shown as a
  separate "Deleted" tab anywhere — a deleted report simply disappears from the reporter's own
  view too, same as it disappears from everyone else's. The row survives untouched in the
  database for audit/history purposes.
- **AC5:** A second delete attempt on an already-deleted report is rejected with 404 (treated as
  "not found" from the perspective of every endpoint that filters out soft-deleted rows) rather
  than silently no-op'd — deliberate, not left undefined.

**Why soft delete, not hard delete:** a published report may already have real related data
attached to it by the time someone wants it gone — photos, in future comments/likes, always an
implicit audit trail of who reported what and when. Hard-deleting the row would destroy that for
no real benefit over simply excluding it from every listing a normal user can reach. This mirrors
the same "don't throw away data you don't have to, keep the door open for a real answer later"
reasoning already used elsewhere in this repo's `docs/decisions/` (e.g. local-disk photo storage
today, swappable to real cloud storage later without a schema change). An admin-console
moderation "remove/hide" action is a distinct, future, admin-only concern — out of scope here.

## Permission matrix

| Report state | Edit | Cancel | Delete |
|---|---|---|---|
| `open`, no volunteers ever joined | ✅ | ✅ (mild confirm) | ✅ |
| `open`, a volunteer has joined/is active | ❌ (403, points at Cancel) | ✅ (strong confirm + notifies volunteers) | ❌ (points at Cancel) |
| `closed` (i.e. cancelled) | ❌ | ❌ | ❌ |
| `expired` | ❌ | ❌ | ❌ |
| `completed` | ❌ | ❌ | ❌ |

There is no "Draft" row and no "Waiting Verification" row — see the scope note above for why.
"Repost" (turning an expired report into a fresh one) is explicitly a future feature, not part of
this one; for v0.1, an expired report's reporter simply creates a new report if they still need
help.

## Data touched

- `reports` gains `deletedAt` (nullable timestamp) and `deletedBy` (nullable FK → `user`) —
  migration 0010. No new status key added anywhere (`closed` is reused for Cancel; no `cancelled`
  or `draft` key exists).
- `alert-templates.ts`'s `AlertType` gains `report_cancelled` (EN real copy, TA
  machine-generated placeholder — same documented caveat as every other alert template and the
  mobile i18n catalog). No schema change needed for this — `alerts.type` is plain text, not
  DB-enforced.
- New `PATCH /reports/:id` (edit), extended `POST /reports/:id/close` (cancel, now with
  volunteer notification), new `DELETE /reports/:id` (soft delete).
- New `GET /users/me/reports` — the reporter's own reports across all non-deleted statuses, for
  the new My Reports screen.

## Out of scope for v0.1

- Repost / re-open an expired report.
- Admin-console "remove/hide" (moderation), separate from a user's own Delete.
- Editing category or coordinates on an existing report.
- Any change to Community Comments, Mission Chat, or Impact Story — untouched by this feature.
