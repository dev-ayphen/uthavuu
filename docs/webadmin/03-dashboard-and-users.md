# 03 — Dashboard & Users

> Covers three tabs: **Dashboard** (the overview landing), **Users** (the people directory
> and moderation surface), and **Volunteers** (reachable only from a user record).

| | |
|---|---|
| **Tabs** | `dashboard` `:1025` · `users` `:1153` · `volunteers` `:1962` |
| **Source** | `apps/web/src/app/admin/dashboard/page.tsx` |
| **Line refs valid as of** | 2026-08-18 |
| **Sidebar** | Dashboard (single) · Users (single, badge = `users.length`) · **Volunteers has no sidebar entry** |
| **Data** | `MOCK_USERS` `:62` (8) · `MOCK_VOLUNTEERS` `:98` (6) · `LIVE_FEED` `:367` (8) |

---

## 0. Layout

### 0.1 Dashboard Overview (`:1025`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Dashboard Overview                                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌────────────┐┌────────────┐┌────────────┐┌────────────┐                 │
│ │Total       ││Today's Help││Active      ││Completed   │ ← 4 headline     │
│ │Platform    ││Reports     ││Missions    ││Today       │   cards, each    │
│ │Users       ││            ││            ││            │   with a % delta │
│ │  8    +12% ││  6    +8%  ││  2         ││  1         │                  │
│ └────────────┘└────────────┘└────────────┘└────────────┘                 │
│ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐         │
│ │Active││Crit. ││Fake  ││Pend. ││Helped││Field ││Comm. ││Impact│ ← 8 mini │
│ │Users ││Open  ││Report││Review││Others││Update││Today ││Story │   tiles  │
│ └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘         │
│ ┌──────────────────────────────┐┌──────────────────────────────────────┐ │
│ │ 📈 Reports — 7-day SVG chart ││ ⚡ Live Activity Feed                │ │
│ └──────────────────────────────┘│  · report opened      [View]        │ │
│ ┌──────────────────────────────┐│  · volunteer accepted               │ │
│ │ 🚩 Recent Flags     [Review] ││  · story published                  │ │
│ └──────────────────────────────┘└──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Every number is derived, not hardcoded** (`:1041–1072`) — `users.length`,
`reports.filter(r => r.status === 'Helping').length`,
`users.reduce((sum, u) => sum + (u.helps || 0), 0)` and so on. The tiles genuinely recompute
when a row is deleted elsewhere in the console. The **percentage deltas are the exception**
— `'+12%'` and friends are string literals with nothing behind them.

| Row | Tiles | Line |
|---|---|---|
| Headline ×4 | Total Platform Users · Today's Help Reports · Active Missions · Completed Today | `:1041–1044` |
| Mini ×8 | Active Users · Critical Open · Fake Reports · Pending Review · Helped Others · Field Updates · Comments Today · Impact Stories | `:1065–1072` |

### 0.2 Users Management (`:1153`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Users Management                                                         │
│ All registered community members                                         │
│ ┌──────────────────────────────────────────┐                             │
│ │ 🔍 Search name, phone, email...          │  ← live filter (`:1160`)    │
│ └──────────────────────────────────────────┘                             │
├──────────────────────────────────────────────────────────────────────────┤
│  User            Contact        Location   Helps  Status    Actions      │
│ ─────────────────────────────────────────────────────────────────────── │
│  ⓗ Hari Krishnan  98765 43210   Velachery   12    Active    [View]      │
│  ⓡ Ravi Shankar   98765 43211   T. Nagar     8    Active    [View]      │
│  …                                                                       │
└──────────────────────────────────────────────────────────────────────────┘
                              │ [View]
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ USER DETAIL PANEL                                              [ ✕ ]     │
│ ┌────────────────────┐┌────────────────────┐┌────────────────────┐       │
│ │ Account            ││ Risk & Moderation  ││ Activity           │       │
│ │ Phone              ││ Reports Against    ││ Reports Created    │       │
│ │ Email              ││ Warnings           ││ Help Accepted      │       │
│ │ Joined Date        ││ Suspensions        ││ Completed          │       │
│ │ Last Login         ││ Blocked By         ││ Cancelled          │       │
│ │ Device             ││ Flagged            ││ Impact Stories     │       │
│ │ Location           ││                    ││ Comments           │       │
│ │ Account Type       ││                    ││                    │       │
│ │ Profile Completion ││                    ││                    │       │
│ └────────────────────┘└────────────────────┘└────────────────────┘       │
│ [ View Reports ] [ View as Volunteer ] [ Warn ] [ Suspend ] [ Block ]    │
└──────────────────────────────────────────────────────────────────────────┘
```

Three field groups — **Account** (`:1260–1267`), **Risk & Moderation** (`:1328–1332`),
**Activity** (`:1352–1357`) — 20 fields in total. This is the most complete user record in
either product; the mobile app models **7** of these 20.

### 0.3 Volunteers (`:1962`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🤝 Volunteers Management                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│  Name  Profession  Helps Offered  Completed  Reliability  Current Mission │
│                                                              Location     │
│ ─────────────────────────────────────────────────────────────────────── │
│  Priya Devi   Nurse        14         12         96%      Person Collapsed│
│  …                                                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

Detail fields: Helps Offered · Completed Missions · **Impact Points** · Joined as Volunteer
(`:2004–2007`). ⚠️ **No sidebar entry** — see §4.

---

## 1. Dashboard tab

The landing view. Header shows **"Dashboard Overview"** with a live IST clock chip.

### 1.1 Metric cards (`:1039–1043`)

Four gradient cards. **Three of four derive from live state:**

| Card | Value | Derived? |
|---|---|---|
| Total Platform Users | `users.length` | ✅ |
| Today's Help Reports | `reports.length` | ✅ — sub-label "3 critical emergency requests" is **hardcoded** |
| Active Missions | `reports.filter(r => r.status === 'Helping').length` | ✅ |
| Completed Today | `reports.filter(r => r.status === 'Completed').length` | ✅ |

Each card also carries a `change` chip — `"+12 today"` on Users is **a hardcoded string**;
the other three derive.

### 1.2 Charts — hand-rolled SVG, no library

| Component | Line | Type |
|---|---|---|
| `BarChart` | `:382` | Scales to `Math.max(...values, 1)`, `viewBox 0 0 300 124` |
| `LineChart` | `:404` | Polyline over a normalised series |
| `DonutChart` | `:432` | Stroke-dasharray arcs |
| `StatusBadge` | `:467` | Coloured pill per status |
| `PriorityBadge` | `:485` | Low / Medium / High / Critical |
| `ReliabilityBar` | `:495` | Percentage bar |

No charting dependency — `apps/web` has only 4 runtime deps. All six are pure SVG and
theme-aware via a `dark` prop.

### 1.3 Live feed

`LIVE_FEED` (`:367`) — 8 fabricated ticker events. Static; nothing streams.

### Interaction map — Dashboard

| # | Element | Line | Interaction → what happens |
|---|---|---|---|
| 1 | Metric cards ×4 | `:1044` | ❌ Not clickable — no drill-down |
| 2 | IST clock chip | `:1032` | ❌ Display only |
| 3 | Charts | `:382–432` | ❌ No tooltips, no hover, not interactive |
| 4 | **"Open" on a live-feed row** | `:1122` | Selects that report **and** switches to the Reports tab |
| 5 | Live feed rows | `:367` | ❌ Otherwise static |

---

## 2. Users tab

### 2.1 List view

| Element | Line | Behaviour |
|---|---|---|
| Search box | `:1160` | ✅ **Live filter** on `name` **or** `email` — case-insensitive substring |
| Count chip | `:1162` | `filteredUsers.length` + " Users" |
| **"View Details"** | `:1530` | Opens the detail panel for that user |

```ts
// :789
const filteredUsers = users.filter(u =>
  !userSearch ||
  u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
  u.email.toLowerCase().includes(userSearch.toLowerCase()));
```

⚠️ The placeholder promises **"Search name, phone, email…"** but `phone` is **not**
searched. See gap #2.

### 2.2 `MOCK_USERS` shape (`:62`, 8 records)

```
id · name · avatar (Unsplash URL) · phone · email · profession · city · district
joined · lastLogin · device · status (Active|Suspended|Blocked) · photo (emoji)
reports · helps · completedHelps · cancelledHelps · updates · stories · comments
flags · warnings · suspensions · impactPoints
```

Sample: *Hari Krishnan · 9876543210 · Software Engineer · Chennai · iPhone 14 · Active ·
3 reports · 12 helps · 0 flags · 420 impact points.*
*Vijay B. · Blocked · 5 flags · 3 warnings · 2 suspensions · 0 impact points.*

> **These are exactly the fields the mobile app collects — and cannot send.** See
> [mobile 20 §4](../mobile/20-edit-profile-screen.md#4-mobile--admin-web-connection). Note
> the mismatches: admin stores `profession` as a **label** while mobile stores an **id**,
> and admin has both `city` and `district` where mobile has one free-text `city`.

### 2.3 Detail panel — interaction map

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **✕ close** | `:1171` | Closes the panel and the actions menu | ✅ |
| 2 | **Suspend / Reactivate** | `:1178` | Toggles `Active ⇄ Suspended` in state | ✅ Real state change |
| 3 | **⋯ More actions** | `:1187` | Opens the dropdown | ✅ |
| 4 | ↳ View Reports | `:1196` | Switches to the Reports tab | ✅ |
| 5 | ↳ View Volunteer Record | `:1199` | Switches to the **Volunteers** tab — one of only two routes to it | ✅ |
| 6 | ↳ View Comments | `:1202` | Switches to the Comments tab | ✅ |
| 7 | ↳ **Send Notification** | `:1205` | ❌ `alert('Notification trigger sent to {name}')` — **nothing is sent** | ❌ Stub |
| 8 | ↳ **Send Email Notice** | `:1208` | ❌ `alert('Email notice dispatched to {email}')` | ❌ Stub |
| 9 | ↳ **Reset Permissions** | `:1211` | ❌ `alert('Account permissions reset for {name}')` | ❌ Stub |
| 10 | ↳ **Delete User** | `:1216` | Opens a confirmation. **Only rendered when `isSuperAdmin`** (`:1215`) | ✅ Real, role-gated |
| 11 | Volunteer-record shortcut | `:1381` | Second route to the Volunteers tab | ✅ |
| 12 | **Content filter tabs ×5** | `:1432` | Switches the content list between reports / helps / stories / comments / flags | ✅ |
| 13 | Report row → view | `:1450` | Selects that report and jumps to the Reports tab | ✅ |
| 14 | Avatar | `:1226` | ❌ Not clickable. Falls back to `ui-avatars.com` on error | — |

**Three of the ten actions are `alert()` stubs** — notification, email and permission reset.

---

## 3. 🔴 The Ops role restricts almost nothing

`isSuperAdmin` appears **6 times** in 4,888 lines. Only **two** enforce anything:

| Line | Use | Enforces? |
|---|---|---|
| `:726` | `deleteUser` — `if (!isSuperAdmin) return alert('Super Admin only.')` | ✅ Yes |
| `:1215` | Hides the Delete button in the actions menu | ✅ Yes |
| `:750` | `sentBy: isSuperAdmin ? 'Super Admin' : 'Ops Admin'` | ❌ Attribution string |
| `:773` | `publishedBy: …` | ❌ Attribution string |
| `:900`, `:901` | Header badge colour and label | ❌ Cosmetic |

**An Ops Moderator can do everything except delete a user**, including:

- Suspend and reactivate accounts
- Dismiss flags, delete comments, delete community updates
- Enable/disable categories, add new ones
- Change all 40 platform settings, including `maintenanceMode`
- **Add, edit and delete admin accounts** — the Admins tab has no role check at all

Combined with [02 §3](./02-dashboard-shell.md#3--the-role-gate) — where the absence of a
`role` param yields Super Admin — the role model provides essentially no separation.

---

## 4. Volunteers tab (`:1962`)

Reachable only from a user record (#5, #11 above). No sidebar entry — see
[10](./10-unreachable-tabs.md#32-volunteers--reachable-but-hidden).

`MOCK_VOLUNTEERS` (`:98`, 6 records): `name · helps · reliability % · currentMission ·
district · status`, rendered with `ReliabilityBar`.

**Read-only by construction:**

```ts
// :564
const [volunteers] = useState(MOCK_VOLUNTEERS);   // ← no setter
```

There is no verify, suspend or reassign action — the tab can only display.

---

## 5. Mobile ↔ Admin connection

**None.** Every number here is a local constant.

| Admin field | Mobile origin | Connected? |
|---|---|---|
| `name`, `email`, `city` | [06 Profile Setup](../mobile/06-profile-setup-screen.md) / [20 Edit Profile](../mobile/20-edit-profile-screen.md) | ❌ |
| `phone` | [03 Login](../mobile/03-login-screen.md) — **never stored by mobile** | ❌ |
| `profession` | Mobile stores an **id**, admin a **label** | ❌ Needs the `PROFESSIONS` map |
| `district` | Mobile has no such field | ❌ |
| `avatar` | Mobile photo upload doesn't exist | ❌ |
| `flags`, `warnings`, `suspensions` | Mobile can flag content but **not users** | ❌ |
| `status` Suspended/Blocked | **Mobile has no concept of a blocked user** | ❌ |
| `helps`, `completedHelps` | [09 My Helps](../mobile/09-my-helps-screen.md) — hardcoded there too | ❌ |
| `impactPoints` | Not modelled in mobile at all | ❌ |

The two sides invented different numbers for the same person: admin says Hari Krishnan has
**12 helps**; the mobile Profile screen says **32**.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Ops role restricts only user deletion.** | Ops can manage admin accounts and toggle maintenance mode. The role split is decorative. | Gate every destructive and settings action; enforce server-side. |
| 2 | **Search doesn't match phone** despite the placeholder saying so (`:789` vs `:1160`). | An operator with a phone number — the primary identifier from mobile — cannot find the user. | Add `u.phone.includes(userSearch)`. |
| 3 | **Three user actions are `alert()` stubs** — Send Notification, Send Email Notice, Reset Permissions (`:1205`, `:1208`, `:1211`). | Each claims success. "Email notice dispatched" is a compliance-relevant false statement. | Implement, or remove. |
| 4 | **No status filter on the list.** Only free-text search. | With more users, finding all Suspended or Blocked accounts requires scrolling. | Add status filter chips. |
| 5 | **Volunteers tab is read-only** (`:564`) **and unreachable from the sidebar**. | Volunteer management can only look, not act. | Add the setter and the sidebar entry. |
| 6 | **Metric sub-labels are hardcoded** — "3 critical emergency requests" (`:1040`), "+12 today" (`:1039`). | Numbers beside derived values that don't derive. | Compute or drop. |
| 7 | **Charts have no interactivity** — no tooltip, hover or legend. | Values can only be estimated by eye. | Add tooltips. |
| 8 | **`LIVE_FEED` is static** despite being presented as live. | A "live" ticker that never moves. | Wire to real events, or relabel. |
| 9 | **No pagination.** 8 users render in full. | Won't scale. | Paginate before launch. |
| 10 | **Avatars are Unsplash URLs** with a `ui-avatars.com` fallback (`:1226`). | Two external image hosts on an admin console. | Self-host, or use initials only. |

---

## 7. What works well

- **Metric cards derive from live state**, so moderation actions immediately change the
  overview.
- **Six hand-rolled SVG chart components** — no dependency, theme-aware, and they scale
  correctly against `Math.max(..., 1)` so an all-zero series doesn't divide by zero.
- **`toggleUserStatus` is a genuine state change** (`:725`) reflected across the list, the
  detail panel and the sidebar badges.
- **Delete is confirmed and role-gated** — the only action in the console with both.
- **Avatar error fallback** to generated initials (`:1226`) mirrors the mobile app's letter
  avatar.
- **The content filter** (`:1432`) is a genuinely useful drill-down — reports, helps,
  stories, comments and flags for one user in one place.

---

## 8. QA checklist

- [ ] Metric cards match the underlying arrays (8 users, 8 reports).
- [ ] Searching a name or email filters live; searching a **phone number returns nothing** (gap #2).
- [ ] "View Details" opens the panel; ✕ closes it and the dropdown.
- [ ] Suspend toggles the status badge in both the panel and the list.
- [ ] With `?role=ops`, the Delete option is **absent** from the dropdown.
- [ ] With `?role=ops`, suspend, flag-dismissal and settings changes all still work (gap #1).
- [ ] With `?role=ops`, the Admins tab still allows adding an admin (gap #1).
- [ ] Send Notification / Email Notice / Reset Permissions show alerts only (gap #3).
- [ ] "View Volunteer Record" reaches the Volunteers tab — and note no sidebar item highlights.
- [ ] Switching tabs clears the open user detail.
- [ ] Content filter tabs switch the listed content for that user.

---

## 9. Changing these tabs

| To change… | Edit |
|---|---|
| User data | `:62` — `MOCK_USERS` |
| Volunteer data | `:98` — `MOCK_VOLUNTEERS` |
| Live feed | `:367` — `LIVE_FEED` |
| Search fields | `:789` — `filteredUsers` |
| Metric cards | `:1039–1043` |
| Suspend logic | `:725` |
| Delete + role gate | `:726`, `:1215` |
| Chart rendering | `:382–505` |

---

**Previous:** [02 — Dashboard shell](./02-dashboard-shell.md) · **Next:** [04 — Reports & moderation](./04-reports-and-moderation.md)
