# ADR 0012: The admin audit log ships before the first mutating admin endpoint

- **Status**: Accepted — captured while the implementation was landing, 2026-08-28
- **Date**: 2026-08-28
- **Deciders**: Sequencing requirement raised by the architecture pass
  ([`../architecture/admin-console-integration.md`](../architecture/admin-console-integration.md) §3,
  gap P-5); implementation by the backend lane the same day. The *shape* below was read out of the
  code and the migration, not proposed by this ADR.

## Context

At the time this was decided the `/admin` surface was three read-only routes — `GET /admin/me`,
`GET /admin/dashboard`, `GET /admin/admins` (`apps/api/src/admin/admin.controller.ts:38-61`). The
next tranche of console work was all mutations: hide a report, remove a comment, resolve a flag, edit
a category, change a ticket status, suspend an account
([ADR 0011](./0011-user-suspension-blocks-login-not-content.md)).

That tranche has since landed — the surface is now eight controllers covering `/admin/reports`,
`/admin/users`, `/admin/report-categories`, `/admin/support-tickets`, `/admin/audit-logs`,
`/admin/analytics`, comments, and the root controller. **The audit table went in first**, which is
the whole point of recording this: the sequencing held under delivery pressure rather than being
abandoned once the mutations became urgent.

**Order matters here in a way it usually does not.** An audit trail added after the endpoints it is
meant to cover starts life with a hole in it — the actions taken before it existed are unattributable
forever, and every existing endpoint has to be revisited to add a call it was not written to make.
The pressure to defer is real, because an audit table produces nothing a user can see and every
mutating endpoint is more urgent-looking than the log that records it.

Two things made deferring unacceptable:

1. **`docs/webadmin/09-admins-and-audit.md` names "audit logs are never written" as a headline
   failure of the prototype.** The prototype had an Audit Logs screen and nothing wrote to it. This
   repo exists partly to not repeat that, and the way to not repeat it is not to ship the screen
   last.
2. **Without it, every moderation action is unattributable.** Uthavu's admin actions are
   consequential — hiding somebody's request for emergency help, removing their words, blocking
   their account. "Who hid this report, when, and why" must have an answer that is not "check the
   database and guess". That answer is also what protects staff: an action nobody can attribute is
   an action nobody can defend.

The architecture pass therefore ranked this #3 of the five blocking gaps and stated the sequencing
explicitly: *"Build it before the first mutating endpoint, not after."*

## Decision

**The audit trail is a hard prerequisite for the `/admin` write surface. Every mutating admin route
writes an `admin_audit_logs` row, in the same transaction as the change it records.**

The shape that landed (verified against `apps/api/drizzle/0018_famous_multiple_man.sql` and
`apps/api/src/db/schema/audit-schema.ts`, applied to `uthavu_dev` 2026-08-28) — **three** tables,
not one:

| Table | Holds |
|---|---|
| `admin_audit_actions` | Lookup — `report.hide`, `comment.remove`, … plus a `target_type_key` and `sort_order`. **13 rows** |
| `admin_audit_target_types` | Lookup — `report`, `comment`, `comment_flag`, `report_category`, `support_ticket`, `user`. **6 rows** |
| `admin_audit_logs` | The append-only trail itself |

> **Correction, 2026-08-28.** The target-type row above originally listed **five** types, omitting
> `user`. It was stale the moment it was written: [ADR 0011](./0011-user-suspension-blocks-login-not-content.md)'s
> suspension work added the `user` target type and the `user.suspend` / `user.reactivate` actions the
> same afternoon, which the Neutral section further down already reflected. Counts confirmed against
> `admin-audit-catalogue.ts` and the live database.

Five properties of that schema are load-bearing, and each is a decision in its own right:

- **Append-only by construction.** `admin_audit_logs` has `created_at` and *no* `updated_at` and
  *no* `deleted_at` (`audit-schema.ts:73-140`). A record that can be edited or hidden is not an
  audit trail, and the absence of the columns is what says so to the next person reading the schema.
- **The actor is snapshotted, not just referenced.** `actor_user_id` is `ON DELETE SET NULL`
  (`audit-schema.ts:88-90`) — never CASCADE, because deleting an admin's account must not delete
  the evidence of what that admin did, which would make account deletion a trail-erasing tool.
  Alongside it, `actor_email` / `actor_name` / `actor_role_key` are written at the time of the
  action (`audit-schema.ts:96-98`). That covers two cases a join cannot: `admin_users` CASCADEs on
  user deletion, so a departed admin's role would join to nothing; and an admin who later changes
  role must not have their past actions relabelled with the new one.
- **The target is identified but not foreign-keyed.** `target_id` is `text`, not `uuid`, because
  most targets are uuid-keyed but `user.id` is text (Better Auth owns that column's type) — one
  column that holds either beats two nullable ones kept mutually exclusive. And it is deliberately
  **not** an FK (`audit-schema.ts:107-117`): the target may be hard-deleted later, and an FK would
  then either block the delete or null the reference, both of which destroy the record of what was
  acted on. `target_label` is the human-readable snapshot that keeps the row meaningful once the
  target is gone.
- **The change itself is diffable.** `before` / `after` `jsonb`, both nullable —`before` alone on a
  removal. For `comment.remove` this is where the removed comment's body lives, which is what makes
  a moderation decision reviewable after the fact (`audit-schema.ts:119-124`).
- **`reason` is a nullable column with a DTO-level requirement.** Required on destructive actions,
  optional elsewhere, and enforced in the DTO so the rule lives in one place rather than two that
  can drift (`audit-schema.ts:126-129`).

> **"Append-only by construction" is overstated — corrected 2026-08-28.** It is append-only by
> *column absence* and by convention, not by enforcement. Migration 0018 contains no `REVOKE`, rule
> or trigger blocking `UPDATE` / `DELETE` on `admin_audit_logs`, and the application connects as a
> single pooled role that could do either. The `Executor` type even exposes `update`
> (`admin-audit.service.ts:27`). The absent columns tell the next developer what the table is; they
> do not stop the database from being edited by someone who wants to.

And two properties of the service:

- **`record()` takes the caller's transaction.** `RecordAuditParams.tx` is a Drizzle `Executor`
  (`apps/api/src/admin/admin-audit.service.ts:27`, params `:29-42`, `record()` `:56-89`). An audit
  entry written outside the transaction that made the change can be orphaned by a rollback — a log
  of something that never happened — or lost by a crash between the two statements — a change nobody
  can attribute. Both are the prototype's failure arrived at from a different direction.
  **But note the limit of that guarantee:** `tx` is *optional* and defaults to `tx = db` (`:66`), so
  an endpoint that simply forgets to pass it still compiles and still writes the row — just outside
  the transaction. "In the same transaction" is a review-enforced convention, not a type-checked
  one. All 13 current call sites pass it correctly (verified route by route, 2026-08-28).
- **The actor comes from `AdminGuard`, not the request.** `record()` takes an `AdminIdentity`, which
  the guard resolved from a verified session and the database
  (`admin-audit.service.ts:29-42`, guard at `apps/api/src/admin/admin.guard.ts:29-79`). Nothing
  client-supplied can name the actor.
- **A missing catalogue row fails the whole request.** If an action key is in the code catalogue but
  not in the database, `record()` throws `admin_audit_actions row missing for key "…" — did db:seed
  run?` (`admin-audit.service.ts:104-108`; the two target-type equivalents are `:120-124` and
  `:134-138`). Loud, not silent: writing the mutation without its audit
  row is precisely the failure this table exists to prevent.

## Consequences

**Positive**

- Every admin mutation is attributable to a named person, with a role, a timestamp, a before/after
  and — where required — a reason. That is the thing the prototype could not do.
- Atomicity is available for free at the call site: pass `tx`, and the log and the change succeed or
  fail together.
- The Audit Logs screen has real data on day one instead of being the last thing wired up, and
  `list()` already supports the filters it needs — actor, action, target type, target id, date range
  — with offset pagination (`admin-audit.service.ts:145-246`,
  `apps/api/src/admin/dto/list-audit-logs.dto.ts:21-36`).
- "Everything that ever happened to this report" is one indexed lookup
  (`admin_audit_logs_target_idx` on `(target_type_id, target_id)`, `audit-schema.ts:148`).
- The `reason` column makes a future, narrowly-scoped privileged read auditable if one is ever
  granted — which is the mechanism [ADR 0010](./0010-mission-chat-is-not-readable-by-admins.md)
  would need if Mission Chat access were ever reopened. Having it does not grant it.

**Negative**

- Real up-front cost before any moderation feature shipped: three tables, a migration, a seed file,
  a service, a DTO and a catalogue, none of which a user ever sees.
- Every mutating admin endpoint now carries an obligation. An endpoint that forgets `record()` is a
  silent hole — the code cannot force the call, only the review can. Adding an action also means
  editing `admin-audit-catalogue.ts` **and** re-running `pnpm db:seed`, or the first use throws.
- Adding an audit action is a code change plus a seed run, not a data change. That is the price of
  the lookup tables (below).

**Neutral**

- **Lookup tables rather than plain text columns**, and the reasoning is specific enough to be worth
  keeping: an audit action key is *filtered on* by a UI dropdown, and `select distinct action from
  admin_audit_logs` can only ever show actions that have already happened — so the filter would
  silently lack an option until someone used it. The lookup gives the dropdown a complete, ordered
  catalogue on day one, and the FK turns a typo'd key into a write-time failure rather than an
  unfilterable orphan row (`audit-schema.ts:16-24`). Note that `alerts-schema.ts` deliberately went
  the *other* way for its own `type` discriminator; the two are not inconsistent, they are the same
  test applied to different facts.
- **Audit action keys are `target.verb`, not the `module:action` form used by RBAC permissions**
  (`audit-schema.ts:39-43`). A permission answers "may you"; an audit action records "what happened
  to which thing". One shape for both would imply a 1:1 mapping that does not exist —
  `reports:manage` covers four distinct report actions.
- **`ip_address` and `user_agent` are best-effort and nullable.** This app does not set Express
  `trust proxy`, so behind a proxy `req.ip` may be an internal hop rather than the admin's real
  address (`apps/api/src/admin/admin-request-meta.ts:4-13`). Recorded as-is and admitted, because an
  audit trail that confidently asserts a wrong IP is worse than one that says it does not know.
- **Coverage is thirteen actions across six target types**
  (target types `apps/api/src/admin/admin-audit-catalogue.ts:15-22`, actions `:32-114`): report
  close/reopen/hide/reinstate, comment
  remove/restore, comment flag resolve, category create/update/delete, ticket status change, and
  `user.suspend` / `user.reactivate` ([ADR 0011](./0011-user-suspension-blocks-login-not-content.md)
  — note the reversal verb is `reactivate`, not `unsuspend`). The catalogue deliberately lists only
  actions some endpoint actually writes, so the console's filter never shows a permanently-empty
  option — which also means this list grows with the endpoint surface and should be re-read rather
  than quoted from here.
- ~~Verified 2026-08-28 against `uthavu_dev`: the three tables exist (migration 0018 applied) but
  hold **0 rows** … `pnpm db:seed` has not run since 0018.~~ **Superseded the same day.** `db:seed`
  has since run. Re-verified against `uthavu_dev`: `admin_audit_actions` **13**,
  `admin_audit_target_types` **6**, and `admin_audit_logs` holds **26 real rows across nine distinct
  actions** (`comment_flag.resolve` ×9, `comment.remove` ×3, `report.close` ×3, `report.reopen` ×3,
  `comment.restore` ×2, `user.reactivate` ×2, `user.suspend` ×2, `report.hide` ×1,
  `report.reinstate` ×1). The trail is not merely wired — it is being written. The unseeded failure
  mode remains real for a fresh database and after every new catalogue entry; see
  [`../_audit/issues.md`](../_audit/issues.md) issue 9.

### Known deviation — `DELETE /admin/community-updates/:id` records no reason

**2026-08-29.** This ADR says `reason` is *"Required by the DTO on destructive actions, optional
elsewhere."* Community Updates' delete does not honour that: it writes `reason: null`
(`apps/api/src/admin/admin-community-updates.service.ts:331-337`, where the deviation is commented
in place rather than left silent).

The cause was **the frozen API contract, not the implementer's choice** — that contract specified
`DELETE /admin/community-updates/:id -> 204` with no request body, and the admin UI was already
being built against it in parallel, so requiring a reason would have broken a client mid-build. This
is a straightforward consequence of freezing a contract before checking it against this ADR, and the
lesson is that the contract review should include the audit obligations, not just the response shape.

**Why it was accepted rather than fixed immediately:** the record is still attributable and
reviewable — actor, role, timestamp, target label and the **complete `before` copy of the deleted
row** are all captured, and the delete is a soft delete (`deleted_at`), so the content is recoverable
from the database as well as from the audit entry. What is lost is the *stated motive*, not the
evidence.

**This is a deviation, not a precedent.** Any new destructive admin action should take a reason, and
if Community Updates' delete grows a body later it should adopt one. Recorded here so the next person
finds a known, argued exception rather than concluding the convention is optional.

## Alternatives considered

- **Ship the mutating endpoints first, add the audit log after.** Rejected — this is the entire
  point of the ADR. It guarantees an unattributable window that can never be reconstructed, and it
  requires revisiting every endpoint afterwards to add a call it was not built to make. It is also
  exactly what the prototype did.
- **A single `admin_audit_logs` table with plain `action` / `target_type` text columns.** The
  simpler schema, and the one the gap analysis originally sketched
  (`admin_audit_log(id, actor_user_id, action, target_type, target_id, before, after, created_at)`).
  Rejected for the dropdown reason above: the filter UI needs a complete catalogue, and text columns
  can only offer the subset that has already occurred. The FK also turns a typo into a write-time
  failure instead of a row nobody can find.
- **A global NestJS interceptor that logs every mutating admin request automatically.** Tempting —
  it cannot be forgotten. Rejected because an interceptor sees the HTTP request, not the domain
  change: it cannot produce a meaningful `before`/`after` diff, cannot name a `target_label` for a
  row it never read, and cannot join the service's transaction, which is the property that keeps the
  log and the change atomic. Explicit `record()` calls trade forgettability for correctness. A
  belt-and-braces interceptor that logs *attempts* could be added later without changing this.
- **Postgres triggers on the mutated tables.** Rejected: triggers cannot see who the acting admin is
  (the connection is a single pooled application user), so every row would have a null actor —
  which is the one field this table exists for.
- **Reuse the existing `alerts` table.** Rejected: `alerts` is a per-citizen notification log read
  by the mobile app (`apps/api/src/db/schema/alerts-schema.ts`), with entirely different retention,
  privacy and localisation requirements. Staff provenance and user notifications are two facts, not
  one.
- **Only log destructive actions.** Rejected: "who reopened this report" and "who restored this
  comment" are exactly as interesting as the destructive halves, and a partial trail invites the
  question of where the line is on every new action.

## Evidence in code

- `apps/api/drizzle/0018_famous_multiple_man.sql` — creates the three tables plus the four indexes;
  also adds `report_comments.deleted_at` / `deleted_by` for `comment.remove`. Applied to
  `uthavu_dev` (verified 2026-08-28: 20 rows in `drizzle.__drizzle_migrations`, head = 0019).
- `apps/api/src/db/schema/audit-schema.ts:1-24` — why three tables and why lookups.
- `apps/api/src/db/schema/audit-schema.ts:73-140` — the append-only trail, the actor snapshot
  columns, the non-FK target.
- `apps/api/src/admin/admin-audit-catalogue.ts:15-22` (target types) and `:32-114` (actions) — the
  closed union; a raw string at a call site is a compile error by design. *(Corrected 2026-08-28:
  this cited `:15-106`, which cuts off mid-`user.suspend` and excludes `user.reactivate` entirely.
  An earlier line in this ADR cited `:15-112` for the same thing — also wrong, and the two disagreed
  with each other.)*
- `apps/api/src/admin/admin-audit.service.ts:27` — the `Executor` type (its rationale is the doc
  comment at `:17-26`) and the transaction argument that makes log-and-change atomic.
- `apps/api/src/admin/admin-audit.service.ts:56-89` — `record()`.
- `apps/api/src/admin/admin-audit.service.ts:145-246` — `list()`, with a `leftJoin` on `user` so a
  departed admin's entries still appear, and `desc(createdAt), desc(id)` so uuidv7 ordering breaks
  ties in true write order within one transaction.
- `apps/api/src/admin/admin-audit.service.ts:253-276` — `catalogue()`, serving the filter dropdowns
  from the lookup tables rather than `select distinct` over the log.
- `apps/api/src/db/seed-audit.ts:22-59` — upserts the catalogue by `key`, so a re-seed is a no-op on
  unchanged rows.
- `apps/api/src/admin/admin-request-meta.ts:25-40` — the `RequestMeta` decorator producing the
  nullable, best-effort `ipAddress` (`:36`) / `userAgent` (`:37`); the `AdminRequestMeta` interface
  is `:14-17`. *(Corrected 2026-08-28 from `:14-39`, which conflated the interface with a truncated
  decorator.)*

### Verified coverage, 2026-08-28

The Decision's central assertion — *every* mutating admin route writes a row — was re-checked route
by route against commit `d60e276`, after the admin API landed as `177100c`:

**13 mutating routes, 13 `record()` call sites, 13 inside the mutating `db.transaction`, 13 passing
`tx`. No mutating admin route lacks an audit write.**

| Route | Service `record()` | Action key |
|---|---|---|
| `POST /admin/report-categories` | `admin-categories.service.ts:131` (tx `:138`) | `report_category.create` |
| `PATCH /admin/report-categories/:id` | `:179` (tx `:195`) | `report_category.update` |
| `DELETE /admin/report-categories/:id` | `:227` (tx `:236`) | `report_category.delete` |
| `POST /admin/comments/:id/remove` | `admin-comments.service.ts:304` (tx `:315`) | `comment.remove` |
| `POST /admin/comments/:id/restore` | `:357` (tx `:369`) | `comment.restore` |
| `PATCH /admin/flagged-comments/:id` | `:425` (tx `:434`) | `comment_flag.resolve` |
| `POST /admin/reports/:id/close` | `admin-report-moderation.service.ts:88` (tx `:97`) | `report.close` |
| `POST /admin/reports/:id/reopen` | `:163` (tx `:176`) | `report.reopen` |
| `POST /admin/reports/:id/hide` | `:210` (tx `:227`) | `report.hide` |
| `POST /admin/reports/:id/reinstate` | `:260` (tx `:272`) | `report.reinstate` |
| `PATCH /admin/support-tickets/:id/status` | `admin-support.service.ts:171` (tx `:180`) | `support_ticket.status_change` |
| `POST /admin/users/:id/suspend` | `admin-users.service.ts:549` (tx `:561`) | `user.suspend` |
| `POST /admin/users/:id/reactivate` | `:619` (tx `:631`) | `user.reactivate` |

Scope of the sweep: no admin route exists outside `apps/api/src/admin/`, and `apps/admin` ships no
`route.ts` handlers and does not import `drizzle-orm`, so it cannot mutate outside the API.

**One wrinkle worth knowing.** `record()`'s catalogue lookups (`actionIdFor` `:95-98`,
`targetTypeIdFor` `:115-118`, `:129-132`) query `db`, not the caller's `tx`. Harmless for immutable
master data, and the "did db:seed run?" throw still fires *inside* the transaction callback so the
mutation correctly rolls back — but it means `record()` touches a second pooled connection while
holding a transaction, which would deadlock at pool size 1.

---

*Captured against working tree at commit `d035cfd` on 2026-08-28, when the audit code was still
uncommitted; the schema was read from the migration and the schema file, not from a summary.
Closes gap **P-5** in
[`../architecture/admin-console-integration.md`](../architecture/admin-console-integration.md).*

_Last verified against commit `d60e276`, 2026-08-28, and the live `uthavu_dev` database. That
adversarial re-check confirmed the Decision (13/13 mutating routes audit-logged) and corrected: the
five-item target-type table (now six), two mutually-inconsistent and both-wrong catalogue ranges,
`admin.guard.ts:29-77`→`:29-79`, `admin-audit.service.ts:100-108`→`:104-108`,
`admin-request-meta.ts:14-39`→`:25-40`, the "0 rows" verification note, and the overstated
"append-only by construction" and "same transaction" guarantees._
