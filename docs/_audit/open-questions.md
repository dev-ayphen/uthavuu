# Open questions

Things the code cannot answer and a human must. Raised 2026-08-27 while mapping the admin console
against the real backend ([`../architecture/admin-console-integration.md`](../architecture/admin-console-integration.md)).

Nothing here is a bug. These are product decisions that will otherwise get made accidentally by
whoever writes the endpoint first.

## Blocking — an endpoint cannot be written until these are answered

| # | Question | Why it blocks | Context |
|---|---|---|---|
| ~~1~~ | ~~**May an admin read Mission Chat?**~~ **ANSWERED 2026-08-28 — (a) never.** See [ADR 0010](../decisions/0010-mission-chat-is-not-readable-by-admins.md). No admin projection contains `mission_messages`; `admin-reports.service.spec.ts` asserts the absence by serialising the whole detail payload and searching it. | — | — |
| 2 | **May an admin see the real identity behind an `anonymous` report?** ⚠️ **A provisional call has been SHIPPED and needs ratifying.** `GET /admin/reports` and `/admin/reports/:id` return the reporter's identity with an explicit `reporter.anonymousToPublic: true` flag, rather than redacting it. Reasoning: `GET /admin/users/:id` already lists every report a user posted — anonymous ones included, because `reports.reporter_id` is a plain FK — so redacting it on the reports screen would be one screen hiding what the next screen shows, which is theatre rather than protection. **If the owner rules the other way**, redact in `AdminReportsService.reporterProjection()` AND `AdminUsersService.recentReportsFor()` — those two are the only places. | Shipped, reversible in two methods. | `apps/api/src/admin/admin-reports.service.ts` (`reporterProjection`) |
| ~~3~~ | ~~**What does suspending a user actually do?**~~ **ANSWERED 2026-08-28 — block login and authenticated requests; change nothing else; reversible; audit-logged.** See [ADR 0011](../decisions/0011-user-suspension-blocks-login-not-content.md). Implemented via `user_statuses` + `user_account_status` (migration 0019), enforced in `auth.ts`'s `session.create.before` hook and `SuspendedAccountGuard`. | — | — |
| 4 | **Which admin actions notify the citizen, and in what words?** **Still blocking, and now concrete.** An admin *close* reuses the existing `report_cancelled` alert to the confirmed volunteers — an existing rule applied to the same event, not new copy. Everything else is silent: **the reporter is never told their report was closed or hidden, and a volunteer is never told it was hidden.** Writing those needs new `AlertType` values with **English AND Tamil** templates, which is product copy this pass had no mandate to invent. A person asking for emergency help currently watches their request vanish with no explanation. | Silent moderation is shipped; the wording is the blocker. | `apps/api/src/alerts/alert-templates.ts:24, 47-97` |

## Shaping — answer before the relevant section is built

| # | Question | Context |
|---|---|---|
| 5 | ~~Should admins see soft-deleted reports, and may they undelete one?~~ **Provisionally implemented 2026-08-28:** hidden from lists by default, reachable via `?includeDeleted=true` or `?status=deleted`, and `POST /admin/reports/:id/reinstate` undoes a hide. `deleted_by` now holds an admin on an admin hide — the two cases stay distinguishable because a hide always writes a `report.hide` audit entry and a self-delete never does. Confirm the default (hidden) is what the owner wants. | `apps/api/src/admin/admin-report-moderation.service.ts` |
| 6 | Analytics "by district" — still open. `GET /admin/analytics` groups by the **reporter's** `user.district` and returns `geography.basis: "reporter_profile_district"` plus a `caveat` string **in the payload**, so the console is forced to label the chart honestly rather than imply the number means the report's location. Swap to reverse-geocoding if the owner prefers. | `apps/api/src/admin/admin-analytics.service.ts` |
| 7 | Category editing vs `db:seed`: the seed upserts by `key` and would overwrite an admin's edits to `label` / `emoji` / `defaultExpiryMinutes`. Accept that, or make seeding insert-only once an admin UI exists? **Now urgent — category CRUD shipped 2026-08-28** (`POST` / `PATCH /:id` / `DELETE /:id` on `/admin/report-categories`), so the overwrite is no longer hypothetical: the next `pnpm db:seed` silently reverts an admin's edits. | `apps/api/src/db/seed.ts:104-118` *(was cited as `:94-108`; drifted)* |
| 8 | Monetization has no permission key. Add a seventh, or fold it under `platform:manage`? | `apps/api/src/admin/admin-rbac.ts:32-39` *(was `:31-38`)* |
| 9 | ~~Should "Flagged Reports" and "Broadcasts" stay in the sidebar while they have no backing table?~~ **HALF ANSWERED IN CODE, and this row's premise was wrong.** *Corrected 2026-08-28:* there is **no "Flagged Reports" entry in `apps/admin/src` at all** — the console renamed it to **"Flagged Comments"** (`nav.ts:75`) and wired it to the real `GET /admin/flagged-comments`; the comment at `nav.ts:71-74` explains the rename ("the old label promised a feature that does not exist"). The cited lines were also wrong: `nav.ts:71` is that comment, and `:87` is the Community section's `href`. **What remains open is Broadcasts only** (`nav.ts:91`) — nav entry + placeholder page, no table, and no FCM send path. Same question, narrowed to one entry. | `apps/admin/src/config/nav.ts:75` (resolved), `:91` (still open) |
| 10 | ~~Does an admin ever *close* a report, or only remove it?~~ **Both, as separate actions, 2026-08-28:** `close`/`reopen` (status) and `hide`/`reinstate` (soft delete) are four distinct audit-logged endpoints. A close alerts the confirmed volunteers by reusing the existing `report_cancelled` alert; a hide notifies nobody (blocked on #4). | `apps/api/src/admin/admin-report-moderation.service.ts` |

## Product-spec claims not yet reconciled with code

| # | Question |
|---|---|
| 11 | `docs/webadmin/` describes a **Reviewer** role alongside Super Admin and Moderator. `admin-rbac.ts:20` seeds only two (`super_admin`, `ops_admin`) — re-verified 2026-08-28, still two, and the live `admin_roles` table holds exactly those two. Is Reviewer dropped, or deferred? |
| 12 | The nav badge `impactStoriesPending` implies an approval queue for Impact Stories. No such state exists — a completion is created already `verified` in the same statement that inserts it (`missions.service.ts:523-537`, re-verified 2026-08-28). Is moderation of Impact Stories intended? |

## Decided, but deliberately not built

| # | Item | Status |
|---|---|---|
| 13 | **Sponsors / AdMob CRUD** | **Approved by the product owner, deferred.** The feature is wanted; it is not being built now, and **no schema has been designed — do not invent one.** `apps/admin` ships the nav entries and three placeholder pages (`.../monetization/page.tsx`, `.../monetization/admob/page.tsx`, `.../monetization/sponsors/page.tsx`, each rendering `SectionPlaceholder`); `apps/api` contains no reference to sponsors or AdMob at all (grepped 2026-08-28). Consistent with [ADR 0001](../decisions/0001-no-payments-at-launch.md) — admin-controlled revenue, no money between users. Any sponsor table, column or endpoint described elsewhere in `docs/` is speculation, not a plan. |

## Genuinely undecided — no product shape at all

These are not "built later". They are **not decided**: no table, no definition, nothing to build
against. Listed so nobody mistakes an empty nav entry for a missing endpoint and starts guessing a
schema.

| # | Item | What exists | What is missing |
|---|---|---|---|
| 14 | **Community → Broadcasts** | Nav entry (`apps/admin/src/config/nav.ts:91`) + placeholder page | No table, no product definition — and **no FCM send path exists anywhere in the repo**, so a broadcast would silently reach nobody. The product decision must precede the endpoint. |
| ~~15~~ | ~~**Community → Updates** — no definition of what an "update" is~~ **ANSWERED 2026-08-29 — and the first answer was wrong.** It is the **per-report public field-update feed**, already implemented as `report_comments` ("Community Comments", PRODUCT-DECISIONS Decision 2) and already moderated at `/reports/comments`. Four sources agree: `docs/mobile/14-request-details-screen.md:319`, `docs/webadmin/04-reports-and-moderation.md:52`, `docs/webadmin/05-community.md:100`, and the console's original placeholder. **Nothing new needs building for it.** An earlier pass guessed it meant admin-authored announcements and built `community_updates` (migration 0020) — that is a *different*, unrequested feature, now reframed as **Announcements**. See [ADR 0013](../decisions/0013-community-updates-vs-announcements.md). |
| 16 | **Platform → Settings** ("App Settings") | Nav entry (`nav.ts:107`) + placeholder page | No settings table, no defined set of settings, and no decision on whether platform config is DB-backed at all or stays in env vars. |

---

_Last verified against commit `d60e276`, 2026-08-28._

_History: questions 2, 4–12 raised against `84a20d3` (2026-08-27); items 13–16 added against
`d035cfd` and committed as `98aae67`; questions 1 and 3 answered the same day by
[ADR 0010](../decisions/0010-mission-chat-is-not-readable-by-admins.md) and
[ADR 0011](../decisions/0011-user-suspension-blocks-login-not-content.md). **Adversarially
re-audited against `d60e276`**: question 9's premise was found to be false (no "Flagged Reports"
entry exists) and both its citations wrong; questions 7 and 8 had drifted citations; questions 4, 6,
11, 12 and items 13–16 were re-checked and hold. Question 7 was upgraded from shaping to urgent —
category CRUD has shipped, so the `db:seed` overwrite is now a live hazard rather than a
hypothetical._

> ⚠️ **Question 4 is the one that got worse.** Thirteen mutating admin routes shipped on 2026-08-28.
> Exactly one of them notifies anybody (an admin close reuses `report_cancelled` for confirmed
> volunteers). The other twelve are silent — including hiding someone's emergency request and
> suspending their account. The blocker is unchanged: new `AlertType` values need English **and**
> Tamil copy that nobody has written.
>
> `apps/admin` and `apps/api` are both under active development by other lanes. Re-grep a label
> before trusting a line number here.
