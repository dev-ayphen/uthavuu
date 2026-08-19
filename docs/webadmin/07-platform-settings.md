# 07 — Platform & settings

> The Platform sidebar group — five tabs: **Categories**, **App Settings**, **Support**,
> **System Health** and **Audit Logs**. Configuration and observability.

| | |
|---|---|
| **Tabs** | `categories` `:2453` · `settings` `:3250` · `feedback` `:2913` · `system-health` `:3156` · `audit-logs` `:3217` |
| **Source** | `apps/web/src/app/admin/dashboard/page.tsx` |
| **Line refs valid as of** | 2026-08-18 |
| **Sidebar badge** | Support shows `newFeedback` (status = New) |
| **Data** | `MOCK_CATEGORIES` `:123` (8) · `settings` `:640` (**35** keys) · `MOCK_FEEDBACK` `:295` (4) · `MOCK_SYSTEM_HEALTH` `:276` (8) · `MOCK_AUDIT_LOGS` `:268` (5) |

---

## 1. Categories (`:2453`)

**📂 Help Categories** — *"Configure help categories displayed across the platform"*.
A one-field add form above a 4-column grid of image cards.

### 1.0 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ 📂 Help Categories                                                   │
│ Configure help categories displayed across the platform              │
├──────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────┐ ┌───────────────────┐ │
│ │ New Category Name (e.g. Disaster Relief)   │ │  + Add Category   │ │
│ └────────────────────────────────────────────┘ └───────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│ │ [ image ]│ │ [ image ]│ │ [ image ]│ │ [ image ]│  h-28, object-cover│
│ │🐶 Animal │ │🍱 Food   │ │🚗 Roadside││❤️ Medical│  icon + name over  │
│ │  Rescue  │ │ Donation │ │   Help   │ │  Support │  a dark gradient   │
│ ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤                  │
│ │Active ●──│ │Active ●──│ │Active ●──│ │Active ●──│  toggle pill       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│ │🩸 Blood  │ │🤝 Comm.  │ │🌧️ Disaster││👵 Elderly│                  │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                  │
└──────────────────────────────────────────────────────────────────────┘
```

Each card: a `h-28` image with `object-cover opacity-80`, a top-to-bottom slate gradient
overlay, the **icon + name** pinned bottom-left in white, and a footer row with the status
label and an 11×6 toggle pill.

### 1.1 Interaction map

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **New Category Name** field | `:2461` | Controlled input, placeholder *"New Category Name (e.g. Disaster Relief)"*. **The only field on the form** | ✅ |
| 2 | **+ Add Category** (submit) | `:2460` | ✅ `handleAddCategory` — blocks on empty, appends and clears. **Captures the name and nothing else** (§1.3) | ✅ |
| 3 | **Active Category toggle** | `:2480` | ✅ `toggleCategory(id)` — flips `enabled`; the label switches "Active Category" ⇄ "Disabled" and the pill slides `translate-x-5` | ✅ |
| 4 | Card image | `:2470` | ❌ Not clickable, not replaceable | ❌ |
| 5 | Card name / icon | `:2474` | ❌ Not editable — **no rename anywhere** | ❌ |
| 6 | Delete category | — | ❌ **No delete button.** `_deleteCategory` exists at `:735`, prefixed `_` with an eslint-disable, never wired | ❌ |

**Three of six interactions work. A category, once created, can never be renamed, re-imaged
or removed — only switched off.**

### 1.2 The 8 categories (`MOCK_CATEGORIES`, `:123`)

| # | Name | Icon | Image | `activeCount` | `priority` | `color` |
|---|---|---|---|---|---|---|
| 1 | Animal Rescue | 🐶 | `/animal_rescue.png` | 12 | 1 | `#10B981` |
| 2 | Food Donation | 🍱 | `/food_donation.png` | 8 | 2 | `#F59E0B` |
| 3 | Roadside Help | 🚗 | `/roadside_help.png` | 14 | 3 | `#3B82F6` |
| 4 | Medical Support | ❤️ | `/medical_support.png` | 5 | 4 | `#EF4444` |
| 5 | Blood Donation | 🩸 | `/blood_donation.png` | 2 | 5 | `#F43F5E` |
| 6 | Community Help | 🤝 | `/community_help.png` | 10 | 6 | `#8B5CF6` |
| 7 | Disaster Relief | 🌧️ | `/disaster_relief.png` | 6 | 7 | `#06B6D4` |
| 8 | Elderly Support | 👵 | `/elderly_support.png` | 3 | 8 | `#64748B` |

All 8 ship `enabled: true`. The images live in `apps/web/public/` at 700 KB–1.1 MB each and
are rendered with raw `<img>` (`:2470`).

#### The category images

| | | | |
|---|---|---|---|
| ![Animal Rescue](../../apps/web/public/animal_rescue.png) | ![Food Donation](../../apps/web/public/food_donation.png) | ![Roadside Help](../../apps/web/public/roadside_help.png) | ![Medical Support](../../apps/web/public/medical_support.png) |
| 🐶 **Animal Rescue**<br>`/animal_rescue.png` | 🍱 **Food Donation**<br>`/food_donation.png` | 🚗 **Roadside Help**<br>`/roadside_help.png` | ❤️ **Medical Support**<br>`/medical_support.png` |
| ![Blood Donation](../../apps/web/public/blood_donation.png) | ![Community Help](../../apps/web/public/community_help.png) | ![Disaster Relief](../../apps/web/public/disaster_relief.png) | ![Elderly Support](../../apps/web/public/elderly_support.png) |
| 🩸 **Blood Donation**<br>`/blood_donation.png` | 🤝 **Community Help**<br>`/community_help.png` | 🌧️ **Disaster Relief**<br>`/disaster_relief.png` | 👵 **Elderly Support**<br>`/elderly_support.png` |

All eight are photographic Tamil Nadu scenes — volunteers in blue tees rescuing a puppy,
serving food from crates, repairing a motorbike on the ECR, a clinic bedside, a blood
drive, a community mural, Chennai flood relief, and a volunteer walking an elderly woman.
They are the visual identity of the platform and are **shared with the mobile app's
category art** in spirit but not in file — mobile has its own set in
`apps/mobile/src/assets/`.

> These are also the images a **new category cannot choose from** — `handleAddCategory`
> hardcodes `/community_help.png` for every category added through the UI. See §1.3.

> **`activeCount` here disagrees with the mobile Dashboard's own hardcoded counts**
> ([mobile 08 §3](../mobile/08-dashboard-screen.md#3-category-grid)) — e.g. admin says
> Medical Support 5, mobile says Medical Help 5 ✅ but admin's Elderly Support 3 vs mobile's
> 3 ✅, while names differ (*Medical Support* vs *Medical Help*). Two lists, hand-synced.

### 1.3 ⚠️ "Add Category" captures a name and nothing else

```ts
// :736 — the complete handler
const handleAddCategory = (e: React.FormEvent) => {
  e.preventDefault();
  if (!newCatName.trim()) return;
  setCategories(p => [...p, {
    id: Date.now(),
    name: newCatName,
    icon: '✨',                       // ← always the same
    image: '/community_help.png',     // ← always the same
    activeCount: 0,
    enabled: true,
    priority: p.length + 1,
    color: '#8B5CF6',                 // ← always the same
  }]);
  setNewCatName('');
};
```

A category created through this form is **visually indistinguishable from every other new
category**: the same ✨ icon, the same community-help photo, the same purple. Given the card
design is image-led, a new category looks like a duplicate of Community Help with a
different label.

#### What the form captures vs. what the model already holds

| Field | In `MOCK_CATEGORIES`? | Add form captures it? |
|---|---|---|
| `name` | ✅ | ✅ |
| `icon` | ✅ | ❌ Hardcoded ✨ |
| `image` | ✅ | ❌ Hardcoded `/community_help.png` |
| `color` | ✅ | ❌ Hardcoded `#8B5CF6` |
| `priority` | ✅ | ⚠️ Auto — appended last, not choosable |
| `enabled` | ✅ | ⚠️ Always `true` |
| **`description`** | ❌ **Not in the model at all** | ❌ |
| **`content` / guidance** | ❌ **Not in the model at all** | ❌ |

**Two fields don't exist anywhere in the system**: a category has no description and no
body content — not in the admin model, not in the mobile app. The mobile category cards
show only emoji + title + count
([mobile 08 §3.1](../mobile/08-dashboard-screen.md#31-card-spec)), and the report wizard's
9 categories are `{ id, label, icon, color }` only
([mobile 10 §3](../mobile/10-report-flow-screen.md#3-categories-3545)).

#### Recommended: what "+ Add Category" should capture

| Field | Control | Notes |
|---|---|---|
| **Name** | text, required | Already present |
| **Icon** | emoji picker | Must match the mobile app's emoji-led cards |
| **Cover image** | file upload → object storage | Card design is image-led; a default makes new categories look duplicated. Same upload constraints as [mobile 20 §2A](../mobile/20-edit-profile-screen.md#2a-profile-photo-upload--full-specification) — ~2 MB in, ~200 KB out, but **16:9 not 1:1** to match the `h-28 object-cover` card |
| **Short description** | text, 1 line | For the mobile category card subtitle and the admin card. **New field** |
| **Content / guidance** | textarea, markdown | What a reporter should include for this category — shown in the report wizard. **New field** |
| **Accent colour** | colour picker | `color` already exists and is hardcoded on create |
| **Priority** | number / drag-reorder | Already stored, never used for ordering |
| **Expiry rule** | duration | Mobile already has per-category rules in `utils/expiry.js`; this is where they belong |

The last two are the highest-value additions: `priority` is stored and ignored, and the
expiry rules currently live only in the mobile bundle
([mobile 24 §1](../mobile/24-utils-and-dead-code.md#1-expiryjs-114-lines--live)) where
they can't be changed without an app release.

```ts
// :735 — written, disabled, unreachable
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _deleteCategory = (id: number) => setCategories(p => p.filter(c => c.id !== id));
```

The same pattern as `_toggleUpdatePin` in [05](./05-community.md#2-community-updates-2253) —
a working handler deliberately switched off.

### 1.4 Category parity with mobile

| | Admin | Mobile |
|---|---|---|
| Count | **8** (`MOCK_CATEGORIES`) | 8 on the Dashboard, **9** in the report wizard (adds 🔍 Lost & Found) |
| `enabled` flag | ✅ Per category | ❌ No concept — disabling one admin-side changes nothing in the app |
| `priority` | ✅ Stored | ❌ Not used for ordering anywhere |
| `activeCount` | ✅ Stored | Mobile hardcodes its own counts ([08](../mobile/08-dashboard-screen.md#3-category-grid)) |

---

## 2. App Settings (`:3250`)

A **35-key** configuration object (`:640–685`) across **nine** comment-delimited groups:
General (5) · Reports (6) · Community (5) · Moderation (6) · Notifications (4) ·
Authentication (4) · Maintenance (2) · GPS & Location (1) · Feature flags (2).

⚠️ **Only 3 of the toggles rendered in this tab are bound to that object.** See §2A.

| Section | Line | Contains |
|---|---|---|
| 📍 Location & GPS | `:3264` | `defaultRadius` (chip selector, `:3275`) |
| 🚨 Report Settings | `:3299` | `expiryHours`, **`maxPhotos`** (`:3310` "Maximum Photos Per Report"), `requireEmail`, `allowAnonymous` |
| 👥 Volunteer Settings | `:3318` | `maxVolunteers`, `minReliability` |
| 🔔 Notifications | `:3344` | `firebaseEnabled`, `smtpEnabled`, `smsEnabled`, `broadcastEnabled` |
| 🔒 Privacy & Safety | `:3368` | `flagLimit`, `profanityFilter`, `duplicateDetection`, `imageModeration`, `autoHideFlags` |
| ⚙️ App & Platform Info | `:3392` | `appName`, `appVersion`, `supportEmail`, `supportPhone`, `website`, `maintenanceMode`, `readOnlyMode` |

### 2A. 🔴 Eleven toggles on this tab are decorative — no state, no handler

**Verified 2026-08-18.** The settings tab renders 14 pill toggles. **Three** are bound to the
`settings` object. **Eleven are not bound to anything at all** — they are rendered from inline
literal arrays with no `key`, and their `<button>` carries **no `onClick`**.

```tsx
// :3354–3372 — representative of all three dead groups
{[
  { label: 'Volunteer Verification Required', desc: 'Require ID verification…' },
  { label: 'Additional Volunteer Option',     desc: 'Show "More Volunteers Needed"…' },
  { label: 'Mission Completion Photos Required', desc: 'Volunteers must upload proof…' },
].map((item, i) => (
  …
  <button className={`… ${i === 1 ? 'bg-emerald-500 …' : '… bg-slate-200 …'}`}>
                       ↑ the ON state is decided by the ARRAY INDEX
    <span className={`… ${i === 1 ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
))}
```

**There is no `onClick`.** The knob position is computed from `i === 1` — the second item in
each array renders green regardless of meaning. Clicking any of the eleven does nothing: no
state change, no visual change, no handler to fire.

| Group | Line | Toggles | Bound? |
|---|---|---|---|
| Feature flags | `:3316–3318` | Comments Enabled · Flagging Enabled · Anonymous Reports | ✅ **3 keyed** → `settings.commentsEnabled` / `flagEnabled` / `allowAnonymous` |
| Volunteer settings | `:3355–3357` | Volunteer Verification Required · Additional Volunteer Option · Mission Completion Photos Required | ❌ **Dead** |
| Notifications | `:3381–3385` | Push Notifications · Emergency Broadcasts · Comment Notifications · Volunteer Join Notifications · Mission Complete Notifications | ❌ **Dead** |
| Privacy & Safety | `:3410–3412` | Location Privacy · User Blocking · AI Content Moderation | ❌ **Dead** |

**Why this matters more than the other settings gaps.** Everything else on this tab at least
*edits* — the value changes on screen and is lost on refresh. These eleven don't even do
that. An operator toggling *"Mission Completion Photos Required"* sees **nothing happen** and
has no way to tell whether the click registered.

Three of the dead labels describe rules the product elsewhere claims are enforced:

| Dead toggle | Claimed elsewhere | Reality |
|---|---|---|
| **Mission Completion Photos Required** | Rule 1 — live-camera proof | No camera exists anywhere in the app |
| **AI Content Moderation** — *"Auto-flag NSFW, spam, and duplicate uploads"* | Rules 2 & 17; two mobile alerts name AWS | A `setTimeout` grepping caption text |
| **Push Notifications** | Broadcasts, 3-day proof reminders | Nothing is ever sent |

So the console shows a switch for the app's most important unbuilt rule, renders it in the
**on** position, and ignores the click. See
[BUSINESS-RULES-COVERAGE](../BUSINESS-RULES-COVERAGE.md).

**Fix:** give each a `key` in the `settings` object and an `onClick` that calls `setSettings`
— or remove them until the feature behind them exists.

### 2.1 Interaction map

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | Radius chips | `:3275` | Updates `settings.defaultRadius` | ✅ In state |
| 2 | Number inputs (`expiryHours`, `maxVolunteers`, …) | `:3306`, `:3352` | Controlled, coerced with `+e.target.value` | ✅ In state |
| 3 | Feature toggles | `:3326` | Generic key flip: `setSettings(s => ({ ...s, [item.key]: !s[item.key] }))` | ✅ In state |
| 4 | Text inputs (`appName`, `appVersion`, `supportPhone`) | `:3438–3446` | Controlled | ✅ In state |
| 5 | **💾 Save All Settings** | `:3257` | ❌ `alert('All app settings saved!')` — **nothing is persisted**; a refresh reverts everything | ❌ |

Every control edits state correctly. **The save button is the only thing that doesn't
work** — which makes the entire tab ephemeral.

### 2.2 Settings that describe mobile behaviour but don't reach it

The tab's own subtitle reads *"Central app configuration — **controls what mobile users see
and how the platform behaves**"* (`:3255`). It controls nothing.

| Setting | Value | Mobile reality |
|---|---|---|
| `maxPhotos` | 4 | Mobile can't attach **any** photo ([mobile 25 §2.4](../mobile/25-forms-validation-and-cross-cutting.md#24-file--photo-upload)) |
| `expiryHours` | — | Mobile has its own 9-rule `expiry.js`, unaware of this value |
| `defaultRadius` | — | Mobile Dashboard defaults to 5 km, hardcoded |
| `allowAnonymous` | — | Mobile always offers the anonymity toggle |
| `requireEmail` | — | Mobile asks once, in the report wizard, unconditionally |
| `imageModeration` | — | Mobile's "AWS scan" greps caption text ([mobile 14 §3](../mobile/14-request-details-screen.md#3-the-simulated-ai-moderation-scan)) |
| `maintenanceMode` | — | **Nothing in the app checks it** — enabling it would do nothing |
| `minReliability` | — | Mobile has no reliability concept |
| `flagLimit`, `autoHideFlags` | — | Mobile flags never leave the device |

---

## 3. Support / Feedback (`:2913`)

`MOCK_FEEDBACK` (`:295`, 4 records) — Feature Request · Suggestion · Bug · Complaint, each
with a priority and status.

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **Ticket row** | `:2962` | Opens the detail and clears the reply box | ✅ |
| 2 | ✕ close | `:2987` | Closes | ✅ |
| 3 | **👤 View Full User Details →** | `:3012` | ✅ Selects the linked user, switches to the Users tab and closes the ticket — a genuine cross-tab drill-through | ✅ |
| 4 | Reply textarea | `:3082` | Controlled — placeholder *"Type your response to the mobile user… (They will receive an in-app notification)"* | ⚠️ |
| 5 | **✅ Send Reply & Mark Resolved** | `:3091` | ⚠️ **Half real.** Sets the ticket's status to `Resolved` in both the list and the panel — but **`adminReplyText` is never read**. The reply text is discarded, and the alert claims *"Push notification dispatched to {user}!"* | ⚠️ |
| 6 | Close/dismiss | `:3101` | Closes the panel | ✅ |

```ts
// :631 and :3082 — the only two references to adminReplyText
const [adminReplyText, setAdminReplyText] = useState('');
… value={adminReplyText}
```

The admin types a reply, clicks send, sees "Push notification dispatched" — and **the text
is thrown away**. Only the status changes.

### 3.1 The mobile side already has the matching UI

[mobile 21 Help & Support](../mobile/21-settings-screen.md) has a full ticket submitter with
required-field validation, and its seed ticket `SUP-1024` even carries a canned admin
**reply** field. Both ends model a support conversation; neither can send a message to the
other.

| | Admin | Mobile |
|---|---|---|
| Ticket types | 4 | **6** |
| Id format | `SUP-{id}` derived from record id | `SUP-{1000–9999}` via `Math.random()` |
| Status | New / In Progress / Resolved | Always `New` |
| Reply | Typed and discarded | Hardcoded on the seed ticket |

---

## 4. System Health (`:3156`) — read-only

`MOCK_SYSTEM_HEALTH` (`:276`, 8 services). **No interactive elements at all.**

| Service | Status | Latency | Uptime |
|---|---|---|---|
| API Gateway | Operational | 42 ms | 99.98% |
| PostgreSQL Database | Operational | 12 ms | 99.99% |
| Firebase Realtime DB | Operational | 65 ms | 99.95% |
| Cloudinary Image Storage | Operational | 110 ms | 99.90% |
| **SendGrid Email Queue** | **Degraded** | 340 ms | 98.50% |
| FCM Push Notifications | Operational | 85 ms | 99.99% |
| Server Cluster (Chennai) | Operational | CPU 28% · Mem 44% | 100% |
| Background Cron Workers | Operational | 4 active · 0 failed | 100% |

Two observations:

1. **None of these services exists.** There is no API, no database, no Cloudinary, no
   SendGrid, no FCM — `apps/web` has 4 runtime dependencies and `apps/mobile` has no
   backend. The tab reports uptime for infrastructure that was never provisioned.
2. **The header contradicts it.** The shell shows a permanently green *"● System
   Operational"* ([02 gap #4](./02-dashboard-shell.md#7-gaps--known-issues)) while this tab
   lists SendGrid as Degraded.

---

## 5. Audit Logs (`:3217`) — read-only

`MOCK_AUDIT_LOGS` (`:268`, 5 records): `admin · action · module · oldVal · newVal · time · ip`.

Example: *Super Admin · Create Broadcast · Notifications · None → "Heavy Rain Alert to
Chennai" · 1 hour ago · 192.168.1.104.*

**No interactive elements** — no filter, no search, no export, no date range.

More importantly: **nothing writes to it.** Every real action in the console — suspending a
user, deleting a story, publishing a broadcast, changing settings — appends no entry. The
five records are static, and one of them describes a broadcast creation that the working
`createBanner` handler does not log.

An audit log that no action writes to is the one component where being mock data is a
functional failure rather than a placeholder.

---

## 5A. 🔴 Mobile ↔ Admin connection

**This is the tab with the deepest overlap with the mobile app — and the deepest
disagreement.** Every value here describes behaviour the app implements independently, with
different numbers.

### 5A.1 Categories exist in three places, with three different lists

| Source | Count | List |
|---|---|---|
| **Admin** `MOCK_CATEGORIES` (`:123`) | **8** | Animal Rescue · Food Donation · Roadside Help · Medical Support · Blood Donation · Community Help · Disaster Relief · Elderly Support |
| **Mobile** `ReportFlowScreen.js:35` | **9** | Animal Rescue · Medical **Help** · Food Donation · Roadside **Assist** · Elderly Support · **Disaster** · Community Help · Blood Donation · **🔍 Lost & Found** |
| **Mobile** `expiry.js:12–60` | **9** | keyed `medical · blood · animal · food · roadside · elderly · disaster · lost · community` |

**Three names differ** for the same category — *Medical Support / Medical Help*, *Roadside
Help / Roadside Assist*, *Disaster Relief / Disaster* — and **Lost & Found exists only on
mobile**. An admin toggling categories off would never see the ninth one users can post to.

Icons diverge too: admin uses 👵 for Elderly Support, mobile uses 👴.

Admin categories also carry `image: '/animal_rescue.png'` paths and a `color` hex; mobile
derives colour from `COLORS.*` tokens and uses no category images. See
[ASSET-INVENTORY](../ASSET-INVENTORY.md).

### 5A.2 `settings` (`:640–685`) — 35 keys, every one disconnected

| Setting | Admin value | What mobile actually does | Verdict |
|---|---|---|---|
| **`expiryHours: 2`** | one global 2-hour window | **Per-category rules** — medical 6 h, blood 24 h, animal **3 days**, disaster admin-managed (`expiry.js`) | 🔴 **Directly contradicts.** A single global expiry cannot express the model the app already implements |
| `maxVolunteers: 5` | 5 | Team modal clamps **2–20**; `totalNeeded` defaults 5 | 🟡 Default agrees, ceiling doesn't |
| `maxPhotos: 4` | 4 | **No camera exists.** Photo attach is a hardcoded Unsplash URL | 🔵 Setting for an unbuilt feature |
| `requireEmail: true` | required | ✅ Report flow gates publish on `hasEmail()` | 🟢 Agrees |
| **`allowAnonymous: false`** | **disabled** | Report flow ships a **"Post Anonymously" toggle**, and the reporter card implements `isAnonymous` precedence | 🔴 **Contradicts.** Admin says anonymity is off; the app offers it |
| `allowPublicComments: true` | enabled | 🔵 **Not built on mobile** — the feed is participant updates, not public comments | 🔵 Setting ahead of the app |
| `defaultRadius: 5` | 5 km | ✅ Dashboard radius options **1 · 3 · 5 · 10 km**, default 5 | 🟢 Agrees |
| `minReliability: 60` | 60% | No reliability is computed anywhere (Rule 18 absent) | 🔵 |
| `autoHideFlags: 3` · `flagLimit: 5` | thresholds | `FlagContext` counts nothing and auto-hides nothing | 🔵 |
| `profanityFilter` · `imageModeration` · `duplicateDetection` | all `true` | The "moderation" is a `setTimeout` grepping caption text — and only when a photo is attached | 🔴 Claims three filters that do not exist |
| `otpEnabled` · `emailVerification` · `googleLogin` · `appleLogin` | all `true` | Mobile OTP is a **local 6-digit compare**; no Google/Apple button exists | 🔴 |
| `enableLikes` · `enableComments` · `enableSharing` | all `true` | Sharing ✅ built ([17](../mobile/17-impact-story-screen.md)); likes and comments 🔵 not built | 🟡 |
| `enableCommunityUpdates: true` | enabled | ✅ Built — [14 §1D](../mobile/14-request-details-screen.md#1d-community-updates--the-full-flow) | 🟢 |
| `maintenanceMode` · `readOnlyMode` | both `false` | **No client-side check for either.** Flipping them would change nothing | 🔵 |
| `firebaseEnabled` · `smtpEnabled` · `smsEnabled` · `broadcastEnabled` | 3 on | No push, no email, no SMS is sent by either product | 🔵 |

**Nothing here is read by the app, and nothing the app does is reported back.** `setSettings`
mutates React state that resets on refresh — there is no `localStorage`, no API, no
persistence of any kind.

### 5A.3 The consequence

`maintenanceMode` is the clearest illustration. It reads as a kill switch — the control an
operator reaches for when something is badly wrong. Flipping it does nothing at all: no
banner, no blocked writes, no notice to a single user. In an emergency-response product,
a switch that looks like a stop button and isn't one is worse than no switch.

### 5A.4 Required contract

| Endpoint | Purpose |
|---|---|
| `GET /config` | Mobile reads settings on launch — **the missing link** |
| `PATCH /admin/settings` | Persist changes (currently state-only) |
| `GET /categories` | **One list, one source** — replacing the three above |
| `PATCH /categories/:id` | `{ enabled, priority }` — mobile must honour `enabled` |
| `GET /config/expiry-rules` | Per-category windows, replacing the global `expiryHours` |

Until `GET /config` exists, every switch on this tab is decoration. See
[API-CONTRACT](../API-CONTRACT.md).

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 0 | **11 of the 14 toggles on this tab are decorative** (`:3355–3357`, `:3381–3385`, `:3410–3412`) — no `key`, no state, **no `onClick`**. The on/off position is computed from the array index (`i === 1`). | Worse than the settings that don't persist: these don't respond at all. An operator clicking *"Mission Completion Photos Required"* or *"AI Content Moderation"* sees nothing happen and cannot tell whether the click registered. Two of them show **on** for rules the product has never built. **See §2A.** | Bind each to a `settings` key with an `onClick`, or remove until the feature exists. |
| 1 | **"Save All Settings" persists nothing** (`:3257`). | 35 settings are editable and every one reverts on refresh. The tab claims to control mobile behaviour and controls nothing. | `PATCH /settings`; have mobile read them. |
| 2 | **Audit logs are never written.** No action in the console appends an entry. | No accountability trail — the exact opposite of the tab's purpose. With a role model that already fails open ([02 §3](./02-dashboard-shell.md#3--the-role-gate)), there's no record of who did what. | Append on every mutation. |
| 3 | **Support replies are discarded** (`:3091`). `adminReplyText` is written and never read; the alert claims a push was dispatched. | Operators reply to users who never receive anything, and the text is lost. | Send the reply; store the thread. |
| 4 | **System Health reports non-existent infrastructure.** | Fabricated uptime for services that were never provisioned, and it contradicts the header's permanent green status. | Wire to real checks, or remove until there's a backend. |
| 5 | **Settings don't reach mobile** — `maxPhotos`, `expiryHours`, `defaultRadius`, `maintenanceMode` and 36 others. | `maintenanceMode` is the sharpest: an operator can "enable maintenance" and the app carries on. | Expose a config endpoint; have mobile fetch it at launch. |
| 6 | **Category delete is written but disabled** (`:735`). | Categories can be added and never removed. | Wire it, or remove the handler. |
| 7 | **"+ Add Category" captures only a name** (`:736`). Icon, image and colour are hardcoded; **description and content don't exist in the model at all**. | On an image-led card grid, every new category renders as a ✨ badge over the community-help photo — visually a duplicate. And no category anywhere in either product has a description or guidance text. | Add icon, image, description, content, colour and priority to the form — full spec in §1.3. |
| 11 | **Categories cannot be renamed, re-imaged or deleted.** Only the enable toggle works. | A typo in a category name is permanent. | Add an edit panel; wire `_deleteCategory` (`:735`). |
| 12 | **`priority` is stored and never used for ordering** — the grid renders in array order. | The field implies a controllable sort that doesn't exist. | Sort by `priority`, or drop the field. |
| 13 | **Category expiry rules live only in the mobile bundle** (`apps/mobile/src/utils/expiry.js`), not here. | Changing how long a Blood Donation request stays open requires an app release. | Move the 9 rules into the category model. |
| 8 | **`enabled` and `priority` have no mobile effect.** | Disabling a category admin-side leaves it live in the app. | Have mobile read the category list. |
| 9 | **Audit logs have no filter, search or export.** | Unusable at any real volume. | Add all three. |
| 10 | **No confirmation on settings changes.** Toggling `maintenanceMode` or `readOnlyMode` is a single click. | Platform-wide switches with no guard. | Confirm destructive settings. |

---

## 7. What works well

- **`handleAddCategory`** (`:736`) — validates, appends with sensible defaults and resets
  the field. A complete little flow.
- **The generic toggle handler** (`:3326`) — `[item.key]: !s[item.key]` drives every
  boolean setting from one code path, so adding a setting is a data change, not a code
  change.
- **Number inputs coerce properly** with `+e.target.value`, avoiding string/number drift.
- **The cross-tab drill-through from a support ticket to the user record** (`:3012`) sets
  the user, switches tab and closes the panel — three correct side effects in one handler.
- **Marking a ticket resolved updates both the list and the open panel** (`:3092–3093`), the
  same dual-update discipline as `updateReportStatus`.
- **The settings taxonomy is well judged** — six sections covering location, reports,
  volunteers, notifications, privacy and platform is the right shape for this product.

---

## 8. QA checklist

- [ ] Adding a category with an empty name is blocked; a valid one appends with ✨.
- [ ] Toggling a category flips its enabled badge.
- [ ] Confirm there is **no** delete button on categories (gap #6).
- [ ] Change several settings, click "Save All Settings", refresh — **all revert** (gap #1).
- [ ] Toggle `maintenanceMode` and confirm the mobile app is unaffected (gap #5).
- [ ] Open a support ticket, type a reply, click Send — status becomes Resolved, and the reply text is gone (gap #3).
- [ ] "View Full User Details →" opens that user in the Users tab.
- [ ] System Health shows SendGrid as Degraded while the header stays green (gap #4).
- [ ] Perform several actions, then check Audit Logs — **no new entries** (gap #2).
- [ ] Audit Logs offers no filter, search or export (gap #9).

---

## 9. Changing these tabs

| To change… | Edit |
|---|---|
| Categories | `:123` — `MOCK_CATEGORIES` |
| Add-category defaults | `:736` — `handleAddCategory` |
| Disabled delete handler | `:735` — `_deleteCategory` |
| Settings object | `:640–685` |
| Settings sections | `:3264`, `:3299`, `:3318`, `:3344`, `:3368`, `:3392` |
| Support tickets | `:295` — `MOCK_FEEDBACK` |
| Health services | `:276` — `MOCK_SYSTEM_HEALTH` |
| Audit entries | `:268` — `MOCK_AUDIT_LOGS` |

---

**Previous:** [06 — Analytics](./06-analytics.md) · **Next:** [08 — Monetization](./08-monetization.md)
