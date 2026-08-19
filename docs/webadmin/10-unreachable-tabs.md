# 10 — Unreachable tabs (admin dashboard)

> **Are all admin pages complete?** Yes — all 22 tabs have full render blocks, no stubs, no
> TODO markers. **But 4 of them cannot be opened from the sidebar, and 3 cannot be opened
> at all.**

| | |
|---|---|
| **Source file** | `apps/web/src/app/admin/dashboard/page.tsx` (4,890 lines) |
| **Line refs valid as of** | 2026-08-18 |
| **Tabs declared** | 22 (`type Tab`, `:515–537`) |
| **Tabs with render blocks** | **22 — all of them** |
| **Tabs in the sidebar** | 18 (`SIDEBAR_GROUPS`, `:809–863`) |
| **Tabs reachable another way** | 1 (`volunteers`) |
| **Tabs with no route in** | **3** |

---

> **Why this doc has no interaction map.** Every other doc in this set maps each control to
> what happens on click. Three of the four tabs here **cannot be opened by any means**, so
> their controls are unreachable by definition. The fourth (`volunteers`) is mapped in
> [03 §4](./03-dashboard-and-users.md#4-volunteers-tab-1962).

---

## 0. Layouts — what is built but cannot be opened

### 0.1 🏴 Flag Management (`:2172`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🏴 Flag Management                                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ Flag Type│Content│Content Type│User│Report│Time│Prev Flags│Actions :2183 │
│ ───────────────────────────────────────────────────────────────────────  │
│ Spam      "…"     Comment      Hari  #101  2h    3        [Dismiss]      │
│ …                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**8 columns** — richer than the Flagged tab's 7-column table, and it carries **Prev Flags**,
a repeat-offender count that exists nowhere else in the console.

### 0.2 🔔 Broadcast Notification Center (`:2840`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🔔 Broadcast Notification Center                                         │
├──────────────────────────────────────────────────────────────────────────┤
│ Title                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐         │
│ │ e.g. Blood Needed — O Negative                        :2854  │         │
│ └──────────────────────────────────────────────────────────────┘         │
│ Message                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐         │
│ │ Write clear alert details...                          :2858  │         │
│ └──────────────────────────────────────────────────────────────┘         │
│ [ Send Notification ]                                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ Notification Log History                                       :2886     │
└──────────────────────────────────────────────────────────────────────────┘
```

**This is the tab that matters most** — see §3.1.

### 0.3 ✉️ Email Queue & SMTP Status (`:3117`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ✉️ Email Queue & SMTP Status                                             │
├──────────────────────────────────────────────────────────────────────────┤
│ Recipient │ Subject │ Type │ Queued At │ Sent At │ Status │ Actions :3127│
│ ───────────────────────────────────────────────────────────────────────  │
│ hari@…      OTP code   Auth   10:02      10:02     Sent     [Retry]      │
│ …                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

⚠️ The mobile app promises **"Reminders sent via email & push"** on a pending completion
proof ([14 §1D.5](../mobile/14-request-details-screen.md#1d5-the-reporter-approval-branch-221247)).
This is the queue those emails would appear in — and it cannot be opened.

### 0.4 🤝 Volunteers (`:1962`) — reachable, but not from the sidebar

Documented in [03 §0.3](./03-dashboard-and-users.md#03-volunteers-1962). Reachable **only**
via "View as Volunteer" inside a user detail panel.

---

## 1. Completeness check

Every member of the `Tab` union has a matching render block. Verified by cross-referencing
the type declaration against all `activeTab === '…'` guards.

| Tab | Render block | In sidebar? | Reachable? |
|---|---|---|---|
| `dashboard` | `:1025` | ✅ Dashboard | ✅ |
| `users` | `:1153` | ✅ Users | ✅ |
| `reports` | `:1545` | ✅ Reports → All Reports | ✅ |
| `flagged` | `:2074` | ✅ Reports → Flagged Reports | ✅ |
| `comments` | `:2210` | ✅ Reports → Comments | ✅ |
| `impact-stories` | `:2290` | ✅ Community → Impact Stories | ✅ |
| `updates` | `:2253` | ✅ Community → Community Updates | ✅ |
| `broadcast` | `:2694` | ✅ Community → Broadcasts | ✅ |
| `analytics` | `:2504` | ✅ Analytics | ✅ |
| `categories` | `:2453` | ✅ Platform → Categories | ✅ |
| `settings` | `:3250` | ✅ Platform → App Settings | ✅ |
| `feedback` | `:2913` | ✅ Platform → Support | ✅ |
| `system-health` | `:3156` | ✅ Platform → System Health | ✅ |
| `audit-logs` | `:3217` | ✅ Platform → Audit Logs | ✅ |
| `monetization-overview` | `:3771` | ✅ Monetization → Overview | ✅ |
| `monetization-admob` | `:3844` | ✅ Monetization → Google AdMob | ✅ |
| `monetization-sponsors` | `:3765` | ✅ Monetization → Sponsors | ✅ |
| `admins` | `:3457` | ✅ Admin | ✅ |
| **`volunteers`** | `:1962` | ❌ | ⚠️ **Only from a user's detail view** |
| **`flags`** | `:2172` | ❌ | ❌ **No route in** |
| **`notifications`** | `:2840` | ❌ | ❌ **No route in** |
| **`email-queue`** | `:3117` | ❌ | ❌ **No route in** |

---

## 2. Why the three are unreachable

There are exactly **four** ways `activeTab` can change, and none reaches them:

```
:555   useState<Tab>('dashboard')        ← initial value
:722   nav(tab)                          ← called only by sidebar items
       setActiveTab('reports')      ×3   ← :1122, :1450, :1196
       setActiveTab('volunteers')   ×2   ← :1199, :1381
       setActiveTab('users')        ×1   ← :3014
       setActiveTab('comments')     ×1   ← :1202
```

**No `setActiveTab('flags')`, `setActiveTab('notifications')` or
`setActiveTab('email-queue')` exists anywhere in the file.**

The URL can't reach them either — `useSearchParams` is read once, at `:541`, and only for
`role`:

```ts
const roleParam = searchParams.get('role');   // :541
```

`activeTab` is never initialised from the query string, so `?tab=flags` does nothing.

---

## 3. What is stranded

| Tab | Lines | Backing data | What it is |
|---|---|---|---|
| `flags` | `:2172–2210` (~38) | `MOCK_FLAGS` (`:90`) — 5 records: Spam · Wrong Category · Duplicate · Abuse · False Information | A content-flag queue, separate from *Flagged Reports* |
| `notifications` | `:2840–2913` (~73) | `MOCK_NOTIFICATIONS` (`:134`) — 3 sent broadcasts | **A push-notification composer** — title, message, audience, priority, channel |
| `email-queue` | `:3117–3156` (~39) | `MOCK_EMAIL_QUEUE` (`:287`) — 5 records with Sent/Failed/Pending, attempts, SMTP error | Outbound email delivery monitor |

Roughly **150 lines of working UI** ship in the production bundle with no way for an
operator to open them.

### 3.1 The notifications tab matters most

It is the composer for sending push alerts to mobile users — with `required` title and
message fields (`:2854`, `:2858`). It is the missing counterpart to the mobile app's
permanently-lit notification dots:

| End | State |
|---|---|
| Admin composer (`notifications` tab) | ✅ Built · ❌ Unreachable |
| Mobile push receipt | ❌ `expo-notifications` not installed — [05 gap #1](../mobile/05-permissions-screen.md#6-gaps--known-issues) |
| Mobile tab-bar dot | ⚠️ Hardcoded always-on — [07 gap #1](../mobile/07-main-tabs.md#8-gaps--known-issues) |
| Mobile dashboard bell dot | ⚠️ Hardcoded always-on — [08 gap #6](../mobile/08-dashboard-screen.md#9-gaps--known-issues) |

Both ends of the notification feature exist. Neither is reachable, and nothing connects
them.

### 3.2 `volunteers` — reachable but hidden

`volunteers` (`:1962`) has no sidebar entry but **is** reachable, via two buttons inside a
user's detail view (`:1199`, `:1381`). An operator who never opens a user record will never
find it.

---

## 4. Fix

Three entries in `SIDEBAR_GROUPS` (`:809–863`):

```ts
// Reports group — alongside 'flagged' and 'comments'
{ id: 'flags', label: 'Content Flags', badge: flags.filter(f => f.status === 'pending').length || undefined },

// Community group — alongside 'broadcast'
{ id: 'notifications', label: 'Push Notifications' },

// Platform group — alongside 'system-health'
{ id: 'email-queue', label: 'Email Queue', badge: emailQueue.filter(e => e.status === 'Failed').length || undefined },
```

`volunteers` is a judgement call — either add it under Users, or leave it as a drill-down
from a user record.

---

## 5. Gaps

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **3 tabs have no route in.** No sidebar entry, no `setActiveTab` call, no URL param. | ~150 lines of built UI, including the entire push-notification composer, are dead in production. | Add the 3 sidebar entries above. |
| 2 | **`volunteers` is hidden behind a user record.** | Volunteer management is undiscoverable from the sidebar. | Add it, or document the drill-down. |
| 3 | **Tab state isn't in the URL.** `activeTab` is `useState`, never synced to the query string. | No deep links, no shareable views, and a browser refresh always returns to Dashboard. | Sync `activeTab` to `?tab=`. |
| 4 | **Two overlapping flag surfaces.** `flagged` (Flagged Reports, in the sidebar) and `flags` (Content Flags, unreachable) both exist with separate mock data. | Unclear which is authoritative. | Decide whether both are needed before exposing `flags`. |

---

**Previous:** [09 — Admins & audit](./09-admins-and-audit.md) · **Next:** [11 — Field validation reference](./11-field-validation-reference.md)
