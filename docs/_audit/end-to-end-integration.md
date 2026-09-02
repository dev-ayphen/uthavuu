# End-to-end data integration

**A different question from the two audits before it.**
[`admin-completion-matrix.md`](admin-completion-matrix.md) asks *does each layer exist*.
[`admin-flow-verification.md`](admin-flow-verification.md) asks *can an operator finish a task*.
This one asks the product owner's question:

> *"if upload image, that wants to reflect in web"*

**Does data actually travel between mobile and the admin console, in both directions, end to end?**
A photo taken on a phone must reach storage, reach the database, and be **visible to a moderator**.
Every hop is traced, and where a live probe could prove it, a live probe was run.

---

## Method

Each round trip is traced across its own hops — **origin → API → storage/DB → destination surface**
— with a `path:line` citation or a live probe for every claim.

| Verdict | Means |
|---|---|
| ✅ **round-trips** | Data leaves one surface and arrives on the other, proven live. |
| 🟡 **works, but a hop is silent or weak** | It arrives, but nobody is told, or it arrives degraded. |
| ❌ **breaks** | It does not arrive. The failing hop is named. |
| 🔨 **in flight** | Another lane is writing it right now. Not a defect. |

### What was exercised for real

Three live sessions were obtained and used:

- **super_admin** — `POST /api/auth/sign-in/email` with `admin@uthavu.org` / the dev default at
  `apps/api/src/db/admin-seed-policy.ts:12`. `GET /admin/me` → 200 with all six permissions.
- **citizen A (reporter)** — a real phone-OTP session on `+919000099911`, obtained through
  `POST /api/auth/phone-number/send-otp` → `GET /dev/otp` (`apps/api/src/dev/dev-otp.controller.ts:16`)
  → `POST /api/auth/phone-number/verify`.
- **citizen B (volunteer)** — the same flow on `+919000099922`.

**Writes were performed**, because a round trip cannot be proven by reading. Everything created is
prefixed `E2E-VERIFY` and listed below. **No pre-existing row was deleted, hidden, suspended or
re-statused.** Three probes that had to mutate state (hide, suspend, a settings change) were run
against **rows this audit created itself** and restored within seconds; each is noted in place.

### ⚠️ Which build each probe hit — read this before trusting a status code

`uthavu-api` runs a compiled `dist/`, no watch mode (`apps/api/Dockerfile:41`), so *a probe is only
evidence about the image that was running when it fired.*

**The container was rebuilt by another lane in the middle of this audit.**

| Window (IST, 2026-09-02) | Image | What it contained |
|---|---|---|
| Before **13:52** | started `2026-08-29T14:21:23Z` | Everything up to Announcements + Platform Settings. **No** Sponsors, Admin Accounts or Activity controllers. |
| **13:52 – 14:02** | started `2026-09-02T08:22:25Z` | Adds `AdminSponsorsController`, `AdminAccountsController`, `AdminActivityController` (confirmed in `docker logs uthavu-api` route mapping). |
| After **14:02** | started `2026-09-02T08:32:22Z` | A third rebuild landed while this document was being written. **Every finding below was re-verified against it** — the `next/image` 400, the absence of any mobile `/updates` consumer, the unimported `CategoryFormDialog`, and `comments.service.ts:22,69`'s missing filter all still hold. |

Both sessions survived the restart (sessions live in Postgres), and every probe below was re-run or
first-run against the **13:52 build** unless the text says otherwise. The two probes that returned
`HTTP 000` at the moment of restart were re-run and are reported from the re-run.

This is the third consecutive audit in which the working copy moved underneath it. Treat every
number here as a **reading at a stated time**, not a fact.

### `E2E-VERIFY` rows created by this audit

| What | Identifier | Where |
|---|---|---|
| Citizen A (reporter) | `+919000099911` / `hwzCQa7vhP4KtrPkbPysTiTO3BnNXwPt` | `user` |
| Citizen B (volunteer) | `+919000099922` / `VTJE2iwFmF9f0d6JvyvwceJY20plfi3n` | `user` |
| Report "E2E-VERIFY round-trip probe" | `01a06131-4554-798a-84c1-e4ba673e0973` | `reports` |
| 3 uploaded PNGs (75 bytes each) | `9c2c13dc-…`, `f644e7dd-…`, `83f6a11a-…` | `UPLOADS_DIR` + `report_photos` / `mission_completions` |
| 2 comments (one posted while the report was hidden — see §10) | `01a06131-d01c-…`, `01a06138-5dc9-…` | `report_comments` |
| 1 comment flag, resolved to `dismissed` | `01a06137-0fde-…` | `report_comment_flags` |
| 1 volunteer acceptance → confirmed → completed | `01a06132-0ee5-…` | `mission_volunteers`, `mission_completions` |
| Support ticket "E2E-VERIFY support ticket" | `01a06134-d2de-…` | `support_tickets` (**this table was empty before; this is its first row ever**) |
| Category `e2eVerifyProbe` "E2E-VERIFY Probe Category" 🧪 | `01a06136-0335-…` | `report_categories` |
| Announcement "E2E-VERIFY announcement" (published, bilingual) | `01a06136-424e-…` | `community_updates` |
| ~8 `admin_audit_logs` rows from the probes above | — | `admin_audit_logs` |

**Reversed before finishing:** the report was hidden then **reinstated**; citizen B was suspended
then **reactivated**; `maxPhotosPerReport` was set 4 → 1 then **restored to 4** (verified).

---

## Condensed round-trip table

### Mobile → Web

| # | Round trip | Origin | API | Storage / DB | Admin surface | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Photo upload** | ✅ | ✅ | ✅ | ❌ **never renders** | ❌ |
| 2 | Report created | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | Comment posted | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | Volunteer accepts | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | Mission completed → Impact Story | ✅ | ✅ | ✅ | ✅ (photos blank — see §1) | 🟡 |
| 6 | Support ticket filed | ✅ | ✅ | ✅ | 🟡 list only, no out-tray | 🟡 |

### Web → Mobile

| # | Round trip | Admin origin | API | Storage / DB | Mobile surface | Verdict |
|---|---|---|---|---|---|---|
| 7 | Category edited | ❌ **no control** | ✅ | ✅ | ✅ instant | ❌ |
| 8 | User suspended | ✅ | ✅ | ✅ | ✅ both gates | ✅ |
| 9 | Platform settings changed | ✅ | ✅ | ✅ | ✅ instant **and enforced** | ✅ |
| 10 | Report hidden | ✅ | ✅ | ✅ | ❌ **6 read paths still serve it** | ❌ |
| 11 | Comment flag resolved | ✅ | ✅ | ✅ | ✅ pull-only | 🟡 |
| 12 | Announcement published | ✅ | ✅ | ✅ | ❌ **no reader exists** | ❌ |
| 13 | Alerts from admin actions | 1 of 13 | ✅ | ✅ | ✅ | 🟡 |

**Nine of thirteen round trips carry data all the way. Four break — and three of the four break on
the very last hop, where the person who needs the data is standing.**

---

# Mobile → Web

## 1. Photo upload — ❌ the photo reaches the database and never reaches the moderator

**This is the product owner's own example, and it fails.**

| Hop | Evidence | Result |
|---|---|---|
| Mobile picks the image | `apps/mobile/src/screens/report/ReportFlowScreen.tsx:159` (`launchCameraAsync`, camera-only) | ✅ |
| Mobile POSTs it | `uploadImage()` at `libs-mobile/api/users.ts:32-44` — field name `file`, FormData, `auth: true`. `apiRequest` strips `Content-Type` so fetch sets its own boundary (`libs-mobile/lib/api.ts:87-88`) | ✅ |
| API stores it | `apps/api/src/uploads/uploads.controller.ts:18-30` → `diskStorage` into `UPLOADS_DIR` with a `randomUUID()` name (`multer.config.ts:11,27-29`). **Live: `POST /uploads` → 201, file present in the container at `/repo/apps/api/uploads/`** | ✅ |
| API returns a URL | `buildUploadUrl()` at `apps/api/src/uploads/upload-url.ts:16-17`, derived from **the uploading request's `Host` header** (`:24-29`) | ✅ |
| URL row written | `apps/api/src/reports/reports.service.ts:162` inserts `report_photos`. **Live: `photos: 1` on the created report** | ✅ |
| File served back | `apps/api/src/main.ts:50` `app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' })`, outside the global auth guard by design (`:46-49`). **Live: `GET /uploads/9c2c13dc-….png` unauthenticated → 200, `image/png`, 75 bytes** | ✅ |
| Admin API returns it | `apps/api/src/admin/admin-reports.service.ts:385-389` emits `url` straight from the column. **Live: `GET /admin/reports/:id` → `photos[0].url = http://localhost:3001/uploads/9c2c13dc-….png`** | ✅ |
| Admin UI asks to render it | `apps/admin/src/features/reports/report-detail.tsx:218-238` → `<ReportPhoto>` → `next/image` (`report-photo.tsx:77-87`) | ✅ |
| **Browser actually gets pixels** | **❌ NO** | ❌ |

### The break, proven two ways

**Live probe against the running admin dev server (`localhost:3002`, `apps/admin`, next-server
v16.3.3, started 2026-08-28 12:50 — after `next.config.ts` was last written on 2026-08-27, so its
config is loaded):**

```
GET /_next/image?url=http%3A%2F%2Flocalhost%3A3001%2Fuploads%2Ftest1.jpg&w=640&q=75
  → 400  "url" parameter is not allowed
GET /_next/image?url=http%3A%2F%2F192.168.1.5%3A3001%2Fuploads%2F83f6a11a-….png&w=640&q=75
  → 400  "url" parameter is not allowed
```

**Cause, read out of the installed Next.js:**
`node_modules/.pnpm/next@16.3.3_…/node_modules/next/dist/server/image-optimizer.js:921-947`

```js
async function fetchExternalImage(href, dangerouslyAllowLocalIP, …) {
    if (!dangerouslyAllowLocalIP) {
        …
        const privateIps = ips.filter((ip) => isPrivateIp(ip));
        if (privateIps.length > 0) {
            log.error('upstream image', href, 'hostname resolved to private IP', …);
            throw new ImageError(400, '"url" parameter is not allowed');
```

`dangerouslyAllowLocalIP` defaults to **`false`** (`next/dist/shared/lib/image-config.js:64`).
Next.js 16 refuses, as an SSRF protection, to optimise any image whose host resolves to a private
IP. `localhost` → `127.0.0.1` is private. So is `192.168.x.x`.

**`apps/admin/next.config.ts:13-15` declares exactly the right `remotePatterns`** —
`{ protocol: "http", hostname: "localhost", port: "3001", pathname: "/uploads/**" }` — and it passes.
The private-IP guard fires **afterwards**, and there is no `images.dangerouslyAllowLocalIP` anywhere
in the repo.

### Two independent failures, not one

**(a) Every photo fails today**, on every host, because the API is only ever reachable over a private
address in this environment. `report-photo.tsx:78` never gets pixels; the browser fires `onError`,
`failed` flips true, and the moderator sees the "Photo unavailable" tile at `report-photo.tsx:59-73`
— **for every single report photo, on every report**. Same for the Impact Story before/after pair
(`story-photo.tsx`), the completion proof (`report-detail.tsx:298-309`), and citizen avatars
(`components/data/cells.tsx:241-253`, which degrades to initials).

**(b) Even without (a), a photo from a real phone would be rejected by the app's own guard.**
`upload-url.ts:16-29` builds the URL from the uploading request's `Host`, so a phone on wifi stores
`http://192.168.1.5:3001/uploads/…`. **Verified live** — an upload sent with `Host: 192.168.1.5:3001`
returned exactly that URL. Meanwhile `report-photo.tsx:32` hardcodes
`const ALLOWED_HOSTS = new Set(["localhost"])` and `next.config.ts:14` pins `hostname: "localhost"`.
Neither knows about the LAN address. All 251 rows currently in `report_photos` carry
`localhost:3001` **only because every one of them was created by curl or the seed on the host** —
the first photo from an actual device will not be one of them.

> **Not entirely dark:** the thumbnail is wrapped in a plain
> `<a href={photo.url} target="_blank">` (`report-detail.tsx:222-227`) which bypasses `next/image`
> entirely. A moderator who knows to click the broken tile *can* open the raw file. That is a
> workaround a moderator has to be told about, not a working feature.

**Verdict: ❌** — the chain is complete and correct through seven hops and dies on the eighth. Both
`docs/decisions/0008-local-disk-photo-storage.md`'s promise that "the returned `avatarUrl` is a plain
URL either way" and the console's photo section are undone by one Next.js 16 default.

---

## 2. Report created on mobile → admin list and detail — ✅

| Hop | Evidence |
|---|---|
| Mobile | `libs-mobile/api/reports.ts:75` ← `apps/mobile/src/screens/report/ReportFlowScreen.tsx:209` |
| API | `POST /reports` (`apps/api/src/reports/reports.controller.ts:16`) → `reports.service.ts:113-165` |
| DB | `reports` + `report_photos` rows in one create path (`reports.service.ts:143,162`) |
| Admin list | **Live: `GET /admin/reports?q=E2E-VERIFY` → `total: 1`**, correct title, category, reporter, `counts.photos: 1` |
| Admin detail | **Live: `GET /admin/reports/:id` → 200**, 23 fields including `storedStatus`, `expired`, `volunteers`, `completion`, `counts` |

Note the search parameter is **`q`**, not `search` (`apps/api/src/admin/dto/list-admin-reports.dto.ts:46`);
an unknown query key is silently ignored rather than rejected, which cost this audit one false
reading before it was checked against the DTO.

**Verdict: ✅**

---

## 3. Comment posted on mobile → admin Comments moderation — ✅

| Hop | Evidence |
|---|---|
| Mobile | `libs-mobile/api/comments.ts:28` ← `apps/mobile/src/screens/request-details/CommunityComments.tsx:54` |
| API | `POST /reports/:id/comments` (`apps/api/src/comments/comments.controller.ts:17`) |
| DB | `report_comments` — **live row `01a06131-d01c-…`** |
| Admin | **Live: `GET /admin/comments?q=E2E-VERIFY` → `total: 1`**, with body, author identity, report context, and `removed: false` |

**Verdict: ✅**

---

## 4. Volunteer accepts on mobile → admin volunteer roster — ✅

| Hop | Evidence |
|---|---|
| Mobile | `libs-mobile/api/missions.ts:64` ← `apps/mobile/src/screens/request-details/RosterSection.tsx:42` |
| API | `POST /reports/:id/volunteers` (`apps/api/src/missions/missions.controller.ts:13`) |
| DB | `missions` + `mission_volunteers` — **live: status `joined`, 15-minute `confirmDeadline` set** |
| Confirm | `PATCH /reports/:id/volunteers/me` → status `active` |
| Admin roster | **Live: `GET /admin/reports/:id` → `volunteers[0]`** with `userId`, `name`, `phoneNumber`, `status.key/label`, `joinedAt`, `confirmDeadline`, `releaseReason`. Rendered at `apps/admin/src/features/reports/report-detail.tsx:240-296` |

One nuance worth knowing rather than filing: at `joined` the detail reports
`counts.activeVolunteers: 0` while `counts.volunteers: 1`. That is correct — "active" means
confirmed — but the two tiles sit next to each other at `report-detail.tsx:131,133` and a moderator
reading them fast will read the roster as empty.

**Verdict: ✅**

---

## 5. Mission completed → admin Impact Story **and** the citizen's own list — 🟡

| Hop | Evidence |
|---|---|
| Mobile | `libs-mobile/api/missions.ts:86` ← `apps/mobile/src/screens/request-details/CompleteMissionSheet.tsx:75` |
| API | `POST /reports/:id/complete` (`apps/api/src/missions/missions.controller.ts:37`), DTO requires **both** a photo URL and a note (`dto/complete-mission.dto.ts:5-8`) |
| DB | `mission_completions`, inserted already `verified` — **live `verifiedAt` = the insert timestamp** |
| Admin | **Live: `GET /admin/impact-stories?q=E2E-VERIFY` → `total: 1`**, with `beforePhotoUrl`, `afterPhotoUrl`, `durationMinutes: 4`, helper and reporter |
| Citizen (reporter) | **Live: `GET /users/me/impact-stories` → 1 story** |
| Citizen (volunteer) | **Live: `GET /users/me/impact-stories` → 1 story** |

The data round-trips completely and reaches three surfaces. It is **🟡 rather than ✅ only because
`beforePhotoUrl` and `afterPhotoUrl` are the two fields a moderator most needs and neither renders**
— `story-photo.tsx` hits the same Next.js 16 wall as §1. An Impact Story with no before and no after
is a caption.

**Verdict: 🟡** — downgraded entirely by §1.

---

## 6. Support ticket filed on mobile → admin Support — 🟡

| Hop | Evidence |
|---|---|
| Mobile | `libs-mobile/api/tickets.ts:20` ← `apps/mobile/src/screens/SubmitTicketScreen.tsx:64` |
| API | `POST /support/tickets` (`apps/api/src/support/support.controller.ts:11`) |
| DB | `support_tickets` — **live: this audit's ticket is the FIRST row this table has ever held** (0 → 1). The previous audit's "never exercised" reading is confirmed. |
| Admin list | **Live: `GET /admin/support-tickets` → `total: 1`**, with subject, description, category, status `new`, and the reporter's phone |
| Admin out-tray | ❌ **none.** `apps/admin/src/app/(console)/platform/support/` has no `[id]/`; `apps/admin/src/features/support-tickets/` is two files with zero `useMutation` and zero `rowHref` |

`GET /admin/support-tickets/:id` and `PATCH /admin/support-tickets/:id/status`
(`apps/api/src/admin/admin-support.controller.ts:39,44`) are finished, gated and tested, and **have
no caller**. The ticket arrives and cannot be answered.

**One more thing this trip surfaced, which is a defect of its own:**
`apps/mobile/src/screens/SubmitTicketScreen.tsx:86` lets a user attach a photo, uploads it —
`await uploadImage(uri)` — and **throws the returned URL away**. It is never assigned, `createTicket`
at `:103-107` has no photo field, and the error is swallowed at `:88`. The user watches an upload
succeed and attaches nothing. Logged as **issue 25**.

**Verdict: 🟡** — data arrives; nothing can be done with it, and the attachment silently evaporates.

---

# Web → Mobile

## 7. Admin edits a report category → mobile category picker — ❌ at the origin

| Hop | Evidence |
|---|---|
| Admin UI | ❌ **no mounted control.** `apps/admin/src/features/report-categories/category-form-dialog.tsx:72` is a complete create/edit dialog that does real writes (`:157-172`) — and **has zero import sites** anywhere in `apps/admin/src`. `app/(console)/platform/categories/page.tsx:11-26` renders only the read-only table. **No DELETE call site exists at all.** |
| API | ✅ Full CRUD, class-level `platform:manage` (`apps/api/src/admin/admin-categories.controller.ts:33-64`) |
| DB | ✅ `report_categories`. **Live: `POST /admin/report-categories` → 201**, row `e2eVerifyProbe` created |
| Mobile | ✅ **Instant.** `GET /reports/categories` (`apps/api/src/reports/reports.service.ts:47-58`) reads the table live and filters on `citizen_selectable`. **Live: the new category appeared in the citizen's picker on the very next request, 9 → 10 categories, no deploy, no cache** |

**The propagation half is perfect. The origin half does not exist.** Since the last audit the UI
moved from *"nothing built"* to *"built and not wired"* — the dialog is written, the mutation
helpers are written, `CategoriesAccessDenied` is written, and none of it is imported by a page.

The blocker previously recorded ("the console has no shared dialog primitive") is gone twice over:
`apps/admin/src/features/moderation/confirm-action-dialog.tsx` exists and four sections use it, and
this feature now has a purpose-built dialog of its own. What remains is one import.

**Still decide open question 7 first:** `pnpm db:seed` upserts by `key`, so the next seed run
silently reverts an operator's `label`/`emoji`/`defaultExpiryMinutes` edits.

**Verdict: ❌** — breaks at hop 1; API, DB and mobile propagation are all finished and idle.

---

## 8. Admin suspends a user → blocked on mobile — ✅

Proven live against **citizen B, a user this audit created**, then reactivated.

| Hop | Evidence | Live result |
|---|---|---|
| Admin UI | `apps/admin/src/features/users/user-status-actions.tsx:56-85`, reason required | ✅ |
| API | `POST /admin/users/:id/suspend` (`apps/api/src/admin/admin-users.controller.ts:63`) | **201** |
| DB | `user_account_status` (`admin-users.service.ts:524-547`) + audit row in the same tx (`:549-561`) | ✅ |
| **Authenticated request** | Global `SuspendedAccountGuard`, no opt-out decorator (`apps/api/src/account-status/account-status.module.ts:28`, registered last at `app.module.ts:61-64`) | **`GET /users/me` → 403 `ACCOUNT_SUSPENDED`** |
| **Login** | `decideSessionCreate()` in Better Auth's `session.create.before` hook (`apps/api/src/account-status/login-block.ts:71-88` ← `apps/api/src/auth/auth.ts:136`) | **`POST /api/auth/phone-number/verify` with a *correct* OTP → 403 `ACCOUNT_SUSPENDED`** |
| Mobile handling | `libs-mobile/lib/api.ts:125-127` → `apps/mobile/src/navigation/RootNavigator.tsx:80-96`; OTP screen handled separately at `apps/mobile/src/screens/OtpScreen.tsx:67-73` | ✅ |
| Reactivate | `POST /admin/users/:id/reactivate` | **201; the same bearer token worked again immediately** |

Both refusals are **byte-identical** (`code`, `message`), and both are 403 not 401 — so the mobile
client cannot mistake a suspension for an expired session and silently bounce the user to Login.
Notably the OTP *send* still returns 200 for a suspended number and only `verify` refuses; that is
the right shape (it avoids leaking account state to an unauthenticated caller).

**One residual weakness, unchanged since the last audit:** `RootNavigator.tsx:83` hardcodes the
English title `'Account suspended'` and passes the API's English-only body through verbatim, while
the Tamil string sits unused at `libs-mobile/i18n/locales/ta/auth.json:29` and `OtpScreen.tsx:68`
uses it correctly. Already filed as issue 21.

**Verdict: ✅**

---

## 9. Admin changes platform settings → mobile `/config` and real enforcement — ✅

The cleanest round trip in the product. Proven live, then restored.

| Hop | Evidence | Live result |
|---|---|---|
| Admin UI | `apps/admin/src/features/platform-settings/use-app-settings.ts:36,75` — eleven controls, each bound to a contract field | ✅ |
| API | `GET`/`PATCH /admin/settings` (`apps/api/src/admin/admin-settings.controller.ts:37,42`) | **200 / 200** |
| DB | `platform_settings`, singleton row, CHECK-constrained (migration `0021`) | ✅ 1 row |
| **Mobile read** | `GET /config` (`apps/api/src/config/platform-config.controller.ts:22`) ← `libs-mobile/api/config.ts:117` ← `apps/mobile/src/hooks/useConfig.ts:29-43`, six consuming screens | **`maxPhotosPerReport` 4 → PATCH to 1 → `GET /config` returned 1 on the very next request** |
| **Server enforcement** | `assertReportLimits()` at `apps/api/src/reports/reports.service.ts:74-110`, called by `create()`, `update()` **and** `addPhoto()` | **`POST /reports` with 2 photos → 400 `{"code":"REPORT_PHOTO_LIMIT","message":"Up to 1 photo allowed","limit":1}`** |
| Restore | PATCH back to 4 | **`GET /config` → 4** ✅ |

**Why it propagates instantly:** `getPlatformConfig()` is **deliberately not cached**
(`apps/api/src/config/platform-settings.ts:78-105`), and the comment explains the reasoning — two of
these fields are kill switches, and "a cache with a TTL reintroduces \[a stop button that does not
stop] for the length of the TTL." A missing row falls back to the same constants the column defaults
use, so an unseeded database behaves identically to a freshly seeded one.

**Why it is genuinely enforced and not decorative:** the DTO's `.max(4)` is built once at import time
and can only express a fixed ceiling (`reports.service.ts:127-134` says exactly this), so the
operator's configured limit is checked at runtime where the current value can actually be read —
and on *every* path that could exceed it, not just `create`.

Mobile caches `/config` for 15 minutes (`useConfig.ts` `staleTime`), so a citizen's *client-side*
photo picker may permit 4 for up to 15 minutes after an operator lowers it. **That is harmless**: the
server refuses, and `libs-mobile/api/config.ts:87-90` degrades to `DEFAULT_PLATFORM_CONFIG` rather
than blocking launch. Worth stating so nobody "fixes" it by adding a server cache.

**Verdict: ✅** — this is the reference implementation the other twelve should be measured against.

---

## 10. Admin hides a report → ❌ six mobile read paths still serve it

Proven live on **this audit's own report**, hidden and reinstated within ninety seconds.

`POST /admin/reports/:id/hide` sets `reports.deleted_at` / `deleted_by`
(`apps/api/src/admin/admin-report-moderation.service.ts:205-208`) and audits the title *and*
description in the same transaction (`:210-228`). That half is correct.

**`ReportsService` filters `deletedAt` on all seven of its own queries** —
`reports.service.ts:176, 255, 308, 342, 350, 386, 561`. **No other service does.**

### Live before/after, same two citizen sessions

| Mobile read path | Before hide | After hide | |
|---|---|---|---|
| `GET /reports/:id` | 200 | **404** | ✅ |
| `GET /users/me/reports` (reporter) | 1 report | **empty** | ✅ |
| `GET /users/me/impact-stories` (**reporter**) | 1 story | **empty** | ✅ |
| `GET /reports/:id/comments` | 1 comment | **still 200, comment body + author** | ❌ |
| `GET /reports/:id/volunteers` | roster | **still 200, full roster + completion photo + note** | ❌ |
| `GET /users/me/missions` (volunteer) | 1 mission | **still there** — title, landmark, **lat/lng**, reporter name, photo | ❌ |
| `GET /users/me/impact-stories` (**volunteer**) | 1 story | **still there** | ❌ |
| `GET /users/me/alerts` (reporter) | 2 alerts | **still there** — title + `reportId` deep link | ❌ |
| `GET /users/me/flagged-comments` (flagger) | 1 flag | **still there** — title + landmark | ❌ |

### Code, for each leak

- **`comments.service.ts:22`** — `select().from(reports).where(eq(reports.id, reportId))`, **no
  `isNull(reports.deletedAt)`**. Same omission on the write path at `:69`.
- **`missions.service.ts:707-721`** (`listMyMissions`) joins `mission_volunteers → statuses →
  missions` and **never touches `reports.deleted_at`**. Zero `deletedAt` references in the whole file.
- **`impact-stories.service.ts:22-25`** composes `ReportsService.listMine()` (filters) with
  `MissionsService.listMyMissions()` (does not). **That is why the reporter's list drops the report
  and the volunteer's keeps it — two halves of one list disagreeing about whether a moderation
  action happened.**
- **`flagged-comments.service.ts`** and **`alerts.service.ts`** carry no report-level filter.

### And a write leak

**A citizen can post a new public Community Comment on a report a moderator has hidden.**
Live: `POST /reports/:id/comments` on the hidden report returned successfully and the row is in
Postgres (`01a06138-5dc9-70be-8c44-68d813018237`, `created_at 08:24:39`, after the hide at 08:24:0x).
`comments.service.ts:69` loads the report without the `deletedAt` filter, so the moderation action
is invisible to the write path too. Mission Chat, by contrast, correctly refused — though for an
unrelated reason ("this mission is complete"), not because the report was hidden.

### What this means in the app

A volunteer opens **My Helps**, sees the mission card with its photo and the reporter's name, taps
it — and gets a 404. The reporter's **Alerts** tab still shows *"…marked E2E-VERIFY round-trip probe
as complete"* with a deep link to nothing. Meanwhile the report's comments and its full volunteer
roster — including phone-adjacent identity and the completion note — remain readable by anyone who
holds the report id.

Hiding is the product's highest-stakes moderation action. Today it removes the report from three
places and leaves it in six, **and it still tells nobody** (see §13).

**Verdict: ❌** — logged as **issue 23**.

---

## 11. Admin resolves a comment flag → the flagger's mobile view — 🟡

| Hop | Evidence | Live result |
|---|---|---|
| Mobile flags | `libs-mobile/api/comments.ts:32` ← `CommunityComments.tsx:66` → `POST /reports/:id/comments/:cid/flag` | **201 `{"flagged":true}`** |
| Admin sees it | `GET /admin/flagged-comments?q=E2E-VERIFY` | **`total: 1`**, status `submitted` |
| Admin resolves | `PATCH /admin/flagged-comments/:id` (`apps/api/src/admin/admin-comments.controller.ts:68`), body key is **`statusKey`** not `status` | **200 → `dismissed`** |
| DB | `report_comment_flags.status_id`, resolved from the `flag_statuses` lookup, never a hardcoded id (`admin-comments.service.ts:406-423`) + audit row in tx (`:425-435`) | ✅ |
| **Flagger sees it** | `GET /users/me/flagged-comments` (`apps/api/src/flagged-comments/flagged-comments.controller.ts:14`) ← `apps/mobile/src/screens/FlaggedCommentsScreen.tsx:40` | **status flipped `submitted` → `dismissed`** ✅ |
| Alert | none | **`GET /users/me/alerts` → `[]`** |

**This remains the only moderation flow where a citizen can find out what happened**, and it is
pull-only — they must open Profile → Flagged Comments and look. Reasonable for a non-urgent outcome.

**Verdict: 🟡**

---

## 12. Admin publishes an Announcement → ❌ nothing on mobile can read it

**Confirmed exactly as the previous audit predicted, and now proven with a real published row.**

| Hop | Evidence | Live result |
|---|---|---|
| Admin UI | `apps/admin/src/app/(console)/announcements/` — list, new, `[id]`; publish/archive/delete behind confirm dialogs (`features/announcements/update-actions.tsx:145-190`) | ✅ |
| API | `POST /admin/community-updates` → `POST :id/publish` (`apps/api/src/admin/admin-community-updates.controller.ts:55,76`) | **201 → 200, status `draft` → `published`** |
| DB | `community_updates` + `community_update_statuses` (migration 0020) | ✅ |
| Citizen endpoint | `GET /updates` (`apps/api/src/updates/updates.controller.ts:22`), locale-resolved per reader from the DB not the session (`updates.service.ts:33-40`) | **200 with the announcement.** Switching the citizen's locale to `ta` and re-reading returned the **Tamil** title and body. Both verified. |
| **Mobile reader** | ❌ **does not exist** | — |

**A repo-wide grep of `apps/mobile/src` and `libs-mobile` for `/updates` returns zero hits.** There is
no `libs-mobile/api/updates.ts`, no screen, and no route named Announcements in
`apps/mobile/src/navigation/types.ts`. The only near-misses are the Alerts tab's client-side
`'Updates'` **filter pill** (`apps/mobile/src/screens/tabs/AlertsScreen.tsx:31,33,41,91-92`), which
filters the already-fetched `/users/me/alerts` array for `type === 'mission_completed'` and issues no
request of its own. **A reader could easily mistake that pill for the announcements feed. It is not.**

The endpoint is written well — unpaginated with a 50-row cap, drafts and archives excluded by lookup
key, `NULL publish_at` treated as "live now", `NULL expires_at` as "never" (`updates.service.ts:60-79`).
It reaches nobody.

**And the console says otherwise.** The publish dialog at `update-actions.tsx:125-127` tells the
operator *"It becomes visible to citizens in the mobile app."* **That sentence is false**, which is
precisely the failure `apps/api/src/db/schema/settings-schema.ts:8-10` was written as a post-mortem of.

Already filed as issue 19; this audit upgrades it from *inferred* to *proven with a published row*.

**Verdict: ❌**

---

## 13. Which admin actions reach the citizen as an alert — 🟡 one of thirteen

`admin_audit_actions` holds **24** seeded actions. Stripping the reads and the sponsor lane, thirteen
mutating admin actions can affect a specific citizen. **Exactly one writes an `alerts` row.**

The only call site outside the citizen's own flows is
**`apps/api/src/admin/admin-report-moderation.service.ts:122`**. A repo-wide grep for
`alertsService.create` finds five call sites total; the other four are citizen-triggered
(`missions.service.ts:352,419,549`, `reports.service.ts:498`).

| Admin action | Alert? | What the citizen actually gets |
|---|---|---|
| `report.close` | ✅ | `report_cancelled` to **active volunteers only**. Reuses an existing type rather than inventing untranslated copy (`admin-report-moderation.service.ts:101-128`). **The reporter is never told** — and the code says so in place (`:112-116`). |
| `report.reopen` | ❌ | silence |
| `report.hide` | ❌ | **silence, plus six read paths that still serve the report (§10)** |
| `report.reinstate` | ❌ | silence |
| `user.suspend` | ❌ | a 403 the next time they touch the app — no alert, no reason |
| `user.reactivate` | ❌ | silence; they find out by trying |
| `comment.remove` | ❌ | the comment vanishes from `GET /reports/:id/comments` with no tombstone |
| `comment.restore` | ❌ | silence |
| `comment_flag.resolve` | ❌ | **visible on pull** via `/users/me/flagged-comments` (§11) |
| `support_ticket.status_change` | ❌ | **visible on pull** via `/users/me/tickets` — but no UI can trigger it (§6) |
| `report_category.*` | n/a | propagates instantly to the picker (§7) |
| `community_update.*` | ❌ | **no reader at all** (§12) |
| `platform_setting.update` | ❌ | propagates instantly and is enforced (§9) |

**The plumbing is not the blocker any more.** Contrary to both earlier audits, **the FCM send path
now exists and is wired**: `apps/api/src/push/push.service.ts`, `firebase-admin` is a real dependency
(`apps/api/package.json:35`), `AlertsModule` imports `PushModule` (`apps/api/src/alerts/alerts.module.ts:12`),
and `AlertsService.create()` attempts a push for **every** alert row it writes
(`alerts.service.ts:60,71-91`), never throwing. This lane is 🔨 in flight — **not a defect, and it
retires the previous audits' "no FCM sender exists anywhere" finding.**

What remains is what it always was: **`alert-templates.ts:24` declares exactly four alert types**, and
adding a fifth means writing English **and** Tamil product copy. That is open question 4 — product
work, not engineering.

**Verdict: 🟡** — one of thirteen, to the wrong person, by deliberate restraint rather than oversight.

---

# Architecture cross-check

## Schema files vs migrations vs the live database — ✅ zero drift

| Comparison | Result |
|---|---|
| Tables declared across `apps/api/src/db/schema/*.ts` | **40** |
| Tables in drizzle snapshot `meta/0022_snapshot.json` | **40** |
| Tables in `uthavu_dev` (`pg_tables`, public schema) | **40** |
| Schema files ∖ snapshot (a schema edited without `db:generate`) | **none** |
| Snapshot ∖ schema files | **none** |
| **Columns** in snapshot 0022 | **313** |
| **Columns** live in `uthavu_dev` | **313** |
| Snapshot ∖ live (unapplied migration) | **none** |
| Live ∖ snapshot (`db:push` residue / manual change) | **none** |
| Migration files on disk | **23** (`0000`–`0022`) |
| Rows in `drizzle.__drizzle_migrations` | **23**, `created_at` matching `meta/_journal.json` entry-for-entry |

**Every schema file has a migration, every migration is applied, and the live database matches the
schema exactly at column granularity.** The `db:push` ban in `CLAUDE.md` is holding.

> **Corrects the brief:** migration `0022_charming_wonder_man` (sponsors) **has** landed and is
> applied — journal idx 22, DB row id 23, `sponsors` / `sponsor_statuses` / `sponsor_creative_types` /
> `sponsor_placements` all present. Marked 🔨 as instructed; noted so nobody re-generates it.

## Lookup tables — 18 of 19 seeded

| Lookup | Rows | |
|---|---|---|
| `report_statuses` | 4 | ✅ |
| `report_categories` | 10 (9 + this audit's probe row) | ✅ |
| `user_statuses` | 2 | ✅ |
| `flag_statuses` | 4 | ✅ |
| `ticket_statuses` / `ticket_categories` | 3 / 6 | ✅ |
| `progress_statuses` | 3 | ✅ |
| `mission_volunteer_statuses` / `mission_completion_statuses` | 3 / 3 | ✅ |
| `community_update_statuses` | 3 | ✅ |
| `admin_roles` / `admin_permissions` / `admin_role_permissions` | 2 / 6 / 9 | ✅ |
| `admin_audit_actions` / `admin_audit_target_types` | 24 / 9 | ✅ |
| `sponsor_statuses` / `sponsor_creative_types` | 5 / 3 | ✅ |
| `platform_settings` (singleton) | 1 | ✅ |
| **`sponsor_placements`** | **0** | 🔨 in-flight lane — noted, not filed |

Every lookup a shipped feature FKs to is populated. `sponsor_placements` is the one empty table and
it belongs to the lane still being written.

## Orphaned endpoints — routes no client calls

| Route | Declared | Status |
|---|---|---|
| `GET /updates` | `apps/api/src/updates/updates.controller.ts:22` | ❌ **no mobile consumer** — §12, issue 19 |
| `POST /reports/:id/photos` | `apps/api/src/reports/reports.controller.ts:56` | ❌ **no caller on any surface.** Mobile sends photos as `photoUrls` on `POST /reports` and replaces the set via `PATCH /reports/:id`; the admin console never writes photos. Dead route. |
| `GET /admin/support-tickets/:id` | `admin-support.controller.ts:39` | ❌ no caller — §6 |
| `PATCH /admin/support-tickets/:id/status` | `admin-support.controller.ts:44` | ❌ no caller — §6 |
| `POST /admin/report-categories` | `admin-categories.controller.ts:44` | ❌ dialog written, never imported — §7 |
| `PATCH /admin/report-categories/:id` | `admin-categories.controller.ts:53` | ❌ dialog written, never imported — §7 |
| `DELETE /admin/report-categories/:id` | `admin-categories.controller.ts:63` | ❌ **no call site exists at all** — §7 |
| `GET /sponsors` | `apps/api/src/sponsors/sponsors.controller.ts:29` | 🔨 see below |

## Orphaned UI — clients calling routes that do not answer

| Caller | Calls | Reality |
|---|---|---|
| `libs-mobile/api/ads.ts:167,170,199,214` | `GET /sponsor-campaigns`, `POST /sponsor-campaigns/:id/impression`, `…/click` | 🔨 **path mismatch** — the API declares `@Controller('sponsors')` with a single `GET /sponsors` (`apps/api/src/sponsors/sponsors.controller.ts:25,29`). Also unreachable at runtime: **no screen imports `SponsorAd`** (`apps/mobile/src/components/SponsorAd.tsx:74` has zero import sites). Both halves are mid-build; `ads.ts:17-29` says so itself. **Not filed.** |
| `apps/admin/src/features/dashboard/use-activity-feed.ts:57` | `GET /admin/activity?limit&cursor` | 🔨 **route exists on disk** (`apps/api/src/admin/admin-activity.controller.ts:23` — a file that did not exist when this audit began) and **returns 500 live**: `TypeError: row.occurred_at.toISOString is not a function` at `admin-activity.service.js:100`. In-flight lane; **passed to that lane as information, not filed.** |
| `apps/admin/src/features/sponsors/*`, `apps/admin/src/features/admin-accounts/*` | `/admin/sponsors/*`, `/admin/admins/*` | 🔨 built, unmounted by any route. The API side **landed during this audit** — `AdminSponsorsController` and `AdminAccountsController` both answered 200 after the 13:52 rebuild. **Not filed.** |

Everything else lines up: **41 live mobile endpoints and 44 admin-console endpoints all resolve to a
declared route**, and every citizen route except the two above has a caller.

---

# Broken seams, in priority order

### 1. ❌ No citizen-uploaded photo renders anywhere in the admin console

§1. `next/image` refuses every private-IP host on Next.js 16.3.3
(`next/dist/server/image-optimizer.js:921-947`, `dangerouslyAllowLocalIP` defaults false), so
`localhost:3001` **and** the LAN address a real phone uploads through are both rejected. Report
photos, Impact Story before/after, completion proof, avatars — all of it.

**This is the product owner's stated acceptance criterion, and it is the only seam here where the
moderator cannot work around the gap by opening another page.** A moderator judges a report by what
was pictured; today they judge it by a grey tile that says "Photo unavailable."

Two separate fixes are needed and the second is the one that survives to production:
`images.dangerouslyAllowLocalIP` for local development, **and** a single shared source of truth for
the allowed photo host — `report-photo.tsx:32` hardcodes `["localhost"]`, `story-photo.tsx:47-52`
independently hardcodes protocol + host + port + prefix, and `next.config.ts:14` hardcodes it a third
time. Three copies of one fact, none of which knows the LAN address. **Issue 24.**

### 2. ❌ Hiding a report leaves it readable on six mobile paths — and writable on one

§10. `comments.service.ts:22,69`, `missions.service.ts:707`, `impact-stories.service.ts:22-25`,
and the alert/flag projections carry no `reports.deleted_at` filter, while `ReportsService` filters
it on all seven of its own queries. **Proven live**: the volunteer's My Helps, the volunteer's Impact
Stories, both citizens' alerts, the flag list, the comment thread and the full volunteer roster all
survived a hide — and a new public comment could still be posted onto the hidden report.

The highest-stakes moderation action in the product does not fully take effect. **Issue 23.**

### 3. ❌ Announcements publish into a feed no mobile screen reads — and the dialog says otherwise

§12. Proven with a real published bilingual row: `GET /updates` returns it, in the citizen's own
locale, and **zero mobile files reference `/updates`**. `update-actions.tsx:125-127` tells the
operator it reached citizens. Already issue 19 — now confirmed rather than inferred.

### 4. ❌ Categories: the write UI is fully built and never imported

§7. `category-form-dialog.tsx:72` has zero import sites; `DELETE` has no call site at all. The
propagation half is flawless — **live, a new category reached the citizen picker on the next
request**. Already issue 20, and the stated blocker is now doubly obsolete. **Decide open question 7
before wiring it**, or the next `pnpm db:seed` reverts every operator edit.

### 5. 🟡 Support tickets arrive and cannot be answered — and the attachment is thrown away

§6. Two finished endpoints, no caller. **This audit filed the first row that table has ever held.**
Separately, `SubmitTicketScreen.tsx:86` uploads the user's photo and discards the URL — the user sees
a successful attachment and submits a ticket with none. **Issue 25.**

### 6. 🟡 Twelve of thirteen citizen-affecting admin actions are silent

§13. The push infrastructure landed (🔨) and is wired into every alert write. The remaining blocker
is four alert types and open question 4's English + Tamil copy. Hiding and suspension are the two
that matter most, and both say nothing.

---

# Contradictions with the existing audits

Named rather than smoothed over.

1. **Both prior audits: "no FCM sender exists anywhere in `apps/api`; `firebase-admin` is absent from
   every `package.json`."** **Now false.** `apps/api/src/push/` exists, `firebase-admin` is at
   `apps/api/package.json:35`, `AlertsModule` imports `PushModule`, and every alert row attempts a
   push. Issue 13 should be re-scoped or closed by the FCM lane.

2. **Completion matrix: App Settings "⛔ blocked on a product decision" / flow verification: "🔨 in
   flight, `GET /config` 404."** **Now shipped and the strongest round trip in the product** — §9,
   proven end to end including runtime enforcement on three write paths.

3. **Completion matrix: Categories "the missing layer is UI only… deliberately unwired for want of a
   dialog primitive."** The dialog now exists twice over and the write UI is fully written — it is
   simply **never imported**. The verdict is unchanged but the reason has moved from *deferred* to
   *unfinished wiring*.

4. **Flow verification §6: "`categories-table.tsx` contains zero `useMutation`, `adminMutate` or
   `onClick` handlers."** Still true of that file — but no longer true of the feature folder, which
   now contains a complete write layer nothing mounts. A folder-level grep would have caught it; a
   file-level one did not.

5. **Flow verification §3 ranked hiding as the top seam because it is *silent*.** It is worse than
   that: it is silent **and incomplete**. Silence was the known half; §10's six leaking read paths and
   one leaking write path are new.

6. **The brief's "Sponsors — migration 0022 not yet landed."** 0022 is generated, journaled and
   applied; all four sponsor tables exist live. Still 🔨, still not filed — recorded so it is not
   re-generated.

7. **The snapshot lesson recurred for the third audit running.** `admin-activity.controller.ts` did
   not exist when this audit's route inventory was taken and existed forty minutes later; the API
   container was rebuilt mid-run at 13:52. Every volatile reading above states its time and its build.

---

## What is genuinely finished, and worth saying plainly

- **The citizen→admin data spine works.** Report, comment, volunteer acceptance, mission completion
  and support ticket all travel from a real phone-OTP session to the admin API and arrive complete,
  with full context — reporter identity, roster, counts, before/after. Five of six mobile→web trips
  carry their payload the whole way.
- **Platform settings is the model.** One uncached read, one enforcement helper called from every
  write path that could exceed a limit, a client that degrades to defaults rather than blocking
  launch, and a comment explaining why there is no cache. §9 round-trips in both directions in
  milliseconds and refuses the request that would violate it.
- **Suspension is genuinely two-point and structural** — a global guard with no opt-out decorator and
  a Better Auth `session.create.before` hook — and both refusals are byte-identical.
- **The database is exactly what the code says it is.** 40 tables, 313 columns, 23 migrations, zero
  drift in either direction. Not one lookup a shipped feature depends on is empty.

The failure pattern is narrow and consistent, and it has shifted since the last audit: it is no
longer *"backend-complete, UI-incomplete."* It is now **"everything is built, and the last import or
the last filter is missing."** A category dialog nobody imports, an updates feed nobody fetches, a
photo host nobody told the console about, a `deleted_at` four services do not check.

---

_Last verified against commit `d60e276`, 2026-09-02 14:08 IST, with several lanes writing into the
working copy. Live evidence came from container `uthavu-api`, **rebuilt twice during this audit** —
images started `2026-08-29T14:21:23Z`, `2026-09-02T08:22:25Z` and `2026-09-02T08:32:22Z`, stated per
probe, with every finding re-verified against the last of them — the admin dev server on
`localhost:3002` (`next-server` v16.3.3, started 2026-08-28 12:50), and read-only `psql` against
`uthavu-postgres` / `uthavu_dev`. A real super_admin session and two real phone-OTP citizen sessions
were obtained and used. All writes are prefixed `E2E-VERIFY` and listed above; **no pre-existing row
was deleted, hidden, suspended or re-statused**, and the three reversible probes (hide, suspend,
settings) were restored and the restoration verified._
