# Uthavu Admin Web — Documentation

> ⚠️ **Not actually verified — see `docs/README.md` for the full correction.** `apps/web`
> doesn't exist in this repo. Every line ref in these 11 documents was fabricated by an earlier
> agent run, not read from real code.

**Codebase:** `apps/web` · package `@uthavu/web`
**Stack:** Next.js **16.2.12** · React 19.2.4 · TypeScript · Tailwind v4 (CSS-first, no config file)
**Runtime dependencies:** 4 — `next`, `react`, `react-dom`, `lucide-react`
**Line refs valid as of:** 2026-08-18

✅ **Complete — 11 documents + this index** covering all 22 tabs, both pages, every flow and every control.

Each doc contains an **interaction map**: every clickable element, its line number, what
happens on click, what state changes, and whether it's real or a stub.

---

## Documents

| # | Doc | Covers |
|---|---|---|
| 01 | [Admin Login](./01-admin-login.md) | `/admin` — credentials, hero image, security assessment |
| 02 | [Dashboard shell](./02-dashboard-shell.md) | Header, sidebar, role gate, **working dark mode** |
| 03 | [Dashboard & Users](./03-dashboard-and-users.md) | `dashboard` · `users` · `volunteers` |
| 04 | [Reports & moderation](./04-reports-and-moderation.md) | `reports` · `flagged` · `comments` |
| 05 | [Community](./05-community.md) | `impact-stories` · `updates` · `broadcast` |
| 06 | [Analytics](./06-analytics.md) | `analytics` |
| 07 | [Platform & settings](./07-platform-settings.md) | `categories` · `settings` · `feedback` · `system-health` · `audit-logs` |
| 08 | [Monetization](./08-monetization.md) | `monetization-overview` · `monetization-admob` · `monetization-sponsors` |
| 09 | [Admins & audit](./09-admins-and-audit.md) | `admins` — roles and the permission matrix |
| 10 | [Unreachable tabs](./10-unreachable-tabs.md) | `flags` · `notifications` · `email-queue` · `volunteers` |
| 11 | [Field validation reference](./11-field-validation-reference.md) | **All 11 forms field-by-field** — mandatory status, validation, error, submit behaviour |

> **Out of scope:** the public marketing landing page at `/`
> (`apps/web/src/app/page.tsx`, 442 lines). It is a standalone website, deliberately
> excluded.

---

## Pages

| Route | File | Lines | Type |
|---|---|---|---|
| `/` | `src/app/page.tsx` | 442 | Client — **out of scope** |
| `/admin` | `src/app/admin/page.tsx` | 231 | Client — [doc 01](./01-admin-login.md) |
| `/admin/dashboard` | `src/app/admin/dashboard/page.tsx` | **4,890** | Client — [docs 02–10](./02-dashboard-shell.md) |
| — | `src/app/layout.tsx` | 30 | Server — root layout, `lang="ta"`, Inter + Noto Sans Tamil |
| — | `src/app/globals.css` | 406 | Landing-page CSS only; the admin pages use raw Tailwind |

---

## Navigation map — all 22 tabs

```
/admin  (login)
   │  admin@uthavu.org / Admin@123   → ?role=super
   │  ops@uthavu.org   / Ops@123     → ?role=ops
   ▼
/admin/dashboard
   │
   ├─ Dashboard ─────────── dashboard          03
   ├─ Users ─────────────── users              03
   │                        └ volunteers ⚠️     03  (no sidebar entry)
   ├─ Reports ───────────── reports            04
   │                        flagged            04
   │                        comments           04
   ├─ Community ─────────── impact-stories     05
   │                        updates            05
   │                        broadcast          05
   ├─ Analytics ─────────── analytics          06
   ├─ Platform ──────────── categories         07
   │                        settings           07
   │                        feedback           07
   │                        system-health      07
   │                        audit-logs         07
   ├─ Monetization ──────── monetization-overview   08
   │                        monetization-admob      08
   │                        monetization-sponsors   08
   └─ Admin ─────────────── admins             09

   ❌ NO ROUTE IN:          flags              10
                            notifications      10
                            email-queue        10
```

**All 22 tabs have full render blocks. 18 are in the sidebar, 1 is reachable only from a
user record, and 3 cannot be opened at all.**

---

## 🔴 Security summary

The console has **no access control**. Four independent bypasses:

| # | Issue | Detail |
|---|---|---|
| 1 | **Credentials hardcoded in a client component** | `admin/page.tsx:25–27` — both passwords ship in the browser bundle |
| 2 | **Credentials printed on the page** | Rendered as one-click "Quick Preset Credentials" buttons |
| 3 | **No auth guard on the dashboard** | `/admin/dashboard` renders for anyone; no middleware, no session |
| 4 | **The role gate fails open** | `isSuperAdmin = roleParam !== 'ops'` — **no param means Super Admin** |

Consequences:

- Every visitor to `/admin/dashboard` is a Super Admin by default
- `?role=super` is self-grantable from the address bar
- The 6-flag permission matrix in [09](./09-admins-and-audit.md) is **never enforced**
- The Admins tab has **no role guard** — an Ops Moderator can create a Super Admin
- **Audit Logs are never written to** — no action in the console appends an entry
- Logout is a `<Link>` that clears nothing, because there is nothing to clear

None of this is exploitable against real data today — the console is entirely mock data with
no API. It becomes critical the moment a backend is attached.

---

## What is real vs. stubbed

| Genuinely works | Alert stub / no-op |
|---|---|
| Theme toggle + `localStorage` persistence | "Save All Settings" (35 settings revert on refresh) |
| Sidebar badges derived from live state | Export Analytics CSV |
| User suspend/reactivate | Send Notification · Email Notice · Reset Permissions |
| Report status changes (list + panel in sync) | Issue warning · Save private note · Merge duplicate |
| **"Confirm fake"** — sets status *and* clears the queue | **"Suspend user" in the fake queue — user stays Active** |
| Flag dismissal, comment hide/delete | "Remove content and warn" — removes nothing |
| **`createBanner`** — validated, attributed, resets | Banner "Preview" button (redundant alert) |
| **Live mobile notification preview** — binds to the form, truncates to 60 chars | Impact story: feature toggle · copy link · new story |
| Banner activate/deactivate | **"⭐ Generate Impact Story" — silent no-op** |
| Category add + enable/disable | Support reply text — **discarded** |
| Support ticket → Resolved | AdMob save buttons · Export Analytics CSV |
| Cross-tab drill-through (ticket → user, report → detail) | Report: call reporter · issue warning · evidence photos · private note · merge duplicate |
| Sponsor pause/activate, **real video playback** | Sponsor video upload (animated simulation) |
| Admin create/edit/suspend/delete with confirm | Admin permissions — **never enforced** |
| District selection in Analytics | Analytics timeframe chips — **filter nothing** |
| 3 keyed settings toggles | **11 settings toggles with no state and no `onClick`** — clicking does nothing |
| Report detail: status changes sync list + panel | Report detail §9 "moderation" — **read-only, no actions** |

---

## 🔌 Mobile ↔ Admin — the connection

**There is none.** The two apps share zero code and zero data.

`libs/shared/src/index.ts` exports 3 TypeScript interfaces and **nothing imports it** —
`apps/web/package.json` doesn't even list it as a dependency. See
[mobile 24 §5](../mobile/24-utils-and-dead-code.md).

### Both ends built, neither connected

| Feature | Admin side | Mobile side | Status |
|---|---|---|---|
| **Flag / fake reports** | Flagged Reports tab, `MOCK_FLAGS`, `MOCK_FAKE_REPORTS` | 7-reason report modal | ❌ Flags die in memory on reload |
| **Push notifications** | Composer built — **but unreachable** | `expo-notifications` not installed | ❌ Neither end works |
| **Emergency broadcasts** | Full create/target/toggle flow | No receiving surface | ❌ Reaches nobody |
| **Sponsors** | 3 campaigns, placements, dates, metrics | `ACTIVE_SPONSORS` — 2 hardcoded | ❌ **Placement keys match exactly** |
| **Support tickets** | 4 tickets, reply box, resolve | Full submitter with validation | ❌ Neither can message the other |
| **Impact stories** | Rich model with 7-step timeline | Static `IMPACT_STORIES` array | ❌ |
| **User records** | 25 fields incl. flags/warnings/suspensions | Profile saved to AsyncStorage only | ❌ |

### Data mismatches to resolve before wiring

| Field | Admin | Mobile |
|---|---|---|
| `profession` | **Label** — `'Software Engineer'` | **Id** — `'software_engineer'` |
| Location | `city` **+** `district` | One free-text `city` |
| Flag reasons | 5 — Spam · Wrong Category · Duplicate · Abuse · False Information | 7 — only **Spam** and **Duplicate** align |
| Support ticket types | 4 | 6 |
| Categories | 8 | 8 (9 in the report wizard — adds 🔍 Lost & Found) |
| User status | Active / Suspended / **Blocked** | **No concept of a blocked user** |

### The numbers don't agree anywhere

| Metric | Admin | Mobile |
|---|---|---|
| Hari Krishnan's helps | 12 | 32 ([Profile](../mobile/12-profile-screen.md)) |
| Total reports | 8 (`MOCK_REPORTS`) · 295 (Analytics districts) | 60 "need help" ([Dashboard](../mobile/08-dashboard-screen.md)) |
| Volunteers | 6 (`MOCK_VOLUNTEERS`) · 184 (Analytics) | 18 "active vols." |
| Helps resolved | 2,340+ (login page) | 2,340 (Dashboard + Impact Stories) |

Only the "2,340" figure is consistent — because it was copied by hand into three places.

---

## ⚠️ Actions that report success falsely

Not stubs — these tell the operator something happened that did not.

| Message | Where | Reality |
|---|---|---|
| *"User {name} suspended."* | [04](./04-reports-and-moderation.md) `:2124` | The queue entry disappears; **the user stays Active** |
| *"Content removed and warning issued"* | [04](./04-reports-and-moderation.md) `:2156` | Only the flag is dismissed — the content stays live |
| *"Warning issued to {reporter}"* | [04](./04-reports-and-moderation.md) `:1657`, `:2116` | `MOCK_USERS.warnings` is never incremented |
| *"Private note saved"* | [04](./04-reports-and-moderation.md) `:1896` | The textarea is uncontrolled; the text is discarded |
| *"Email notice dispatched to {email}"* | [03](./03-dashboard-and-users.md) `:1208` | Nothing is sent |
| *"Notification trigger sent to {name}"* | [03](./03-dashboard-and-users.md) `:1205` | Nothing is sent |
| *"Push notification dispatched to {user}!"* | [07](./07-platform-settings.md) `:3094` | The reply text is never read |
| *"All app settings saved!"* | [07](./07-platform-settings.md) `:3257` | 35 settings revert on refresh |
| *"Story link copied to clipboard!"* | [05](./05-community.md) `:2316` | No Clipboard API call |
| *"Exporting Analytics Report as CSV..."* | [06](./06-analytics.md) `:2526` | No file is produced |

Plus one that reports nothing at all: **"⭐ Generate Impact Story"**
([04](./04-reports-and-moderation.md) `:1594`) writes to state declared
`const [, setCreatingStoryFor] = useState(…)` — the value slot is discarded, so it is
unreadable by construction. No alert, no feedback, no composer.

## 🔴 Controls that do not respond at all

Distinct from the list above: those *report* a false success. These give **no feedback of any
kind**, because they have no handler.

| Control | Where | Reality |
|---|---|---|
| **11 of the 14 App Settings toggles** — Volunteer Verification Required · Additional Volunteer Option · Mission Completion Photos Required · Push Notifications · Emergency Broadcasts · Comment Notifications · Volunteer Join Notifications · Mission Complete Notifications · Location Privacy · User Blocking · AI Content Moderation | [07 §2A](./07-platform-settings.md#2a--eleven-toggles-on-this-tab-are-decorative--no-state-no-handler) `:3355–3412` | **No `key`, no state, no `onClick`.** The ON/OFF position is computed from the array index (`i === 1`). Clicking does nothing |
| Category image / name | [07 §1.1](./07-platform-settings.md#11-interaction-map) `:2470` | Not clickable — a category can never be renamed or re-imaged |
| Analytics timeframe selector | [06 §2](./06-analytics.md#2-the-timeframe-selector-does-nothing) | `analyticsTimeframe` is set and never read |

⚠️ Three of the dead toggles — **Mission Completion Photos Required**, **AI Content
Moderation**, **Push Notifications** — render **on** for product rules that have never been
built. See [BUSINESS-RULES-COVERAGE](../BUSINESS-RULES-COVERAGE.md).

## 🖼️ Surfaces that display a pipeline that doesn't exist

The report detail panel presents a proof-and-verification story the mobile app cannot
produce:

| Section | Claims | Reality |
|---|---|---|
| §4 Uploaded Evidence Media | *"3 Photos Uploaded"* | Mobile cannot attach a real photo |
| §7 Mobile App Product Lifecycle Flow | A staged mission timeline | Transitions are local `useState`, never sent |
| §12 AI Safety Verification | A verification **score** | Mobile greps caption text for `'unsafe'`/`'nudity'` |
| §17 Report Audit History | A per-report trail | **Static — nothing appends to it** |
| Impact story timeline | *"Final proof photo uploaded via app camera"* | Mobile's completion form requires no photo |

## ✅ What the admin console does better than the app

Worth noting, since these are patterns the mobile app should adopt:

1. **Dark mode works and persists** — `localStorage`, dark by default, derived theme tokens.
   The mobile Settings screen has a switch that does nothing.
2. **Native HTML form validation** on the login page — `required` + `type="email"` blocks
   submission before any JS. Stronger than any mobile screen.
3. **`createBanner`** — validation, attribution, optimistic prepend, form reset. The
   mobile Report Flow publishes with no validation and saves nothing.
4. **Destructive actions confirm** — admin removal and user deletion both use `confirm()`.
   Mobile logout has no confirmation and clears no session.
5. **Six SVG chart components with zero dependencies**, theme-aware and divide-by-zero safe.
6. **Typed interfaces** — `AdminRecord` and `Sponsor` use union types for status and role.
7. **The live mobile notification preview** ([05 §3.3](./05-community.md#33--there-is-a-live-mobile-notification-preview)) — binds to the compose form as you type, falls back to
   placeholders when empty, and truncates the body to 60 characters the way a real push
   would. The best-crafted piece of UI in either product.

---

## Assets

`apps/web/public/` — 9 category/story PNGs (700 KB–1.1 MB each, ~9 MB total), all loaded
with raw `<img>` behind a file-level `eslint-disable @next/next/no-img-element`.

| Asset | Used by |
|---|---|
| `hero_community.png` | Admin login background ([01 §1A](./01-admin-login.md#1a-background-image)) and the landing hero |
| `animal_rescue` · `food_donation` · `roadside_help` · `medical_support` · `elderly_support` · `disaster_relief` · `blood_donation` · `community_help` · `story_medical` | Category and story records |

**Unused — 0 references in `apps/web/src`:** `app_logo.png`, `splash_logo.png`, `file.svg`,
`globe.svg`, `next.svg`, `vercel.svg`, `window.svg`.

⚠️ `app_logo.png` and `splash_logo.png` are framework placeholders, byte-identical to the
mobile app's — see [mobile 01 §2.2](../mobile/01-splash-screen.md#22-image-assets-that-exist-but-are-not-used-here).

---

## Related

- [`../mobile/`](../mobile/) — the mobile app, 26 documents
- [`../README.md`](../README.md) — top-level index
