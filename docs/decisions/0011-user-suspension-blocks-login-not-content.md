# ADR 0011: User suspension blocks access, never content

- **Status**: Accepted
- **Date**: 2026-08-28
- **Deciders**: Product owner. The enforcement code landed the same day and follows this rule; the
  rule came first.

## Context

The admin console's Users section needs a moderation lever short of account deletion. Deletion
already exists and is drastic and irreversible: `UsersService.deleteAccount()` removes the `user`
row and lets the schema's SET NULL / CASCADE policy anonymise everything the person left behind
(`apps/api/src/users/users.service.ts:65-153`). There was nothing between "do nothing" and that.

Before this decision there was no status concept on an account at all — no `status`, `suspended_at`
or `banned_at` column anywhere on `user` (Better Auth owns that table,
`apps/api/src/db/schema/auth-schema.ts`). "What does suspending a user actually do?" was open
question #3 in [`../_audit/open-questions.md`](../_audit/open-questions.md), flagged as blocking
both the schema and the endpoint — because the answer decides the columns *and* the side effects.

The forces:

- **Uthavu is an emergency-help product.** A report is often somebody asking for help *right now*.
  Whatever suspension does, it must not turn a moderation action into a second emergency.
- **Missions have two parties.** A report has a reporter and, once accepted, one or more volunteers
  whose `mission_volunteers` rows are live. The two are different people and the moderation reason
  applies to only one of them.
- **The obvious implementation is the wrong one.** "Suspend the account and hide their stuff" is
  what most products mean by suspension, and it is one `WHERE` clause away in every listing query.
- **It has to be reversible.** Moderation gets things wrong, and an action that cannot be undone
  turns every borderline case into a decision nobody wants to make.

## Decision

**Suspension is a reversible `active` / `suspended` status on a person's *access*, enforced
server-side. It never touches their content.**

A suspended user:

- **cannot log in** — session creation is refused, so no token and no cookie is ever issued;
- **cannot perform authenticated actions** — creating reports, accepting missions, sending mission
  chat, and every other authenticated request.

Suspension **must NOT** delete, hide, cancel, or otherwise alter:

- their existing reports (open or otherwise),
- their active missions,
- their completed missions,
- their impact stories.

### The load-bearing scenario, in the owner's words

> Hari files an emergency report → Priya accepts and begins helping → an admin suspends Hari →
> **Priya's mission must continue normally** (view, navigate, continue, complete).

This is the scenario the whole design serves. Priya is not suspended; Priya's mission is not the
moderation target; Priya must not discover mid-journey that the person she is driving to has
evaporated from the app.

### Shape

- Status values live in a **lookup table** referenced by FK, per CLAUDE.md § Database — not a text
  enum. `user_statuses` seeds `active` and `suspended`
  (`apps/api/src/db/seed.ts:92-95`).
- The status lives in **`user_account_status`, a separate table keyed on `user_id`**, not a column
  on `user`. Two reasons, both in the schema's own header
  (`apps/api/src/db/schema/user-status-schema.ts:20-28`): Better Auth owns `user` and CLAUDE.md says
  extend rather than modify it (the generated `auth-schema.ts` already carries hand-edits that must
  be redone after every regenerate, and a security-relevant column is a bad thing to lose that way);
  and **absence of a row means active**, so there is no backfill and no default value that has to be
  right — the same honest default `admin_users` uses for "most people are not admins".
- Carries an **optional internal `reason`**, `suspended_at`, and `suspended_by`
  (`user-status-schema.ts:79-85`). `reason` is staff-only and is never returned on a citizen-facing
  endpoint — the suspended user is told they are suspended, not what an admin wrote about them.
- **Reversible via unsuspend**, which sets the status back to `active` and clears the three
  suspension columns, leaving the row in place.
- **All of it audit-logged.** `user_account_status` answers "what is true right now"; the durable
  history of who suspended whom, when, and why belongs in `admin_audit_logs`
  ([ADR 0012](./0012-admin-audit-log-before-the-first-mutating-endpoint.md)).

### Where it is enforced — exactly two places

1. **Login.** A `session.create.before` database hook throws, so a suspended user never receives a
   session (`apps/api/src/auth/auth.ts:128-141`). That hook is the one chokepoint every sign-in path
   passes through — admin email+password, mobile phone-OTP verify, and any provider added later —
   so no future sign-in route can be added without inheriting the check.
2. **Authenticated requests.** `SuspendedAccountGuard` is registered as a **global** `APP_GUARD` by
   its own module (`apps/api/src/account-status/account-status.module.ts:28`; guard at
   `apps/api/src/account-status/suspended-account.guard.ts:39-82`). `AccountStatusModule` is
   imported **last** in `AppModule` (`apps/api/src/app.module.ts:59-62`), which is load-bearing:
   Nest orders global enhancers by registration, and this one must run after `AuthModule`'s own
   `APP_GUARD` has resolved the session onto the request. Global rather than per-route deliberately:
   a guard you have to remember to apply is a guard that will be missing from next month's route.
   There is no opt-out decorator.

Both read the same function, `isUserSuspended()`
(`apps/api/src/account-status/account-status.ts:29-44`), so the two paths cannot drift on what
"suspended" means.

**Both gate on the *caller's* id and nothing else.** No request is ever evaluated against the
reporter's status. That is what makes Priya's mission keep working — by construction, not by a
special case someone has to remember to write.

### Error shape

Rejection is **403 with `code: 'ACCOUNT_SUSPENDED'`**, never a bare 401
(`apps/api/src/account-status/account-status.ts:59-62`). A 401 is indistinguishable from an expired
session, and the two need opposite client responses: an expired session should silently
re-authenticate, whereas a suspension must show the user an honest message and must **not** clear
their token and bounce them to login as though nothing had happened.

## Consequences

**Positive**

- A volunteer is never stranded mid-emergency by a moderation action against someone else.
- A genuine request for help is never destroyed as a side effect of moderating the person who filed
  it. The community record — completed missions, impact stories — stays intact.
- Nothing to un-hide on unsuspend. Because suspension never hid anything, reversal is a status
  update, not a restoration job that has to remember what it changed.
- The blast radius is auditable: two enforcement points, one shared predicate, no filter added to
  any citizen read path.
- No migration risk for existing accounts — absence of a row is active, so 0019 is purely additive
  (`apps/api/drizzle/0019_motionless_invaders.sql`).

**Negative**

- **A suspended user's content stays visible, including content that may be part of why they were
  suspended.** If the problem *is* the report or the comment, suspension is the wrong tool — hide
  the report (`report.hide`) or remove the comment (`comment.remove`) as well. Suspension answers
  "this person may not use the app", not "this content must go". Staff need to understand that
  those are two actions.
- A suspended reporter cannot be reached through the app by the volunteer still helping them.
  Mission Chat writes from a suspended account are refused like any other authenticated action, so
  Priya can message but Hari cannot reply. The phone number, where `phone_visible` allowed it, is
  the remaining channel.
- The guard adds a single-row primary-key lookup to every authenticated request. Deliberately not
  cached (`account-status.ts:21-27`): a cache would buy microseconds and cost a window in which a
  just-suspended account keeps working, which is the wrong side of that trade for a moderation
  control. If it ever shows up in a profile, the fix is a cache with explicit invalidation on
  suspend/unsuspend, not a bare TTL.

**Neutral**

- The request guard covers **reads as well as writes**, which is slightly wider than the owner's
  enumeration of writes. The reasoning is recorded at `suspended-account.guard.ts:23-29`: "cannot
  log in" already means a suspended person has no working session, so gating reads is the consistent
  reading rather than a broader one — and it is kinder, because a suspended user who can still read
  gets an app that looks normal until every button fails.
- The guard throws a **500** if `request.session` is `undefined`, meaning the two global guards were
  registered in the wrong order (`suspended-account.guard.ts:59-65`). That is intentional: treating
  it as anonymous and passing would turn a guard-ordering regression into a silently disabled
  suspension check.
- **The admin-facing half landed while this ADR was being written.** `POST /admin/users/:id/suspend`
  and `POST /admin/users/:id/reactivate`, both gated on `users:manage`
  (`apps/api/src/admin/admin-users.controller.ts:63-64, 75-76`), alongside `GET /admin/users` and
  `GET /admin/users/:id`. The audit catalogue gained a `user` target type
  (`apps/api/src/admin/admin-audit-catalogue.ts:21`) and the `user.suspend` / `user.reactivate`
  actions (`:103, :109`). Note the reversal verb is **`reactivate`**, not `unsuspend`. The
  "all audit-logged" clause above is therefore now a description, not just a requirement.
- Verified 2026-08-28: `user_statuses` had **0 rows** in the local `uthavu_dev` database — the seed
  defines `active`/`suspended` but had not been re-run since migration 0019 applied, so nothing
  could be suspended until `pnpm db:seed` ran. An operational note, not a design defect; tracked as
  [`../_audit/issues.md`](../_audit/issues.md) issue 9. Re-check before concluding a suspend call is
  broken.

## Alternatives considered

- **Block login *and* hide the suspended user's content.** The conventional meaning of "suspend",
  and rejected outright. It strands a volunteer mid-emergency — Priya's mission would lose its
  report — and it destroys a genuine help request as collateral damage of a decision about a person.
  It also makes suspension irreversible in practice: restoring hidden content correctly means
  knowing which rows the suspension hid versus which were already hidden for other reasons.
- **A boolean `suspended` column on `user`.** Rejected for the two reasons in the schema header:
  Better Auth owns that table and its generated file already carries hand-edits that must survive
  regeneration, and a boolean has no room for the reason/`suspended_at`/`suspended_by` the audit
  story needs. A lookup-table FK is also what CLAUDE.md § Database requires for status values.
- **A text enum column instead of the `user_statuses` lookup table.** Rejected per CLAUDE.md:
  renaming or adding a status should be a data change, not a migration, and the FK is what stops an
  invalid value being written at all.
- **Use Better Auth's own admin plugin and its `user.banned` field.** Rejected: the plugin brings a
  whole parallel role system, and this project deliberately models admin identity in `admin_users`
  instead ([ADR 0009](./0009-admin-scoped-api-surface.md)). The plugin's *placement* of the check
  was borrowed — `session.create.before` is where its ban enforcement lives — but not its schema.
  Noted at `apps/api/src/auth/auth.ts:114-122`.
- **Deletion only, with no suspension tier.** Rejected: it makes every moderation call permanent and
  identity-destroying, so staff under-enforce on real problems and any mistake is unrecoverable.
- **Release the suspended reporter's active missions back to the pool.** Considered as a
  "tidy the state" option and rejected: it is precisely the behaviour the owner's scenario forbids.
  Priya has already committed and may already be en route; unbooking her to keep a status column
  tidy is the failure this ADR exists to prevent.

## Evidence in code

- `apps/api/drizzle/0019_motionless_invaders.sql` — creates `user_statuses` and
  `user_account_status`; applied to `uthavu_dev` (verified 2026-08-28, 20 rows in
  `drizzle.__drizzle_migrations`).
- `apps/api/src/db/schema/user-status-schema.ts:1-18` — the product rule, in the schema, in prose.
- `apps/api/src/db/schema/user-status-schema.ts:65-94` — `user_account_status`: PK on `user_id`,
  FK to `user_statuses`, nullable `reason` / `suspended_at` / `suspended_by` (SET NULL, so deleting
  an admin does not un-suspend everyone they actioned).
- `apps/api/src/db/seed.ts:92-95` — the two status rows; the comment explains that `active` exists
  for the un-suspend path to write back to, not because anyone starts in it.
- `apps/api/src/account-status/account-status.ts:29-44` — `isUserSuspended()`, the single shared
  predicate; absence of a row returns `false`.
- `apps/api/src/auth/auth.ts:128-141` — the `session.create.before` hook that blocks login.
- `apps/api/src/account-status/suspended-account.guard.ts:31-36` — the comment stating in the code
  that the guard never looks at anyone but the caller, which is what protects Priya's mission.
- `apps/api/src/account-status/account-status.module.ts:20-28` — registered as a global `APP_GUARD`; `AccountStatusModule` is imported **last** in `AppModule` (`apps/api/src/app.module.ts:59-62`) so it runs after `AuthModule`'s own `APP_GUARD` has resolved the session.

---

*Decided by the product owner 2026-08-28. Captured against working tree at commit `d035cfd`; the
`apps/api/src/account-status/` and `user-status-schema.ts` code was uncommitted in the shared
working copy when this was written. Answers open question #3 in
[`../_audit/open-questions.md`](../_audit/open-questions.md) and closes gaps **U-1 / U-2** in
[`../architecture/admin-console-integration.md`](../architecture/admin-console-integration.md).*
