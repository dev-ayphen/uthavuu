# 05 — Community

> The Community sidebar group: **Impact Stories**, **Community Updates** and
> **Broadcasts**. The publishing and emergency-messaging side of the console.

| | |
|---|---|
| **Tabs** | `impact-stories` `:2290` · `updates` `:2253` · `broadcast` `:2694` |
| **Source** | `apps/web/src/app/admin/dashboard/page.tsx` |
| **Line refs valid as of** | 2026-08-18 |
| **Sidebar** | Community → Impact Stories (badge = count) · Community Updates · Broadcasts (badge = active banners) |
| **Data** | `MOCK_IMPACT_STORIES` `:165` (3) · `MOCK_UPDATES` `:107` (5) · `MOCK_BANNERS` `:302` (3) |

---

## 1. Impact Stories (`:2290`)

The richest data model in the console. Each story carries before/after images, a mission
team, impact counts, engagement metrics and a **7-step `timeline[]`**.

### 1.1 Interaction map

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **"New Impact Story"** | `:2298` | ❌ `alert('New Impact Story wizard launched!')` — no wizard exists | ❌ |
| 2 | **Story card** | `:2436` | Opens the detail panel | ✅ |
| 3 | ✕ close | `:2309` | Closes the panel | ✅ |
| 4 | **Toggle Feature** | `:2313` | ❌ `alert('Feature status toggled for "{title}"')` — **the story's featured flag never changes** | ❌ |
| 5 | **Copy story link** | `:2316` | ❌ `alert('Story link copied to clipboard!')` — **nothing is copied**; no Clipboard API call | ❌ |
| 6 | **Delete story** | `:2319` | ✅ Removes it from state — **no confirmation dialog** | ⚠️ Real but unconfirmed |
| 7 | Before/after images | — | ❌ Not clickable — no lightbox |
| 8 | Timeline steps | `:2380`-ish | ❌ Display only |

**Four of six actions are stubs, and the one destructive action has no confirmation.**

### 1.2 There is no way to create a story

| Path | Where | Result |
|---|---|---|
| "New Impact Story" button | `:2298` | ❌ Alert only |
| "⭐ Generate Impact Story" on a completed report | `:1594` | ❌ **Silent no-op** — see [04 gap #12](./04-reports-and-moderation.md#5-gaps--known-issues) |

Both entry points are dead. The three stories in the tab can only ever be the three
hardcoded ones — an operator can delete them but never add one.

### 1.3 Story detail panel — full structure

| Element | Line | Content |
|---|---|---|
| Title | `:2333` | `text-2xl font-black` over the hero |
| **Before / After pair** | `:2341`, `:2355` | Two labelled panels — **"Before Mission"** (red) and **"After Completion"** (emerald) |
| **⏱ Mission Execution Timeline** | `:2370` | Vertical timeline with a `border-l-2` emerald rail, mapping `selectedStory.timeline?` — 7 steps per story |
| **Story summary metrics** | `:2386–2404` | Four stat tiles (see below) |

#### The four metrics (`:2390–2403`)

| Tile | Field | Colour | Real? |
|---|---|---|---|
| **People Impacted** | `impactPeople` | emerald | ❌ Static |
| **Resolution Duration** | `duration` | amber | ❌ Static |
| **Community Likes** | `likes` | blue | ❌ **Mobile has no like action** — can never increment |
| **App Views** | `views` | purple | ❌ **Mobile reports no views** — can never increment |

Two of the four metrics measure mobile-app engagement that the app has no capability to
report. See gap #11.

> The timeline uses optional chaining (`selectedStory.timeline?.map`), so a story without
> one degrades gracefully — a small piece of defensive care.

### 1.4 Data shape (`MOCK_IMPACT_STORIES`, `:165`)

```
id · title · category · beforeImage · afterImage · missionTeam[]
impactCount · status · likes · shares · views
timeline[]  ← 7 steps, e.g.:
  { step: '6', title: 'Completion Photo', time: '10:15 AM',
    actor: 'Rahul Shankar', desc: 'Final proof photo uploaded via app camera',
    status: 'Completed', icon: '📸' }
```

> The timeline describes a verification pipeline — *"Final proof photo uploaded via app
> camera"* — that the mobile app cannot perform. Its completion form requires no photo at
> all ([mobile 15 gap #2](../mobile/15-volunteer-journey-screen.md#5-gaps--known-issues)),
> and every "proof photo" it does attach is a hardcoded Unsplash URL
> ([mobile 14 gap #3](../mobile/14-request-details-screen.md#5-gaps--known-issues)).

### 1.5 Images

Stories reference the shared category art in `apps/web/public/`:

| Asset | Used as |
|---|---|
| `animal_rescue.png` · `food_donation.png` · `roadside_help.png` · `medical_support.png` · `story_medical.png` | `beforeImage` / `afterImage` |

All rendered with raw `<img>` — the file carries a top-level
`/* eslint-disable @next/next/no-img-element */` (`:1`). Each PNG is 700 KB–1.1 MB.

---

## 2. Community Updates (`:2253`)

> Sidebar: **Community → Community Updates**. Header: *"📣 Community Updates"*, subtitle
> *"Field updates submitted by volunteers & community members"* (`:2257–2258`).

This is the admin-side mirror of the mobile
[Community Updates feed](../mobile/14-request-details-screen.md#1d-community-updates--the-full-flow)
— the public information feed on an active request, distinct from Mission Chat.

### 2.1 Layout

```
📣 Community Updates
Field updates submitted by volunteers & community members
─────────────────────────────────────────────────────────────────────────────
 Update Text          Posted By    Related Mission    Time    Likes  Status     Actions
─────────────────────────────────────────────────────────────────────────────
 "Food shifted to     Ravi         Wedding Hall       5 mins    4    Published  [Delete]
  back gate…"         Shankar      Excess Food…       ago
 "Dog moved near      Arun Kumar   Injured Dog        1 min     2    Published  [Delete]
  temple premises…"                Fallen in Drain    ago
 …3 more rows
```

A single `overflow-x-auto` table — no search, no filter, no sort, no pagination, no detail
panel. Every one of the other Community tabs has at least one of those.

### 2.2 Columns (`:2264`)

| Column | Field | Rendering |
|---|---|---|
| **Update Text** | `update` | Wrapped in typographic quotes `&ldquo;…&rdquo;`, `max-w-62.5` |
| **Posted By** | `postedBy` | `font-semibold text-emerald-400` |
| **Related Mission** | `reportTitle` | `max-w-37.5 truncate` — ⚠️ truncated with no tooltip and **not a link**, so an admin cannot open the report an update refers to |
| **Time** | `time` | Relative string, pre-baked in the mock |
| **Likes** | `likes` | `font-bold text-pink-400` |
| **Status** | — | ⚠️ **Hardcoded** `Published` pill on every row (`:2274`). Not read from data |
| **Actions** | — | `Delete` button only |

### 2.3 Data shape — `MOCK_UPDATES` (`:107`, 5 records)

```ts
{ id: 401, update: 'Food shifted to back gate for easy pickup. 80 meals remaining.',
  postedBy: 'Ravi Shankar', reportTitle: 'Wedding Hall Excess Food Donation',
  reportId: 101, time: '5 mins ago', likes: 4, comments: 1,
  hidden: false, pinned: true }
```

**Three fields are carried and never used:** `reportId` (the linkage that would make
"Related Mission" clickable), `comments`, `hidden`, and `pinned`. Record 401 is `pinned:
true` and renders identically to every other row.

### 2.4 Interaction map

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **Delete update** | `:2276` | `deleteUpdate(id)` — removes from state. **No confirmation dialog** | ✅ local |

**One action, and it works.** But note what's missing: there is no hide/unhide here, even
though the data has a `hidden` field and the Comments tab implements exactly that.

⚠️ Delete is **immediate and irreversible**, with no confirm step — unlike Reports, where
destructive actions are confirmed. Deleting a field update during a live mission destroys
information volunteers are actively relying on ("Food shifted to back gate").

### 2.5 The end-to-end updates flow — and where it breaks

```
 MOBILE                         BACKEND              ADMIN
 ─────────────────────────────  ───────────────────  ─────────────────────────
 Request Details
   │
   ├─ [+ Add Update] ──▶ composer
   │     ├─ type: 📍 location / ℹ️ info / 🚨 urgent / ✅ status
   │     └─ optional photo
   │
   ├─ Post ──┬─ no photo ──────────▶ published instantly (unscanned)
   │         │
   │         └─ photo ──▶ 1.2 s "AWS scan"
   │                       ├─ caption has 'unsafe'/'nudity'
   │                       │    └─▶ ✗ DISCARDED ····▶ ✗ no queue ····▶ ✗ nothing
   │                       │        (user told it went to admins)
   │                       ├─ type = status
   │                       │    └─▶ PENDING_REPORTER_REVIEW
   │                       │         ····▶ ✗ no 3-day timer ····▶ ✗ no escalation
   │                       └─ else ─▶ published
   │
   └─ published update  ····▶  ✗ NO API  ····▶  admin table (MOCK_UPDATES)
        👍 Helpful       ····▶  ✗ NO API  ····▶  Likes column
        Report update    ····▶  ✗ nothing recorded anywhere
```

`····▶` = the path the product intends; **none of it is connected**. The admin table is
seeded from `MOCK_UPDATES` and has never seen a mobile update.

**Field-level disagreement between the two ends:**

| Mobile (`RequestDetailsScreen.js:134`) | Admin (`MOCK_UPDATES:107`) | Problem |
|---|---|---|
| `message` | `update` | Rename only |
| `userName` | `postedBy` | Rename only |
| `helpful` / `isHelpful` | `likes` | Mobile tracks *the viewer's own vote*; admin has no equivalent |
| `time` | `time` | Both pre-baked strings, not timestamps — **unsortable** |
| — | `reportId` · `reportTitle` | 🔴 **Mobile updates carry no report linkage at all.** An update composed in the app could not be attached to a report even with a backend |
| `type` (4 kinds) | — | 🔴 Admin cannot tell an 🚨 Urgent update from an ℹ️ Information one |
| `role` / `badge` (3 roles) | — | 🔴 Admin cannot tell a reporter's update from a bystander's |
| `status: 'PENDING_REPORTER_REVIEW'` | — | 🔴 The moderation state the app creates **has no inbox here**. Status is hardcoded "Published" |
| `proofImage` | — | 🔴 Completion proof photos are invisible to moderators |
| — | `hidden` · `pinned` · `comments` | Admin-only fields mobile never sends |

**The moderation loop is open at both ends.** The app tells users that flagged updates go to
"Uthavu Admins for review" and that unreviewed completion proofs "escalate to Uthavu Admins"
— this tab is where those would arrive, and it has **no pending state, no review queue and
no approve/reject action**. It can only delete things that were never sent to it.

### 2.6 Required contract

| Endpoint | Purpose |
|---|---|
| `POST /reports/:id/updates` | Publish an update (must carry `type`, `role`, `reportId`) |
| `GET /updates?status=pending` | The review queue this tab needs and lacks |
| `POST /updates/:id/helpful` | Vote |
| `POST /updates/:id/report` | The mobile "Report" action, which currently records nothing |
| `PATCH /updates/:id` | `{ hidden }`, `{ pinned }` — fields already in the data |
| `POST /updates/:id/approve` \| `/reject` | Resolve `PENDING_REPORTER_REVIEW` |
| `DELETE /updates/:id` | Existing delete, server-side |

See [API-CONTRACT](../API-CONTRACT.md) and
[mobile 14 §1D](../mobile/14-request-details-screen.md#1d-community-updates--the-full-flow).

### 2.7 Dead code — the pin toggle

```ts
// :730 — written, disabled, never used
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _toggleUpdatePin = (id: number) =>
  setUpdates(p => p.map(u => u.id === id ? { ...u, pinned: !u.pinned } : u));
```

A pin toggle was written, renamed with a `_` prefix and suppressed with an eslint-disable
rather than wired up. The `pinned` field exists in the data and is never surfaced. See
gap #4.

---

## 3. Broadcasts (`:2694`)

Emergency banners targeted at a district. **The most complete feature in the console** —
a real form with validation, creating real records.

### 3.1 `createBanner` — genuinely works

```ts
// :762–779
const createBanner = (e: React.FormEvent) => {
  e.preventDefault();
  if (!bannerTitle.trim()) return;              // ← validation
  const newB = {
    id: Date.now(),
    title: bannerTitle,
    message: bannerMsg,
    category: bannerType.includes('Flood') ? 'Emergency' : 'General',
    type: bannerType,
    active: true,
    targetDistrict: bannerDistrict,
    publishedBy: isSuperAdmin ? 'Super Admin' : 'Ops Admin',
    views: 0
  };
  setBanners(prev => [newB, ...prev]);
  setBannerTitle('');                            // ← form reset
  setBannerMsg('');
};
```

Required-field guard, derived category, role attribution, optimistic prepend, form reset.

### 3.2 Interaction map

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | Title field | `:2710` | `required` — placeholder *"e.g. 🚨 Emergency Volunteer Request"* | ✅ |
| 2 | Message textarea | `:2715` | `required`, 3 rows | ✅ |
| 3 | Type select | — | Feeds the derived `category` | ✅ |
| 4 | District select | — | Sets `targetDistrict` | ✅ |
| 5 | **Preview** | `:2775` | ⚠️ `alert('Preview:\n\n{title}\n\n{message}')` — a plaintext alert, not a real preview | ⚠️ |
| 6 | **Publish** (form submit) | `:2703` | ✅ Creates the banner, prepends it, clears the form | ✅ |
| 7 | **Toggle active** | `:2822` | ✅ `toggleBanner(id)` — flips `active` | ✅ |
| 8 | **Delete banner** | `:2825` | ✅ Removes it — **no confirmation** | ⚠️ |

### 3.3 ✅ There *is* a live mobile notification preview

Separate from the Preview **button** (#5), the compose panel renders a **live mock of the
push notification as it will appear on a phone** (`:2793–2802`), headed *"📱 How it appears
on mobile"*:

```jsx
// :2791–2800 (abridged) — updates as you type
<div className="text-[10px] font-bold text-emerald-400 uppercase">📱 How it appears on mobile</div>
<div className={`${dark ? 'bg-slate-900' : 'bg-white'} rounded-xl p-3 border …`}>
  <div className="w-8 h-8 rounded-xl bg-emerald-600 …">🔔</div>
  <div className="text-xs font-bold">Uthavu Alert</div>
  <div className="text-[11px]">{bannerTitle || 'Emergency Volunteer Request'}</div>
  <div className="text-[10px]">{bannerMsg ? bannerMsg.slice(0, 60) + '...' : 'Hea…'}</div>
</div>
```

It binds directly to `bannerTitle` and `bannerMsg`, falls back to sensible placeholders when
the fields are empty, and **truncates the body to 60 characters** — matching how a real push
notification would be clipped.

This is a genuinely good piece of UI, and it makes the separate "Preview" alert button (#5)
redundant. See gap #7.

### 3.4 Existing banners (`MOCK_BANNERS`, `:302`)

| Title | District | Active | Views | By |
|---|---|---|---|---|
| 🌧️ Heavy Flood & Rain Warning — Chennai | Chennai | ✅ | 1,842 | Super Admin |
| 🩸 Urgent O-Negative Blood Camp | Salem | ✅ | 620 | Ops Admin |
| 🍱 Night Food Drive Initiative | Madurai | ❌ | 410 | Super Admin |

`views` starts at 0 on creation and can never increment — nothing reports impressions.

---

## 4. 🔴 Mobile ↔ Admin connection

**None of the three tabs reaches the app.**

| Admin capability | Mobile counterpart | Connected? |
|---|---|---|
| Publish/delete an impact story | [16 Impact Stories](../mobile/16-impact-stories-screen.md) reads a hardcoded `IMPACT_STORIES` array | ❌ |
| Story `status` (published/hidden) | **Mobile has no concept of an unpublished story** | ❌ Hiding a story admin-side changes nothing in the app |
| Story `likes` / `shares` / `views` | Mobile has no like/comment UI; shares are never reported | ❌ Counters can never move |
| Delete a community update | Updates feed in [14 Request Details](../mobile/14-request-details-screen.md) uses `SAMPLE_UPDATES` | ❌ |
| **Publish an emergency broadcast** | **Nothing receives it** | ❌ |

### 4.1 Broadcasts have no delivery channel

This is the gap that matters most in this group. An operator can compose a flood warning
targeted at Chennai, publish it, and see it appear in the list — and **no user will ever
see it**, because:

1. `expo-notifications` is not installed in the mobile app
   ([mobile 05 gap #1](../mobile/05-permissions-screen.md#6-gaps--known-issues))
2. No push token is ever registered — the Permissions screen requests nothing
3. There is no in-app banner surface that reads broadcasts
4. The console's own push composer (`notifications` tab) is **unreachable**
   ([10](./10-unreachable-tabs.md))

The mobile Alerts screen has a `System` filter and a "⚡ System Alert" record type — the
natural destination — but it reads 7 hardcoded alerts
([mobile 11](../mobile/11-alerts-screen.md)).

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Broadcasts reach nobody.** No push, no in-app surface, no delivery of any kind. | The emergency-messaging feature — flood warnings, urgent blood requests — is a list that only admins can see. In a disaster-response product this is the highest-value missing link. | Install `expo-notifications`, register tokens, add an in-app banner surface, and send on publish. |
| 2 | **No impact story can be created.** Both entry points are dead — the tab's own button alerts (`:2298`), and the report-level button is a silent no-op ([04 gap #12](./04-reports-and-moderation.md#5-gaps--known-issues)). | Stories can only be deleted, never added. The product loop *"Mission Closed → Auto Impact Story"* has no admin path. | Build the composer; wire `creatingStoryFor`. |
| 3 | **Feature-toggle and copy-link are alerts** (`:2313`, `:2316`). | Featuring a story does nothing; "link copied" copies nothing. `navigator.clipboard.writeText()` would make #5 real in one line. | Implement both. |
| 4 | **Update pin is written but disabled** (`:730`). The handler exists, prefixed `_` with an eslint-disable, and `pinned` sits unused in the data. | A built feature deliberately switched off with no comment explaining why. | Wire it, or delete the handler and the field. |
| 5 | **Updates have no hide action** despite a `hidden` field, while Comments implements exactly that. | Inconsistent moderation powers over near-identical content. | Add hide/unhide. |
| 6 | **Destructive actions have no confirmation** — delete story (`:2319`), delete banner (`:2825`), delete update (`:2276`). | One misclick destroys a record. The Users tab *does* confirm before deleting. | Add confirmations. |
| 7 | **The "Preview" button is redundant.** It fires a plaintext `alert` (`:2775`) while a **live, correctly-truncated mobile notification preview already renders in the same panel** (`:2793`, §3.3). | Two previews, one good and one worse, side by side. The alert adds nothing. | Remove the button; the live panel is the preview. |
| 11 | **Two of the four story metrics can never move.** "Community Likes" and "App Views" (`:2398`, `:2402`) measure mobile engagement — mobile has no like action and reports no views. | Half the story dashboard is permanently frozen. | Add a like action and view reporting in the app, or drop the tiles. |
| 8 | **`views` can never increment.** Set to 0 on creation; nothing reports impressions. | Reach is unmeasurable. | Report views from the client. |
| 9 | **Story `timeline` describes a pipeline that doesn't exist** — "proof photo uploaded via app camera" when the app requires no photo. | The console displays a verification trail that was never performed. | Build the capture flow first. |
| 10 | **Story images are raw `<img>`** at 700 KB–1.1 MB, with a file-level eslint-disable. | Slow tab, no optimisation. | `next/image`. |

---

## 6. What works well

- **`createBanner` is the most complete flow in the console** — required-field validation
  that blocks submission, a derived category, role attribution, optimistic prepend and a
  form reset. Compare the mobile app, where [10 Report Flow](../mobile/10-report-flow-screen.md)
  publishes with no validation and saves nothing.
- **`toggleBanner`** (`:781`) is a clean, real state change.
- **District targeting** is modelled end to end in the data — `targetDistrict` on every
  banner, matching the 6 districts in `MOCK_DISTRICT_ANALYTICS`.
- **Role attribution on publish** (`publishedBy`) — the console records *who* sent an
  emergency broadcast, which is exactly right for an audit trail.
- **The impact-story data model is genuinely well designed** — before/after, mission team,
  engagement metrics and a 7-step timeline. It is far richer than the mobile equivalent and
  is what mobile should adopt.
- **The live mobile notification preview** (`:2793`) binds to the form as you type, falls
  back to placeholders when empty, and truncates the body to 60 characters the way a real
  push would. The single best-crafted piece of UI in the console.
- **The story timeline uses optional chaining** (`selectedStory.timeline?.map`), so a story
  without one renders rather than crashing.
- **Before/After panels are colour-coded** — red "Before Mission", emerald "After
  Completion" — which reads instantly.

---

## 7. QA checklist

- [ ] Impact Stories lists 3 cards; clicking one opens the detail with before/after and timeline.
- [ ] "New Impact Story" shows an alert only (gap #2).
- [ ] Toggle Feature and Copy Link show alerts; the story's state is unchanged (gap #3).
- [ ] Delete story removes it immediately with **no confirmation** (gap #6).
- [ ] Community Updates: delete removes a row; confirm there is no hide action (gap #5).
- [ ] Broadcasts: submitting with an empty title is blocked.
- [ ] Publishing prepends the banner, sets `active: true`, `views: 0`, and clears the form.
- [ ] `publishedBy` reads "Ops Admin" when the URL carries `?role=ops`.
- [ ] Toggle active flips the badge on an existing banner.
- [ ] Preview shows a plaintext alert (gap #7).
- [ ] Publish a banner, then open the mobile app — **nothing arrives** (gap #1).
- [ ] Refresh — every created banner is gone.

---

## 8. Changing these tabs

| To change… | Edit |
|---|---|
| Impact stories | `:165` — `MOCK_IMPACT_STORIES` |
| Community updates | `:107` — `MOCK_UPDATES` |
| Banners | `:302` — `MOCK_BANNERS` |
| Banner creation | `:762–779` — `createBanner` |
| Banner toggle | `:781` — `toggleBanner` |
| Update deletion | `:729` — `deleteUpdate` |
| Disabled pin handler | `:730` — `_toggleUpdatePin` |

---

**Previous:** [04 — Reports & moderation](./04-reports-and-moderation.md) · **Next:** [06 — Analytics](./06-analytics.md)
