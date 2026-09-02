# Admin console completion matrix

Every item in the admin console's sidebar, checked at four layers — **UI**, **API**,
**Backend/data**, **Mobile** — against the code and the live dev database, not against
documentation.

The menu is enumerated from [`apps/admin/src/config/nav.ts`](../../apps/admin/src/config/nav.ts)
in file order. It is the single source of truth for the sidebar (`nav.ts:45-131`); nothing else
declares a section.

## How to read this

| Status | Means |
|---|---|
| ✅ Complete | All layers that the feature needs exist and are wired end to end. |
| 🟡 Partial | Some layers exist; the missing one is named. |
| 🔨 In flight | Being written **right now** by another lane. Half-written files here are work in progress, not defects. |
| ❌ Not built | Nav entry and a placeholder page; nothing behind it. |
| ⛔ Blocked | Cannot be finished until something outside this section lands — named explicitly. |

**Mobile column.** Several sections are staff-only by design and correctly have no citizen
side. Those read **n/a (staff-only)**, which is a different verdict from *missing*. Only where
the feature implies a citizen surface does a missing one count against it.

> ⚠️ **Snapshot caveat — read this before trusting a line number.** Captured
> **2026-08-29 18:43 IST** with four lanes writing into this working copy. Impact Stories and
> Community Updates moved *during* this audit: the admin Impact Stories page went from
> `SectionPlaceholder` to a real table while the scan was running, and
> `apps/api/src/admin/admin-community-updates.controller.ts` plus `apps/api/src/updates/`
> appeared mid-pass. Everything below reflects the later state. Re-grep a symbol before relying
> on a line number.

> ⚠️ **The API layer is judged from the source on disk, not from `curl`.** `apps/api/Dockerfile:41`
> is `CMD ["sh", "-c", "pnpm db:migrate && node dist/src/main.js"]` — a compiled `dist/`, no watch
> mode — and `uthavu-api` has been up 26 hours. **A 404 from the live container right now means
> either "not built" *or* "built after the container started", and those are opposite verdicts.**
> A 403 is still good evidence the route exists and is gated. Every API verdict below comes from
> `@Controller` / `@Get` / `@Post` declarations and registration in `admin.module.ts`; live
> responses are cited only where the build they came from is named. See issue 15 in
> [`issues.md`](issues.md).

---

## 1. Dashboard

Nav: `nav.ts:51-55`. No children.

| Menu item | UI | API | Backend/data | Mobile | Status | Notes |
|---|---|---|---|---|---|---|
| Dashboard | ✅ Real client page, 184 lines, `page.tsx` + `loading.tsx` + `error.tsx` all present (`apps/admin/src/app/(console)/dashboard/page.tsx:1`). Fetches live via `useDashboardSummary` (`apps/admin/src/features/dashboard/use-dashboard-summary.ts:1-21`) | ✅ `GET /admin/dashboard` (`apps/api/src/admin/admin.controller.ts:44`) — `@AdminOnly()`, **no** `@RequireAdminPermissions`, so both roles see it | 🟡 4 totals + 1 counter are real; **7 of 12 designed tiles have no source and return `null`** (`apps/api/src/admin/admin-dashboard.service.ts:35,145`) | n/a (staff-only) | 🟡 Partial | The 7 nulls are honest, not stubs: they render an em dash rather than a lying `0` (`use-dashboard-summary.ts:10-21`). `flaggedReportsPendingReview` is null **permanently** — only comments can be flagged in this product. |

**Sidebar badges are also a dashboard concern.** `useNavBadges` (`apps/admin/src/config/nav-badges.ts:25-37`) can only fill 2 of the 8 declared `NavBadgeKey`s — `users` and `commentsFlagged`. `reportsOpen`, `reportsFlagged`, `impactStoriesPending`, `broadcastsActive`, `supportNew` and `admins` have **no counting endpoint** and render as no badge at all. `nav.ts` declares five badge keys that can never light up (`nav.ts:68,88,91,108,129`).

---

## 2. Users

Nav: `nav.ts:57-62`.

| Menu item | UI | API | Backend/data | Mobile | Status | Notes |
|---|---|---|---|---|---|---|
| Users (list) | ✅ `apps/admin/src/app/(console)/users/page.tsx:19` + `loading.tsx` + `error.tsx`. Real table, filters, pagination (`apps/admin/src/features/users/users-table.tsx`) | ✅ `GET /admin/users` — `users:manage` (`apps/api/src/admin/admin-users.controller.ts:35-36`) | ✅ `user` (Better Auth), `user_statuses`, `user_account_status`. Live: 8 users, 1 status row | n/a (staff-only view of citizen accounts) | ✅ Complete | |
| Users → detail `[id]` | ✅ `apps/admin/src/app/(console)/users/[id]/page.tsx:13` + `loading.tsx` + `error.tsx`; suspend/reactivate wired (`apps/admin/src/features/users/user-status-actions.tsx`) | ✅ `GET /admin/users/:id` (`admin-users.controller.ts:49-50`), `POST /admin/users/:id/suspend` (`:63-64`), `POST /admin/users/:id/reactivate` (`:75-76`) — all `users:manage` | ✅ Enforced at login in `auth.ts`'s `session.create.before` hook and `SuspendedAccountGuard` — ADR 0011 | ⛔ **Mobile does not handle `403 ACCOUNT_SUSPENDED`** — logged as issue 11 in [`issues.md`](issues.md) | 🟡 Partial | The admin half is finished and audit-logged. The citizen half is a dead end: a suspended user hits a 403 the app has no branch for. Also blocked on open question 4 — suspension notifies nobody, because no Tamil/English alert copy exists. |

---

## 3. Reports

Nav: `nav.ts:64-78`.

| Menu item | UI | API | Backend/data | Mobile | Status | Notes |
|---|---|---|---|---|---|---|
| All Reports | ✅ `apps/admin/src/app/(console)/reports/page.tsx:17` + `loading.tsx` + `error.tsx`; real table (`apps/admin/src/features/reports/reports-table.tsx`) | ✅ `GET /admin/reports` — `reports:manage` (`apps/api/src/admin/admin-reports.controller.ts:38-39`) | ✅ `reports`, `report_statuses`, `report_photos`, `report_categories`. Live: 142 reports | ✅ Citizen side complete — `apps/mobile/src/screens/report/*`, `libs-mobile/api/reports.ts` | ✅ Complete | Status is **derived** from `expiry_at` at read time (`apps/api/src/admin/report-effective-status.ts`); nothing ever writes `expired`. That is issue 3 in `issues.md`, not a gap in this page. |
| Reports → detail `[id]` | ✅ `apps/admin/src/app/(console)/reports/[id]/page.tsx:13` + `loading.tsx` + `error.tsx`; close / reopen / hide / reinstate wired (`apps/admin/src/features/reports/report-actions.tsx`) | ✅ 4 mutating routes: `POST :id/close` (`admin-reports.controller.ts:65-66`), `reopen` (`:76-77`), `hide` (`:87-88`), `reinstate` (`:98-99`) — all `reports:manage` | ✅ `AdminReportModerationService` + audit rows in the same transaction. Live: 28 `admin_audit_logs` rows | ✅ `apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx` | 🟡 Partial | ⚠️ **Only *close* notifies anybody** (reuses `report_cancelled` for confirmed volunteers). A *hide* silently removes a citizen's emergency request with no explanation — open question 4, blocked on English + Tamil alert copy. |
| Flagged Comments | ✅ `apps/admin/src/app/(console)/reports/flagged/page.tsx:21` + `loading.tsx` + `error.tsx`; resolve wired (`apps/admin/src/features/comments/flag-actions.tsx`) | ✅ `GET /admin/flagged-comments` (`apps/api/src/admin/admin-comments.controller.ts:37-38`), `PATCH /admin/flagged-comments/:id` (`:68-69`) — `comments:manage` | ✅ `report_comment_flags`, `flag_statuses`. Live: 7 flags | ✅ `apps/mobile/src/screens/FlaggedCommentsScreen.tsx`, `POST /reports/:id/comments/:commentId/flag` (`apps/api/src/comments/comments.controller.ts:26`) | ✅ Complete | The nav label was corrected from "Flagged Reports" — reports **cannot be flagged at all** in this product; `report_comment_flags` is the only flag table (`nav.ts:71-75`). |
| Comments | ✅ `apps/admin/src/app/(console)/reports/comments/page.tsx:16` + `loading.tsx` + `error.tsx`; remove/restore wired (`apps/admin/src/features/comments/comment-actions.tsx`) | ✅ `GET /admin/comments` (`admin-comments.controller.ts:30-31`), `POST /admin/comments/:id/remove` (`:44-45`), `POST /admin/comments/:id/restore` (`:56-57`) — `comments:manage` | ✅ `report_comments`. Live: 14 comments | ✅ `apps/mobile/src/screens/request-details/CommunityComments.tsx` | ✅ Complete | Scope is **public Community Comments only**. Private Mission Chat has no admin endpoint by design — ADR 0010, asserted by a test that serialises the whole admin detail payload and searches it. |

---

## 4. Community

Nav: `nav.ts:80-93`. **Two of three items are being written right now.**

| Menu item | UI | API | Backend/data | Mobile | Status | Notes |
|---|---|---|---|---|---|---|
| Impact Stories | ✅ **Landed during this audit** (was `SectionPlaceholder` at 18:39). List `apps/admin/src/app/(console)/community/impact-stories/page.tsx:19` and detail `[id]/page.tsx:18`, each with its own `loading.tsx` + `error.tsx`; 9 files under `apps/admin/src/features/impact-stories/` | ✅ `GET /admin/impact-stories` and `GET /admin/impact-stories/:id` — `reports:manage` (`apps/api/src/admin/admin-impact-stories.controller.ts:34-35,48-49`), registered in `admin.module.ts`. 22 tests in `admin-impact-stories.service.spec.ts`. **Read-only by design — no POST/PATCH/DELETE** | ✅ **No `impact_stories` table exists and none is needed** — a story is a projection over `mission_completions` → `missions` → `reports` (`admin-impact-stories.service.ts:179-193`). Live: 47 completions | ✅ Already shipped — `apps/mobile/src/screens/MyImpactStoriesScreen.tsx`, `libs-mobile/api/impactStories.ts:14`, `GET /users/me/impact-stories` (`apps/api/src/impact-stories/impact-stories.controller.ts:6-10`) | ✅ Complete | `:id` is the **`mission_completions`** id, not the report id — the story *is* the completion, and one report has at most one (`[id]/page.tsx:15-16`). **Read-only is a decision, not a gap:** the `impactStoriesPending` badge implies an approval queue that does not exist (a completion is inserted already `verified`), so rather than ship an Approve button that would settle open question 12 by accident, the page states on its face that it is a record and not a queue (`page.tsx:11-17`). Question 12 stays open. |
| Community Updates | ✅ **Already complete — under another name.** Per [ADR 0013](../decisions/0013-community-updates-vs-announcements.md) this nav item means the **per-report public field-update feed**, which ships as Community Comments: citizen surface `apps/mobile/src/screens/request-details/CommunityComments.tsx`, moderation at `/reports/comments`, API `apps/api/src/admin/admin-comments.controller.ts:30,44,56`, table `report_comments`. The Community nav entry now points at that existing flow. | ✅ existing | ✅ `report_comments` | ✅ existing | ✅ Complete | **Nothing new to build.** An earlier pass misread this item and built admin-authored announcements instead — that is a separate, unrequested feature, now reframed as **Announcements** (own top-level section, tables `community_updates`, migration 0020 retained). |
| Announcements *(new, unapproved scope)* | ✅ list + create + edit, own top-level section | ✅ 8 routes, `platform:manage`, all audit-logged | ✅ `community_updates` + `community_update_statuses` (migration 0020, applied + seeded) | n/a — `GET /updates` exists but no mobile consumer | 🟡 Pending approval | Built on a misread requirement; kept pending a decision on whether Announcements survives. ADR 0012's `DELETE`-without-reason deviation lives here and is parked until then. |
| Broadcasts | ❌ `apps/admin/src/app/(console)/community/broadcasts/page.tsx:6-14` — `SectionPlaceholder` | ❌ No endpoint | ❌ **No table** (`to_regclass('public.broadcasts')` → NULL) | ⛔ Push tokens are registered (`libs-mobile/api/users.ts:64` → `POST /devices`, `apps/api/src/devices/devices.controller.ts:13`) but **`devices` is empty in dev (0 rows)** | ⛔ **Blocked** | **The blocker is not the table — it is that no FCM sender exists anywhere in `apps/api`.** Grepping `firebase-admin`, `messaging()`, `sendMulticast`, `sendEachForMulticast` across `apps/api/src` returns **zero send-path hits**; the only matches are a config *check* (`apps/api/src/admin/admin-system-health.service.ts:152-153`) and a comment admitting the gap (`apps/api/src/db/schema/devices-schema.ts:1-4`). `firebase-admin` is **not a dependency of any package.json in the repo**. Consequence: `devices` stores push tokens that nothing ever sends to — **a broadcast built today would silently reach nobody, and would report success**. Two things must land first: (1) the FCM send path + `FCM_SERVICE_ACCOUNT_JSON`, (2) a product definition of what a broadcast targets (open question 14). |

---

## 5. Analytics

Nav: `nav.ts:95-99`. No children.

| Menu item | UI | API | Backend/data | Mobile | Status | Notes |
|---|---|---|---|---|---|---|
| Analytics | ✅ `apps/admin/src/app/(console)/analytics/page.tsx:18` + `loading.tsx` + `error.tsx`; real charts (`apps/admin/src/features/analytics/charts.tsx`), 403 handled distinctly from an error (`use-analytics.ts:137`, `analytics-view.tsx:63`) | ✅ `GET /admin/analytics` — `analytics:view` (`apps/api/src/admin/admin-analytics.controller.ts:25-26`) | ✅ Computed live over `reports` / `missions` / `mission_volunteers` / `user`; percentiles not means (`admin-analytics.service.ts:121-136`) | n/a (staff-only) | 🟡 Partial | ⚠️ **`ops_admin` does not hold `analytics:view`** — verified in the live `admin_role_permissions` table, only `super_admin` has it. An ops admin sees a permission refusal on a section the sidebar shows them. That may be intended; nothing records the decision. **"By district" groups by the *reporter's* profile district, not the report's location** — the payload carries `geography.basis` and a `caveat` string so the chart is forced to say so (open question 6, still open). |

---

## 6. Platform

Nav: `nav.ts:101-112`. Frame comes from `platform/layout.tsx` (SubMenuPageLayout Mode B), so the sub-pages deliberately have no `PageLayout` of their own.

| Menu item | UI | API | Backend/data | Mobile | Status | Notes |
|---|---|---|---|---|---|---|
| Categories | 🟡 **Read-only list.** `apps/admin/src/app/(console)/platform/categories/page.tsx:11` + `loading.tsx` + `error.tsx`; real table, **no create/edit/delete wired** — stated in the code and on the page (`apps/admin/src/features/report-categories/categories-table.tsx:143-153,196-198`) | ✅ **Full CRUD exists and is unused by the console:** `GET`, `POST`, `PATCH :id`, `DELETE :id` on `/admin/report-categories`, class-level `platform:manage` (`apps/api/src/admin/admin-categories.controller.ts:33-64`) | ✅ `report_categories`, live: 9 rows (`medicalHelp` 100 reports, `animalRescue` 1, `roadsideHelp` 1) | ✅ Categories drive the citizen picker — `apps/mobile/src/screens/discover/CategoryListScreen.tsx` | 🟡 Partial | **The missing layer is UI only.** Deliberately unwired: an edit flow needs a confirm dialog (delete 409s when the category is in use) and the console has no shared dialog primitive — the team chose a plain statement over a disabled button. ⚠️ **Open question 7 is now urgent**: `pnpm db:seed` upserts by `key` and would silently revert an admin's `label`/`emoji`/`defaultExpiryMinutes` edits the moment the UI ships. The count subquery bug that page's fallback text describes has **already been fixed** (`admin-categories.service.ts:76-92`) and live counts are correct — that warning text is now stale. |
| App Settings | ❌ `apps/admin/src/app/(console)/platform/settings/page.tsx:13-17` — an inline "Not built yet" `EmptyState`, **not** `SectionPlaceholder`, followed by 24 filler rows (`:19-30`) | ❌ No endpoint | ❌ **No `app_settings` table** (`to_regclass` → NULL) | n/a (staff-only config, though it would change mobile behaviour) | ⛔ **Blocked on a product decision, not on code** | Three things are undecided (open question 16): *which* settings exist, whether platform config is DB-backed at all or stays in env vars, and who may change it. Nothing can be built until someone answers the second one. ⚠️ Because it uses a bare `EmptyState` rather than `SectionPlaceholder`, this page is **invisible to a "which sections are unbuilt" grep** — that is issue 10 in `issues.md`. The 24 filler rows are a scroll-behaviour proof, not content. |
| Support | 🟡 **List only.** `apps/admin/src/app/(console)/platform/support/page.tsx:11`; real table (`apps/admin/src/features/support-tickets/support-table.tsx`). **No detail route, no status-change UI** — zero `useMutation` and zero `rowHref` in the whole feature folder | ✅ `GET /admin/support-tickets`, `GET :id`, `PATCH :id/status` — class-level `platform:manage` (`apps/api/src/admin/admin-support.controller.ts:28-44`) | 🟡 **Table exists, `support_tickets` is EMPTY (0 rows).** `ticket_statuses` + `ticket_categories` are seeded | ✅ `apps/mobile/src/screens/SubmitTicketScreen.tsx`, `MyTicketsScreen.tsx`, `SupportHomeScreen.tsx` → `POST /support/tickets`, `GET /users/me/tickets` (`apps/api/src/support/support.controller.ts:11,16`) | 🟡 Partial | **Two endpoints have no caller.** A ticket can be filed from mobile and read in a list, but no one can open it or move its status — the queue has an in-tray and no out-tray. This is the second half of issue 5 in `issues.md` ("`ticket_statuses` had no transition path"), still open. |
| System Health | ✅ `apps/admin/src/app/(console)/platform/system-health/page.tsx:6` + `loading.tsx` + `error.tsx`; polls every 30s, separates a correct 403 from an error (`apps/admin/src/features/system-health/system-health-view.tsx:35`) | ✅ `GET /admin/system-health` — `platform:manage` (`apps/api/src/admin/admin-analytics.controller.ts:31-32`) | ✅ Live introspection of Postgres, Redis, uptime and which credentials are set (`apps/api/src/admin/admin-system-health.service.ts`) | n/a (staff-only) | ✅ Complete | This page is the one place that currently reports `fcmConfigured` (`admin-system-health.service.ts:152-153`) — worth knowing that it reports *credential presence*, not *send capability*, and no send path exists. |
| Audit Logs | ✅ `apps/admin/src/app/(console)/platform/audit-logs/page.tsx:14` + `loading.tsx` + `error.tsx`; table + filters + diff cell (`apps/admin/src/features/audit-logs/change-cell.tsx`) | ✅ `GET /admin/audit-logs` and `GET /admin/audit-logs/catalogue` — `platform:manage` (`apps/api/src/admin/admin-audit.controller.ts:26-27,41-42`) | ✅ `admin_audit_logs` + `admin_audit_actions` + `admin_audit_target_types`. Live: 28 rows. Written in the same transaction as the change (ADR 0012) | n/a (staff-only) | ✅ Complete | Read-only by construction, which is the point — nothing in the console can edit it. |

---

## 7. Monetization

Nav: `nav.ts:114-123`. All three items are `SectionPlaceholder`.

| Menu item | UI | API | Backend/data | Mobile | Status | Notes |
|---|---|---|---|---|---|---|
| Overview | ❌ `apps/admin/src/app/(console)/monetization/page.tsx:6-14` — `SectionPlaceholder` (group `loading.tsx` + `error.tsx` present) | ❌ None | ❌ No table | n/a (staff-only) | ❌ Not built | |
| Google AdMob | ❌ `apps/admin/src/app/(console)/monetization/admob/page.tsx:6-14` — `SectionPlaceholder` | ❌ None | ❌ No table | Ads would render on mobile eventually; nothing exists | ❌ Not built | |
| Sponsors | ❌ `apps/admin/src/app/(console)/monetization/sponsors/page.tsx:6-14` — `SectionPlaceholder` | ❌ None | ❌ `to_regclass('public.sponsors')` → NULL | Sponsor placements would render on mobile eventually; nothing exists | ❌ Not built | |

**Section note.** This is *approved and deliberately deferred*, not forgotten — open question 13. `apps/api` contains no reference to sponsors or AdMob anywhere. **No schema has been designed; do not invent one** — any sponsor table or column described elsewhere in `docs/` is speculation. Consistent with [ADR 0001](../decisions/0001-no-payments-at-launch.md): admin-controlled revenue only, no money between users.

⚠️ **There is also no permission key for this section** (open question 8). The six seeded keys are `analytics:view`, `comments:manage`, `data:delete_all`, `platform:manage`, `reports:manage`, `users:manage` — verified live in `admin_permissions`. Whoever writes the first monetization endpoint answers that question by accident unless it is decided first.

---

## 8. Admin

Nav: `nav.ts:125-130`.

| Menu item | UI | API | Backend/data | Mobile | Status | Notes |
|---|---|---|---|---|---|---|
| Admin (admin accounts) | 🟡 **Read-only list.** `apps/admin/src/app/(console)/admins/page.tsx:26` + `loading.tsx` + `error.tsx`; a server component that renders a 403 as "you don't have permission" rather than an error state (`:18-24`). **Zero mutations** | 🟡 `GET /admin/admins` — `platform:manage` (`apps/api/src/admin/admin.controller.ts:57-58`). **No create / edit / remove / role-change endpoint exists** | ✅ `admin_users`, `admin_roles`, `admin_role_permissions`, `admin_permissions`. Live: 2 admins, 2 roles, 6 permissions | n/a (staff-only) | 🟡 Partial | Admin accounts can be **viewed but not managed** — creating one is a manual database/seed operation. ⚠️ `docs/webadmin/` describes a third **Reviewer** role; only `super_admin` and `ops_admin` are seeded and present live (open question 11 — dropped or deferred is undecided). The `admins` badge key is declared (`nav.ts:129`) but nothing counts admins, so it never renders. |

---

## Scoreboard

| Status | Count | Items |
|---|---|---|
| ✅ Complete | 7 | Users list, All Reports, Flagged Comments, Comments, **Impact Stories**, System Health, Audit Logs |
| 🟡 Partial | 6 | Dashboard, Users detail, Reports detail (notification gap), Analytics, Categories, Support, Admin |
| 🔨 In flight | 1 | Community Updates |
| ❌ Not built | 4 | Monetization Overview, AdMob, Sponsors |
| ⛔ Blocked | 2 | Broadcasts (no FCM sender), App Settings (no product decision) |

Counted by menu item, with detail routes folded into their parent. Where an item appears twice in the prose (Users list vs Users detail) the stricter verdict governs the scoreboard.

---

## What to build next, in priority order

1. ~~**Apply migration 0020 and seed the three `community_update_statuses` rows.**~~ **DONE — this finding was a timing artifact and is now false.** The audit read the database while the Community Updates lane was still mid-build; the migration was applied minutes later. Re-verified 2026-08-29: 21 migrations applied, both tables present, lookup and audit actions seeded, suite green at 27 suites / 324 tests. **Leaving the original wording struck through deliberately** — a matrix that quietly deletes a wrong finding teaches nobody, and the lesson generalises: *in a working copy with five concurrent agents, any database or HTTP observation is a snapshot, not a fact.* Re-verify before acting on one. The remaining Community Updates work is the **admin page** (11 feature files exist, no page consumes them) and a **mobile surface** (none exists).

2. **Build the FCM send path.** It is the single blocker behind Broadcasts, and it is also the reason twelve of thirteen mutating admin actions are silent. Registering push tokens without a sender means `devices` is a write-only table. Until this lands, do not build Broadcasts — a broadcast that reports success and reaches nobody is worse than no broadcast.

3. **Answer open question 4 — write the English + Tamil alert copy.** Hiding someone's emergency request and suspending their account both currently notify nobody. This is product copy, not engineering; it blocks moderation from being honest and it gates item 2's usefulness.

4. **Wire Support ticket detail + status change.** `GET /admin/support-tickets/:id` and `PATCH /admin/support-tickets/:id/status` already exist and have no caller. This is a UI-only task against a finished API — the queue currently has no way to close a ticket.

5. **Wire Category create/edit/delete** — but decide open question 7 *first*. The API is complete; the console needs a shared confirm-dialog primitive. Shipping the UI before fixing `db:seed`'s upsert means the next seed run silently reverts an admin's edits.

6. **Finish the Community Updates admin page.** Eleven support files exist in `apps/admin/src/features/community-updates/` with no page consuming them; the page itself is still `SectionPlaceholder`. Depends on item 1. This is the **only** remaining in-flight item — Impact Stories closed out during this audit.

7. **Add a mobile surface for Community Updates.** `GET /updates` is written and has zero consumers — no `libs-mobile/api/updates.ts`, no screen. An announcement nobody can read is not an announcement.

8. **Decide App Settings** (open question 16): DB-backed or env vars? Nothing can be built until that is answered, and the answer determines whether there is a table at all.

9. **Decide the Monetization permission key** (open question 8) before the first monetization endpoint is written, so the answer is deliberate rather than incidental.

10. **Decide whether `ops_admin` should hold `analytics:view`.** Today it does not, so an ops admin sees a section in the sidebar that refuses them. Either grant it or hide the entry — the current state is neither.

---

## Contradictions with existing documentation

Named rather than smoothed over, per the audit rules.

1. **[`open-questions.md`](open-questions.md) item 15 says Community Updates has "no table, and no definition of what an 'update' even is."** That is now stale: `apps/api/src/db/schema/updates-schema.ts` defines the table with a documented product model (staff-authored announcement, bilingual, scheduled by timestamp not status), migration `0020_wild_landau.sql` is generated and journaled, and both an admin CRUD controller and a citizen `GET /updates` are written. The row should be retired. *(That file is currently modified by another lane; leaving the edit to whoever owns it.)*

2. **`open-questions.md` item 14 and item 16 are still accurate** — Broadcasts and App Settings genuinely have nothing behind them. Item 14's FCM claim was re-verified here independently and holds: zero send-path hits in `apps/api/src`, and `firebase-admin` is absent from every `package.json` in the repo.

3. **`apps/admin/src/features/report-categories/categories-table.tsx:196-205` warns operators about a live API bug** — that the per-category count subquery compares `reports.category_id` against `reports.id`. **That bug is fixed.** `admin-categories.service.ts:76-92` documents the fix, and the live table returns correct counts (`medicalHelp` 100, `animalRescue` 1, `roadsideHelp` 1), not zeroes. The warning is conditional on all-zero counts so it will not render, but the text now describes history rather than the present.

4. **`nav.ts` declares eight `NavBadgeKey`s; only two can ever be populated.** `reportsOpen`, `reportsFlagged`, `impactStoriesPending`, `broadcastsActive`, `supportNew` and `admins` have no counting endpoint (`nav-badges.ts:35`). `impactStoriesPending` is the misleading one — it implies an approval queue that does not exist, which is open question 12.

5. **`docs/webadmin/` describes a **Reviewer** role.** Only two roles are seeded and only two exist live. Open question 11, unchanged.

6. **`curl` against the running API is not evidence about this repo, and this audit does not treat it as such.** `uthavu-api` has been up 26 hours serving a compiled `dist/` with no watch mode (`apps/api/Dockerfile:41`). Live right now: `/admin/reports` → **403** (built before the container started), `/admin/impact-stories` → **404**, `/admin/community-updates` → **404** — both of those controllers are on disk and registered in `admin.module.ts`. **A 404 from this container conflates "not built" with "built today", which are opposite verdicts.** Every API column above was decided by reading `@Controller`/`@Get`/`@Post` declarations, not by probing the container. Logged as issue 15.

---

_Last verified against commit `d60e276`, 2026-08-29 18:43 IST, with four lanes actively writing
into the working copy. Uncommitted work from those lanes (Impact Stories admin API + UI, Community
Updates API + UI, migration 0020) is included in the verdicts above; only Community Updates is still marked 🔨. Impact Stories closed to ✅ during the audit, confirmed with the architecture lane. The live database
inspected was `uthavu_dev` in container `uthavu-postgres`, read-only._
