# ADR 0009: Admin reads and writes go through dedicated `/admin/*` controllers, not role-conditional citizen endpoints

- **Status**: Accepted — captured retroactively, 2026-08-27
- **Date**: 2026-08-27
- **Deciders**: Captured from the code by the architecture agent; the pattern was established by the
  admin auth/RBAC work landing the same day. Not confirmed with the product owner.

## Context

`apps/admin` needs to display and moderate data the mobile app creates. Both surfaces talk to the
same NestJS API and the same PostgreSQL database — single-tenant, no `org_id`, no second datastore
(`apps/api/src/db/index.ts:25-27`). So the only real question is *how the admin console reaches
rows that citizen endpoints already read*.

Two shapes were available:

1. **Role-conditional projections** — keep one set of endpoints and branch inside them: if the
   caller is an admin, widen the filter and skip the redaction.
2. **A separate `/admin/*` surface** — admin-only controllers with their own DTOs, filters,
   projections and guard.

The pressure toward option 1 is real: the citizen endpoints already contain the joins and the
business rules, and duplicating them is duplicated work.

The pressure against it is stronger, and specific to this codebase:

- **The citizen projection is a security boundary, not a convenience.**
  `ReportsService.toResponse()` hides the reporter on an `anonymous` report and hides
  `reporterPhone` unless the caller is the owner or an accepted volunteer
  (`apps/api/src/reports/reports.service.ts:551-562`). `MissionsService.listMessages()` refuses
  before touching the database unless `hasActiveAccess()` passes
  (`apps/api/src/missions/missions.service.ts:645-650`). CLAUDE.md names Mission Chat gating as a
  security boundary and the prototype's client-only version as an explicit anti-pattern. A
  `if (isAdmin)` branch placed *inside* those methods puts the escape hatch in the same function as
  the gate, where a future refactor can widen it by accident.
- **The citizen endpoints are `/me`-scoped by construction.** `users/me/*`,
  `ReportsService.listMine()` (`reports.service.ts:187-194`), `AlertsService.list()`
  (`apps/api/src/alerts/alerts.service.ts:39`), `SupportService.listMine()`
  (`apps/api/src/support/support.service.ts:47`) all take the caller's id and filter on it. Adding
  a "list someone else's" parameter to a citizen route creates a privilege-escalation surface on the
  most-called endpoints in the product.
- **The shapes genuinely differ.** `ListReportsDto` *requires* `categoryKey` + `lat` + `lng` +
  `radiusKm` and the query hard-filters to `status='open'`
  (`apps/api/src/reports/dto/list-reports.dto.ts:6-11`,
  `apps/api/src/reports/reports.service.ts:306-329`). An admin needs the opposite: all categories,
  all statuses, no geography, with pagination. And `list()` runs `hasActiveAccess()` +
  `hasAnyActiveVolunteer()` per row (`reports.service.ts:351-353`) — acceptable for ~20 nearby
  cards, ruinous for a 500-row admin table. The citizen response also carries `isOwner`,
  `savedByMe` and `editable`, all computed relative to the caller and all meaningless for staff.
- **Failing closed needs a place to live.** `AdminGuard` is deliberately *not* an `APP_GUARD`,
  because registering it globally would put every mobile endpoint behind an admin check
  (`apps/api/src/admin/admin.module.ts:9-13`). It has to attach somewhere, and a controller class is
  the smallest unit that can't be forgotten per-route.

## Decision

**Admin functionality lives on its own controllers under the `/admin` prefix, guarded at the class
level by `@AdminOnly()`, with admin-specific DTOs and projections. Citizen endpoints are never given
a role branch.**

Shared *business logic* may still be reused by calling the same service method — the rule is about
route surface and projection, not about copy-pasting SQL. Where a citizen service method already
encodes a subtle policy (`UsersService.deleteAccount()` and its SET NULL / CASCADE rules,
`apps/api/src/users/users.service.ts:65-153`), an admin path must call it rather than
re-implement it.

`@AdminOnly()` bundles `OptionalAuth()` with `UseGuards(AdminGuard)` in one decorator specifically so
the two can never be applied separately — applying `OptionalAuth()` alone would publish an admin
controller to the world (`apps/api/src/admin/admin.decorators.ts:8-32`).

## Consequences

**Positive**

- The redaction rules in `toResponse()` and the `hasActiveAccess` gates keep exactly one meaning.
  There is no admin branch inside them to widen by mistake.
- Admin projections can be designed for a dense desktop table — pagination, filters, sortable
  columns — without compromising a mobile payload.
- Every admin route is gated by construction. Publishing an ungated one requires creating a whole
  new controller and omitting the decorator, which is visible in review.
- Permission checks are declarative and per-route: `@RequireAdminPermissions('platform:manage')`
  (`apps/api/src/admin/admin.decorators.ts:42-43`), ANDed, with no super-admin bypass
  (`apps/api/src/admin/admin.guard.ts:60-73`).
- A future audit-log interceptor has one obvious place to attach.

**Negative**

- Query logic gets written twice where the underlying join is genuinely the same — e.g. reports
  with their category, status and photos. Real duplication, accepted deliberately.
- More files. The admin surface will grow to roughly two dozen endpoints (see
  [`../architecture/admin-console-integration.md`](../architecture/admin-console-integration.md) §3).
- A bug fixed in a citizen query is not automatically fixed in its admin twin.

**Neutral**

- Admin routes return `403` for anonymous callers rather than `401`, so a prober can't use the
  status code to discover which admin routes exist; callers distinguish cases via the `code` field
  (`ADMIN_NO_SESSION` / `ADMIN_NOT_AN_ADMIN` / `ADMIN_MISSING_PERMISSION`) —
  `apps/api/src/admin/admin.decorators.ts:17-26`.
- Both surfaces still share one better-auth `session` table; admin uses a cookie
  (`apps/api/src/auth/auth.ts:80-84`), mobile a bearer token (`auth.ts:171`). One guard resolves
  either, so this ADR does not fork authentication — only authorization and projection.

## Alternatives considered

- **Role-conditional projections on the existing endpoints** — rejected for the reasons in Context:
  it places the privilege escape hatch inside the function that implements the privacy gate, and it
  turns every citizen route into a potential escalation surface. The performance and shape
  mismatches (per-row access checks, mandatory geography, no pagination) would have forced
  branching inside the query builder as well as the projection.
- **A separate admin NestJS application** — rejected: it would need its own deployment, its own
  connection pool and its own copy of every schema import, to solve a problem that a controller
  prefix and a guard already solve. It would also make "call the citizen service to reuse its
  policy" impossible, which is the one form of sharing this ADR wants to keep.
- **A GraphQL layer for admin** — rejected: it trades a duplicated query for a whole second API
  paradigm, and field-level authorization on `mission_messages` and `reporterPhone` becomes harder
  to audit, not easier.
- **Reading Postgres directly from `apps/admin`** (a Next.js server component with its own Drizzle
  client) — rejected: it would put business rules and authorization in a second place, and every
  invariant in [`../architecture/data.md`](../architecture/data.md#invariants-a-new-feature-must-not-break)
  (soft-delete filtering, lazy volunteer expiry, deleted-vs-anonymous) would have to be re-learned
  by whoever wrote each query.

## Evidence in code

- `apps/api/src/admin/admin.controller.ts:16-18` — `@Controller('admin')` + one class-level `@AdminOnly()`.
- `apps/api/src/admin/admin.decorators.ts:32` — the bundled decorator.
- `apps/api/src/admin/admin.guard.ts:29-77` — session-derived identity, DB-resolved role, ANDed
  permissions, no fallthrough.
- `apps/api/src/admin/admin.module.ts:9-13` — `AdminGuard` registered as a provider, deliberately
  not an `APP_GUARD`.
- `apps/api/src/admin/admin-dashboard.service.ts:50-121` — an admin-shaped query (platform-wide,
  time-zone-parameterised) that no citizen endpoint could have produced.
- `apps/api/src/reports/reports.service.ts:551-562` — the citizen redaction this ADR keeps
  branch-free.
- `apps/api/src/missions/missions.service.ts:645-650` — the Mission Chat gate, likewise.

---

*Captured against commit `84a20d3` on 2026-08-27. The `/admin` controller surface was being built by
another session as this was written; this ADR records the pattern that work established rather than
proposing a new one.*
