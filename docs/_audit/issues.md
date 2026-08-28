# Issues found while documenting

Raised 2026-08-27 by the architecture agent, which is **document-only** and did not fix any of
these. Each was verified against the code or the live `uthavu_dev` database, not inferred.

Severity: **High** = will produce wrong data or block the admin build · **Medium** = will mislead a
developer · **Low** = tidy-up.

Re-verified 2026-08-28. Issues 1 and 2 are now **resolved** and kept below with the correction
spelled out — issue 2's original diagnosis was **wrong**, and the record of why matters more than a
tidy list.

---

## RESOLVED (2026-08-28) — 1. The two admin lanes disagreed on the role key: `ops_admin` vs `moderator`

**Fixed in `apps/admin`, and fixed better than this issue asked for.**

The API's admin roles are `super_admin` and `ops_admin` — `apps/api/src/admin/admin-rbac.ts:20-27`,
and present in the live database (`select key from admin_roles` → `ops_admin`, `super_admin`,
re-verified 2026-08-28). The console originally typed the same field as `super_admin | moderator`
and rendered it through a local `ROLE_LABEL` map, which would have made every Ops Admin look
signed-out.

The console now:

- declares the known set correctly — `KnownAdminRole = "super_admin" | "ops_admin"`
  (`apps/admin/src/lib/roles.ts:10`);
- deliberately widens the transported key to `string` rather than the union
  (`apps/admin/src/lib/roles.ts:12-21`), so a role added server-side before the console redeploys
  degrades to fewer permissions instead of a broken session;
- validates only that `role.key` is a string (`apps/admin/src/lib/session.ts:72`) and never rejects
  an unfamiliar one;
- keeps **no** key→label map — it renders `role.label` straight from `GET /admin/me`
  (`apps/admin/src/lib/session.ts:82`, rendered at
  `apps/admin/src/components/layout/app-header.tsx:54-56`), with the key used only to pick a badge
  tone;
- fails closed on capability: `isSuperAdmin()` is an equality check, so an unknown key gets the
  smaller capability set (`apps/admin/src/lib/roles.ts:34-36`).

**Stale citations retired.** `apps/admin/src/lib/session.ts:27` no longer holds a role union (it is
the `AdminSession` type), and `app-header.tsx:12-14` is no longer a label map. Do not cite the old
line numbers.

## RESOLVED — 2. ~~The API returns no `Access-Control-Allow-Origin`~~ — **this diagnosis was wrong**

**Correction, 2026-08-28.** The original entry claimed CORS was not configured, that the browser
blocked everything, and that nothing was testable. **That was not the cause.** CORS *was* working
through better-auth's `trustedOrigins`-derived middleware. The actual fault was a configuration
mismatch: `ADMIN_URL` pointed at port **3000** — a stale prototype address — while the admin console
runs on **3002** (`apps/admin/package.json:7`, `next dev -p 3002`). An origin that is not on the
allowlist is exactly what a missing-CORS failure looks like from the browser, which is how the
misdiagnosis happened.

**The trap that produced the wrong conclusion, and that will produce it again.** An *untrusted*
origin still receives a `204` preflight carrying `Access-Control-Allow-Credentials`,
`Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`. Only
`Access-Control-Allow-Origin` is withheld. So **"the preflight returned 204" is not evidence that
CORS works**, and the presence of the other `Access-Control-*` headers is not either. The only
header worth reading is `Access-Control-Allow-Origin`, and it must be read for the *specific* origin
you care about.

Re-verified live, 2026-08-28, against the running `uthavu-api`:

```
$ curl -si -X OPTIONS http://localhost:3001/reports/categories \
    -H 'Origin: http://localhost:3002' -H 'Access-Control-Request-Method: PATCH'
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:3002        ← present
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS

$ curl -si -X OPTIONS http://localhost:3001/reports/categories \
    -H 'Origin: http://evil.example' -H 'Access-Control-Request-Method: GET'
HTTP/1.1 204 No Content
Access-Control-Allow-Credentials: true                    ← still sent
Access-Control-Allow-Methods: GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS
        ← Access-Control-Allow-Origin withheld: this is the refusal
```

**Current state — fixed, and now owned explicitly.** `apps/api/src/main.ts:41-45` calls
`app.enableCors()` with an exact-match allowlist built from `ADMIN_URL`
(`main.ts:38-40`), `credentials: true`, and an explicit method list **including `PATCH`**.
`apps/api/src/app.module.ts:39` sets `disableTrustedOriginsCors: true` so the library does not
register a second CORS middleware — two of them emit `Access-Control-Allow-Origin` twice, which
browsers reject outright. `ADMIN_URL=http://localhost:3002` is set in `apps/api/.env` and present in
the container (`docker exec uthavu-api printenv`, verified 2026-08-28).

Two details worth keeping: the library's own method list omits `PATCH`
(`main.ts:20-23`), and the console's moderation actions are PATCHes — that omission would have
surfaced later as a second mystifying CORS failure. And an unset `ADMIN_URL` leaves the allowlist
empty, which refuses every cross-origin caller, which is the right way to fail.

Mobile was never affected: React Native `fetch` sends no `Origin` header and is not subject to CORS.

## HIGH — 3. `report_statuses.expired` is seeded but never written; 18 of 20 "open" reports are stale

`seed.ts:33` seeds an `expired` key. A repo-wide grep finds no code that assigns it — expiry is
derived from `reports.expiry_at` at read time and `ReportsService.list()` filters on `status='open'`
only (`reports.service.ts:306, 324`).

Live `uthavu_dev`, 2026-08-27: `open` 20 · `completed` 11 · `closed` 0 · `expired` **0** — and
**18 of the 20 `open` rows are already past `expiry_at`**.

**Impact:** any admin list or counter that trusts `status` will report 20 active requests when 2 are
active. A "Status = Expired" filter returns zero rows forever.

**Fix (product decision):** either derive consistently (`status='open' AND expiry_at > now()`) and
document `expired` as unused, or add a lazy transition in the same style as the volunteer
15-minute timeout (`missions.service.ts:195-238`).

## MEDIUM — 4. Code comments reference a `report_likes` table that does not exist

`apps/api/src/db/schema/comments-schema.ts:74` and `apps/api/src/users/users.service.ts:90` both
name `report_likes` as if it were a peer of `report_saves`. There is no such table in
`apps/api/src/db/schema/` and none in the database (`\dt` verified). Only `report_saves` exists
(`saves-schema.ts:9-26`).

**Impact:** `users.service.ts:90` documents the account-deletion cascade policy, so a reader may
believe a like table is covered when it isn't; and an admin "likes" metric could be planned against
nothing.

**Fix:** update the two comments. No schema change needed.

## MEDIUM — 5. `flag_statuses` and `ticket_statuses` have no transition path

Every `report_comment_flags` row is `submitted` and every `support_tickets` row is `new`, because no
endpoint writes any other value (`comments.service.ts:70-74`, `support.service.ts:17-27`). Both
schema files say so themselves and call it deliberate — "capture now, act on later"
(`comments-schema.ts:39-45`, `tickets-schema.ts:1-6`).

Flagged as an issue only because it is now *actionable*: the admin console is the "later", and the
Dashboard already counts `submitted` + `under_review` as pending (`admin-dashboard.service.ts:116-120`),
so the second half of that predicate is currently unreachable.

## MEDIUM — 6. Nothing rate-limits any route except OTP send

`apps/api/src/auth/otp/otp-rate-limiter.ts` covers OTP sends, and `auth.ts:98-102` adds a
better-auth rule for `/sign-in/email` — which better-auth applies **in production only**, using
**in-memory** storage that is per-process (`auth.ts:86-97` says so). Every other route — including
`POST /reports`, `POST /uploads` and `POST /reports/:id/messages` — has no throttle at all. There is
no `ThrottlerModule` in `apps/api/src/app.module.ts`.

## LOW — 7. No global error shape, no request id, no structured logging

Errors are Nest's defaults (`{"message":"Unauthorized","statusCode":401}`, verified live). There is
no exception filter, no response interceptor and no correlation id. Both clients must parse the raw
Nest shape. Worth deciding before the admin console adds a second error-handling surface.

## LOW — 8. `report_photos.captured_live` is always `true` and unverified

`reports-schema.ts:102-105` says it plainly: the "in-app camera only" rule (BR-1) is enforced
client-side and nothing server-side checks it (no EXIF validation). An admin moderation view should
not present this column as evidence of anything.

## OPERATIONAL — 9. Migrations 0018/0019 are applied but their seed rows are missing

Not a code defect — a local-environment state note, raised because it will look like a bug to the
next person who tries the features.

Verified against `uthavu_dev`, 2026-08-28:

| Table | Rows | Seeded by |
|---|---|---|
| `admin_audit_actions` | **0** (expected 11) | `apps/api/src/db/seed-audit.ts:40-53` |
| `admin_audit_target_types` | **0** (expected 5) | `apps/api/src/db/seed-audit.ts:26-38` |
| `user_statuses` | **0** (expected 2) | `apps/api/src/db/seed.ts:190-199` |

The tables exist — migrations 0018 and 0019 are both applied (20 rows in
`drizzle.__drizzle_migrations`). `pnpm db:seed` has simply not been re-run since they landed.

**Consequences until it is:** nothing can be suspended, because
`user_account_status.status_id` has no `suspended` row to point at
([ADR 0011](../decisions/0011-user-suspension-blocks-login-not-content.md)); and the first mutating
admin endpoint that calls `AdminAuditService.record()` will throw
`admin_audit_actions row missing for key "…" — did db:seed run?`
(`apps/api/src/admin/admin-audit.service.ts:104-108`). That throw is the designed behaviour — it
refuses the mutation rather than performing it unlogged — but it reads as a crash if you do not know
why.

**Fix:** `pnpm db:seed`. The seed upserts by `key`, so re-running it is safe.

---

_Issues 3–8 raised against commit `84a20d3`, 2026-08-27. Issues 1, 2 and 9 re-verified against the
working tree at commit `d035cfd` and the live `uthavu_dev` database, 2026-08-28._
