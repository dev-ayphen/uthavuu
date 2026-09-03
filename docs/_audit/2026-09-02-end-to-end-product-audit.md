# End-to-end product audit — 2026-09-02

_Scope: is Uthavu complete and correctly wired end to end, and where are the gaps?_
_Method: live exercise of the running system (API on `localhost:3001` in Docker, Postgres on
5433, Redis on 6380) plus code reading. Every finding below is marked **VERIFIED LIVE** or
**READ ONLY** (established by reading code, not executed)._
_Auditor lane: document-only. No application code was modified._

_Verified against commit `96f6386`, working tree as on disk 2026-09-02 (≈59 files uncommitted
from other live sessions)._

---

## Verdict

**No — not complete end to end, but much closer than the gap count suggests.** The spine of the
product works: I ran the full core loop live against the running API with three real
phone-OTP sessions — report → discover by radius → accept → 15-minute confirmation → Mission
Chat → completion → Impact Story — and every step persisted correctly. Both security gates
CLAUDE.md names (Mission Chat and the reporter's phone reveal, on `hasAccepted`) are genuinely
server-side and refuse a stranger with 403/`null`. Suspension, hide/reinstate, comment removal,
category gating and the two-way support conversation all propagate from the console to the
citizen API for real. Migrations are clean: 25 files, 25 applied rows, zero hash drift.
**The top three gaps are:** (1) **expired reports are still served to citizens as `open`** —
76 of 147 open reports in the live DB are past `expiry_at`, the Discover feed returns them,
the summary counts them as "urgent", and a volunteer can still accept one; the admin console
correctly calls the same report `expired`, so the two surfaces actively disagree;
(2) **Announcements have no citizen surface at all** — `GET /updates` is a finished, correct
endpoint and the mobile app never calls it, so everything staff publish there is invisible;
(3) **a scheduled broadcast never sends** — there is no cron, no queue, no scheduler anywhere
in the API, so `broadcasts.scheduled_at` is a promise nothing keeps.

---

## Findings by severity

### S1 — Expired reports are served to citizens as open, and can still be accepted
**VERIFIED LIVE.**

The citizen Discover queries filter on `status = 'open'` and distance but never on
`expiry_at`. Nothing ever writes the `expired` status — `report_statuses.expired` is a seeded
lookup row with zero rows pointing at it, by design.

- Filter, with no expiry predicate: `apps/api/src/reports/reports.service.ts:426-433` (`list`),
  `:418-427` (`summary`), `:455-472` (`communityStats`)
- The deliberate no-write decision: `apps/api/src/admin/report-effective-status.ts:11-46`
- Admin derives the truth instead: `apps/api/src/admin/admin-reports.service.ts:191`, `:415`

Live evidence, same report id on both surfaces:

| Surface | Response |
|---|---|
| `GET /reports?categoryKey=medicalHelp&lat=13.08&lng=80.27&radiusKm=5` | 146 items, **76 past `expiryAt`**, all `status: "open"` |
| `GET /admin/reports/01a04280-…d444a` | `status: "expired"`, `storedStatus: "open"`, `expired: true`, `expiryAt: 2026-08-27` |
| `POST /reports/01a04280-…d444a/volunteers` as a fresh citizen | **201 Created** — mission joined on a request that expired 6 days earlier |

Compounding bug in the same query: the "urgent" counter is
`count(*) filter (where expiry_at - now() < interval '1 hour')`
(`apps/api/src/reports/reports.service.ts:421`). That predicate is **true for everything
already expired**, so long-dead reports are counted as *expiring soon*. Live:
`{"key":"medicalHelp","activeCount":146,"urgentCount":77}` — 77 "urgent" of which 76 are
expired.

**User-visible consequence:** the Dashboard shows inflated counts and a red urgency badge
driven mostly by dead requests; a volunteer taps a week-old request, accepts it, gets the
reporter's phone number and an open Mission Chat, and travels to help with something long over.

**Fix shape (not applied):** add `gt(reports.expiryAt, now())` to the three discover
predicates and to the accept path, and make the urgent filter a range
(`expiry_at > now() AND expiry_at - now() < interval '1 hour'`).

---

### S1 — Announcements are published to nobody
**VERIFIED LIVE (both halves).**

`GET /updates` is complete and correct — locale resolution, publish-window filter,
soft-delete filter, 50-row cap
(`apps/api/src/updates/updates.service.ts:33-70`). It returned my probe row live.

The mobile app never calls it. Exhaustive grep across `apps/mobile/src` and `libs-mobile`
for `/updates` returns **zero call sites**; the mobile endpoint inventory has 44 distinct
routes and this is not one of them.

The console half is fully built: `/announcements` list, create, edit, publish, archive,
delete — `apps/admin/src/app/(console)/announcements/page.tsx:37`,
`apps/admin/src/features/announcements/update-actions.tsx:157` (publish), `:169` (archive).

**User-visible consequence:** staff write a bilingual announcement, hit Publish, it lands in
`community_updates` with `status = published`, the API serves it — and no citizen ever sees
it. Every hour spent in that console section produces nothing.

---

### S1 — A scheduled broadcast never sends
**VERIFIED LIVE.**

There is no scheduler in the API: no `@nestjs/schedule`, no BullMQ, no cron, no `setInterval`.
`grep -rn "@Cron|ScheduleModule|BullMQ|Queue|Processor|setInterval"` over `apps/api/src`
returns only a comment saying BullMQ is not installed
(`apps/api/src/db/schema/broadcasts-schema.ts:149`).

`scheduled` is nonetheless a real, reachable state that the create/update path writes
whenever `scheduledAt` is set — `apps/api/src/admin/admin-broadcasts.service.ts:230-232`,
`:340-343`.

Live probe: created a broadcast with `scheduledAt = 10:16:00Z`. At **10:17:01Z** it was still
`status: scheduled`, `sentAt: null`, `recipientCount: null`. Nothing swept it.

Only the manual `POST /admin/broadcasts/:id/send` moves it, and that accepts
`draft | scheduled` (`apps/api/src/admin/admin-broadcasts.service.ts:668-677`).

**User-visible consequence:** an operator schedules a flood warning for 6am, closes the
laptop, and it never goes out. This is the highest-stakes silent failure in the product —
worse than not offering scheduling at all.

**Note:** the *manual* send path is fully wired and works. Verified live: a district-scoped
broadcast to "Chennai" returned `recipientCount: 3`, wrote one `alerts` row per recipient, and
the citizen `GET /users/me/alerts` returned it as `type: "broadcast"`. `deliveredCount: 0`
because no FCM credentials are configured and `devices` holds 0 rows — expected, not a defect.

---

### S2 — Discover is an unbounded query with an N+1 behind it and no spatial index
**VERIFIED LIVE (timing + EXPLAIN).**

Three separate problems on the single hottest citizen path:

1. **No index the radius filter can use.** The predicate is a haversine expression over bare
   `lat`/`lng` columns (`apps/api/src/reports/reports.service.ts:42-48`). `reports` has
   indexes on `category_id`, `reporter_id`, `status_id` only — none on location.
   `EXPLAIN ANALYZE` on the live DB: `Seq Scan on reports … Rows Removed by Filter: 219`.
   Every Discover load computes an `acos` per report row in the table.
2. **No `LIMIT`.** `list()` returns every matching report
   (`apps/api/src/reports/reports.service.ts:414-443`). Live, one category at 5km returned
   **146 items / 87 KB**.
3. **N+1 per returned row.** For each report the response builder awaits
   `hasActiveAccess()` **and** `hasAnyActiveVolunteer()`
   (`apps/api/src/reports/reports.service.ts:535-551`). Each resolves a mission id and calls
   `expireStaleAndListVolunteers()` (`apps/api/src/missions/missions.service.ts:185-227`),
   which is itself a join query **plus a serial `UPDATE` loop** when stale rows exist. That is
   roughly six queries per report — ~900 for one screen at today's data volume.

Measured live: 112–208 ms for one Discover call on a 516-row table with everything warm in
shared buffers. The shape is linear in reports-per-radius, so a busy Chennai launch is where
this surfaces, not now.

**User-visible consequence:** the Discover screen degrades from snappy to multi-second as the
product succeeds, and the failure mode is proportional to adoption.

---

### S2 — Removing a comment does not resolve its flags
**VERIFIED LIVE.**

`AdminCommentsService.remove()` sets `removed_at` on the comment and never touches
`report_comment_flags` — no flag-status write anywhere in
`apps/api/src/admin/admin-comments.service.ts`. Resolving a flag is a separate action,
`PATCH /admin/flagged-comments/:id`
(`apps/api/src/admin/dto/resolve-flag.dto.ts`, UI at
`apps/admin/src/features/comments/flag-actions.tsx:103-109`).

Live: user B flagged a comment → admin removed the comment → `GET /users/me/flagged-comments`
still returned `status: "submitted"` for B. The live DB carries **84 flags stuck in
`submitted`** against 8 `dismissed`.

**User-visible consequence:** the citizen who reported abusive content is never told anything
happened, and the moderator queue never drains even when every reported comment has actually
been removed. Two actions are required and nothing links them.

---

### S2 — A suspended user is told to contact support, and cannot
**VERIFIED LIVE.**

`SuspendedAccountGuard` is global with no opt-out, by explicit design
(`apps/api/src/account-status/suspended-account.guard.ts:14-37`). The message it returns is
_"This account has been suspended. Contact support if you believe this is a mistake."_
(`apps/api/src/account-status/account-status.ts:67`).

Live, as a suspended user: `GET /support/categories` → **403**, `GET /users/me/tickets` →
**403**, `POST /support/tickets` → **403**, `GET /config` → **403**. Re-login is also blocked
at session creation (`apps/api/src/auth/auth.ts:132-143`) — correctly.

There is no email provider (ADR 0003) and no other channel, so the instruction names a route
that does not exist.

**User-visible consequence:** a wrongly-suspended citizen has no appeal path whatsoever. Either
exempt the support endpoints from the guard, or change the copy to name a real channel.

_(The same guard shape means `MaintenanceGuard` also blocks ticket creation during
maintenance — `apps/api/src/config/maintenance.guard.ts:24-31` exempts only `/admin/*` and auth
routes. Lower stakes, same shape.)_

---

### S2 — Fabricated numbers on the mobile Profile screen
**READ ONLY** (mobile app not run; evidence is literal source).

- `apps/mobile/src/screens/tabs/ProfileScreen.tsx:135` — `<Text>96%</Text>` under a
  "Reliability" label. No reliability field exists anywhere: `UserStats` is
  `{ reportsCount, missionsCount }` (`libs-mobile/api/users.ts:67-70`) and
  `GET /users/me/stats` returned exactly those two live.
- `apps/mobile/src/screens/tabs/ProfileScreen.tsx:130` — `{stats?.missionsCount ?? 32}`. The
  fallback for missing data is the literal **32**, not 0 or a skeleton.
- `apps/mobile/src/screens/tabs/ProfileScreen.tsx:203-249` — the whole "Badges & Achievements"
  strip is static JSX, including "4 Unlocked" and five named badges. No API supplies badges.

This directly contradicts `docs/PRODUCT-DECISIONS.md` Decision 1 (trust comes from verification
and completion history, never a score). A hardcoded 96% *is* a rating, and it is a fake one.

**User-visible consequence:** every user sees the same invented reliability score and the same
four unlocked badges. It will read as a trust signal, and it is not one.

---

### S3 — `community_impact` sponsor placement has no renderer
**VERIFIED LIVE (data) / READ ONLY (mobile).**

`community_impact` is one of the four placement keys the API accepts
(`apps/api/src/sponsors/dto/list-sponsors.dto.ts:22`) and two sponsors are assigned to it in
the live DB. Mobile declares it in `AD_PLACEMENTS` (`libs-mobile/api/ads.ts:61`) but renders
only three: `home` (`apps/mobile/src/screens/tabs/DashboardScreen.tsx:390`), `category_list`
(`apps/mobile/src/screens/discover/CategoryListScreen.tsx:122`), `impact_stories`
(`apps/mobile/src/screens/MyImpactStoriesScreen.tsx:81`).

**User-visible consequence:** staff assign a sponsor to Community Impact, the console reports
success, and the creative is never shown to anyone.

_Overlaps the monetization lane currently under construction — flagged, not investigated
further._

---

### S3 — Impact Story is private, not the public record the product describes
**VERIFIED LIVE.**

CLAUDE.md's core loop ends: _"Impact Story (public record: before/after, who helped, how
long)"_. What exists is `GET /users/me/impact-stories` — the union of your own completed
reports and your own completed missions, de-duped
(`apps/api/src/impact-stories/impact-stories.service.ts:34-92`). There is no public feed
endpoint and no by-id endpoint for citizens.

Live response shape: `{ reportId, title, category, photo }` — **no before/after pair, no
"who helped", no duration**. The admin side has a richer read
(`GET /admin/impact-stories`, with a `verified` status) that no citizen surface consumes.

**User-visible consequence:** the loop's final beat — the public record that makes helping feel
worth it — is a private four-field thumbnail list. Whether this is descoped for v0.1 or an
oversight needs an owner decision; it is currently undocumented either way.

---

### S3 — Six API routes are live and correct but have no caller
**VERIFIED LIVE** (each probed; all responded correctly).

| Route | Live probe | Caller |
|---|---|---|
| `GET /` | 200 `"Hello World!"` | none — NestJS scaffold leftover, sitting behind the auth guard |
| `POST /admin/admins` | (create-admin) | no console UI creates an admin — only edit/suspend/reactivate/revoke exist |
| `PATCH /admin/me` | 400 `"Provide at least one of name or email."` | none; `apps/admin/src/features/admin-accounts/edit-admin-dialog.tsx:47` documents deliberately not using it |
| `PATCH /admin/support-tickets/:id/status` | 409 `TICKET_ALREADY_IN_STATUS` | none — console uses `PATCH /admin/support-tickets/:id` instead (`ticket-controls.tsx:99-101`) |
| `DELETE /admin/report-categories/:id` | 404 `CATEGORY_NOT_FOUND` | none |
| `POST /reports/:id/photos` | 400 (validation) | none — mobile sends `photoUrls` in `PATCH /reports/:id` |

Also unreachable from the UI, though the client code exists:
`POST`/`PATCH /admin/report-categories` — `apps/admin/src/features/report-categories/category-form-dialog.tsx`
(513 lines) is imported by nothing, so `/platform/categories` is read-only in practice while a
full editor sits dead beside it.

**Recommendation: do not delete these yet.** `POST /admin/admins` and the category
create/edit pair are the API halves of console features that are either half-built or
deliberately deferred; deleting them would have to be undone. `GET /` and
`PATCH /admin/support-tickets/:id/status` are the two safe removals. The broadcasts client
layer (`apps/admin/src/features/broadcasts/api.ts`) is mid-construction and must not be
touched.

---

### S3 — Announcements and Broadcasts are near-identical by schema, opposite by delivery
**VERIFIED LIVE.** _(Answers the direct question about the two console screens.)_

They are genuinely two features, not a duplication — but they share every content column, which
is why they look the same in the console.

| | Announcements (`community_updates`) | Broadcasts (`broadcasts`) |
|---|---|---|
| Content columns | `title_en/ta`, `body_en/ta` | `title_en/ta`, `body_en/ta` — **identical** |
| Statuses | draft / published / archived | draft / scheduled / sending / sent / cancelled |
| Scheduling | `publish_at` — query-driven, self-publishes on read | `scheduled_at` — **nothing sweeps it (S1 above)** |
| Targeting | none — global | `all_users` or a single `district` |
| Delivery | **pull**: one row, read by `GET /updates` | **push**: fan-out to one `alerts` row per recipient + FCM |
| Expiry | `expires_at` | none |
| Citizen surface | **none — mobile never calls `/updates`** | `GET /users/me/alerts` → AlertsScreen ✅ |

Schemas: `apps/api/src/db/schema/updates-schema.ts`,
`apps/api/src/db/schema/broadcasts-schema.ts`.

The real distinction — passive noticeboard vs. active notification — is legitimate. The
problem is that it is invisible from the console, where both screens present a bilingual
title/body form with a schedule and a publish button. Worth one line of copy on each screen
saying which one rings a phone.

---

### S4 — `docs/coordination.md` contradicts itself three ways on the migration head
**VERIFIED LIVE — the ledger is wrong, the database is fine.**

Ground truth, established from both sides:

- `apps/api/drizzle/` holds **25** files, `0000`–`0024`, head `0024_broadcasts`
- `drizzle.__drizzle_migrations` holds **25** rows
- **Every applied hash matches its file byte-for-byte** (recomputed all 25 sha256s and
  compared in order — zero mismatches). No drift.
- `GET /admin/system-health` independently reports
  `migrations: { applied: 25, head: "0024_broadcasts" }`

`docs/coordination.md` says head **0024 / 25 applied** at line 57 (correct), head **0021 /
22 applied** at lines 64-65, and head **0019 / 20 rows** at lines 77-78. The lock-protocol
warning at line 81 is accurate as history, but the bypass caused no actual damage.

**Consequence:** documentation only. The next person to consult the ledger before generating a
migration reads two stale numbers first. Lines 64-65 and 77-78 should be struck.

---

### S4 — Dev-only: `/dev/otp` needs the `+` percent-encoded
**VERIFIED LIVE.**

`GET /dev/otp?phone=+919000099901` returns 404 — `+` in a query string decodes to a space, so
the Redis key lookup at `apps/api/src/dev/dev-otp.controller.ts:19` misses.
`?phone=%2B919000099901` works. Only affects Maestro E2E flows and manual testing; harmless in
production because the module is not registered there.

---

## What is verified WORKING

All **VERIFIED LIVE** against the running system unless noted.

- **Full core loop.** Three real phone-OTP sessions. Report created (201) → appeared in
  radius Discover → volunteer accepted (`joined`, 15-min `confirmDeadline` stamped) →
  confirmed (`active`) → progress `helping_now` → Mission Chat both directions → completion
  with an after-photo → report `completed` → Impact Story visible to both reporter and
  volunteer.
- **Both `hasAccepted` gates are real and server-side.** A stranger got
  `reporterPhone: null`, `GET .../messages` → 403 _"You need to accept this request to view
  Mission Chat"_, `POST .../messages` → 403. A volunteer got the phone number and the thread.
  Gate code: `apps/api/src/reports/reports.service.ts:825-831`,
  `apps/api/src/missions/missions.service.ts:700-745`.
- **Suspension.** Console suspend → every citizen route 403 `ACCOUNT_SUSPENDED` → re-login
  blocked at session creation → reactivate → 200 again.
- **Hide / reinstate.** Hidden report → citizen `GET` and its comments both 404
  `REPORT_REMOVED`, and it vanished from `/users/me/reports` **and** `/users/me/impact-stories`
  in the same pass. Reinstate restored it. (Reinstate requires a `reason`; the console does
  send one — `apps/admin/src/features/reports/report-actions.tsx:206`.)
- **Comment removal** propagates: citizen comment list went to `[]` immediately.
- **Category gating.** Console `citizenSelectable: false` → key disappeared from
  `GET /reports/categories` **and** `POST /reports` in that category returned 400
  _"This category is not citizen-selectable"_ — enforced server-side, not just hidden.
- **Support conversation, both directions.** Citizen ticket → admin reply (status
  auto-advanced to `in_progress`) → citizen saw it with `senderType: "admin"` → citizen replied
  → admin saw both, with internal-note separation intact.
- **Broadcast manual send** → `alerts` rows → citizen `GET /users/me/alerts`.
- **Account deletion.** 204, token immediately 401, `user` row hard-deleted, the volunteer row
  correctly released with `release_reason: 'account_deleted'`, phone number reusable.
- **Platform settings enforcement.** `maxPhotosPerReport: 4` rejected a 5-photo report.
- **Every admin GET returns 200.** All 19 admin list/detail/catalogue endpoints exercised
  with a real `super_admin` cookie session; none 500'd, none were unreachable.
- **Admin RBAC, including the restricted role.** `GET /admin/me` returns role + permission keys
  resolved from the database, not from code; unauthenticated → 403 `ADMIN_NO_SESSION`
  (fail-closed). Signed in as the seeded `ops_admin` (permissions
  `comments:manage`, `reports:manage`, `users:manage`) and re-ran all 17 admin GETs: users,
  reports, comments, flagged-comments, impact-stories, dashboard and activity returned 200;
  analytics, system-health, audit-logs, report-categories, settings, sponsors, support-tickets,
  community-updates, broadcasts and admins **all returned 403 `ADMIN_MISSING_PERMISSION`** naming
  the exact missing permission. Enforcement is server-side and correct.
- **OTP rate limiting is real on both halves** — the concern CLAUDE.md raises about "the first
  load test becomes an msg91 bill" is closed. Sends 1–3 to a fresh number returned 200; send #4
  returned **429 `OTP_RATE_LIMITED`** with `retryAfterSeconds: 600`. Verify attempts 1–5 returned
  400 `INVALID_OTP`; attempt #6 returned **403 `TOO_MANY_ATTEMPTS`**. That is exactly
  `docs/features/auth.md` BR-2 (3 sends per rolling 10 min, 5 verify attempts), and the send
  limiter runs *before* the provider is touched (`apps/api/src/auth/auth.ts:297-303`), so a
  rate-limited request never costs an SMS.
- **Ownership checks hold — no IDOR found.** With a second citizen's bearer token: reading
  another user's ticket by id → 404 `TICKET_NOT_FOUND`; posting into it → 404; editing, deleting
  and closing another user's report → 403 `"Not your report"`; hitting `/admin/users` with a
  citizen token → 403 `ADMIN_NOT_AN_ADMIN`. No horizontal or vertical escalation on any path
  tested.
- **Migrations.** 25/25, zero hash drift (see S4).
- **No dead tables.** Every one of the 46 tables is referenced by non-schema application code.
  The only never-written lookup value is `report_statuses.expired`, which is deliberate and
  documented (`apps/api/src/admin/report-effective-status.ts:11-46`) — though it is the root
  of S1.

### Stale claim corrected

`apps/admin/src/features/platform-settings/settings-view.tsx:101-114` renders an EmptyState
saying _"App settings aren't served by the API yet … the API doesn't answer that route yet"_.
**That is no longer true.** `GET /admin/settings` returned 200 with the full settings body
live, and `PATCH /admin/settings` exists at
`apps/api/src/admin/admin-settings.controller.ts:42`. The 404 branch is dead defensive code and
its comment is misleading to the next reader.

---

## Data hygiene note (not a code defect)

The live `uthavu_dev` database carries heavy test-lane pollution that distorts every count in
the console: 516 reports of which **426 have `reporter_id IS NULL`** (bulk-deleted test users),
142 `mission_volunteers` rows that are `active` with a NULL `volunteer_id`, and a category
named "E2E-VERIFY Probe Category" visible to citizens in `GET /reports/categories`.

The 142 ghost rows matter beyond tidiness: the comment at
`apps/api/src/missions/missions.service.ts:283-287` asserts this state is unreachable
("`UsersService.deleteAccount()` always releases the row in the same transaction"). The service
code is in fact correct — I read it (`apps/api/src/users/users.service.ts:165-189`) and
verified the release live — so those rows came from direct SQL, not the endpoint. But
`communityStats.activeVolunteers` counts active volunteer rows with no NULL check
(`apps/api/src/reports/reports.service.ts:455-472`), so ghosts are counted as live volunteers.

**Artifacts this audit created** (so they can be cleaned up): users `+919000099901` and
`+919000099902` (`+919000099903` was deleted as part of the deletion test), report
"AUDIT flow probe", ticket `UT-1001`, broadcasts "AUDIT probe broadcast" (sent) and
"AUDIT scheduled probe" (still scheduled), two uploaded 1×1 PNGs, and one `joined` volunteer row
on report `01a04280-…d444a` from the expired-accept probe.

---

## What I could NOT verify

- **The mobile app was never run.** No simulator, no Metro, no device. Every mobile finding is
  from source reading and from the API side of the contract. Rendering, navigation timing,
  gesture behaviour, and whether a screen actually displays what it fetches are unverified.
- **The admin console was never rendered.** `apps/admin` was not started; console findings are
  source-level plus live exercise of the endpoints it calls.
- **Push delivery.** No FCM credentials are configured and `devices` holds 0 rows, so
  `deliveredCount` was 0 on every broadcast. The fan-out and the `alerts` write are verified;
  the FCM leg is not.
- **msg91 SMS.** The dev console-OTP fallback was active throughout (ADR 0007). Real SMS
  delivery, msg91 error handling, and the production hard-block are unverified.
- **Maintenance / read-only mode.** Not toggled — it is a global switch on a box other lanes
  are using. Verified by reading `apps/api/src/config/maintenance.guard.ts` and its spec only.
- **How the console *renders* an ops-admin's 403s.** The API side is now verified (above), but
  whether each admin page degrades gracefully or shows a raw failure state was not observed —
  13 console pages have no server-side permission gate and rely on the API 403.
- **Scheduled *announcements*.** `publish_at` is query-driven so it should self-publish, unlike
  broadcasts — read at `apps/api/src/updates/updates.service.ts:60-70`, not tested with a
  future timestamp.
- **Load behaviour.** The N+1 and missing spatial index are established by EXPLAIN, code
  reading and single-request timing. No load test was run.

---

## Addendum A — validation, uploads, image preview, video

_Follow-up sweep requested mid-audit. Same evidence rules._

### A-S2 — The photo and volunteer caps are bounded twice, and the two bounds disagree
**VERIFIED LIVE (both halves).**

| Layer | `maxPhotosPerReport` | `maxVolunteersPerReport` |
|---|---|---|
| DB CHECK constraint | **1–10** (`platform_settings_max_photos_range`) | **1–50** (`platform_settings_max_volunteers_range`) |
| Admin console schema | 1–10 (`apps/admin/src/features/platform-settings/types.ts:84`) | 1–50 (`:86`) |
| **Citizen Zod DTO** | **hard 4** (`apps/api/src/reports/dto/create-report.dto.ts:36`) | **hard 20** (`:28`) |

The global `ZodValidationPipe` (`apps/api/src/app.module.ts:83`) runs **before**
`ReportsService.assertReportLimits()` (`apps/api/src/reports/reports.service.ts:106-129`), so
the configurable limit can only ever *tighten* below 4/20 — never raise it. Mobile sizes its UI
from the configured value: `apps/mobile/src/screens/report/ReportFlowScreen.tsx:153`,
`steps/ReportDetailsPage.tsx:119` renders `maxPhotos` slots, `:237-244` clamps the volunteer
stepper to `maxVolunteers`.

Verified live: config reports `maxPhotosPerReport: 4`; a 5-photo `POST /reports` returned
400 `"Up to 4 photos allowed"` from the DTO, not from the service. DB constraint bounds read
directly from `\d platform_settings`.

**User-visible consequence:** an operator sets 6 photos — the console accepts it, the DB
accepts it, mobile renders six slots — and every citizen report with five or six photos fails
with a validation error nobody can act on. The setting is a trap.

### A-S2 — `POST /uploads` trusts the client-declared MIME type
**READ ONLY.**

`apps/api/src/uploads/multer.config.ts:33-35` filters on `file.mimetype`, which is the
client-supplied `Content-Type` of the multipart part. There is no content sniffing —
no `sharp`, no `file-type`, no `image-size` in `apps/api/package.json`. Arbitrary bytes labelled
`image/png` are written to disk and served back from `/uploads/`.

Mitigating factors, and they are real: the stored filename is `randomUUID()` + an extension
derived **from the MIME map, never from `originalname`** (`multer.config.ts:29`), files are
served as static assets rather than executed, and the read-back validator
(`apps/api/src/uploads/stored-upload.ts:71-137`) is genuinely thorough — it rejects non-`http(s)`
schemes, decorated URLs, undeclared hosts, and percent-encoded traversal (`%2e%2e%2f`) before
the `resolve()` containment check, then requires the file to actually exist.

The gap is content sniffing on write, and the absence of any test for the MIME filter or the
5 MB limit — there is no `uploads.controller.spec.ts`.

Related, lower severity: the controller's only guard is `if (!file)`
(`apps/api/src/uploads/uploads.controller.ts:24`), so "wrong type", "over 5 MB" and "no field"
all collapse into one message. Three of five mobile call sites then replace even that with a
generic string (`ProfileSetupScreen.tsx:120`, `EditProfileScreen.tsx:148`,
`CompleteMissionSheet.tsx:61`), so a user who exceeded 5 MB is told only "upload failed".

### A-S3 — Video is declared on all three surfaces and implemented on none
**READ ONLY.**

`video` is a real, enforced value: seeded into `sponsor_creative_types`
(`apps/api/src/db/seed.ts:242`), in the DTO enum
(`apps/api/src/admin/dto/create-sponsor.dto.ts:76`), and activation is *refused* without a
`creativeUrl` (`apps/api/src/admin/admin-sponsors.service.ts:461-465`).

Nothing plays it. There is no `expo-av`, no `expo-video`, no `react-native-video`, no `<video>`
element and no `<Video>` component anywhere in the repo, and `multer.config.ts:18-22` accepts
no `video/*` MIME type, so the API cannot even receive one.

The mobile fallback is a poster frame — `apps/mobile/src/components/SponsorAd.tsx:97` reads
`campaign.thumbnailUrl` — **and that field does not exist server-side**. There is no
`thumbnail_url` column (`apps/api/src/db/schema/sponsors-schema.ts:91-158`) and the citizen
projection does not select one (`apps/api/src/sponsors/sponsors.service.ts:46-67`). So it is
always `null` and a video campaign renders no creative imagery at all.

Two pieces of console copy assert otherwise and should be corrected regardless of what happens
to the feature:
- `apps/admin/src/features/sponsors/creative.tsx:48` — _"The app plays it inside the sponsor
  card."_ It does not, and cannot.
- `apps/admin/src/features/sponsors/sponsor-form.tsx:408` — _"A video card renders blank without
  a creative URL"_ implies it renders something with one.

_Sponsors/monetization is mid-construction and a separate lane is auditing that chain — flagged
here, not pursued._

### A-S3 — Client validation looser than the server in five places
**READ ONLY.** Each produces a 400 the user could not have predicted.

- **Mobile, comment body:** server max 1000 (`apps/api/src/comments/dto/create-comment.dto.ts:5`);
  `apps/mobile/src/screens/request-details/CommunityComments.tsx:153-164` checks non-empty only,
  no `maxLength`, no counter.
- **Mobile, mission chat:** server max 2000
  (`apps/api/src/missions/dto/send-message.dto.ts:5`);
  `apps/mobile/src/screens/request-details/MissionChat.tsx:94-99` — same omission.
- **Mobile, edit report:** server keeps `description` at **min 20**
  (`apps/api/src/reports/dto/update-report.dto.ts:14-22`);
  `apps/mobile/src/screens/report/EditReportScreen.tsx:77` only requires non-empty. The *create*
  flow gets this right. The edit screen's error path is a bare `Alert.alert` (`:68-70`) with no
  field mapping.
- **Mobile, completion note:** server max 1000
  (`apps/api/src/missions/dto/complete-mission.dto.ts:6`);
  `apps/mobile/src/screens/request-details/CompleteMissionSheet.tsx:68` non-empty only.
- **Admin, ticket close/resolve message:** server max 2000
  (`apps/api/src/admin/dto/close-support-ticket.dto.ts:26-29`);
  `apps/admin/src/features/support-tickets/ticket-controls.tsx:431` computes an over-length flag
  but uses it only for `aria-invalid` and a counter colour — submit is never blocked (`:316`,
  `:360`). Documented as deliberate at `:458-460`.

Support is the counter-example done right: `libs-mobile/api/tickets.ts:149-152` exports the caps
and both screens apply them as `maxLength`.

### A-S4 — One admin control panel drops server field errors into a toast
**READ ONLY.**

The console's `validationErrors` plumbing is genuinely good: `apps/admin/src/lib/api-error.ts:77-98`
parses the NestJS+Zod envelope, and **8 of 10 forms** map it back onto fields with `setError`
behind a per-feature field-name type guard, so an unknown server path falls to a root banner
rather than vanishing.

The exception is `apps/admin/src/features/support-tickets/ticket-controls.tsx` — three selects
plus a free-text message, no `useForm`, no `zodResolver`, no `setError`. Failures go to
`toast.error(...)` at `:111`, so a server validation error is flattened rather than attached to
the control that caused it. The over-length message case above is the one that reaches it.

### A-S4 — No `onError` on any mobile `<Image>`; no lightbox on either surface
**READ ONLY.**

Mobile has a proper report-photo carousel — `pagingEnabled`, index tracking, `1/N` badge
(`apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx:213-241`) — and previews the
picked image from its **local URI before the upload resolves**
(`steps/ReportDetailsPage.tsx:119-152`), which is the right pattern. But no `<Image>` in the app
carries an `onError`, including `libs-mobile/components/Avatar.tsx:28-32`, whose otherwise-good
initial-letter fallback only fires when the URI is *absent*, not when it fails to load. A broken
photo URL renders an empty box everywhere.

One flow is missing its preview entirely: `CompleteMissionSheet.tsx:106-107` sets
`localPhotoUri` and renders only the text "photo captured" — the one screen where the photo *is*
the proof never shows it.

Admin is stronger: `apps/admin/src/features/moderation/uploaded-photo.tsx` uses `next/image`
with three distinct states and an `onError` keyed by `src` (`:129`, `:69-72`), and routes every
URL through `resolveUploadUrl` (`apps/admin/src/lib/upload-url.ts:65-80`) so Next's render-time
`remotePatterns` throw is unreachable. **But `apps/admin/src/components/data/cells.tsx:226`
passes `avatarUrl` to `next/image` raw, without that resolver** — the one place the console's own
defence is skipped. Its `onError` at `:266` cannot catch a render-time throw, which would take
the whole segment to `error.tsx`. Probably unreachable in practice (avatars pass
`assertStoredUpload` on write), but the two image components disagree about whether it can
happen and only one is defended.

Neither surface has a lightbox or zoom. Admin's photo grids link to the **raw stored URL** in a
new tab (`report-detail.tsx:222-228`, `story-detail.tsx:201-207`), which on a LAN/local setup can
point at a host the browser cannot reach even though the inline image renders fine.

### Not a gap — the admin console deliberately does not upload files

There is no file input anywhere in `apps/admin` or `libs-web` (zero matches for `type="file"`,
`FormData`, `Dropzone`). Sponsor logo and creative are plain `type="url"` text fields with an
explicit in-UI disclaimer (`apps/admin/src/features/sponsors/sponsor-form.tsx:361-368`) and a
documented rationale (`apps/admin/src/features/sponsors/creative.tsx:11-32`): `POST /uploads` is
the avatar endpoint — jpeg/png/webp, 5 MB — and cannot take a video creative. Announcements and
broadcasts have no image field at all, in either the schema or the DTO. This is a deliberate
scope boundary, not an omission.

---

## Addendum B — file and folder architecture

_Follow-up sweep. Counts are from the tree as on disk; `.ts`/`.tsx` only, excluding
`node_modules`/`dist`/`.next`._

| Package | Files | Lines |
|---|---|---|
| `apps/api/src` | 243 | 38,865 |
| `apps/admin/src` | 326 | 37,138 |
| `apps/mobile/src` | 47 | 11,745 |
| `libs-mobile` | 40 | 3,078 |
| `libs-web` | 16 | 627 |
| `libs-common` | 3 | 157 |

### B-S2 — `CLAUDE.md` documents a directory that does not exist

`CLAUDE.md:157` says _"Modules under `apps/api/src/modules/` follow: `*.controller.ts`,
`*.service.ts`, `*.module.ts`, `dto/`, `utils/`."_

There is **no `apps/api/src/modules/` directory**. All 22 domain folders sit directly under
`src/`. The *file-suffix* half of the convention is followed well — every module has its
`.module`/`.controller`/`.service` trio and `dto/` exists in 8 modules with real Zod DTOs — but
`utils/` exists in none; what the doc calls `utils/` is loose sibling files
(`reports/report-visibility.ts`, `support/ticket-status.ts`, `uploads/stored-upload.ts`, and
so on).

**Consequence:** a new contributor following CLAUDE.md creates `src/modules/` and is the only
one there. **Cheapest correct fix is to change the doc, not the tree** — moving 22 domains in a
243-file app whose only e2e test is the Nest scaffold default is not a safe trade.

### B-S2 — `apps/api/src/admin/` is a district, not a module

60 files (34 of them DTOs) — a quarter of the entire API in one flat folder, holding ~17
distinct feature services (accounts, activity, analytics, audit, broadcasts, categories,
comments, community-updates, dashboard, impact-stories, report-moderation, reports, settings,
sponsors, support, system-health, users), all registered through one `admin.module.ts`.

The four largest files in the repo are all here or adjacent:

| Lines | File |
|---|---|
| 1119 | `apps/api/src/admin/admin-broadcasts.service.ts` |
| 1084 | `apps/api/src/admin/admin-accounts.service.ts` |
| 951 | `apps/api/src/admin/admin-support.service.ts` |
| 928 | `apps/api/src/admin/admin-sponsors.service.ts` |
| 914 | `apps/api/src/missions/missions.service.ts` |
| 838 | `apps/api/src/reports/reports.service.ts` |

48 source files exceed 400 lines. The two worst already mark their own seams with `private`
sections: `admin-broadcasts.service.ts` splits cleanly into a send pipeline (`claimForSending`,
`recipientPage`, `pushPage`), lookup caches, and pure rule guards (`assertMutable`,
`assertSendable`, `audienceIsCoherent`) that would then be unit-testable without a DB;
`admin-accounts.service.ts` is two independent features — password lifecycle and suspension
lifecycle — sharing a file, with the last-super-admin invariant (`assertNotLastSuperAdmin`,
`lockSuperAdminRoster`) buried inside despite being the crown-jewel rule.

### B-S2 — `apps/admin/src/features/moderation/` has become the shared kernel

11 of 17 features import it, and almost none of what they import is moderation: `Dialog`,
`ConfirmActionDialog`, `useDetailQuery`, `MODERATION_TABLE`, `invalidateAll`, `adminMutate`,
`userDetailHref`/`reportDetailHref`. Every feature is transitively coupled to a sibling feature
folder; renaming or deleting it breaks the app.

This happened because there is no `src/shared/`. Related cross-feature reaches:
`broadcasts → announcements/{dates,tamil-coverage}`, `monetization → analytics/use-analytics`
(for a *formatting* helper), `impact-stories → audit-logs/use-audit-logs` (for a date util),
`users/users-table.tsx → reports/report-status-badge`.

### B-S3 — ~600 lines of near-identical code across 18 admin files

- **8 `*-access-denied.tsx` files**, six of them 22–23 lines; the diff between
  `broadcasts-access-denied.tsx` and `sponsors-access-denied.tsx` is six lines — a function name
  and two strings. One `<AccessDenied title description />` plus eight copy constants replaces
  237 lines.
- **10 `permission.ts` files, 445 lines**, six of which are the identical
  `getAdminSession().permissions.includes("platform:manage")` shape differing only in prose and
  the function name. One `requirePermission(key)` helper replaces them.
- **4 copies of a `Textarea` primitive** —
  `features/{announcements,sponsors,support-tickets}/textarea.tsx` plus one inline in
  `features/moderation/confirm-action-dialog.tsx`. The third copy's own header reads
  `⚠ THIS IS THE THIRD COPY. PROMOTE IT.` A style-token change currently needs four edits.
- **IST date conversion** duplicated in `features/announcements/dates.ts` and
  `features/sponsors/dates.ts`, same `+05:30` literal — and `broadcasts` already reaches across
  to `announcements/dates` for `TIMEZONE_LABEL`, which proves it is shared code in the wrong
  place.

### B-S2 — 44 API error codes are spelled as string literals on both sides

`libs-common/src/error-codes.ts` exists **specifically** to prevent this and holds only 6 codes.
The other 44 (`SPONSOR_NOT_FOUND`, `BROADCAST_ALREADY_SENT`, `TICKET_NOT_FOUND`,
`LAST_SUPER_ADMIN`, …) are typed independently in `apps/api/src/**` and in
`apps/admin/src/features/*/*-errors.ts`.

This is not hypothetical: `apps/admin/src/features/sponsors/sponsor-errors.ts:6-14` documents
**three codes the console got wrong by guessing**. A shared typed export would have made each
one a compile error. The same shape applies to the sponsor placement keys, spelled
independently in `apps/admin/src/features/sponsors/placements.ts` and
`libs-mobile/api/ads.ts:58-60` — which is exactly the class of bug behind the
`community_impact` placement gap in the main report.

### B-S1 — `apps/admin` and `apps/mobile` have zero unit tests

- `apps/api`: **45 co-located `.spec.ts`** — genuinely good. But six modules have none
  (`dev/`, `devices/`, `flagged-comments/`, `lib/`, `redis/`, `saved-reports/`), `alerts/`
  has only its push spec, and `admin/` has 18 specs against 60 source files —
  `admin-users.service.ts` (709 lines), `admin-analytics.service.ts`,
  `admin-categories.service.ts` and `admin-system-health.service.ts` are untested. E2E is one
  file: the Nest scaffold default (`apps/api/test/app.e2e-spec.ts`).
- `apps/admin`: **zero.** No `.spec`, no `.test`, no Vitest, no Jest, **no Playwright config
  anywhere in the repo** — 326 files and 37k lines with no regression net, including
  `lib/list-params.ts` (395 lines of URL-state parsing) and
  `components/data/data-table.tsx` (460).
- `apps/mobile`: zero unit tests, but **Maestro is real and well organised** —
  `.maestro/config.yaml`, four numbered flows (`01-otp-login`, `02-report-a-request`,
  `03-accept-and-volunteer`, `04-complete-mission`), six shared utils, wired to
  `pnpm test:e2e`. That is the critical-journey coverage the App Profile asks for.
- `libs-common` — the cross-package contract package — has no tests.
- Root `pnpm test` runs `pnpm -r run test`, and only `apps/api` defines a `test` script, so the
  monorepo-wide command exercises one package.

Against the App Profile's `Testing: full` (80%/100% coverage bar **plus** Playwright E2E), the
Playwright half does not exist.

### B-S3 — No environment-config module in any package

- `apps/api` reads `process.env` raw in `main.ts`, `app.module.ts:31-35`, `auth/auth.ts`,
  `auth/otp/msg91-otp.provider.ts`, `admin/admin-system-health.service.ts`, and
  `lib/redis.ts:6` — the last with a non-null assertion (`process.env.REDIS_URL!`). Nothing
  validates at boot; a missing var fails at first use, in whatever request happens to touch it.
  The obvious home, `src/config/`, is occupied by an unrelated feature (maintenance mode +
  platform settings), which is itself a naming problem.
- `apps/admin/src/lib/env.ts` exists but uses bare `?? "http://localhost:3001"` defaults, so a
  missing `NEXT_PUBLIC_API_URL` in production silently points the console at localhost. Zod is
  already a dependency and is not used here.
- `apps/mobile` reads `process.env.EXPO_PUBLIC_API_URL` directly in
  `libs-mobile/lib/api.ts:8`, undefined-tolerant, with no central config file.

Only `apps/api/.env.example` exists; the other two apps have none.

### B-S3 — Data fetching sits in components in both client apps

- **Admin has three different API patterns in one app:** `features/*/api.ts` (7 features), a
  `use-*.ts` hook calling `apiFetch` (8 features), and `apiFetch` inline in the table component
  (6 features — `reports-table.tsx:234`, `users-table.tsx:173`, `sponsors-table.tsx:155`, and
  the comments/announcements/broadcasts equivalents). Those six tables cannot be rendered in a
  test or a second context without hitting the network.
- **Mobile has effectively no hook layer:** 25 of 47 screen files call
  `useQuery`/`useMutation` directly, while `apps/mobile/src/hooks/` holds two files (108 lines).
  Worst offenders: `DashboardScreen.tsx` (768 lines, 5 queries),
  `VolunteerJourneyScreen.tsx` (5), `ProfileScreen.tsx` (4), `CommunityComments.tsx` (4).

### B-S4 — Naming drifts across the stack

Three names for one concept: API `admin-community-updates.service.ts` / `updates/` ↔ admin
`features/announcements/` (with files named `update-form.tsx`, `updates-table.tsx`) ↔ route
`/announcements`. Same shape for API `admin-categories.service.ts` ↔ admin
`features/report-categories/` ↔ route `/platform/categories`.

File-naming is fully consistent inside `apps/api` (kebab + Nest suffixes) and inside
`apps/admin` (kebab), and **mixed in `apps/mobile`** — PascalCase screens
(`DashboardScreen.tsx`), camelCase logic (`reportDraft.ts`, `navigation/tabTypes.ts`), and
kebab-case logic (`support/support-faq.ts`, `support/ticket-display.ts`) all coexist.
`libs-mobile/api/` is single-word lowercase except `impactStories.ts`.

`apps/mobile/src/screens/` also holds non-screens: `CommunityComments.tsx`, `RosterSection.tsx`,
`MissionChat.tsx`, `ImpactStorySection.tsx`, `CompleteMissionSheet.tsx`, `TicketStatusPill.tsx`,
plus pure logic (`report/reportDraft.ts`, `support/support-faq.ts`, `support/ticket-display.ts`).

Some `types.ts` files hold runtime code, not types:
`features/platform-settings/types.ts:113` (`isUsableSettings`),
`features/support-tickets/types.ts:215` / `:271` (`normalizeTicket` / `normalizeTicketDetail`) —
`import type` would silently drop them.

### B-S4 — `libs-web` and `libs-mobile` have no root barrel or `exports` map

Consumers deep-path: 40 imports of `@uthavu/libs-mobile/theme/tokens`, 39 of
`.../theme/ThemeProvider`, 38 of `.../theme/colors` — 117 deep imports total. Every internal
file move in the libs is a breaking change across the app.

### What the architecture already gets right

- **`apps/admin/src/app/(console)/**/` is exemplary** — every data leaf is exactly
  `page.tsx` + `loading.tsx` + `error.tsx`, with no exceptions. This is the strongest single
  thing in the repo's structure.
- **No lib imports an app.** `libs-common`, `libs-web`, `libs-mobile` are clean in that
  direction — the dependency arrow never inverts.
- **`apps/api` file-suffix discipline** is total: every module has its `.module`/`.controller`/
  `.service` trio, and `dto/` holds real Zod schemas.
- **The two admin fetch wrappers are a justified split**, not duplication — browser cookie vs.
  manually-forwarded server cookie, both documented at length. Only the URL builder and the
  `204 → undefined` tail are copy-pasted.
- **`apps/admin/src/components/ui/` is a deliberate re-export shim** to `@uthavu/libs-web`,
  parked mid-migration specifically to avoid colliding with the live lanes. That judgment is
  correct.
- **Maestro coverage on mobile** is real and covers the four critical journeys.

### Suggested order of work (structure only)

1. **Correct `CLAUDE.md:157`** to describe the flat `apps/api/src/<domain>/` layout. Zero risk;
   stops every future contributor building against a directory that isn't there.
2. **Move the 44 error codes into `libs-common`.** Additive on both sides, no file moves, and it
   converts a documented class of silent bug into a compile error.
3. **Stand up a test runner in `apps/admin`.** Nothing else on this list is safe to do until
   37k lines have a regression net.
4. Then: `apps/admin/src/shared/` (pure move, removes the worst coupling in the app), the single
   `AccessDenied` + `requirePermission` collapse, and a hooks layer for mobile — mobile is the
   least contended surface and has Maestro flows to verify the four critical paths after a move,
   so it is the best package to restructure first.

**Do not start** anything under `apps/admin/src/features/{broadcasts,monetization,sponsors}/**`
or `config/nav.ts` while the two writing lanes are live. The `Textarea` promotion is queued
behind the same wait — but do it *first* once they land, since three files already document it
as overdue.

---

## Addendum C — the question-mark cursor on the admin Dashboard

**VERIFIED LIVE (payload) / READ ONLY (render).** Raised directly during the audit.

**Cause:** `apps/admin/src/features/dashboard/counter-tile.tsx:32`

```
<div className="relative grid cursor-help" title={note}>
```

`cursor-help` is Tailwind for CSS `cursor: help`, which most browsers draw as an arrow with a
question mark. It is applied by the `Noted` wrapper (`counter-tile.tsx:27-41`) to **any** tile
whose counter carries a `note`, and both tile components go through it — `StatTile:57` (the four
headline totals) and `CounterTile:81` (the eight compact counters).

**Scope:** `GET /admin/dashboard` returns a `basis` block, and **7 of the 12 counters carry a
caveat** in it live — `activeUsers`, `criticalOpen`, `helpsGiven`, `impactStories`,
`fieldUpdates`, `commentsToday`, `flaggedReportsPendingReview`. So roughly seven of twelve tiles
on `/dashboard` show the cursor on hover, along with a native tooltip and a small ⓘ mark in the
bottom-right corner.

**It is deliberate, and the reasoning is sound** (`counter-tile.tsx:8-23`): several tiles render
an em dash, and an unexplained em dash is ambiguous between "not tracked", "the API is behind"
and "something is broken". `flaggedReportsPendingReview` is permanently `null` — the API says so
itself, `"basis": "no_source"`, _"Only comments can be flagged in this product"_ — and the
footnote is what stops an operator rediscovering that non-bug every few weeks. The `sr-only`
span beside it (`:37`) exists because `title` on a non-interactive element is announced
inconsistently by screen readers.

**If you want it gone**, it is a one-token change on line 32 — `cursor-help` → `cursor-default`,
which keeps the tooltip and the ⓘ mark and only stops the pointer changing. Removing
`title={note}` as well would drop the tooltip entirely, and then the ⓘ mark should go too or it
points at nothing.

**Not changed here** — this audit lane is document-only, and `features/dashboard/` is outside the
two lanes currently writing admin code, so it is safe for a frontend lane to pick up.

---

## Addendum D — layering and pattern consistency

_Final follow-up sweep. Same evidence rules._

### D-S1 — The API emits three error shapes, and citizen-facing errors carry no machine-readable code
**VERIFIED LIVE.**

There is no global exception filter: `apps/api/src/app.module.ts:83` registers `APP_PIPE` only —
no `APP_FILTER`, no `*.filter.ts`, no `useGlobalFilters()` in `main.ts`. Three shapes result:

| Shape | Where | Live example |
|---|---|---|
| `{ code, message }` | 80 sites — all `/admin/*`, plus the platform/suspension guards | `{"code":"ADMIN_MISSING_PERMISSION","message":"Missing admin permission: platform:manage"}` |
| Nest default `{ message, error, statusCode }` | **19 sites, all citizen-facing** | `{"message":"Not your report","error":"Forbidden","statusCode":403}` · `{"message":"You cannot accept your own report","error":"Bad Request","statusCode":400}` |
| nestjs-zod `{ statusCode, message, errors[] }` | every DTO rejection | `{"statusCode":400,"message":"Validation failed","errors":[…]}` |

The 19 code-less sites: `apps/api/src/missions/missions.service.ts:325,333,340,343,477,518,540`;
`apps/api/src/reports/reports.service.ts:171,174,494,742,744,751,770`;
`apps/api/src/comments/comments.service.ts:132,139`.

**Consequence, and it is a product bug on a bilingual app:** `ApiError.code` is `null` for all 19,
so neither client can branch on them. `apps/mobile/src/screens/request-details/RosterSection.tsx:39`
falls through to `e.message` and renders the server's raw English — "You already accepted this
request", "Volunteer limit reached for this request" — to a Tamil user. That is exactly what
`libs-common/src/error-codes.ts:13-17` exists to prevent, and what the rest of the app does
correctly. Every one of these is on the accept/help path, i.e. the core loop.

### D-S1 — `EditReportScreen` mirrors server data into state via `useEffect`
**READ ONLY.**

`apps/mobile/src/screens/report/EditReportScreen.tsx:30-50` fills four `useState`s from the
`['report', reportId]` query inside `useEffect(…, [report, navigation])`. Because the mobile
QueryClient sets no `staleTime` (below), any refetch — reconnect, remount, or the sibling
`invalidateQueries(['report', reportId])` at `:62` — yields a new `report` identity and
**overwrites whatever the user is currently typing**. The locked-report guard
(`assignedVolunteersCount > 0` → Alert → `goBack`) sits in the same effect and re-fires on every
refetch.

This is the exact anti-pattern CLAUDE.md bans for admin forms ("**never** `useEffect` + `reset` —
a background refetch wipes the user's input"). `apps/mobile/src/screens/EditProfileScreen.tsx:52-58,74-86`
already does it correctly — split child, seeded from props at mount, no effect — so this is an
internal inconsistency, not an unknown pattern.

### D-S1 — The mobile QueryClient has no defaults at all
**READ ONLY.**

`apps/mobile/App.tsx:10` is a bare `new QueryClient()`. Compare
`apps/admin/src/components/providers/query-provider.tsx:16-26`
(`staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: true`).

Library defaults therefore apply app-wide: `staleTime: 0` — every screen refetches on every
mount, and `['me']` is fetched independently by six screens — and `retry: 3` with exponential
backoff, so a deterministic 403/404 holds a screen in loading→error for ~7 seconds and costs four
round trips. Only two hooks override anything, ad hoc (`hooks/useAds.ts:39-48`,
`hooks/useConfig.ts:37-39`).

Note this compounds D-S1 above: `staleTime: 0` is what makes the `EditReportScreen` refetch — and
therefore the input-wipe — likely rather than theoretical.

### D-S2 — Server-side permission gating is applied on 14 admin pages and skipped on 4
**READ ONLY** (API side verified live — see the ops_admin sweep in the main report).

Gated (page resolves a `permission.ts` mirror, renders an `AccessDenied` panel): admins,
announcements, broadcasts, monetization, sponsors, settings, support, dashboard.

Not gated: `app/(console)/platform/categories/page.tsx`, `platform/audit-logs/page.tsx`,
`platform/system-health/page.tsx`, `analytics/page.tsx` — all four are API-gated on
`platform:manage` / `analytics:view`, which an ops admin does not hold (I confirmed all four
return 403 live). Three mirror modules exist and are imported by nothing:
`features/report-categories/permission.ts`, `features/report-categories/categories-access-denied.tsx`,
`features/users/permission.ts`.

**Consequence:** an ops admin gets an in-table failure state on those four pages instead of the
calm page-level explanation its Platform siblings give. Safe — the API is the real gate
(`(console)/layout.tsx:26-27` correctly notes it enforces session only) — but inconsistent UX,
and three modules are drifting unreferenced.

### D-S2 — The admin console has seven HTTP clients
**READ ONLY.**

`apps/admin/src/lib/api-client.ts:20` types `method` as `"GET" | "POST"` only, so six features
hand-rolled a near-identical copy rather than widening that union:
`features/moderation/api.ts:33`, `sponsors/api.ts:45`, `report-categories/api.ts:54`,
`broadcasts/api.ts:56`, `admin-accounts/api.ts:70`, `announcements/api.ts:71`. Each carries its own
`MutationMethod` union and its own `credentials`/`cache`/`catch` block, and each file's header
acknowledges the duplication and names the one-line fix.

**Consequence:** a transport-contract change (a header, a trace id, a timeout) lands in seven
places. *(sponsors + broadcasts are mid-construction.)*

### D-S2 — `libs-mobile` restates four `libs-common` constants locally
**READ ONLY.**

`libs-mobile/lib/api.ts:42,62,63,65` redeclares `ACCOUNT_SUSPENDED`, `MAINTENANCE_MODE`,
`READ_ONLY_MODE` and `PlatformBlockCode`, all of which `libs-common/src/index.ts:14-24` already
exports and both `apps/api` and `apps/admin` already import. `libs-mobile/package.json` **declares
`@uthavu/libs-common: workspace:*` and never imports it.**

**Consequence:** a rename in `libs-common` type-checks clean and silently kills the mobile
suspension banner. This is the same class as the 44 duplicated error codes in Addendum B, on the
one consumer that opted out.

### D-S2 — `apps/api/src/users/*` is the only module with no response projection
**READ ONLY.**

`users.service.ts:63,73,92` all `return updated` — the raw Drizzle row off `.returning()` — and
`users.controller.ts:18` returns `session.user` with no service call. Every other module has an
explicit `toResponse()`.

**Consequence:** `GET /users/me` and `PATCH /users/me` are structurally different objects that
`libs-mobile/api/users.ts:22,45` types as one `AuthUser`; and any column added to
`db/schema/auth-schema.ts:21-55` ships to the client with no code change and no review. (I saw
this live — `GET /users/me` returns Better Auth's full row including `emailVerified` and `image`.)

### D-S3 — Response types are hand-transcribed two to three times, and are already drifting
**READ ONLY.**

`apps/admin/src/features/*/types.ts` is 1,399 lines whose headers say "transcribed from
`apps/api/src/…`"; `libs-mobile/api/*.ts` restates the same shapes again. Nothing is derived or
shared. Two confirmed drifts:

- `features/admin-accounts/types.ts:76` declares `isSelf?: boolean` ("the deployed endpoint does
  not send it yet") while `apps/api/src/admin/admin-accounts.service.ts:64,962` types it required
  and always sends it. The console carries a whole compensating identity path — the `selfUserId`
  seam at `features/admin-accounts/permission.ts:38-45`, threaded through `admins-table.tsx:139`
  and `admin-detail.tsx:69` — for a field that is never missing.
- `features/sponsors/sponsor-errors.ts:6-19` documents that its codes were guessed and three were
  wrong (`CREATIVE_URL_REQUIRED` vs the real `SPONSOR_CREATIVE_URL_REQUIRED`; `INVALID_PLACEMENT`
  invented outright).

`libs-common`'s zero-runtime-deps rule permits type-only exports, so nothing structural blocks
moving response types there.

### D-S4 — Smaller consistency gaps

- **Mobile response validation is split.** `libs-mobile/api/config.ts:117`, `ads.ts:176`,
  `tickets.ts:311,318,331,338,355` fetch `unknown` and normalize defensively; `reports.ts`,
  `missions.ts`, `users.ts`, `alerts.ts`, `comments.ts`, `impactStories.ts` cast straight to a
  hand-written interface. A server field rename is a graceful default in three modules and a
  runtime `undefined` in six.
- **Bearer auth is opt-in.** Attached in exactly one place (`libs-mobile/lib/api.ts:89-92`, good),
  but via `auth: true` written 45× — the default is unauthenticated, so a new endpoint added
  without the flag 401s silently.
- **Three mobile error stragglers** use untyped `e?.message` with hardcoded English instead of the
  house `e instanceof ApiError` pattern (14 correct sites):
  `RequestDetailsScreen.tsx:126,158`, `EditReportScreen.tsx:69`.
- **Query keys are inline literals.** Admin defines `["admin", …]` at 16 sites with only two named
  constants, and `moderation/actions.ts:40` invalidates by literal array — a typo'd invalidate
  silently no-ops. Mobile has all keys inline (`['me']` in six files).
- **`features/comments/comments-table.tsx:77`** keeps `selectedId` in component state, so a comment
  cannot be deep-linked or survive a refresh — every other detail surface is an `[id]` route.
- **`dev/dev-otp.controller.ts:3,19`** is the only controller touching a datastore directly
  (`redis.get`) with no service behind it. Dev-only, but the one exception to an otherwise perfect
  rule.

### Layering that is genuinely clean — verified, not assumed

- **All 33 controllers are thin.** Grepping `if (` / `for (` / `.map(` / `.filter(` / `drizzle-orm`
  / `db/schema` across every `*.controller.ts` returns **two** hits total
  (`uploads.controller.ts:24`, `dev-otp.controller.ts:18,20`). No controller builds a query; none
  does inline authorization — `@AdminOnly()` + `@RequireAdminPermissions()` carry all of it, and
  `admin.module.ts:60-76` documents a spec that walks the controller array and fails if
  `@AdminOnly()` is ever dropped.
- **No service reads the request or sets headers** (zero `@Req`/`@Res`/`setHeader` in any service).
- **DB access is confined.** `db` is imported by 30 services plus exactly three plain-function
  helpers, each with a written reason (callers on both sides of the DI boundary). No guard has an
  inline query.
- **No service cycles, no `forwardRef` anywhere.**
- **Validation coverage is 100%.** All 53 `dto/` files use `createZodDto`; every `@Body()` is typed
  to a `*Dto`. The only unvalidated input in the codebase is the dev OTP controller's raw
  `@Query('phone')`, in a module that is not registered in production.
- **No prose-matching on errors** in either client — zero hits for `message.includes` /
  `error.message ===`. Both branch on `code` (which is precisely why D-S1 bites).
- **Admin state management is exemplary.** Across all of `apps/admin/src`: zero server data mirrored
  into `useState`, zero props→state sync effects, all 8 forms compute `defaultValues` via `useMemo`,
  and filters/sort/page/search are entirely URL-backed. The branch order loading → error → empty →
  content is enforced **by type** — `hooks/use-list-query.ts:222-229` is a discriminated union, so
  "empty before error" is unrepresentable.
- **Cross-field validation is correctly placed.** `admin-sponsors.service.ts:289` (`END_BEFORE_START`)
  and `admin-broadcasts.service.ts:299,445` (`BROADCAST_AUDIENCE_MISMATCH`) look like DTO logic in a
  service, but both DTOs carry the `.refine()`; the service check exists because a PATCH compares one
  submitted field against the **stored** other — work no DTO can do. Both clients route these back
  onto the right form field. Compliant.

### Ambiguous — not asserted

`features/admin-accounts/types.ts:129-133` claims the list endpoint omits `lastLoginAt` while detail
sends it, driving a three-state `LastLogin` union. But `admin-accounts.controller.ts:68-73` says the
two projections were since merged, and `admin-accounts.service.ts:961` sets the field in what looks
like the shared builder — so the `"unreported"` branch is probably dead. The two call paths were not
traced far enough to assert it.

---

## Addendum E — GitHub kanban board vs. reality

_Board: `https://github.com/users/dev-ayphen/projects/2` (9 items) · repo `dev-ayphen/uthavuu`.
Project #1 "Uthavu" exists but holds 0 items. Every card fact-checked against the code._

| # | Card | Board | Reality | Verdict |
|---|---|---|---|---|
| 1 | Mission Completion: mark-complete + proof photo | Done | Ran it live end to end — completion, proof photo, report → `completed` | ✅ |
| 2 | Impact Story: generation + sharing | Done | Generation ✅. Share exists **only** on the per-report `ImpactStorySection.tsx:53`; `MyImpactStoriesScreen` has none. The "public record" is a private 4-field list (S3 in main report) | ⚠️ partial |
| 3 | Mobile i18n: EN + Tamil catalog switching | Done | Catalogs are **complete** — 13 namespaces, **523/523 key parity**, zero missing Tamil keys. Switcher wired at `SettingsScreen.tsx:46`. But **4 of 37 screens never call `useTranslation`** | ⚠️ ~90% |
| 4 | Alerts: unread badge on tab bar | Done | Real — `MainTabs.tsx:49,113,114` | ✅ |
| 5 | FCM push send path (needs Firebase creds) | **Todo** | Correctly open. Fan-out and `alerts` write verified live; `devices` holds 0 rows and no creds are set | ✅ |
| 6 | Maestro E2E: OTP, report, accept, complete | Done | Real — 4 flows + 6 utils in `apps/mobile/.maestro/`, wired to `pnpm test:e2e` | ✅ |
| 7 | Token-compliance: magic-number literals | Done | **NOT done — 74 hardcoded hex colors remain in `apps/mobile/src`** | ❌ |
| 8 | Admin console: scaffold + Reports & Moderation | **Todo** | **Long finished** — 31 pages, 12 console sections, full `features/reports` + `features/moderation`; every admin endpoint verified 200 live | ❌ stale |
| 9 | Localize backend alert content (EN+TA) | Done | Real — `alert-templates.ts:30,80` ship en+ta with an English fallback | ✅ |

### E-1 — Card #7 was closed but the work was not done

74 hardcoded hex colors remain in `apps/mobile/src`, concentrated in:

| Count | File |
|---|---|
| 13 | `screens/tabs/DashboardScreen.tsx` |
| 10 | `screens/report/steps/ReportDetailsPage.tsx` |
| 10 | `screens/report/MyReportsScreen.tsx` |
| 8 | `screens/tabs/ProfileScreen.tsx` |
| 8 | `screens/report/ReportFlowScreen.tsx` |
| 7 | `screens/request-details/VolunteerJourneyScreen.tsx` |
| 6 | `screens/tabs/MyHelpsScreen.tsx` |

e.g. `ProfileScreen.tsx:211,219,227,235` — `'#FEF3C7'`, `'#FFE4E6'`, `'#DCFCE7'`, `'#DBEAFE'` on the
(fabricated) badge tiles; `:357,362,367` and `:510` more of the same. These bypass
`libs-mobile/theme/` entirely, so they do not respond to dark mode.

### E-2 — Card #8 sits in Todo for work that shipped

The admin console is one of the most complete things in the repo. The card should move to Done.

### E-3 — The four mobile screens with no i18n

`screens/report/EditReportScreen.tsx`, `screens/report/MyReportsScreen.tsx`,
`screens/report/steps/ReportLocationPage.tsx`, `screens/request-details/RequestDetailsSkeleton.tsx`.

`EditReportScreen.tsx:45,46,64,69` renders user-facing English directly —
`'Editing Unavailable'`, `'Report Updated'`, `'Update Failed'`. That is the same file carrying the
`useEffect` input-wipe bug (D-S1) and the loosest client validation (A-S3): three independent
findings converge on one screen, which makes it the highest-value single file to fix in the mobile app.

### E-4 — The board does not cover most of what was built, or any known bug

Nine cards, all mobile-or-scaffold flavoured. **No card exists for** support tickets (citizen +
staff, both directions), broadcasts, sponsors/monetization, platform settings, admin accounts +
RBAC, the audit log, or community updates — all of which are built and were exercised in this
audit. **And no card exists for any S1/S2 finding in this report**, including expired reports being
served as open.

The board is not being used as the source of truth for what is left to do. `WORKFLOW.md` asks for a
tracking issue per change with `Closes #N`; the last five commits reference none.

---

## Addendum F — theme / design-token compliance

_Read-only sweep of both client surfaces. Source of truth established by TRACING imports and usage,
not assumed. Claims below were independently re-verified by me before recording._

### F-1 — Both surfaces DO have a single source of truth, and both are architecturally sound

**Mobile** — `libs-mobile/theme/`, three files, and the split is legitimate:

| File | Role | Evidence |
|---|---|---|
| `tokens.ts` | static palette + scales (`COLORS`, `CATEGORY_COLORS`, `TONES`, `SIZES`, `SPACING`, `RADIUS`, `ICON_SIZE`, `TOUCH_TARGET`, `TYPE`) | **64 importing files** |
| `ThemeProvider.tsx` | resolves light/dark at runtime | **63 files** consume `useTheme()` |
| `colors.ts` | the two `ColorScheme`s the provider picks between | 59 imports, **all `import type`** — I verified the only value-import in the entire repo is `ThemeProvider.tsx:4` |

So there is exactly one way to get a theme-aware colour (`useTheme().colors`) and one way to get a
static value (`tokens.ts`). **Not a second source of truth.**

**Admin** — `apps/admin/src/app/globals.css`, and nothing else. Verified: no `tailwind.config.*`
anywhere in the repo; exactly one CSS file in scope; `grep` for `^\s*--[a-z-]+:` across
`apps/admin` + `libs-web` returns hits in that file only; no `theme.ts`, no `<style>`, no
`dangerouslySetInnerHTML`, no styled-components. All three CVA files
(`libs-web/components/{badge,button,icon-button}.tsx`) contain 100% semantic-token class strings.

The **two `:root` blocks are deliberate**: block 1 (38–147) is the raw token layer paired with
`[data-theme="dark"]`; block 2 (232–252) is the semantic alias layer (`--success-fg:
var(--accent-emerald-fg)`) placed outside both theme blocks because `var()` resolves lazily at use
time — one declaration serves both themes. Duplicating it into the dark block would create a drift
surface. Correct as built.

### F-2 — The admin console's colour discipline is genuinely excellent

**Verified live by me, not just reported:**

- **Zero** Tailwind palette classes bypassing the semantic layer. An exhaustive grep for
  `(bg|text|border|ring|fill|stroke|from|to|via|divide|accent|caret|placeholder)-(slate|gray|zinc|
  neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|
  fuchsia|pink|rose)-(50…950)` across `apps/admin/src` + `libs-web` returns **no matches**.
- **Exactly 4 raw hex literals in the whole surface**, and both files are structurally forced:
  `app/layout.tsx:56,57` (Next serialises `themeColor` into a `<meta>` at build — `var()` is
  impossible) and `app/global-error.tsx:77,78` (replaces the root layout, never receives
  `globals.css`).
- **The dark-mode rule at `globals.css:30-31` holds exactly.** I re-ran the diff: `:root` declares
  **67** properties, `[data-theme="dark"]` declares **53**, **0** appear in dark but not light, and
  the 14-property gap is *entirely* non-colour and correctly theme-invariant — the 7 layout tokens,
  3 container widths, and 4 shape radii. 67 − 14 = 53. **Every colour has both halves. No
  light-text-on-light-background class of bug exists in this codebase.**
- The chart code has no raw hex: series fills are `bg-accent-emerald-fg/71` etc. The hexes near
  `features/analytics/charts.tsx:17,18,63` are inside a comment recording measured composites.

### F-3 — The real admin gap is typography, not colour

**135 arbitrary font-size classes, 3 distinct values, and none of them has a token** — verified by
count:

| Class | Count | Computed | Nearest scale value | Safe to substitute? |
|---|---|---|---|---|
| `text-[11px]` | **112** | 0.6875rem | `text-xs` = 0.75rem | **No — 1px larger** |
| `text-[10px]` | **22** | 0.625rem | none | No |
| `text-[13px]` | **1** | 0.8125rem | none | No |

There is **no `--text-*` namespace in `@theme` at all**. The 0.625rem value does exist at
`globals.css:391` inside `.micro-label`, but as a full rule, not a size-only utility.

The fix is additive and pixel-safe: declare `--text-2xs: 0.6875rem`, `--text-3xs: 0.625rem`,
`--text-base-console: 0.8125rem`. **Line-heights must be omitted** — `text-[Npx]` sets font-size
only, so adding a `--text-*--line-height` companion would change rendering.

Second-largest gap: **112 sites forced into `[var(--page-padding-inline)]`-style arbitrary syntax**
because the layout/container tokens are declared on `:root` but never mapped into `@theme inline`.
Tailwind v4 has `--spacing-*` and `--container-*` namespaces; mapping them turns all 112 into
first-class utilities with zero visual change. Highest-leverage single change in the theme.

Also missing entirely from the admin theme: any z-index namespace (10 sites run an undeclared
content 10 → tooltip 20 → page-header 30 → sidebar 40 → chrome 50 ladder), any duration token
(`duration-200` ×5, three of which are chrome animations that must stay in lockstep), and any
easing token (`ease-out` appears exactly once).

### F-4 — Mobile has entire scales that do not exist

This is the finding that matters most for a "no visual change" refactor, because it means most
violations **cannot** be fixed by find-and-replace:

| Scale | Status |
|---|---|
| `lineHeight` | **No scale exists.** 28 distinct literals in use (15–30) |
| `borderWidth` | **No scale exists.** `1` appears ~120× across 40 files; `Divider.tsx:75 HAIRLINE = 1` is the de-facto token |
| Shadow / elevation | **No scale exists.** Only `MainTabs.tsx:144-150` uses shadows at all — the app is deliberately flat |
| Opacity | **No scale exists.** "Disabled" alone is spelled 5 ways: 0.45 / 0.5 / 0.55 / 0.6 / 0.7 |
| z-index, duration, easing | **No scale exists** |
| `SIZES` dimensions | **`SIZES` has NO width/height entries** — only padding + 4 radii. Every box dimension in the app is a raw number; `36` is the most repeated (18 sites) |

Font sizes `8.5 · 9 · 9.5 · 10.5 · 11.5 · 13.5 · 14.5 · 18 · 24` are all absent from `TYPE`, as is
weight `'900'`. Spacing `1 2 3 5 6 10 14` are absent from `SPACING`. Radii `2 4 5 6 9 13 18 19 20
22 23 26 32` are absent from `RADIUS`.

**Consequence:** ~103 colour literals, 135+ typography literals and hundreds of numeric literals
cannot be tokenised without first ADDING those values to `tokens.ts` at their exact current values.
Snapping any of them to a near token changes pixels.

### F-5 — Duplications worth fixing

**Mobile:**
1. **`CAT_ACCENT` defined twice with identical values** — `screens/report/ReportFlowScreen.tsx:44-53`
   and `screens/report/steps/ReportDetailsPage.tsx:37-45`. I normalised and hashed both palettes:
   **same 8 colours, identical md5**. Neither is in the theme. This is a real second source of truth
   for category accents, competing with `CATEGORY_COLORS`.
2. **`colors.ts` restates 12 hex values that already live in `COLORS`** (`#FFFFFF`, `#111827`,
   `#16A34A`, `#DC2626`, `#6B7280`, `#E5E7EB`, …) instead of referencing them. The file split is
   sound; the copy-paste inside it is not.
3. **`SIZES.radiusSm/Md/Lg/Input` (8/16/24/12) are the same values as `RADIUS.sm/xxl/pill/lg`** —
   two radius scales under two names, in the same file. Acknowledged in the source comment as a
   back-compat keep.
4. Two scrim alphas for one concept (`COLORS.scrim` is 0.65; two sites use 0.6) and two overlay
   alphas (`TONES.overlay.fill` is 0.75; one site uses 0.7).

**Admin:**
5. **Account-status → tone mapped three times, and one disagrees.**
   `features/users/user-status-badge.tsx:29` and `features/admin-accounts/badges.tsx:56` both render
   a non-suspended account **`success`** (green); `features/support-tickets/badges.tsx:56` renders it
   **`neutral`** (grey). The same fact renders green on two screens and grey on a third.
6. **`bottomGap = 20` hardcoded twice in JS** (`components/data/list-pane.tsx:37,108`), fed into
   `calc(100svh - Npx)`. **20px is exactly `--page-padding-block` (1.25rem)** — a CSS token shadowed
   by two JS literals that cannot read it. Change the token and every fill-height pane misaligns.
7. **Three sticky-scrim alphas for one job:** `bg-canvas/85` (page layouts) vs `bg-canvas/90` (4 form
   footers) vs `bg-surface/95` (app header, ticket composer).
8. **Skeleton/content geometry paired only by convention:** `aspect-[3/2]` ×4, `h-[4.75rem]` ×4,
   `h-[26rem]` ×4, `grid-cols-[minmax(0,1fr)_20rem]` ×2, `max-w-[46rem]` ×2. A skeleton whose
   dimensions drift from its content is precisely the layout shift the skeleton exists to prevent.
9. **`components/ui/back-button.tsx` is a design-system fork** — the one file in a directory
   documented as a pure re-export shim that is *not* a re-export. It reimplements the button surface
   with `rounded-full` instead of `rounded-pill`, `shadow-xs`/`shadow-sm` instead of the elevation
   tokens, its own `duration-200`/`ease-out`, the **only `dark:` variant in the entire codebase**,
   and a bespoke `variant` union paralleling `buttonVariants`. Highest violations-per-line in the
   report.

### F-6 — A real bug found in passing (not a token issue)

`apps/admin/src/app/layout.tsx:54-59` sets `viewport.themeColor` keyed off `prefers-color-scheme`,
but the console **ignores the OS preference**: `theme-provider.tsx:22-23` is
`defaultTheme="dark"` with `enableSystem={false}`. Verified both sides. A user on a light OS gets
browser chrome `#f1f5f9` above a `#020617` page.

### F-7 — Items that must NOT be auto-fixed

Flagged because a mechanical pass would change the UI or the product:

1. **`DashboardScreen.tsx:442`** renders placeholder `"Search city, area or locality"`, but the
   catalog key `dashboard.searchLocationPlaceholder` says `"Search city, area or town…"`. Adopting
   the key **changes visible text**.
2. **`'transparent'`** (mobile, 3 sites). `TONES.overlay.border` happens to equal `'transparent'`,
   but it means "the overlay tone has no border", not "this control is see-through". Value-identical,
   semantically wrong.
3. **`MyReportsScreen.tsx:179` "Expired"** uses `TONES.normal`'s values, not `TONES.expired`'s.
   Pixel-identical adoption requires `TONES.normal`; semantic correctness requires `TONES.expired`
   and changes 3 colours. **A design decision, not a refactor.**
4. **`#475569` and `#064E3B`** (mobile) exist only inside `darkColors`. Referencing them from a
   light-mode screen is value-identical today and a latent bug.
5. **The admin alpha ladder** — picking one canonical scrim value is a visual change by definition.
6. **`h-[26rem]` → `h-104`** is exact on Tailwind's dynamic scale but is a lateral move: `h-104` is
   no more semantic and arguably less readable. Nobody should "fix" these into scale numbers and
   call them tokenised.
7. **`libs-web/components/dialog.tsx:89`** — the `4rem` in `calc(100svh-4rem)` numerically equals
   `--layout-header-height` but is semantically a viewport margin. Substituting would couple a
   shared-package dialog to admin chrome.

### F-8 — Top files by violation count

**Mobile:** `DashboardScreen.tsx` 92 · `ProfileScreen.tsx` 83 · `ReportDetailsPage.tsx` 60 ·
`CategoryListScreen.tsx` 59 · `MyHelpsScreen.tsx` 58 · `VolunteerJourneyScreen.tsx` 57 ·
`MyReportsScreen.tsx` 48 · `ReportFlowScreen.tsx` 38 · `RequestDetailsScreen.tsx` 37 ·
`ReportLocationPage.tsx` 28.

**Admin:** `features/analytics/charts.tsx` 25 · `features/system-health/system-health-view.tsx` 11 ·
`components/ui/back-button.tsx` 9 · `features/reports/report-detail.tsx` 7 ·
`features/analytics/analytics-view.tsx` 7 · `components/layout/app-sidebar.tsx` 6 ·
`features/users/user-detail.tsx` 5 · `features/moderation/uploaded-photo.tsx` 5 ·
`features/dashboard/dashboard-skeleton.tsx` 5.

The four contended paths hold **25 violations, 24 of them `text-[11px]`** — all of which the
`--text-2xs` token resolves with no coordination needed beyond waiting for those lanes to finish.
