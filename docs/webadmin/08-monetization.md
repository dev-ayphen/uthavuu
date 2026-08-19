# 08 — Monetization

> The Monetization sidebar group: **Overview**, **Google AdMob** and **Sponsors**. The
> largest and most elaborately built section of the console — a multi-step sponsor campaign
> wizard with video upload, an ad-placement manager, and live video preview.

| | |
|---|---|
| **Tabs** | `monetization-overview` `:3771` · `monetization-admob` `:3844` · `monetization-sponsors` `:3765` |
| **Source** | `apps/web/src/app/admin/dashboard/page.tsx` |
| **Line refs valid as of** | 2026-08-18 |
| **Render** | All three share one IIFE block at `:3765` that switches on `activeTab` |
| **Data** | `MOCK_SPONSORS` `:337` (3) · `admobPlacements` `:577` (6) · `admobUnits` `:581` (6) |

---

## 0. Layout

### 0.1 Monetization Overview (`:3771`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 💰 Monetization Overview                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌────────────┐┌────────────┐┌────────────┐┌────────────┐                 │
│ │Total       ││Active      ││AdMob       ││Sponsor     │   :3784–3787    │
│ │Revenue     ││Sponsors    ││Earnings    ││Revenue     │                 │
│ └────────────┘└────────────┘└────────────┘└────────────┘                 │
│ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐                       │
│ │Impress.││Clicks  ││CTR     ││Est.    ││eCPM    │       :3804–3808      │
│ │(Aug)   ││        ││        ││Revenue ││        │                       │
│ └────────┘└────────┘└────────┘└────────┘└────────┘                       │
│ ┌──────────────────────────────────────────────────────┐                 │
│ │ Sponsors                                  [View All] │  :3820          │
│ └──────────────────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 0.2 Google AdMob (`:3844`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 📱 Google AdMob                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌────────┐┌────────┐┌────────┐┌────────┐                                 │
│ │Today   ││This    ││Last    ││All     │                  :3855–3858     │
│ │        ││Month   ││Month   ││Time    │                                 │
│ └────────┘└────────┘└────────┘└────────┘                                 │
│ ┌──────────────────────────────────────────────────────┐                 │
│ │ Platform          │ Android / iOS                    │  :3874          │
│ │ App ID (Android)  │ ca-app-pub-…                     │  :3875          │
│ │ App ID (iOS)      │ ca-app-pub-…                     │  :3876          │
│ │ Test Mode         │ [ ON ]                           │  :3877          │
│ └──────────────────────────────────────────────────────┘                 │
│ Ad placements ×6 — see §2.1                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

⚠️ The ad unit IDs are **Google's public test IDs** — see §2.2.

### 0.3 Sponsors (`:3765`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🎯 Sponsors                                        [ + Add Sponsor ]     │
├──────────────────────────────────────────────────────────────────────────┤
│  Sponsor      Category     Placement    Budget   Status    Actions       │
│  ─────────────────────────────────────────────────────────────────────  │
│  Blue Cross   Animal       Feed card    ₹25,000  Active   [Edit][Stats]  │
│  …                                                                       │
└──────────────────────────────────────────────────────────────────────────┘
                         │ [ + Add Sponsor ]
                         ▼
        6-step wizard (§3.4) — 9 fields marked * , none enforced
```

The **mobile counterpart** is `SponsorCard` — same concept, entirely separate hardcoded data.
See §4.

---

## 1. Overview (`:3771`)

A summary landing for the group.

| # | Element | Line | Interaction → what happens |
|---|---|---|---|
| 1 | **Manage Sponsors** | `:3778` | `nav('monetization-sponsors')` |
| 2 | **Configure AdMob** | `:3815` | `nav('monetization-admob')` |
| 3 | **View Sponsors** | `:3820` | `nav('monetization-sponsors')` |
| 4 | **+ Add Sponsor** | `:3835` | ✅ Navigates **and** opens the wizard — `nav('monetization-sponsors'); setShowAddSponsor(true)` |

All four work. #4 is a nice touch: one click to the right tab with the modal already open.

---

## 2. Google AdMob (`:3844`)

### 2.1 Six placements

`admobPlacements` (`:577`) and `admobUnits` (`:581`):

| Key | Label | Default | Frequency |
|---|---|---|---|
| `home` | Home Feed Banner | ✅ on | Every 15 posts |
| `impactStories` | Impact Stories | ✅ on | Every 5 story cards |
| `categoryList` | Category List | ✅ on | Every 10 items |
| `profile` | User Profile | ❌ off | 1 per session |
| `interstitialAfterMission` | — | ❌ off | — |
| `appOpen` | — | ❌ off | — |

Each carries an `androidId`, `iosId` and `platform`.

### 2.2 ⚠️ The ad unit IDs are Google's public test IDs

```
androidId: 'ca-app-pub-3940256099942544/6300978111'
iosId:     'ca-app-pub-3940256099942544/2934735716'
```

`ca-app-pub-3940256099942544` is **Google's official sample publisher ID**, documented for
development only. It serves test ads and earns nothing. All six placements use variants of
it. See gap #2.

### 2.3 Interaction map

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **Placement row** | `:3905` | Opens the edit panel for that placement | ✅ |
| 2 | **Enable/disable toggle** | `:3910` | ✅ Generic key flip on `admobPlacements` | ✅ In state |
| 3 | **Save placement settings** | `:3922` | ❌ `alert('AdMob placement settings saved!')` | ❌ |
| 4 | Edit panel — close | `:3945`, `:3962` | Closes | ✅ |
| 5 | Edit panel — toggle | `:3956` | Flips the same state as #2 | ✅ |
| 6 | Edit panel — **Save** | `:3963` | ❌ Closes and alerts `'Ad Placement updated!'` | ❌ |

Toggles are real state; both save buttons are alerts.

---

## 3. Sponsors (`:3765`)

The most feature-complete surface in the console.

### 3.1 `MOCK_SPONSORS` (`:337`, 3 records)

```
id · name · logo · description · website · category · campaignName · location
creativeType ('video' | 'banner' | 'logo-text') · creativeUrl
placements { home · communityImpact · impactStories · categoryList }
startDate · endDate · status · views · clicks · color
```

| id | Sponsor | Campaign | Creative | Status | Views | Clicks |
|---|---|---|---|---|---|---|
| `SP001` | ABC Foods | Feed Tamil Nadu 2026 | **video** | Active | 12,840 | 342 |
| `SP002` | PetCare Chennai | — | banner | — | — | — |
| `SP003` | — | — | — | — | — | — |

Creative URLs point at Google's `gtv-videos-bucket` samples (`ForBiggerBlazes.mp4`) and
`example.com` websites.

### 3.2 Interaction map — list & detail

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **Status filter tabs** ×6 | `:617` state | all / active / scheduled / paused / expired / draft | ✅ |
| 2 | Sponsor card | — | Opens the detail panel | ✅ |
| 3 | ✕ close | `:3987` | Closes | ✅ |
| 4 | **Pause / Activate** | `:4004` | ✅ Real state flip — `Active ⇄ Paused` | ✅ |
| 5 | **▶ / ⏸ video** | `:4033` | ✅ **Real playback control** via a `videoRef` — `v.paused ? v.play() : v.pause()` | ✅ |
| 6 | **🔊 / 🔇 mute** | `:4038` | ✅ Per-sponsor mute state | ✅ |
| 7 | **+ Add Sponsor** | `:3835` | Opens the wizard | ✅ |

### 3.3 The sponsors list (`:4643` onward)

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 8 | **+ Add Sponsor** (list header) | `:4643` | Opens the wizard — second entry point after Overview #4 | ✅ |
| 9 | **Status filter tab ×6** | `:4671` | `setSponsorTab(t)` — all / active / scheduled / paused / expired / draft | ✅ |
| 10 | **👁 View** | `:4731` | Opens the sponsor detail panel | ✅ |
| 11 | **✏️ Edit** | `:4734` | Opens the **edit modal** with a copy: `setEditingSponsor({ ...sp })` | ✅ |
| 12 | **⏸ Pause / ▶ Activate** | `:4737` | Real status flip from the list row | ✅ |
| 13 | **🗑 Delete** | `:4741` | Removes the sponsor | ⚠️ Check for confirm |
| 14 | **📊 Analytics** | `:4747` | Opens the **per-sponsor analytics modal** | ✅ |

### 3.4 The add-sponsor wizard — 6 steps (`:4235`)

```ts
// :4235
const steps = ['Sponsor Info', 'Branding & Creative', 'Ad Content', 'Placement', 'Schedule', 'Preview'];
```

| Step | Line | Content |
|---|---|---|
| 1 | `:4274` | Sponsor Info |
| 2 | `:4297` | Branding & Creative — hosts the video upload |
| 3 | `:4379` | Ad Content |
| 4 | `:4402` | Placement |
| 5 | `:4444` | Schedule |
| 6 | `:4502` | **Preview** — and the publish-success state |

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 15 | ✕ close | `:4241` | Closes the wizard | ✅ |
| 16 | **Step chips ×6** | `:4258` | `setAddStep(n)` — jump directly to any step. Completed steps render as `done`, the current as `active` (`:4254–4255`) | ✅ |
| 17 | **Upload video** | `:4342` | ⚠️ `simulateUpload` — animates `uploadProgress` 0→100 % with a real bar. **No file picker, no upload** | ⚠️ Simulated |
| 18 | **Replace video** | `:4358` | Resets `videoUploaded` and progress | ✅ |
| 19 | **Remove video** | `:4359` | Clears `videoUploaded` | ✅ |
| 20 | **Preview mode toggle** | `:4519` | ✅ `setPreviewMode(m)` — switches the step-6 preview between **`'home'`** and **`'impact'`** placements, so the operator sees the creative in each mobile context | ✅ |
| 21 | **Publish** | `:4583` | Sets `publishDone`, swapping step 6 for a success state (`:4505`) | ✅ |
| 22 | **Done / close after publish** | `:4510` | `setShowAddSponsor(false); setPublishDone(false)` — resets for the next campaign | ✅ |
| 23 | **Cancel** | `:4582` | Closes without publishing | ✅ |
| 24 | **← Back** | `:4610` | `setAddStep(s => Math.max(1, s - 1))`, **`disabled` on step 1** | ✅ |
| 25 | **Next →** | `:4615` | `setAddStep(s => Math.min(steps.length, s + 1))`; becomes Publish on the last step | ✅ |
| — | Step counter | `:4613` | *"Step {n} of 6"* | — |

The wizard is **properly built**: bounded navigation with `Math.max`/`Math.min`, a disabled
Back on step 1, a live step counter, jump-to-step chips with done/active states, and a
post-publish success screen that resets cleanly.

### 3.5 Edit-sponsor modal (`:4854`)

| # | Element | Line | Interaction → what happens |
|---|---|---|---|
| 26 | Cancel | `:4854` | Closes, discarding edits — the copy at `:4734` means the list is untouched |
| 27 | **Save** | `:4855` | Writes the edited sponsor back to state |

Same copy-on-edit discipline as the [Admins tab](./09-admins-and-audit.md#2-interaction-map).

### 3.6 Per-sponsor analytics modal (`:4870`)

Opened by #14. `sponsorAnalyticsTarget` (`:600`) holds the sponsor; the modal shows that
campaign's metrics.

| # | Element | Line | Interaction → what happens |
|---|---|---|---|
| 28 | Close | `:4870` | Clears `sponsorAnalyticsTarget` |

Since `views` and `clicks` never increment (gap #5), this modal can only ever show the
seeded figures — 12,840 / 342 for `SP001`.

---

## 4. Mobile ↔ Admin connection

**None** — and this is the one group where both sides are substantially built.

| Admin capability | Mobile counterpart | Connected? |
|---|---|---|
| `MOCK_SPONSORS` — 3 campaigns with placements, dates, status | `ACTIVE_SPONSORS` in [`SponsorCard.js`](../mobile/23-shared-components.md#6-sponsorcard--googleadmobcard) — **2 hardcoded sponsors** | ❌ Two separate constants |
| Placement flags (`home`, `impactStories`, `categoryList`) | Mobile `<SponsorCard placement="home" />` on Dashboard, Impact Stories, Category List | ❌ **The placement names match exactly** — and nothing reads them |
| Campaign `startDate` / `endDate` | Mobile has no scheduling | ❌ Campaigns can't start or expire |
| `status: Active / Paused` | Mobile always renders its sponsors | ❌ Pausing changes nothing |
| `views` / `clicks` (12,840 / 342) | Mobile reports no impressions or clicks | ❌ Counters can never move |
| 6 AdMob placements with unit IDs | **No AdMob SDK in `apps/mobile`** | ❌ `GoogleAdMobCard` is a simulated card |

**The two sides use the same vocabulary and share no data.** Admin models `home`,
`impactStories` and `categoryList`; mobile renders `<SponsorCard>` in exactly those three
places. Wiring them is a matter of one endpoint — the shapes already agree.

### 4.1 Revenue reporting is fictional twice over

`SP001` shows 12,840 views and 342 clicks. Mobile reports no impressions, so the number
can't be real — and the AdMob units are test IDs, which earn nothing even if they did
serve. Neither the sponsor nor the ad revenue path exists.

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Sponsors never reach the app.** Mobile has its own 2-record `ACTIVE_SPONSORS` constant. | Campaigns created here are invisible; the mobile app shows two different sponsors permanently. Placement keys already match — this is the lowest-effort, highest-value integration in the console. | `GET /sponsors?placement=…`; have `SponsorCard` fetch it. |
| 2 | **AdMob unit IDs are Google's public test IDs** (`ca-app-pub-3940256099942544/…`). | Test ads only, zero revenue — and easy to ship to production unnoticed. | Replace with real unit IDs; keep test IDs behind a dev flag. |
| 3 | **Video upload is simulated** (`:4342`). An animated progress bar with no file picker and no storage. | An operator can complete the wizard believing a creative was uploaded. | Real file input + object storage. |
| 4 | **Both AdMob save buttons are alerts** (`:3922`, `:3963`). | Placement changes revert on refresh. | Persist. |
| 5 | **`views` / `clicks` can never increment.** | The only revenue metrics in the product are decorative. | Report impressions and clicks from mobile. |
| 6 | **Campaign dates do nothing.** `startDate` / `endDate` are stored; nothing schedules or expires. The filter tabs include "scheduled" and "expired" states that can't be reached automatically. | Campaigns must be paused by hand. | Derive status from dates. |
| 7 | **Placeholder creatives** — `example.com` websites and Google sample MP4s, in both the admin and the mobile constant. | Ads point nowhere. | Real assets before launch. |
| 8 | **No AdMob SDK in mobile.** | Six configured placements have no renderer; `GoogleAdMobCard` is a mock. | Integrate, or remove the tab. |
| 9 | **Monetization is more built than the core product.** A campaign wizard with video upload exists while [Report Flow](../mobile/10-report-flow-screen.md) can't save a report and [broadcasts](./05-community.md) reach nobody. | Effort allocation, not a defect — flagged for visibility. | Product decision. |

---

## 6. What works well

- **Real video playback control** (`:4033`) — a `videoRef` with genuine `play()`/`pause()`
  and per-sponsor mute state (`:4038`). Actual media handling, not a mock.
- **Pause/Activate is a real state flip** (`:4004`), correctly typed with `as const`.
- **The upload progress bar is genuinely animated** — the simulation is well built, even
  though it simulates.
- **Six status filter tabs** (`:617`) covering the full campaign lifecycle including draft
  and expired.
- **"+ Add Sponsor" from Overview** (`:3835`) navigates *and* opens the modal in one action.
- **The sponsor data model is the best in the console** — creative type, per-placement flags,
  date range, status and engagement metrics. It is production-shaped and matches the mobile
  component's props exactly.
- **Generic placement toggle** (`:3910`) — one handler for all six, same pattern as the
  settings tab.

---

## 7. QA checklist

- [ ] All four Overview buttons navigate correctly; "+ Add Sponsor" opens the wizard directly.
- [ ] AdMob toggles flip; both Save buttons show alerts only (gap #4).
- [ ] Confirm the unit IDs start `ca-app-pub-3940256099942544` — Google's test publisher (gap #2).
- [ ] Sponsor status filters narrow the list across all six states.
- [ ] Pause flips a sponsor to Paused and back.
- [ ] The sponsor video plays, pauses and mutes.
- [ ] The wizard's step chips move between steps.
- [ ] "Upload video" animates 0→100 % with **no file picker** (gap #3).
- [ ] Create a sponsor, then open the mobile app — the same two hardcoded sponsors appear (gap #1).
- [ ] Refresh — every change is gone.

---

## 8. Changing these tabs

| To change… | Edit |
|---|---|
| Sponsor data | `:337` — `MOCK_SPONSORS` |
| AdMob placements | `:577` — `admobPlacements` |
| AdMob unit IDs | `:581` — `admobUnits` |
| Sponsor status filters | `:617` — `sponsorTab` |
| Upload simulation | `simulateUpload` (called at `:4342`) |
| Mobile counterpart | `apps/mobile/src/components/SponsorCard.js:6` — `ACTIVE_SPONSORS` |

---

**Previous:** [07 — Platform & settings](./07-platform-settings.md) · **Next:** [09 — Admins & audit](./09-admins-and-audit.md)
