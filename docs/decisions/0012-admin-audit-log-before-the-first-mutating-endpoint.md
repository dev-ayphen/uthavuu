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
| `admin_audit_actions` | Lookup — `report.hide`, `comment.remove`, … plus a `target_type_key` and `sort_order` |
| `admin_audit_target_types` | Lookup — `report`, `comment`, `comment_flag`, `report_category`, `support_ticket` |
| `admin_audit_logs` | The append-only trail itself |

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

And two properties of the service:

- **`record()` takes the caller's transaction.** `RecordAuditParams.tx` is a Drizzle `Executor`
  (`apps/api/src/admin/admin-audit.service.ts:27-42, 56-89`). An audit entry written outside the
  transaction that made the change can be orphaned by a rollback — a log of something that never
  happened — or lost by a crash between the two statements — a change nobody can attribute. Both
  are the prototype's failure arrived at from a different direction.
- **The actor comes from `AdminGuard`, not the request.** `record()` takes an `AdminIdentity`, which
  the guard resolved from a verified session and the database
  (`admin-audit.service.ts:30-31`, guard at `apps/api/src/admin/admin.guard.ts:29-77`). Nothing
  client-supplied can name the actor.
- **A missing catalogue row fails the whole request.** If an action key is in the code catalogue but
  not in the database, `record()` throws `admin_audit_actions row missing for key "…" — did db:seed
  run?` (`admin-audit.service.ts:100-108`). Loud, not silent: writing the mutation without its audit
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
  (`apps/api/src/admin/admin-audit-catalogue.ts:15-112`): report close/reopen/hide/reinstate, comment
  remove/restore, comment flag resolve, category create/update/delete, ticket status change, and
  `user.suspend` / `user.reactivate` ([ADR 0011](./0011-user-suspension-blocks-login-not-content.md)
  — note the reversal verb is `reactivate`, not `unsuspend`). The catalogue deliberately lists only
  actions some endpoint actually writes, so the console's filter never shows a permanently-empty
  option — which also means this list grows with the endpoint surface and should be re-read rather
  than quoted from here.
- Verified 2026-08-28 against `uthavu_dev`: the three tables exist (migration 0018 applied) but hold
  **0 rows**, including the two lookup tables — `pnpm db:seed` has not run since 0018. Until it
  does, the first `record()` call will throw its "did db:seed run?" error, which is the designed
  behaviour rather than a defect.

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
- `apps/api/src/admin/admin-audit-catalogue.ts:15-106` — the closed union of actions and target
  types; a raw string at a call site is a compile error by design.
- `apps/api/src/admin/admin-audit.service.ts:17-27` — the `Executor` type and the transaction
  argument that makes log-and-change atomic.
- `apps/api/src/admin/admin-audit.service.ts:56-89` — `record()`.
- `apps/api/src/admin/admin-audit.service.ts:145-246` — `list()`, with a `leftJoin` on `user` so a
  departed admin's entries still appear, and `desc(createdAt), desc(id)` so uuidv7 ordering breaks
  ties in true write order within one transaction.
- `apps/api/src/admin/admin-audit.service.ts:253-276` — `catalogue()`, serving the filter dropdowns
  from the lookup tables rather than `select distinct` over the log.
- `apps/api/src/db/seed-audit.ts:22-59` — upserts the catalogue by `key`, so a re-seed is a no-op on
  unchanged rows.
- `apps/api/src/admin/admin-request-meta.ts:14-39` — the nullable, best-effort `ipAddress` /
  `userAgent`.

---

*Captured against working tree at commit `d035cfd` on 2026-08-28. The audit code was being written
by the backend lane as this was recorded and was uncommitted in the shared working copy; the schema
above was read from the migration and the schema file, not from a summary. Closes gap **P-5** in
[`../architecture/admin-console-integration.md`](../architecture/admin-console-integration.md).*
