# Issues found while documenting

Raised 2026-08-27 by the architecture agent, which is **document-only** and did not fix any of
these. Each was verified against the code or the live `uthavu_dev` database, not inferred.

Severity: **High** = will produce wrong data or block the admin build · **Medium** = will mislead a
developer · **Low** = tidy-up.

Re-verified 2026-08-28. Issues 1 and 2 are now **resolved** and kept below with the correction
spelled out — issue 2's original diagnosis was **wrong**, and the record of why matters more than a
tidy list.

**Adversarially re-audited 2026-08-28 (second pass)** against commit `d60e276`, after the admin API
(`177100c`) and console (`0227403`) landed. Issues 5 and 9 changed state; several citations in 3–9
had drifted and are corrected in place; issues **10–12 are new**.

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

> **Independently re-verified live, 2026-08-28 (second pass).** Curled all three origins against the
> running container. `http://localhost:3002` → `Access-Control-Allow-Origin: http://localhost:3002`.
> `http://evil.example` → header **withheld**, everything else present. `http://localhost:3000` (the
> old stale value) → header **withheld**, confirming the allowlist is exact-match and that the
> original misdiagnosis is reproducible from the symptom. Exactly one
> `Access-Control-Allow-Origin` header is emitted, which confirms
> `disableTrustedOriginsCors: true` is doing its job. **This issue's correction is accurate as
> written — no changes needed.**

## HIGH — 3. `report_statuses.expired` is seeded but never written; 18 of 20 "open" reports are stale

`seed.ts:33` seeds an `expired` key. A repo-wide grep finds no code that assigns it — expiry is
derived from `reports.expiry_at` at read time and `ReportsService.list()` filters on `status='open'`
only (`reports.service.ts:306, 324`).

Live `uthavu_dev`, **re-checked 2026-08-28**: `open` 78 · `completed` 40 · `closed` **0** ·
`expired` **0** — and **33 of the 38 live (non-soft-deleted) `open` rows are already past
`expiry_at`**. (2026-08-27 read `open` 20 · `completed` 11 · "18 of 20"; the dev database is churned
continuously by the backend lane's integration suite, so treat totals as indicative.)

**The finding is unchanged and still valid**: nothing writes `expired`. Note `closed` is also still
0, even though `POST /admin/reports/:id/close` now exists and has been exercised — three
`report.close` audit rows, each followed by a `report.reopen`.

**Impact:** any admin list or counter that trusts `status` over-reports active requests. A
"Status = Expired" filter returns zero rows forever.

**Partially addressed on the admin side, 2026-08-28:** `apps/api/src/admin/report-effective-status.ts`
derives effective status from `expiry_at` rather than trusting the column, so the admin Reports
screen is correct. **The citizen path still is not**, and `expired` is still dead master data.

**Fix (product decision, still open):** either derive consistently everywhere
(`status='open' AND expiry_at > now()`) and document `expired` as unused, or add a lazy transition
in the same style as the volunteer 15-minute timeout (`missions.service.ts:195-238`).

## MEDIUM — 4. Code comments reference a `report_likes` table that does not exist

`apps/api/src/db/schema/comments-schema.ts:96`, `apps/api/src/users/users.service.ts:90` **and
`apps/api/src/comments/comments.service.ts:71`** all name `report_likes` as if it were a peer of
`report_saves`. There is no such table in `apps/api/src/db/schema/` and none in the database
(`information_schema` re-verified 2026-08-28). Only `report_saves` exists (`saves-schema.ts:9-26`).

*(Corrected 2026-08-28: this cited `comments-schema.ts:74`, which is now `});` — migration 0018's
soft-delete columns pushed the comment to `:96`. A third occurrence was also missed. Note that
migration `0016_pretty_jimmy_woo` explicitly **dropped** `report_likes`, so these are leftovers from
a table that genuinely once existed.)*

**Impact:** `users.service.ts:90` documents the account-deletion cascade policy, so a reader may
believe a like table is covered when it isn't; and an admin "likes" metric could be planned against
nothing.

**Fix:** update the two comments. No schema change needed.

## RESOLVED (flags) / OPEN (tickets) — 5. `flag_statuses` and `ticket_statuses` had no transition path

**Corrected 2026-08-28. The flag half of this issue is fixed; the original claim is now false.**

`PATCH /admin/flagged-comments/:id` shipped (`admin-comments.service.ts:425`, audit action
`comment_flag.resolve`). Live `uthavu_dev` re-check: **all 7 `report_comment_flags` rows are
`dismissed`, not `submitted`**, and `admin_audit_logs` carries 9 `comment_flag.resolve` entries. The
lifecycle is real and exercised.

**Tickets: endpoint exists, path still unexercised.** `PATCH /admin/support-tickets/:id/status`
shipped (`admin-support.service.ts:171`), so the missing-endpoint half is fixed too — but
`support_tickets` has **0 rows**, so no ticket has ever changed status and `in_review` / `resolved`
remain untested in practice.

**Two stale code comments this leaves behind** (a doc can't fix these; they are for the backend
lane):
- `comments-schema.ts:61-67` still asserts "every flag is created and stays at `submitted` today.
  That's correct, not a gap". Seven dismissed rows say otherwise.
- `tickets-schema.ts:1-6` still says "No admin-side ticket management exists yet". It does.

*(Citation drift corrected: this issue cited `comments-schema.ts:39-45`, which migration 0018's
soft-delete columns pushed to `:61-67`.)* The Dashboard's pending predicate
(`admin-dashboard.service.ts:116-120`) counts `submitted` + `under_review`; with every flag now
`dismissed`, that counter reads 0 — correctly.

## MEDIUM — 6. Nothing rate-limits any route except OTP send

`apps/api/src/auth/otp/otp-rate-limiter.ts` covers OTP sends, and `auth.ts:103-107` adds a
better-auth rule for `/sign-in/email` — which better-auth applies **in production only**, using
**in-memory** storage that is per-process (`auth.ts:91-102` says so). Every other route — including
`POST /reports`, `POST /uploads` and `POST /reports/:id/messages` — has no throttle at all. There is
no `ThrottlerModule` anywhere in `apps/api/src` (re-grepped 2026-08-28, zero hits). **The 13 new
mutating `/admin/*` routes are also unthrottled.**

*(Citation drift corrected 2026-08-28: this cited `auth.ts:98-102` for the rule and `:86-97` for the
in-memory note — the two were swapped and shifted. `:91-102` is the comment; `:103-107` is the
`rateLimit` block.)*

## LOW — 7. No global error shape, no request id, no structured logging

Errors are Nest's defaults (`{"message":"Unauthorized","statusCode":401}`, verified live). There is
no exception filter, no response interceptor and no correlation id — re-grepped 2026-08-28 for
`ExceptionFilter` / `APP_FILTER` / `APP_INTERCEPTOR` across `apps/api/src`: **zero hits**. Both
clients must parse the raw Nest shape.

**No longer just "worth deciding" — the second surface has arrived.** `apps/admin` shipped and now
parses these responses, and the `/admin/*` routes deliberately return machine-readable `code` fields
(`ADMIN_NO_SESSION` / `ADMIN_NOT_AN_ADMIN` / `ADMIN_MISSING_PERMISSION` / `ACCOUNT_SUSPENDED`)
hand-rolled into each `ForbiddenException` body rather than produced by a shared filter. That
convention is now load-bearing in two clients with nothing enforcing it.

## LOW — 8. `report_photos.captured_live` is always `true` and unverified

`reports-schema.ts:102-105` says it plainly: the "in-app camera only" rule (BR-1) is enforced
client-side and nothing server-side checks it (no EXIF validation). An admin moderation view should
not present this column as evidence of anything.

## RESOLVED (2026-08-28) — 9. ~~Migrations 0018/0019 are applied but their seed rows are missing~~

**`pnpm db:seed` has since run. The counts in the original entry were also wrong.** Kept because the
failure mode recurs on every fresh database and after every new audit action.

Re-verified against `uthavu_dev`, 2026-08-28 (second pass):

| Table | Rows then | Rows now | Expected | Seeded by |
|---|---|---|---|---|
| `admin_audit_actions` | 0 | **13** | 13 (not 11 — the entry was already stale) | `apps/api/src/db/seed-audit.ts:40-53` |
| `admin_audit_target_types` | 0 | **6** | 6 (not 5 — `user` was missing from the count) | `apps/api/src/db/seed-audit.ts:26-38` |
| `user_statuses` | 0 | **2** | 2 | `apps/api/src/db/seed.ts:190-198` |

`admin_audit_logs` now holds **26 real rows across nine distinct actions**, so the trail is being
written, not just wired. `user_account_status` has a live row and `user.suspend` / `user.reactivate`
have each fired twice — the suspend path is exercised end to end.

*(The "expected 11 / expected 5" figures were wrong when written:
[ADR 0011](../decisions/0011-user-suspension-blocks-login-not-content.md)'s suspension work had
already added the `user` target type and two actions. `seed.ts:190-199` was off by one at the tail —
the loop is `:190-198`.)*

**Still true, and the reason to keep this entry:** on a fresh database, or after adding a catalogue
action without re-seeding, nothing can be suspended (`user_account_status.status_id` has no
`suspended` row to point at) and the first mutating admin endpoint throws
`admin_audit_actions row missing for key "…" — did db:seed run?`
(`apps/api/src/admin/admin-audit.service.ts:104-108`). That throw is the designed behaviour — it
refuses the mutation rather than performing it unlogged — but it reads as a crash if you do not know
why.

**Fix:** `pnpm db:seed`. The seed upserts by `key`, so re-running it is safe.

---

## LOW — 10. `platform/settings` renders 24 filler rows and is invisible to the placeholder grep

**New, 2026-08-28.** `apps/admin/src/app/(console)/platform/settings/page.tsx` hand-rolls its own
"Not built yet" `EmptyState` at `:13-17` and then renders **24 `Setting row N` divs** at `:19-29` as
a scroll-behaviour demo.

**To be fair to the code, this is not fabricated data:** every row carries the literal text
*"Placeholder — proves the sub-menu holds still while this pane scrolls"* (`:26`), and the page
already says "Not built yet" above them. Nobody would mistake it for a real settings list. Severity
lowered to **Low** on that basis.

**Why it is still worth an entry, and the part that matters:** this page does **not** use
`SectionPlaceholder`, so the repo-wide `grep SectionPlaceholder` that everyone (including this
audit's first pass) uses to enumerate unbuilt console sections **misses it** — it reports six
unbuilt pages when there are seven. Any claim of the form "the unbuilt sections are exactly those
rendering `SectionPlaceholder`" is wrong by one.

**Fix:** either route it through `SectionPlaceholder` like the other six, or delete the filler rows
once the scroll behaviour they demonstrate is covered elsewhere.

---

## MEDIUM — 11. Nothing on mobile handles `403 ACCOUNT_SUSPENDED`

**New, 2026-08-28.** [ADR 0011](../decisions/0011-user-suspension-blocks-login-not-content.md)
chose `403` + `code: 'ACCOUNT_SUSPENDED'` over a bare `401` specifically so the mobile client could
tell "you are suspended" apart from "your session expired" — the two need opposite responses, and
the rationale is written into the code at
`apps/api/src/account-status/account-status.ts:49-58`.

**RESOLVED 2026-08-29 — in two halves, by two different lanes.**

*Half one, the authenticated path (mobile lane).* `libs-mobile/lib/api.ts:41-54` exports the
`ACCOUNT_SUSPENDED` constant and a `setSuspendedHandler` registration kept deliberately **separate**
from the 401 handler, with the reasoning in the code: routing suspension through the 401 path would
clear the token and drop the user on Login, where they would sign in successfully — the API does not
revoke the session — and be blocked again with no explanation. `api.ts:125-127` fires it on
`403` + the code. `apps/mobile/src/navigation/RootNavigator.tsx:80-96` shows an
`Alert` titled "Account suspended" and only clears the token **after** the user acknowledges, so the
redirect is never silent. A `suspendedShown` latch stops a burst of parallel failed requests
stacking identical alerts.

*Half two, the login path — this was still broken after half one.* `verifyOtp` is deliberately
unauthenticated (`libs-mobile/api/auth.ts:52-57` passes no `auth: true`), and the handler in
`api.ts:125` is gated on `options.auth`. So a suspended user **logging in** never reached the
suspended handler and fell through `OtpScreen`'s `else` to
`t('common:somethingWentWrong')` — they could re-enter a correct code forever. Fixed at
`apps/mobile/src/screens/OtpScreen.tsx:59-73`: an `ACCOUNT_SUSPENDED` branch checked *first*,
which sets the honest message and returns without clearing/refocusing the code field, because
inviting another attempt would be a lie.

Copy is catalogued in both locales as `accountSuspendedError`
(`libs-mobile/i18n/locales/en/auth.json:29`, `libs-mobile/i18n/locales/ta/auth.json:29`), per the
i18n contract — 72 keys each, no drift.

Verified at runtime that the branch is not dead code: `APIError.from('FORBIDDEN', { code:
'ACCOUNT_SUSPENDED' })` serialises to `403` with body
`{"message":"…","code":"ACCOUNT_SUSPENDED"}`, so `data.code` reaches the client. (`APIError.from`
is absent from better-call's `error.mjs` but present at runtime — checked directly rather than
assumed.)

**Remaining:** no automated test covers either half — `apps/mobile` has no unit-test tooling at all
(no jest/RNTL; only Maestro E2E). Tracked as a gap, not a defect.

---

## RESOLVED (2026-08-29) — 12. `user-status-schema.ts:14` pointed at a file that did not exist

**Raised 2026-08-28.** The schema header named the login enforcement point as
`auth/suspension-check.ts`, which never existed.

**Fixed, and better than the one-word correction this issue asked for.** The comment
(`user-status-schema.ts:12-18`) now names both enforcement points **by symbol** —
`session.create.before`, `SuspendedAccountGuard`, `isUserSuspended()` — rather than by path, and
says why inline: *"the login hook has already moved between files once."*

That judgement was immediately vindicated. Within hours the hook's decision logic **did** move
again, to `apps/api/src/account-status/login-block.ts`, so a path-based comment would have been
stale for the third time. Symbol-named references survive refactors; path-named ones do not. Worth
copying elsewhere.

## HIGH — 13. No FCM send path exists; `devices` is a write-only table

**Raised 2026-08-29** while auditing the admin console's navigation
([`admin-completion-matrix.md`](admin-completion-matrix.md) § Community → Broadcasts).

Mobile registers a push token on sign-in (`libs-mobile/api/users.ts:64` → `POST /devices`,
handled at `apps/api/src/devices/devices.controller.ts:13`). **Nothing ever sends to one.**

Grepping `apps/api/src` for `firebase-admin`, `messaging()`, `sendMulticast` and
`sendEachForMulticast` returns **zero send-path hits**. The only two matches are a config
*presence* check (`apps/api/src/admin/admin-system-health.service.ts:152-153`) and a comment
admitting the gap (`apps/api/src/db/schema/devices-schema.ts:1-4`). `firebase-admin` is **not a
dependency of any `package.json` in the repo**.

Three consequences, in descending order of how quietly they fail:

1. **Broadcasts cannot be built** — a broadcast composed today would report success and reach
   nobody. This is the real blocker behind open question 14, not the missing table.
2. **`fcmConfigured` on System Health reports credential presence, not send capability.** Setting
   `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON` would flip that indicator green while the
   product still cannot send a single notification.
3. **The CLAUDE.md App Profile names `push: fcm` as one of the five blocking modules.** Nearby-request
   alerts, broadcasts and mission-status pushes all depend on this, and all three are currently
   served only by polled `GET /users/me/alerts`.

Not a regression — the scaffolding was built deliberately ahead of the sender (`devices-schema.ts`
says so). Logged because the gap is invisible from the console, which is where someone will next
try to use it.

## MEDIUM — 14. `ops_admin` is shown an Analytics section it is refused

**Raised 2026-08-29.** `GET /admin/analytics` requires `analytics:view`
(`apps/api/src/admin/admin-analytics.controller.ts:25-26`). Verified live in
`admin_role_permissions`: **only `super_admin` holds that key.** `ops_admin` holds
`users:manage`, `reports:manage` and `comments:manage` — not `analytics:view`.

The sidebar shows Analytics to every admin (`apps/admin/src/config/nav.ts:95-99`); there is no
permission filter on the nav. An ops admin therefore clicks a section that refuses them.

**The console handles this well** — `use-analytics.ts:137` stops retrying a 403 and
`analytics-view.tsx:63` renders a permission refusal rather than a red error state, so it is not a
broken-looking failure. The defect is that the entry is offered at all, and that nothing records
whether excluding ops admins from analytics was a decision or an omission. Same shape as
Platform → Audit Logs / System Health / App Settings, which are also `platform:manage` and also
shown to everyone.

Fix is one of two things, and needs an owner's call: grant `analytics:view` to `ops_admin` in the
seed, or filter `NAV_SECTIONS` by the caller's permission set. Doing neither leaves a menu that
lies about what the operator can reach.

## OPERATIONAL — 15. The API container serves a stale `dist/`, so new endpoints look like missing endpoints

**Raised 2026-08-29**, jointly with the architecture lane, after both of us curled a route that
demonstrably exists.

`apps/api/Dockerfile:41` is `CMD ["sh", "-c", "pnpm db:migrate && node dist/src/main.js"]` — the
runtime stage copies a **compiled** `apps/api/dist` from the builder (`:27`) and there is no watch
mode. `uthavu-api` has been up 26 hours. Source written since then is invisible to it.

Measured live, same minute:

| Route | Live | On disk |
|---|---|---|
| `/admin/reports` | `403` | exists, built before the container started |
| `/admin/impact-stories` | `404` | **exists** — `admin-impact-stories.controller.ts:34`, registered in `admin.module.ts` |
| `/admin/community-updates` | `404` | **exists** — `admin-community-updates.controller.ts:45`, registered |

**The trap:** a `404` from this container means *either* "not built" *or* "built after the container
started", and those are opposite verdicts. A `403` is safe — it proves the route exists and is
gated. Anyone hand-testing admin work will otherwise conclude a finished feature is missing, or
file a defect against a lane that shipped correctly.

**Rules that follow.** Judge an endpoint's existence from `@Controller` / `@Get` / `@Post` in
`apps/api/src` plus registration in the owning module — never from `curl`. When a live response is
cited as evidence, name the build it came from. To actually test new work by hand, the container
needs rebuilding (`docker compose up -d --build api`) — **not** in this session, which is
document-only and shares the working copy with four other lanes.

Related: this is the same class of confusion as CLAUDE.md's note that the OTP fallback logs to
`docker compose logs -f api` rather than a bare terminal. The API being containerised keeps
surprising people.

## LOW — 16. Two photo components duplicate the same host check, and the older one is too weak

**Raised 2026-08-29** by the architecture lane; verified here.

`apps/admin/next.config.ts:14` allows exactly one remote pattern for `next/image`:
`{ protocol: "http", hostname: "localhost", port: "3001", pathname: "/uploads/**" }`. A URL outside
it makes `next/image` **throw during render**, which an `error.tsx` catches as a whole-segment
failure — one bad photo URL takes down the page rather than one cell.

Two components guard against that, and they disagree:

- `apps/admin/src/features/reports/report-photo.tsx:37` — `ALLOWED_HOSTS.has(parsed.hostname)`.
  **Hostname only.** `http://localhost:3002/anything` passes this check, reaches `next/image`, and
  throws anyway. The guard does not cover the case it exists to prevent.
- `apps/admin/src/features/impact-stories/story-photo.tsx:54-64` — matches protocol, hostname,
  port **and** path prefix against the same pattern, so the throw is unreachable. Its header says
  why it is stricter (`:30-38`).

So the newer file is correct and the older one is not, and the logic is copied rather than shared.
Both should converge into one component (or one exported `isRenderable`) in the shared UI layer,
with the strict check. They were not merged when `story-photo.tsx` was written because
`features/reports/` belongs to another lane and a cross-lane edit would have collided.

**Two things must move together** — the allow-list and `next.config.ts`'s `remotePatterns`. Fixing
one without the other either hides good photos or reintroduces the render throw. Note that both
values hardcode `localhost:3001`, so this needs revisiting when profile photos leave local disk
(ADR 0008).

---

_Last verified against commit `d60e276`, 2026-08-28, and the live `uthavu_dev` database._

_History: issues 3–8 raised against `84a20d3` (2026-08-27); 1, 2 and 9 re-verified against `d035cfd`
and committed as `98aae67`. **Adversarially re-audited against `d60e276`** after the admin API
(`177100c`) and console (`0227403`) landed. That pass: re-confirmed issue 2's CORS correction live
(accurate as written), moved issue 5 to resolved-for-flags, moved issue 9 to resolved, corrected
drifted citations in 4, 5, 6 and 9, refreshed issue 3's live counts, and added issues 10–12. Issues
6, 7 and 8 were re-checked and still hold unchanged._

## OPERATIONAL — 17. A stale `apps/admin/.next/types/` shadows the live dev types and invents `tsc` errors

**New, 2026-08-29.** `npx tsc --noEmit` in `apps/admin` reported 4 errors referencing a route that
had just been moved. None were real. The cause: **two generated type directories, both inside
`tsconfig`'s include**, written by different tools —

| Directory | Written by | State |
|---|---|---|
| `apps/admin/.next/dev/types/` | `next dev` | live, correct |
| `apps/admin/.next/types/` | `next build` | **orphaned**, from an Aug 28 build |

The stale `build` copy still named the old route and shadowed the live one, so `tsc` type-checked
against a filesystem that no longer existed.

**Why it matters beyond one afternoon:** this makes `tsc` report failures for correct code after any
route move or rename, and the errors point at files that are already gone — so the natural reaction
is to "fix" working code. It will recur for anyone who runs `next build` once and then keeps working
with `next dev`.

**Fix:** delete `apps/admin/.next/types/` (gitignored build output; `next build` regenerates it).
Longer term, consider narrowing `tsconfig.include` so only the dev-server types are picked up during
development.

## RESOLVED (2026-08-29) — 18. The admin login page displayed fabricated statistics

**Found and fixed 2026-08-29** during a repo-wide sweep for mock data.

`apps/admin/src/app/(auth)/login/page.tsx` rendered a `HERO_STATS` row presenting three invented
figures as fact — **"2,340+ Helps resolved"**, **"35 min Avg response"**, **"100% Verified
helpers"** — taken from a design mock. Its own comment admitted it: *"PLACEHOLDER — these are the
values from the approved design mock, not measured figures… bind them to a public stats endpoint
(or delete the row) before this console is exposed to anyone outside the team."*

**Why this was the worst instance of its kind in the repo:** it was on the **login page** — the
first screen anyone sees, including anyone the console is ever demoed to — and unlike the dashboard's
honest em dashes, it stated specific numbers with no qualification. "100% Verified helpers" is a
trust claim about a safety product, invented.

**Fixed by removal**, the option the comment itself sanctioned. There is no public stats endpoint,
and building one to feed a login-page decoration is not justified.

**Contrast — deliberately left alone:** `apps/admin/src/features/dashboard/use-dashboard-summary.ts:10-21`
types seven unavailable metrics as `null` and renders them as an em dash, with the reasoning written
out: *"a `0` on 'Fake reports' reads as 'nothing to review'. The truth is 'we do not track this
yet'."* That is the correct pattern and is **not** mock data.

**Swept at the same time, clean:** no `MOCK_`/`SAMPLE_`/`FAKE_`/fabricated fixtures in `apps/api`
production code or in `apps/mobile`/`libs-mobile`. Sections with no backend render an explicit
`SectionPlaceholder` ("Not built yet") rather than invented rows — the correct behaviour.

---

> Issues 19-23 were logged by the **admin flow verification** pass
> ([`admin-flow-verification.md`](admin-flow-verification.md)), 2026-08-29 19:31 IST, which traced
> each admin capability click → API → table → audit row → citizen rather than checking layer
> presence. Live evidence came from a real super_admin, ops_admin and citizen session against
> `uthavu-api` (rebuilt that day); no destructive write was performed.

## RESOLVED (2026-08-29) — 11 is fixed; see the note under issue 19

Issue 11 above ("Nothing on mobile handles `403 ACCOUNT_SUSPENDED`") **is no longer true.** The
mobile half landed: `libs-mobile/lib/api.ts:41-54,125-127` routes the suspended 403 to a dedicated
handler kept separate from the 401 path; `apps/mobile/src/navigation/RootNavigator.tsx:73-96` shows
one de-duplicated alert then clears the token; `apps/mobile/src/screens/OtpScreen.tsx:59-73` handles
it at OTP verify, where the global handler cannot fire because `verifyOtp` is unauthenticated. Copy
exists in both locales (`libs-mobile/i18n/locales/{en,ta}/auth.json:29`).

**A narrower defect survives it — see issue 21.**

## HIGH — 19. Publishing an announcement tells the operator it reaches citizens. Nothing on mobile can read it.

`apps/admin/src/features/announcements/update-actions.tsx:125-127` renders, in the publish confirm
dialog: *"It becomes visible to citizens in the mobile app…"*

**That sentence is currently false.** The citizen endpoint is real and correct — `GET /updates`
(`apps/api/src/updates/updates.controller.ts:18-25`), authenticated, locale-aware, verified live at
**200 `{"items":[]}`** with a real citizen bearer token. But grepping `apps/mobile/src/screens` and
`libs-mobile/api` for `updates` / `announcement` returns **no consumer**: there is no
`libs-mobile/api/updates.ts`, no screen, and no navigation entry.

So the full admin chain works — bilingual editor, 7 gated routes, `community_updates` +
`community_update_statuses` (migration 0020, applied), four audited mutations — and the output
reaches nobody, while the UI promises otherwise.

This is the failure mode `apps/api/src/db/schema/settings-schema.ts:8-10` quotes from the prototype
post-mortem: *"a switch that looks like a stop button and isn't one is worse than no switch."*

**Fix, in either order:** build the mobile reader, or change that sentence until one exists. Do not
leave it as is.

## HIGH — 20. Report categories have complete CRUD, zero controls, and the stated blocker no longer exists

`apps/api/src/admin/admin-categories.controller.ts:39-70` declares `GET`, `POST`, `PATCH :id` and
`DELETE :id`, all behind class-level `@AdminOnly()` + `platform:manage` (`:34-35`), all writing
audit rows inside the mutation's transaction (`admin-categories.service.ts:131-138,179-195,227-236`).
`GET` answers 200 live with 9 correct rows.

`apps/admin/src/features/report-categories/` contains **zero** `useMutation`, `adminMutate` or
`onClick` handlers. An operator cannot create, rename or retire a category from the console at all —
it is a `pnpm db:seed` operation.

**Confirmed by the audit log itself: 0 of the 28 `admin_audit_logs` rows are `report_category.*`,**
despite all three actions being seeded in `admin_audit_actions`. Those endpoints have never been
called.

**The reason given is now out of date.** `categories-table.tsx:145-153` defers the work because an
edit flow "needs a confirm dialog… and this console has no shared dialog primitive yet."
`apps/admin/src/features/moderation/confirm-action-dialog.tsx` now exists and is used by reports,
users, comments **and** announcements.

**Decide open question 7 before wiring it**, though: `pnpm db:seed` upserts by `key`, so shipping
this UI first means the next seed run silently reverts an admin's `label` / `emoji` /
`defaultExpiryMinutes` edits.

## MEDIUM — 21. The mobile suspension alert is hardcoded English, on the one screen where that matters most

`apps/mobile/src/navigation/RootNavigator.tsx:83`:

```
Alert.alert('Account suspended', message, [ … ])
```

The title is a hardcoded English literal, and `message` is the API's English-only
`ACCOUNT_SUSPENDED_MESSAGE` (`apps/api/src/account-status/account-status.ts:61-62`) passed straight
through. Meanwhile the Tamil string already exists at
`libs-mobile/i18n/locales/ta/auth.json:29`, and `apps/mobile/src/screens/OtpScreen.tsx:68` uses it
correctly via `t('accountSuspendedError')`.

A Tamil-only user is locked out of a community emergency app and told why in a language they may not
read. This violates `CLAUDE.md § Mobile`: *"Every user-facing string goes through the catalog; no
hardcoded copy."*

**Fix:** route the global handler's title and body through the catalog, as the OTP screen already
does. The API's English message becomes a fallback, not the display string.

## LOW — 22. `categories-table.tsx` warns operators about a bug that is already fixed

`apps/admin/src/features/report-categories/categories-table.tsx:198-205` renders an explanation that
the API's per-category count subquery compares `reports.category_id` against `reports.id` "so it can
never match."

**That bug is fixed** (`apps/api/src/admin/admin-categories.service.ts:76-92`). Live
`GET /admin/report-categories` returns `animalRescue → reportCount: 1`, not zero. The paragraph is
gated on all-zero counts so it will not render today, but the text now describes history as though
it were the present, and the next person to read the file will believe it.

**Fix:** delete the paragraph, or rewrite it to describe the guard rather than the defect.

## SUPERSEDED (2026-08-29) — 15's caveat no longer applies to the current container

Issue 15 above ("The API container serves a stale `dist/`, so new endpoints look like missing
endpoints") was correct for a 26-hour-old container. **`uthavu-api` was rebuilt on 2026-08-29** and
every `/admin/*` route present on disk answered **200** for a super_admin session, including the ones
that returned 404 during the completion-matrix pass (`/admin/impact-stories`,
`/admin/community-updates`).

The underlying mechanism is unchanged and will recur after the next mid-session build — so the
useful form of this issue is not "never trust `curl`" but **"state the container's age whenever you
cite a live response."** Re-scope it accordingly rather than closing it.

## CRITICAL — 23. Hiding a report leaves it readable on six mobile paths, and writable on one

*Found by [`end-to-end-integration.md`](end-to-end-integration.md) §10, proven live 2026-09-02 on a
report this audit created, hidden and reinstated within ninety seconds.*

`POST /admin/reports/:id/hide` sets `reports.deleted_at`
(`apps/api/src/admin/admin-report-moderation.service.ts:205-208`) and `ReportsService` honours it on
all seven of its own queries (`apps/api/src/reports/reports.service.ts:176,255,308,342,350,386,561`).

**No other service filters it.** Live, after the hide:

| Path | Result |
|---|---|
| `GET /reports/:id/comments` | 200 — comment body + author identity |
| `POST /reports/:id/comments` | **succeeded; the row is in Postgres** (`01a06138-5dc9-…`, written after the hide) |
| `GET /reports/:id/volunteers` | 200 — full roster + completion photo + note |
| `GET /users/me/missions` | still lists it — title, landmark, **lat/lng**, reporter name, photo |
| `GET /users/me/impact-stories` (volunteer) | still lists it (the **reporter's** correctly does not) |
| `GET /users/me/alerts` | still lists it, with a `reportId` deep link to a now-404 screen |
| `GET /users/me/flagged-comments` | still lists it — title + landmark |

Offending code:

- `apps/api/src/comments/comments.service.ts:22` and `:69` —
  `select().from(reports).where(eq(reports.id, reportId))`, no `isNull(reports.deletedAt)`.
- `apps/api/src/missions/missions.service.ts:707-721` (`listMyMissions`) — joins
  `mission_volunteers → statuses → missions`, never reaches `reports`. Zero `deletedAt` references in
  the file.
- `apps/api/src/impact-stories/impact-stories.service.ts:22-25` — composes
  `ReportsService.listMine()` (filters) with `MissionsService.listMyMissions()` (does not), so **the
  two halves of one list disagree about whether the moderation happened**.
- `apps/api/src/flagged-comments/flagged-comments.service.ts` and
  `apps/api/src/alerts/alerts.service.ts` — no report-level filter.

**Why it is critical:** hiding is the highest-stakes action in the console. A volunteer taps a
mission card that still shows the reporter's name and the report's coordinates and lands on a 404;
anyone holding the report id can still read its comments and its full roster; and a citizen can post
new public content onto content a moderator removed.

**Fix:** one shared predicate. `ReportsService` already has the correct filter seven times — extract
it and apply it in the five services above, on read **and** on write. Mission Chat happens to refuse
today, but for an unrelated reason ("this mission is complete"), so it needs the same treatment
rather than being assumed safe.

## CRITICAL — 24. No citizen-uploaded photo renders in the admin console — Next.js 16 blocks every private-IP host

*Found by [`end-to-end-integration.md`](end-to-end-integration.md) §1. This is the product owner's own
acceptance criterion — "if upload image, that wants to reflect in web" — and it fails.*

The upload chain is correct through seven hops: mobile camera → `POST /uploads` →
`UPLOADS_DIR` → `report_photos` → `GET /uploads/<file>` served unauthenticated
(`apps/api/src/main.ts:50`) → the URL in `GET /admin/reports/:id` → `<ReportPhoto>`. Verified live at
every step.

**It dies at `next/image`.** Live against the running admin dev server (`localhost:3002`,
`next-server` v16.3.3):

```
GET /_next/image?url=http%3A%2F%2Flocalhost%3A3001%2Fuploads%2Ftest1.jpg&w=640&q=75
  → 400  "url" parameter is not allowed
```

Cause, in the installed package —
`next/dist/server/image-optimizer.js:921-947`:

```js
const privateIps = ips.filter((ip) => isPrivateIp(ip));
if (privateIps.length > 0) {
    throw new ImageError(400, '"url" parameter is not allowed');
```

`dangerouslyAllowLocalIP` defaults to **`false`** (`next/dist/shared/lib/image-config.js:64`).
Next.js 16 refuses to optimise any image whose host resolves to a private IP, as SSRF protection.
`apps/admin/next.config.ts:13-15` declares exactly the right `remotePatterns` and they **pass** — the
private-IP guard fires afterwards. Affects report photos, Impact Story before/after
(`features/impact-stories/story-photo.tsx`), the completion proof
(`features/reports/report-detail.tsx:298-309`) and avatars (`components/data/cells.tsx:241-253`).

**A second, independent failure sits behind it.** `apps/api/src/uploads/upload-url.ts:16-29` builds
the URL from the uploading request's `Host`, so a phone on wifi stores
`http://192.168.1.5:3001/uploads/…` — verified live by sending an upload with that `Host` header.
Meanwhile `apps/admin/src/features/reports/report-photo.tsx:32` hardcodes
`ALLOWED_HOSTS = new Set(["localhost"])` and `next.config.ts:14` pins `hostname: "localhost"`.
All 251 rows in `report_photos` today carry `localhost:3001` **only because every one was created by
curl or the seed on the host machine.** The first photo from a real device will not be.

**Fix, two parts:**
1. `images.dangerouslyAllowLocalIP: true` in `apps/admin/next.config.ts` for local development
   (it is exactly the documented escape hatch, and the "upstream" here is our own API).
2. **One source of truth for the allowed photo host.** The fact is currently written three times —
   `report-photo.tsx:32`, `story-photo.tsx:47-52`, `next.config.ts:14` — and none of the three knows
   the LAN address. Issue 16 already flags the duplication; this is what the duplication costs.
   Setting `UPLOADS_PUBLIC_URL` (already supported at `upload-url.ts:21-22`) would pin one host for
   every uploader and make the guard checkable.

**Workaround until then:** the thumbnail is wrapped in a plain
`<a href={photo.url} target="_blank">` (`report-detail.tsx:222-227`) that bypasses `next/image`, so a
moderator who clicks the grey "Photo unavailable" tile does get the raw file. Nothing tells them that.

## MEDIUM — 25. Submit-a-ticket uploads the user's photo and throws the URL away

*Found by [`end-to-end-integration.md`](end-to-end-integration.md) §6.*

`apps/mobile/src/screens/SubmitTicketScreen.tsx:80-88` opens the camera, uploads the image, and
discards the result:

```ts
await uploadImage(uri);   // :86 — return value never assigned
```

`createTicket` at `:103-107` sends `{categoryKey, subject, description}` with **no photo field**, and
`POST /support/tickets` has nowhere to put one. The local `photoUri` is shown in the UI, so the user
believes the attachment is going with the ticket. Upload errors are swallowed at `:88`
(`// Ignored non-fatal image upload error for tickets`), so a failure is invisible too.

The result is an orphaned file on disk for every ticket with a photo, and a support queue whose
tickets never carry the evidence the user attached — on the one screen a user reaches *because*
something went wrong.

**Fix:** either carry the URL through (`support_tickets` needs a column and the DTO a field), or
remove the attach control. Uploading a file nobody will ever read is the worse of the two.

## RESOLVED (2026-09-02) — 26. The `Host` header was persisted into photo URLs, and mobile fetched them

*Found while re-reading issue 24's second half. Fixed in the same pass —
`apps/api/src/uploads/upload-url.ts`.*

`buildUploadUrl()` built the URL it returns — and that every caller then persists — out of the
uploading request's own `Host` header:

```ts
const host = req.get('host');                 // chosen by the caller, not by us
return `${resolveProtocol(req)}://${host}`;   // persisted verbatim
```

`UPLOADS_PUBLIC_URL` short-circuits it, but it is not set anywhere in this environment, so the
`Host` branch was the live one. An **authenticated** user uploading with `Host: evil.com` put
`http://evil.com/uploads/<uuid>.png` into `report_photos.url`. Reproduced with
`Host: 192.168.1.5:3001`, which produced exactly that shape (the same reproduction issue 24 records,
read there as a *host mismatch* rather than as an injection).

**Blast radius is asymmetric, and the safe half is safe by accident of a different fix.** The
console is immune: `apps/admin/src/lib/upload-url.ts` keeps only the `/uploads/<file>` path and
re-homes it onto `NEXT_PUBLIC_API_URL`, so a hostile origin in the column never reaches the browser.
**Mobile has no such resolver** — it renders the stored string directly, so one poisoned row makes
citizen devices issue a request to a host we do not control, leaking their headers and letting that
host serve arbitrary image bytes inside the app.

**Fixed, without changing the URL shape.** Mobile and the 251 existing rows depend on an absolute
`http(s)://origin/uploads/<file>`, so the returned shape is untouched. What changed is where the
origin may come from: `UPLOADS_PUBLIC_URL` first, then the request's `Host` **only if it matches an
origin this deployment declares** (`BETTER_AUTH_URL` or `EXPO_PUBLIC_API_URL` — the latter is by
construction the `Host` on a genuine mobile upload, which is what keeps LAN device testing working
and is already trusted by `src/auth/auth.ts`), then `BETTER_AUTH_URL`. `ADMIN_URL` is deliberately
excluded: the console does not serve `/uploads`, so it can never legitimately be the `Host` here.
`x-forwarded-proto` is caller-controlled too and is now constrained to `http`/`https` rather than
concatenated into the stored string.

An untrusted `Host` **falls back rather than rejecting the upload**, deliberately: multer has
already written the file to disk by then, the photo is the evidence on an emergency request, and an
undeclared proxy would otherwise take uploads down for everyone behind it. The security requirement
is only that the untrusted value is never *persisted*. The mismatch is logged once per distinct host
(bounded at 20) so a genuine misconfiguration is discoverable rather than silent. 15 tests in
`upload-url.spec.ts` cover it, including that `evil.com` never appears in the returned string.

**`UPLOADS_PUBLIC_URL` is now documented in `apps/api/.env.example`.** Setting it removes the
inference entirely and makes every stored row uniform — it is the answer to issue 24's "one source
of truth for the allowed photo host" as well as to this one.

**Still open, deliberately** — the *long-term* fix is to store a **relative** `/uploads/<file>` and
let each client resolve it against its own API base. The console's resolver already accepts that
form. It needs a coordinated mobile change plus a backfill of `report_photos.url`,
`mission_completions.photo_url` and `user.avatar_url`, so it was not started here. See also issue 27,
which this fix does **not** close.

## HIGH — 27. `POST /reports` stores whatever photo URL the client sends, unvalidated

*Found while fixing issue 26, which closes the other half of the same hole. Not fixed — it lives in
`apps/api/src/reports/`, outside that pass's scope.*

Issue 26 stopped the API from *generating* a hostile photo URL. It does nothing about the client
handing one over directly, which is the shorter path to the same row:

- `apps/api/src/reports/dto/create-report.dto.ts:27-30` — `photoUrls: z.array(z.string().trim().url())`.
  `.url()` is a syntax check. `http://evil.com/x.png` passes it.
- `apps/api/src/reports/reports.service.ts:164` and `:471` — the array is written straight into
  `report_photos` (`url` taken verbatim), on create and on edit.
- The DTO comment says *"URLs already come from POST /uploads"*. Nothing enforces that. The mobile
  client does upload first, but the client is not the boundary.

**The check already exists, one module over.** `MissionsService.isGenuineUpload()`
(`apps/api/src/missions/missions.service.ts:160-167`) refuses a completion photo unless the URL
starts with this API's own `/uploads/` prefix **and** the file is really on disk — "real
verification, not fabricated ML content analysis", as its comment puts it. `reports` simply never
calls it. It is private to `MissionsService` and hard-codes `${BETTER_AUTH_URL}/uploads/` as the
only acceptable origin, which is its own defect:

- a completion photo uploaded from a phone over the LAN already carries the LAN origin and is
  **already refused today**;
- and the moment anyone sets `UPLOADS_PUBLIC_URL` — which issue 26 and `apps/api/.env.example` both
  recommend — *every* mission completion starts failing with "The completion photo must be one
  uploaded through this app".

So the two halves want fixing together: lift the predicate out of `MissionsService` into the uploads
module, make its accepted origins the same set `upload-url.ts` already computes, and call it from
`reports`, `missions` and the avatar path alike.

Same blast radius as 26 and the same asymmetry: the console re-homes the path and is unaffected,
mobile renders the string and is not. `mission_completions.photo_url` and `user.avatar_url` reach the
database the same way and want the same check.

**Fix:** validate on the way in — a stored URL must be one this API serves. The check is the same
predicate three DTOs need, so it belongs in one shared Zod refinement: parse the URL, require the
origin to be `UPLOADS_PUBLIC_URL`/a declared origin **and** the path to start with `/uploads/`.
Doing this at the same time as the relative-URL migration in issue 26 would be cheaper than doing
either twice — a relative `/uploads/<file>` makes the refinement a pure path check with no origin
question at all.
