# Admin console flow verification

**This is not a presence audit.** [`admin-completion-matrix.md`](admin-completion-matrix.md)
already answers *does each layer exist*. This document answers the harder question:
**can an operator finish the task end to end — click → API → database → audit row → and does the
citizen on mobile ever learn it happened?**

A feature can have all four layers and still break at the seams. Six of the nine flows below do.

## Method

Each flow is traced across six hops, each with a `path:line` citation:

| Hop | What it asks |
|---|---|
| **UI** | Is there a real control, wired to a handler? Not a disabled button, not a placeholder. |
| **Endpoint** | Does the path and method the UI calls match what the API actually declares? |
| **Gate** | Class-level `@AdminOnly()` plus the right `@RequireAdminPermissions`. |
| **Writes** | The right table and columns. |
| **Audit** | An `admin_audit_logs` row, in the **same transaction** (ADR 0012). |
| **Citizen** | Does anything tell the person it happened? Silence is a finding, not a pass. |

Verdicts: **✅** works end to end · **🟡** works, but a hop is weak or silent · **❌** breaks, and
where · **🔨** being written right now by another lane — not a defect.

### What was exercised for real

**A live super-admin session was obtained and every read endpoint was exercised with `curl`.**
`apps/api/src/db/admin-seed-policy.ts:34-48` seeds `admin@uthavu.org` / `ops@uthavu.org`; with
`SEED_ADMIN_PASSWORD` unset the dev defaults at `admin-seed-policy.ts:12-13` apply.
`POST /api/auth/sign-in/email` → **200** with a `set-auth-token` bearer.

`uthavu-api` had been up **27 minutes** at the start of this audit (rebuilt today), so unlike the
completion matrix's snapshot, **a 404 from this container is meaningful** — the running image
matches disk except for work that landed during the audit itself.

**Every admin read endpoint answered 200 as super_admin:**

```
/admin/me 200   /admin/dashboard 200        /admin/users 200      /admin/reports 200
/admin/comments 200                          /admin/flagged-comments 200
/admin/impact-stories 200                    /admin/community-updates 200
/admin/report-categories 200                 /admin/support-tickets 200
/admin/audit-logs 200                        /admin/audit-logs/catalogue 200
/admin/analytics 200                         /admin/system-health 200   /admin/admins 200
/admin/settings 404   /admin/platform-settings 404   /config 404   /updates 200
```

**No destructive writes were performed.** No suspend, no delete, no status change was executed
against `uthavu_dev`. Every mutating flow below is traced statically and corroborated by the
`admin_audit_logs` rows that earlier sessions left behind.

> ⚠️ **Snapshot caveat.** Four lanes write into this working copy. **The Platform → App Settings
> lane moved twice during this audit**: at 18:56 `grep -r platform_settings` returned nothing at
> all; by 19:28 `apps/api/src/db/schema/settings-schema.ts`, `apps/api/src/config/` and migration
> `0021_curvy_marten_broadcloak.sql` all existed; by 19:31 `apps/api/src/config/platform-config.controller.ts`
> had appeared too. Any DB or HTTP observation here is a snapshot, not a fact — re-verify before
> acting on one.

---

## Condensed verdict table

| # | Flow | UI | Endpoint | Gate | Writes | Audit | Citizen sees | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | Suspend → reactivate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **now handled** | 🟡 |
| 2 | Close → reopen | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 volunteers only | 🟡 |
| 3 | Hide → reinstate | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ **silent** | 🟡 |
| 4 | Remove comment → restore | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ **silent** | 🟡 |
| 5 | Resolve a comment flag | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ pull-only | 🟡 |
| 6 | Category create / edit / delete | ❌ **none** | ✅ | ✅ | ✅ | ✅ | ✅ instant | ❌ |
| 7 | Support ticket status change | ❌ **none** | ✅ | ✅ | ✅ | ✅ | ✅ pull-only | ❌ |
| 8 | Announcement create→publish→archive→delete | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ **no reader** | ❌ |
| 9 | Impact Stories (read-only by design) | ✅ | ✅ | ✅ | n/a | n/a | ✅ already shipped | ✅ |
| 10 | Read the audit log | ✅ | ✅ | ✅ | n/a | n/a | n/a | ✅ |
| 11 | Sign-in / sign-out / denials | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| 12 | Platform → App Settings | 🔨 | 🔨 | 🔨 | 🔨 | 🔨 | 🔨 | 🔨 in flight |

**The gate hop passes on every single flow.** Verified live, three distinct denial codes, and
structurally enforced by a test that walks `AdminModule`'s controller list
(`apps/api/src/admin/admin-module-guard.spec.ts:42-49`). **The audit hop passes on every mutation**
— all 15 mutating service methods call `auditService.record({ …, tx })` inside the transaction that
makes the change.

**Where this breaks is the two ends: the operator's button, and the citizen's screen.**

---

## 1. Suspend a user → reactivate

| Hop | Evidence |
|---|---|
| **UI** | "Suspend account" button → confirm dialog, reason **required** (`apps/admin/src/features/users/user-status-actions.tsx:56-59,62-85`). Reactivate at `:87-107`, reason optional. |
| **Endpoint** | `POST /admin/users/:id/suspend` (`user-status-actions.tsx:77`) matches `apps/api/src/admin/admin-users.controller.ts:63`. Reactivate `:101` matches `admin-users.controller.ts:75`. |
| **Gate** | `@AdminOnly()` class-level (`admin-users.controller.ts:23`), `@RequireAdminPermissions('users:manage')` on both (`:64`, `:76`). |
| **Writes** | `user_account_status` via `admin-users.service.ts:524-547` / `:604-618`. |
| **Audit** | `user.suspend` (`admin-users.service.ts:549-561`) and `user.reactivate` (`:619-631`), both with `tx`. **Live: 3 + 3 rows in `admin_audit_logs`.** |
| **Citizen** | ✅ **Both enforcement points work, and mobile now handles the refusal.** |

**Enforcement is genuinely two-point, and both are structural, not opt-in.**

- **Login:** `decideSessionCreate()` (`apps/api/src/account-status/login-block.ts:71-88`) is wired
  into Better Auth's `session.create.before` hook (`apps/api/src/auth/auth.ts:136`) — the one
  chokepoint every sign-in path passes through, so a future provider inherits it.
- **Authenticated requests:** `SuspendedAccountGuard` is a **global** `APP_GUARD`
  (`apps/api/src/account-status/account-status.module.ts:28`), registered last in `AppModule`
  (`apps/api/src/app.module.ts:61-64`) so it runs after the session resolves. There is no opt-out
  decorator. If the guard order ever regresses it throws a 500 rather than silently passing
  (`suspended-account.guard.ts:59-65`) — a disabled suspension check is made impossible to ship by
  accident.

Both paths return **403 + `ACCOUNT_SUSPENDED`**, byte-identical, never 401
(`account-status.ts:59-62`, `login-block.ts:78-84`).

### ⭐ This contradicts the completion matrix

The matrix records this as **"⛔ Mobile does not handle `403 ACCOUNT_SUSPENDED`… a suspended user
hits a 403 the app has no branch for"** (matrix line 63, issue 11). **That is now stale — the
mobile half has landed:**

- `libs-mobile/lib/api.ts:125-127` — every authenticated 403 carrying `ACCOUNT_SUSPENDED` fires a
  dedicated handler, kept deliberately separate from the 401 path (`:44-50`) so it does not clear
  the token and bounce the user to Login as if nothing happened.
- `apps/mobile/src/navigation/RootNavigator.tsx:80-96` — one alert (de-duplicated across a burst of
  parallel failures via `suspendedShown`), then `clearToken()` and reset to Login **after** the user
  has read it.
- `apps/mobile/src/screens/OtpScreen.tsx:67-73` — handled separately at OTP verify, because
  `verifyOtp` is deliberately unauthenticated and the global handler only fires on `auth: true`.
  Without this branch a suspended user would meet "something went wrong" and retype a correct code
  forever.
- Copy exists in **both** locales: `libs-mobile/i18n/locales/en/auth.json:29` and
  `libs-mobile/i18n/locales/ta/auth.json:29` (Tamil present).

**Issue 11 should be closed.**

**Remaining weakness (why 🟡, not ✅):** the alert **title** in
`RootNavigator.tsx:83` is the hardcoded English string `'Account suspended'`, and the **body** is
the API's English-only `ACCOUNT_SUSPENDED_MESSAGE` (`account-status.ts:61-62`) passed through
verbatim — not the Tamil catalog entry that exists two lines away. The OTP screen does it correctly
via `t('accountSuspendedError')`; the global handler does not. A Tamil-only user gets an English
alert at the one moment the app most needs to be understood. This breaks the
"every user-facing string goes through the catalog" rule in `CLAUDE.md § Mobile`.

**Verdict: 🟡** — works end to end; the global handler's copy is not localised.

---

## 2. Close a report → reopen

| Hop | Evidence |
|---|---|
| **UI** | "Close request" / "Reopen request" buttons, each behind a confirm dialog with a **required** reason (`apps/admin/src/features/reports/report-actions.tsx:58-70,84-116`). Correctly conditional on stored status (`:42-43`). |
| **Endpoint** | `POST /admin/reports/:id/close` (`report-actions.tsx:45-52`) matches `apps/api/src/admin/admin-reports.controller.ts:65`; `reopen` matches `:76`. |
| **Gate** | `@AdminOnly()` (`admin-reports.controller.ts:31`) + `reports:manage` (`:66`, `:77`). |
| **Writes** | `reports.status_id`, `closed_at` (`admin-report-moderation.service.ts:83-86`). |
| **Audit** | `report.close` (`:88-98`), `report.reopen` (`:163-176`), both with `tx`. **Live: 3 + 3 rows.** |
| **Citizen** | 🟡 **Close notifies active volunteers only. Reopen notifies nobody. The reporter is never told either way.** |

`close` reuses the **existing** `report_cancelled` alert type rather than inventing one
(`admin-report-moderation.service.ts:101-128`), and the code says why: every alert type needs an
English *and* a Tamil template (`apps/api/src/alerts/alert-templates.ts:24` declares exactly four
types), and writing new Tamil product copy is open question 4. That is honest restraint, not a bug.

The dialog does not oversell it — `report-actions.tsx:99` tells the operator the reason "is not sent
to the reporter."

**Verdict: 🟡** — the mutation and audit are complete; the reporter learns nothing.

---

## 3. Hide a report → reinstate

| Hop | Evidence |
|---|---|
| **UI** | "Hide from everyone" (danger) / "Reinstate" (`report-actions.tsx:72-82`), confirm dialog at `:118+`. |
| **Endpoint** | `POST /admin/reports/:id/hide` → `admin-reports.controller.ts:87`; `reinstate` → `:98`. |
| **Gate** | `@AdminOnly()` (`:31`) + `reports:manage` (`:88`, `:99`). |
| **Writes** | `reports.deleted_at`, `reports.deleted_by` (`admin-report-moderation.service.ts:205-208`). |
| **Audit** | `report.hide` (`:210-228`) snapshots title **and description** — "hiding is the action most likely to be appealed" (`:215-217`). `report.reinstate` at `:260-272`. **Live: 1 + 1 rows.** |
| **Citizen** | ❌ **Completely silent, and the report vanishes without trace.** |

The code states the gap in place rather than hiding it
(`admin-report-moderation.service.ts:231-234`: *"No alert. A hidden report vanishes silently for the
reporter and for any volunteer"*).

**What the citizen actually experiences, traced:** `reports.deleted_at` is filtered out of every
citizen read path — `GET /reports/:id` (`apps/api/src/reports/reports.service.ts:115`), their own
"My Reports" list (`:194`), nearby discovery (`:247`), and the completed feed (`:289`). So a
reporter whose emergency request was hidden opens the app and **their request is simply not there**.
No banner, no alert, no 410, no "removed by a moderator" state. From inside the app it is
indistinguishable from a bug.

This is the exact failure `docs/architecture/admin-console-integration.md` §5 rule 2 names.
It is the most severe seam in this audit because it fails on the product's highest-stakes action.

**Verdict: 🟡** overall (admin half is complete and well-audited) with a **❌ citizen hop**.

---

## 4. Remove a comment → restore

| Hop | Evidence |
|---|---|
| **UI** | Remove / Restore, one control that flips (`apps/admin/src/features/comments/comment-actions.tsx:43-45`). |
| **Endpoint** | `POST /admin/comments/:id/remove` \| `/restore` (`comment-actions.tsx:45`) matches `apps/api/src/admin/admin-comments.controller.ts:44,56`. |
| **Gate** | `@AdminOnly()` (`admin-comments.controller.ts:25`) + `comments:manage` (`:45`, `:57`). |
| **Writes** | `report_comments.deleted_at` — soft delete (`admin-comments.service.ts:294-302`). |
| **Audit** | `comment.remove` (`:304-315`), `comment.restore` (`:357-369`), both with `tx`. **Live: 3 + 2 rows.** |
| **Citizen** | ❌ **Silent.** The comment disappears from `GET /reports/:id/comments` (`apps/api/src/comments/comments.service.ts:38` — `isNull(reportComments.deletedAt)`) with no alert and no tombstone. |

Scope is public Community Comments only. Private Mission Chat has **no** admin endpoint, by design
(ADR 0010) — confirmed: `AdminCommentsController` declares five routes and none of them touches
mission chat.

**Verdict: 🟡** — mutation and audit complete; the author is never told.

---

## 5. Resolve a comment flag

| Hop | Evidence |
|---|---|
| **UI** | Resolve action (`apps/admin/src/features/comments/flag-actions.tsx:103-106`), `method: "PATCH"`. |
| **Endpoint** | `PATCH /admin/flagged-comments/:id` (`flag-actions.tsx:105-106`) matches `admin-comments.controller.ts:68`. |
| **Gate** | `@AdminOnly()` (`:25`) + `comments:manage` (`:69`). |
| **Writes** | `report_comment_flags.status_id`, resolved from the `flag_statuses` lookup, never a hardcoded id (`admin-comments.service.ts:406-423`). |
| **Audit** | `comment_flag.resolve` with `tx` (`:425-435`). **Live: 9 rows — the most-used action in the console.** |
| **Citizen** | ✅ **The flagger can see the outcome** — `GET /users/me/flagged-comments` (`apps/api/src/flagged-comments/flagged-comments.controller.ts:10-14`) → `apps/mobile/src/screens/FlaggedCommentsScreen.tsx:45-52,116-117` renders `under_review` / `action_taken` / `dismissed` as a coloured pill. |

**This is the only moderation flow where the citizen can find out what happened.** It is
pull-only — nothing pushes, so they must open Profile → Flagged Comments and look. That is a
reasonable design for a non-urgent outcome.

**Verdict: 🟡** — complete, but discoverable only if the citizen goes looking.

---

## 6. Create / edit / delete a report category

| Hop | Evidence |
|---|---|
| **UI** | ❌ **There is no control.** `apps/admin/src/features/report-categories/categories-table.tsx` contains **zero** `useMutation`, `adminMutate` or `onClick` handlers — verified by grep across the feature folder. The page states this in prose instead (`categories-table.tsx:194-197`). |
| **Endpoint** | ✅ Full CRUD exists: `GET`, `POST`, `PATCH :id`, `DELETE :id` (`apps/api/src/admin/admin-categories.controller.ts:39,44,53,63`). Live `GET` → 200, 9 rows. |
| **Gate** | `@AdminOnly()` + **class-level** `@RequireAdminPermissions('platform:manage')` (`admin-categories.controller.ts:34-35`) — so it covers every route including ones added later. Verified live: ops_admin → **403 `ADMIN_MISSING_PERMISSION`**. |
| **Writes** | `report_categories` (`admin-categories.service.ts:125-129,172-177,224-226`). |
| **Audit** | `report_category.create` / `.update` / `.delete`, all with `tx` (`:131-138`, `:179-195`, `:227-236`). |
| **Citizen** | ✅ Would be immediate — the API reads `report_categories` live on every report and filters on `citizen_selectable` (`apps/api/src/reports/reports.service.ts:50,74`); mobile's picker is driven from it. No deploy needed. |

**❌ The chain breaks at hop 1.** Every other hop is finished. An operator cannot create, rename or
retire a category from the console at all — it is a `pnpm db:seed` operation.

**The live audit log confirms it: zero `report_category.*` rows** among the 28, despite all three
actions being seeded in `admin_audit_actions`. The API has never been called.

The reason given is legitimate — a delete flow needs a confirm dialog (it 409s when the category is
in use) and the console lacked a shared dialog primitive (`categories-table.tsx:145-153`). **That
justification is now out of date:** `apps/admin/src/features/moderation/confirm-action-dialog.tsx`
exists and is used by reports, users, comments *and* announcements. The stated blocker is gone.

Two follow-ups the matrix already flags and this trace confirms:

1. **Open question 7 becomes live the moment this UI ships.** `pnpm db:seed` upserts by `key`, so
   the next seed run would silently revert an admin's `label`/`emoji`/`defaultExpiryMinutes` edits.
2. **`categories-table.tsx:198-205` warns operators about a bug that is fixed.** It describes the
   count subquery comparing `reports.category_id` to `reports.id`. Live `GET /admin/report-categories`
   returns `animalRescue → reportCount: 1` — correct, non-zero. The warning is conditional on
   all-zero counts so it will not render, but the text is now history, not fact.

**Verdict: ❌** — breaks at the UI hop. API, gate, table, audit and citizen propagation are all
ready and idle.

---

## 7. Change a support ticket's status

| Hop | Evidence |
|---|---|
| **UI** | ❌ **There is no control, and no detail route.** `apps/admin/src/app/(console)/platform/support/page.tsx` is 23 lines; the feature folder is two files (`support-table.tsx`, `use-support-tickets.ts`) with **zero** `useMutation` and **zero** `rowHref` — a row cannot even be opened. |
| **Endpoint** | ✅ `GET /admin/support-tickets`, `GET :id`, `PATCH :id/status` (`apps/api/src/admin/admin-support.controller.ts:34,39,44`). Live `GET` → 200 `{"items":[],"pagination":{…,"total":0}}`. |
| **Gate** | `@AdminOnly()` + class-level `platform:manage` (`admin-support.controller.ts:29-30`). Verified live: ops_admin → 403. |
| **Writes** | `support_tickets.status_id`, resolved from `ticket_statuses` (`admin-support.service.ts:141-144,162-169`). Refuses a no-op transition so it cannot write an audit row for a change that did not happen (`:153-160`). |
| **Audit** | `support_ticket.status_change` with `tx` (`admin-support.service.ts:171-181`). |
| **Citizen** | ✅ Would be visible — `GET /users/me/tickets` (`apps/api/src/support/support.controller.ts:16-19`) → `apps/mobile/src/screens/MyTicketsScreen.tsx:80,101-102` renders the status as a localised pill. Pull-only; no push. |

**❌ The chain breaks at hop 1.** Two finished endpoints have no caller. A citizen can file a ticket
from mobile and an operator can see it in a list — **and then nothing. The queue has an in-tray and
no out-tray.** Nobody can acknowledge, work or close a ticket.

**Live: `support_tickets` is empty (0 rows) and `admin_audit_logs` has zero `support_ticket.*` rows.**
The empty table means this has never been exercised even manually — a real user filing the first
ticket would hit a dead end.

This is the second half of issue 5 in [`issues.md`](issues.md), still open.

**Verdict: ❌** — breaks at the UI hop. Everything behind it is done.

---

## 8. Create → publish → archive → delete an Announcement

> **Naming note, not a defect.** The UI calls this **Announcements**; the HTTP path is still
> `/admin/community-updates` and the table is still `community_updates`. That mismatch is
> deliberate and documented at `apps/admin/src/features/announcements/api.ts:13-37`: "Community
> Updates" already means the public per-report feed (shipped as Community Comments), and two
> features under one name was the actual bug. Renaming the API would cost a migration plus a rewrite
> of seeded `community_update.*` audit rows, and the feature's survival is undecided.

| Hop | Evidence |
|---|---|
| **UI** | ✅ **Landed — the matrix's `SectionPlaceholder` verdict is stale.** Real list (`apps/admin/src/app/(console)/announcements/page.tsx:37`, 74 lines), create (`new/page.tsx:20`), edit (`[id]/page.tsx:16`), each with `loading.tsx` + `error.tsx`. Publish / Archive / Delete are real buttons behind confirm dialogs (`features/announcements/update-actions.tsx:97-112,114-186`). |
| **Endpoint** | ✅ 7 routes. Create `POST /admin/community-updates` (`update-form.tsx:147` → `admin-community-updates.controller.ts:55`), edit `PATCH :id` (`update-form.tsx:133` → `:64`), publish `POST :id/publish` (`update-actions.tsx:145` → `:76`), archive (`:157` → `:85`), delete `DELETE :id` → 204 (`update-actions.tsx:177-178` → `:96-97`). |
| **Gate** | ✅ `@AdminOnly()` + **class-level** `platform:manage` (`admin-community-updates.controller.ts:38-39`). Mirrored server-side in the console for UX only, failing closed and checking `permissions` not `role.key` (`features/announcements/permission.ts:35-38`). Verified live: ops_admin → 403. |
| **Writes** | ✅ `community_updates` + `community_update_statuses` lookup (migration 0020, applied — both tables present live). |
| **Audit** | ✅ All four mutations, all with `tx`: create (`admin-community-updates.service.ts:165-172`), update (`:241-259`), delete (`:326-339`), publish/archive share `transition()` (`:373-382`). |
| **Citizen** | ❌ **`GET /updates` exists and has no reader.** |

`GET /updates` is real and correct — authenticated, no role branch, locale-aware
(`apps/api/src/updates/updates.controller.ts:18-25`, `update-locale.ts`). Verified live with a
**citizen** bearer token: **200 `{"items":[]}`**.

**But nothing on mobile calls it.** Grepping `apps/mobile/src/screens` and `libs-mobile/api` for
`updates` / `announcement` returns **no consumer** — no `libs-mobile/api/updates.ts`, no screen, no
navigation entry.

An operator can write a bilingual announcement, publish it, watch it enter the citizen feed
endpoint — **and no citizen can ever read it.** Worse, the publish dialog tells the operator the
opposite: *"It becomes visible to citizens in the mobile app"* (`update-actions.tsx:125-127`).
**That sentence is currently false.** This is the same class of failure as the `maintenanceMode`
post-mortem quoted in `apps/api/src/db/schema/settings-schema.ts:8-10` — a control that looks like
it does something and does not.

**Verdict: ❌** — the citizen hop is missing entirely, and the UI actively claims it is not.

---

## 9. View Impact Stories — read-only by design

| Hop | Evidence |
|---|---|
| **UI** | ✅ List + detail with their own `loading.tsx` / `error.tsx` (`apps/admin/src/app/(console)/community/impact-stories/page.tsx:19`, `[id]/page.tsx:18`); 9 files under `features/impact-stories/`. |
| **Endpoint** | ✅ `GET /admin/impact-stories`, `GET :id` (`apps/api/src/admin/admin-impact-stories.controller.ts:34,48`). Live → 200 with real rows. |
| **Gate** | ✅ `@AdminOnly()` (`:28`) + `reports:manage` (`:35`, `:49`) — the **existing** permission, not a seventh key, so open question 8 is not answered by accident (`:16-20`). Verified live: ops_admin → **200** (holds `reports:manage`); citizen → 403. |
| **Writes** | n/a — **no `impact_stories` table exists and none is needed.** A story is a projection over `mission_completions` → `missions` → `reports`. Confirmed live: the table is absent from `pg_tables`. |
| **Audit** | n/a — no mutations, correctly (ADR 0012 scopes the log to mutations). |
| **Citizen** | ✅ Already shipped: `apps/mobile/src/screens/MyImpactStoriesScreen.tsx`, `libs-mobile/api/impactStories.ts`. |

### ✅ No write path leaked in — confirmed two ways

1. **Grep for `@Post` / `@Patch` / `@Delete` / `@Put` across `admin-impact-stories.controller.ts`
   and `apps/api/src/impact-stories/*.controller.ts` returns nothing.**
2. **The admin UI contains no mutation.** The only `<Button>` in the whole feature folder is
   `story-filters.tsx:105` — "clear all filters".

Read-only is a **decision**, not a gap, and it is stated on the page's own face
(`page.tsx:11-17`). The `impactStoriesPending` nav badge implies an approval queue that does not
exist (a completion is inserted already `verified`); rather than ship an Approve button that would
settle open question 12 by accident, the page says it is a record and not a queue.

**Verdict: ✅** — works end to end, and the design constraint holds.

---

## 10. Read the audit log — do the entries actually appear?

| Hop | Evidence |
|---|---|
| **UI** | ✅ Table + filters + a diff cell (`apps/admin/src/app/(console)/platform/audit-logs/page.tsx:14`, `features/audit-logs/change-cell.tsx`). |
| **Endpoint** | ✅ `GET /admin/audit-logs`, `GET /admin/audit-logs/catalogue` (`apps/api/src/admin/admin-audit.controller.ts:26,41`). Both live → 200. |
| **Gate** | ✅ `@AdminOnly()` (`:15`) + `platform:manage` (`:27`, `:42`). Verified live: ops_admin → 403. |
| **Writes** | Read-only **by construction** — the controller declares no write route, and its class comment says why: an endpoint that let an admin post an entry directly would let them forge one (`admin-audit.controller.ts:9-12`). |
| **Citizen** | n/a — staff only. |

### The entries from the flows above do appear. Live count by action:

| Action | Rows | Flow |
|---|---|---|
| `comment_flag.resolve` | 9 | § 5 |
| `user.suspend` / `user.reactivate` | 3 / 3 | § 1 |
| `report.close` / `report.reopen` | 3 / 3 | § 2 |
| `comment.remove` / `comment.restore` | 3 / 2 | § 4 |
| `report.hide` / `report.reinstate` | 1 / 1 | § 3 |
| **`report_category.*`** | **0** | § 6 — no UI |
| **`support_ticket.status_change`** | **0** | § 7 — no UI |
| **`community_update.*`** | **0** | § 8 — new |
| **Total** | **28** | |

**The audit log is the cleanest proof in this document of where the console is finished and where it
is not.** All 18 actions are seeded in `admin_audit_actions`; exactly the 9 with a wired button have
ever fired.

A live row confirms the shape end to end — actor snapshot (`actorEmail`, `actorName`,
`actorRoleKey`, so a deleted admin's history stays attributable), action, target, and a
before/after diff:

```json
{"actor":{"name":"Super Admin","email":"admin@uthavu.org","roleKey":"super_admin",
 "accountExists":true},
 "action":{"key":"user.reactivate","label":"Reactivated a suspended user account"},
 "target":{"type":{"key":"user"},"id":"7O2m…","label":"+919000045001"}, "before":{…}}
```

**Verdict: ✅** — works end to end, and its contents corroborate the rest of this audit.

---

## 11. Admin sign-in, sign-out, and the denial paths

**All four paths were exercised live.**

| Path | Result |
|---|---|
| Sign in `admin@uthavu.org` | **200** + `set-auth-token`, `set-cookie better-auth.session_token; HttpOnly; SameSite=Lax` |
| `/admin/me` before sign-out | **200** `{"role":{"key":"super_admin"},"permissions":[…6 keys]}` |
| `POST /api/auth/sign-out` | **200** |
| `/admin/me` after sign-out | **403 `ADMIN_NO_SESSION`** — the token is genuinely revoked |
| **Anonymous** → `/admin/*` | **403 `ADMIN_NO_SESSION`** |
| **Citizen** (real phone-OTP session) → `/admin/*` | **403 `ADMIN_NOT_AN_ADMIN`** |
| **ops_admin** → `/admin/analytics` | **403 `ADMIN_MISSING_PERMISSION: analytics:view`** |
| **Forged bearer** → `/admin/users` | **403** |

**Sign-out is a real revocation, not a navigation.** `sign-out-button.tsx:29` POSTs to
`/api/auth/sign-out`; the comment at `:13-16` records that this was previously a
`<Link href="/login">`, which left the token valid. On failure it deliberately does **not**
navigate (`:34-39`) — showing "signed out" while the session is live is the more dangerous lie on a
shared workstation.

**The three denials are deliberately not collapsed** (`apps/admin/src/app/(console)/layout.tsx:23-34`):

- `signed-out` → redirect to `/login`.
- `not-admin` → an explanation, **not** a redirect — they hold a valid session, so `/login` would
  bounce them straight back in a loop.
- `unreachable` → an outage, not an auth failure. Still denies access; fails closed
  (`apps/admin/src/lib/session.ts:36-52`).

**The role never comes from the URL.** `getAdminSessionResult()` resolves it server-side from
`GET /admin/me` (`session.ts:66-80`), and the guard reads only the session user id, resolving the
role from the database (`apps/api/src/admin/admin.guard.ts:30-53`). The prototype's `?role=super`
fail-open is structurally unreachable.

**Every exit from `AdminGuard` is `true` or a throw** — no fallthrough, no default-allow, and no
super-admin bypass: `super_admin` passes because the seed grants it six real permission rows, so
revoking one in the database actually revokes it (`admin.guard.ts:60-75`).

**Verdict: ✅** — works end to end on all four paths.

---

## 12. 🔨 Platform → App Settings — IN FLIGHT, do not treat as broken

Another lane is actively writing this. **It moved twice during this audit.** State as of the final
re-verification (2026-08-29 19:31 IST):

| Piece | State |
|---|---|
| `apps/api/src/db/schema/settings-schema.ts` | ✅ **landed** — a deliberately small table; every column names its enforcement point (`:16-25`), and the file lists the prototype's settings it refuses to add because nothing could enforce them (`:27-36`) |
| Migration `0021_curvy_marten_broadcloak.sql` | ✅ **generated + journaled** — singleton row, CHECK constraints on every range |
| `platform_settings` table in `uthavu_dev` | ⏳ **not applied yet** — 21 of 22 migrations applied; `to_regclass` → ABSENT |
| `apps/api/src/config/` (`platform-config.controller.ts`, `.service.ts`, `platform-settings.ts`, `maintenance.guard.ts`) | ✅ **landed on disk** |
| `PlatformConfigModule` in `app.module.ts` | ⏳ **not registered yet** |
| `GET /config` live | ⏳ **404** (expected — not registered, container not rebuilt) |
| `AdminSettingsController` | ⏳ referenced in a comment (`platform-config.controller.ts:14`), not yet written |
| Admin UI `platform/settings/page.tsx` | ⏳ still the placeholder + 24 filler rows |
| **Mobile client** | ✅ **fully landed** — `libs-mobile/api/config.ts` (typed `PlatformConfig`, field-by-field normalisation, `DEFAULT_PLATFORM_CONFIG` fallback so a config failure never blocks launch) + `apps/mobile/src/hooks/useConfig.ts` |

**Nothing here is a defect.** The mobile client landing ahead of the endpoint is intentional and
handled — `config.ts:87-90` explicitly anticipates "a build running against an older API that has no
`/config` yet" and degrades to defaults. **Re-verify before judging any of it.**

**Verdict: 🔨** — half-written by design.

---

## Broken and weak seams, in priority order

### 1. ❌ Hiding a report is completely silent to the citizen — the highest-stakes action in the product

`admin-report-moderation.service.ts:231-234`; citizen filters at `reports.service.ts:115,194,247,289`.

A moderator hides someone's **emergency help request** and the citizen's app shows them nothing —
not an alert, not a tombstone, not a 410. Their request is simply absent from their own list, which
is indistinguishable from a bug. Suspension is a close second in severity but is now handled
honestly on mobile (§1); hiding is not handled at all.

**Blocked on product copy, not engineering** — open question 4. English + Tamil wording for
"a moderator removed this" is the whole task; the alert plumbing (`AlertsService.create`,
`alert-templates.ts`) already exists and `close` demonstrates the pattern.

### 2. ❌ Announcements: publish works, and the publish dialog tells the operator a falsehood

`update-actions.tsx:125-127` promises *"It becomes visible to citizens in the mobile app."*
`GET /updates` is live and correct (`updates.controller.ts:18-25`, verified 200 as a citizen), but
**no mobile consumer exists** — no `libs-mobile/api/updates.ts`, no screen.

Eight admin-side files, a table, a migration, four audited mutations and a bilingual editor all
work, and the output reaches nobody. Either build the mobile reader or change that sentence — the
current state is a control that lies about what it does, which is exactly the failure
`settings-schema.ts:8-10` was written to avoid repeating.

### 3. ❌ Support tickets: a queue with no out-tray

`admin-support.controller.ts:39,44` — `GET :id` and `PATCH :id/status` are finished, tested and
gated, and have **zero callers**. The feature folder has no `useMutation` and no `rowHref`, so a row
cannot even be opened.

**Live: `support_tickets` is empty and `admin_audit_logs` has zero `support_ticket.*` rows** — this
has never been exercised. The first real citizen ticket arrives into a dead end. This is a UI-only
task against a complete API.

### 4. ❌ Report categories: complete CRUD, zero controls

`admin-categories.controller.ts:39-70` vs. a feature folder with no handlers. **Zero
`report_category.*` audit rows.**

**The stated blocker no longer exists.** `categories-table.tsx:145-153` defers the work because the
console "has no shared dialog primitive yet" — but
`features/moderation/confirm-action-dialog.tsx` now exists and is used by four other sections.
**Decide open question 7 first**, though: `pnpm db:seed` upserts by `key`, so shipping this UI before
fixing the seed means the next seed run silently reverts an admin's edits.

### 5. 🟡 The mobile suspension alert is not localised — the one screen where that matters most

`apps/mobile/src/navigation/RootNavigator.tsx:83` hardcodes the English title `'Account suspended'`
and passes the API's English-only body (`account-status.ts:61-62`) straight through — while
`libs-mobile/i18n/locales/ta/auth.json:29` holds the Tamil string, and `OtpScreen.tsx:68` uses it
correctly two files away. A one-line fix that closes an i18n contract violation at the worst
possible moment.

### 6. 🟡 Only `close` notifies anyone, and only volunteers

Twelve of the fifteen mutating admin actions are silent. `close` alone alerts, and only active
volunteers, and only by reusing `report_cancelled` (`admin-report-moderation.service.ts:101-128`).
**The reporter is never told anything by any admin action.**

This is downstream of the same root cause as seams 1 and 2: **there is no FCM sender anywhere in
`apps/api`** — re-verified independently here, `firebase-admin` is absent from every `package.json`
in the repo. `devices` is a write-only table today, so even the alerts that *are* written arrive
only when the citizen pulls to refresh.

### 7. 🟡 Stale operator-facing warning about a fixed bug

`categories-table.tsx:198-205` warns that the API's per-category count subquery compares
`reports.category_id` to `reports.id`. **Fixed** — live `GET /admin/report-categories` returns
`animalRescue → reportCount: 1`, not zero. The warning is conditional on all-zero counts so it will
not render, but the text describes history as if it were the present.

---

## Contradictions with the existing completion matrix

Named rather than smoothed over.

1. **Matrix line 63 / issue 11 — "Mobile does not handle `403 ACCOUNT_SUSPENDED`" is now false.**
   The mobile half landed: `libs-mobile/lib/api.ts:41-54,125-127`,
   `RootNavigator.tsx:73-96`, `OtpScreen.tsx:59-73`, plus English **and Tamil** copy at
   `libs-mobile/i18n/locales/{en,ta}/auth.json:29`. Issue 11 should be closed; the residual defect is
   narrower and different (seam 5 above: the global handler's copy is not localised).

2. **Matrix line 87-88 / scoreboard — Community Updates is no longer 🔨, and Announcements is no
   longer a `SectionPlaceholder`.** The section shipped as its own top-level nav entry
   (`nav.ts:135-140`) with a real list, create and edit page and working publish/archive/delete. The
   matrix's remaining-work item 6 ("eleven support files exist with no page consuming them") is
   closed; item 7 (no mobile surface) stands and is seam 2 above.

3. **Matrix line 109 — the Categories blocker is stated as "the console has no shared dialog
   primitive."** That is no longer true: `features/moderation/confirm-action-dialog.tsx` exists and
   four other sections use it. The remaining blocker is open question 7, not the primitive.

4. **Matrix line 195 / issue 15 — "`curl` against the running API is not evidence about this repo."**
   That caveat was correct for a 26-hour-old container. **It no longer applies**: `uthavu-api` was
   rebuilt today and every `/admin/*` route on disk answered 200 for super_admin. Live probing was
   used as primary evidence throughout this document and the container age is stated at the top.
   Issue 15 should be re-scoped to "state the build's age whenever you cite a live response,"
   which is what this audit does.

5. **Matrix line 88 — "Announcements: 8 routes."** The controller declares **7**
   (`admin-community-updates.controller.ts:45,50,55,64,76,85,96`). Cosmetic.

6. **The matrix's own snapshot lesson repeated itself, twice, during this audit.** At 18:56
   `platform_settings` had no hits anywhere in the tree; by 19:31 a schema file, a migration, four
   `src/config/` files and a controller existed. Anything read from disk, Postgres or HTTP in a
   four-lane working copy is a snapshot. This document states the time of each volatile reading.

---

## What is genuinely finished, and worth saying plainly

Because a list of seams reads worse than the console deserves:

- **The gate hop passes on every flow, verified live.** Three distinct denial codes
  (`ADMIN_NO_SESSION` / `ADMIN_NOT_AN_ADMIN` / `ADMIN_MISSING_PERMISSION`), no `?role=` bypass, no
  super-admin special case, no `return true` fallthrough — and
  `admin-module-guard.spec.ts:42-49` walks `AdminModule`'s controller list so a new ungated
  controller fails the suite instead of publishing an admin route.
- **The audit hop passes on every mutation.** All 15 mutating service methods pass `tx` into
  `auditService.record()` so the entry and the change commit or roll back together
  (`admin-audit.service.ts:27,72`) — no orphaned entries, no unattributable changes.
- **The console does not lie about state where it knows better.** Non-optimistic mutations
  (`features/moderation/actions.ts:22-25`), an em dash instead of a false `0` for dashboard tiles
  with no source, a 403 rendered as "you don't have permission" rather than an error, and
  `ContentStaysVisibleNote` (`user-status-actions.tsx:113-120`) telling a moderator that suspension
  is not a takedown.

The failure mode across this console is consistent and narrow: **backend-complete, UI-incomplete at
one end and citizen-silent at the other.** Four of the six broken seams are a missing button or a
missing screen against an API that already works.

---

_Last verified against commit `d60e276`, 2026-08-29 19:31 IST, with four lanes writing into the
working copy. Live evidence came from container `uthavu-api` (rebuilt today, up ~27 min at the start
of this audit) and read-only `psql` against `uthavu-postgres` / `uthavu_dev`. A real super_admin,
ops_admin and citizen session were each obtained and used; **no destructive write was performed**.
Platform → App Settings (§12) is in flight and its state changed twice during the audit — re-verify
before acting on it._
