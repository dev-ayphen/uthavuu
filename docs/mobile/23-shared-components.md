# 23 — Shared components

> The six reusable components in `apps/mobile/src/components/`. Every one is live — none is
> dead code.

| | |
|---|---|
| **Location** | `apps/mobile/src/components/` |
| **Line refs valid as of** | 2026-08-18 |
| **Total** | 6 components, 1,048 lines |

---

## Index

| Component | Lines | Exports | Used by |
|---|---|---|---|
| [`ExpiryBadge`](#1-expirybadge) | 61 | default | Category List, `MissionSummary` |
| [`ExpiryPicker`](#2-expirypicker) | 187 | default | Report Flow |
| [`ExpiredNotice`](#3-expirednotice) | 66 | default | Category List |
| [`MissionSummary`](#4-missionsummary--missioncontrols) | 207 | default + `MissionControls` | Request Details |
| [`VolunteerRoster`](#5-volunteerroster) | 89 | default | Request Details |
| [`SponsorCard`](#6-sponsorcard--googleadmobcard) | 438 | `ACTIVE_SPONSORS`, `SponsorCard`, `GoogleAdMobCard` | Dashboard, Impact Stories, Category List |

---

## 1. `ExpiryBadge`

**`ExpiryBadge({ minutesLeft, adminManaged, compact })`** — a countdown pill whose tone
escalates as a request's help window closes.

| Prop | Type | Meaning |
|---|---|---|
| `minutesLeft` | number | Remaining window; `0` means expired |
| `adminManaged` | bool | Renders "Managed by admin" instead of a countdown |
| `compact` | bool | Smaller variant for list cards |

Tone map at `:44–49` — slate → amber → red as time runs down. Formatting comes from
`formatRemaining` in [`utils/expiry.js`](./24-utils-and-dead-code.md#1-expiryjs-114-lines--live).

**Interaction:** none — display only.

**Used at:** `CategoryListScreen.js:519` (each request card), and nested inside
`MissionSummary.js:5`.

---

## 2. `ExpiryPicker`

**`ExpiryPicker({ category, value, onChange })`** — a collapsible chooser for the
"expected help window" that offers **only the durations the selected category allows**.

Reads `getExpiryRule(category)` and renders that rule's `options`, never exceeding
`maxMinutes`. For `adminManaged` categories (disaster relief) it shows a note instead of
choices.

**Interaction:**

| Element | Tap → what happens |
|---|---|
| Collapsed row | Expands to show the allowed durations |
| Duration option | Calls `onChange(minutes)` |
| Admin-managed note | Not tappable — no choice offered |

**Used at:** `ReportFlowScreen.js:211`. This is the component behind
[10 — Report Flow](./10-report-flow-screen.md#4-the-expiry-system)'s only working
validation.

---

## 3. `ExpiredNotice`

**`ExpiredNotice({ reason, onRepost, onArchive })`** — replaces a card's normal actions once
its help window has closed, on the reporter's own post.

| Prop | Meaning |
|---|---|
| `reason` | Why it closed — Category List passes either *"Not resolved before the help window closed"* or *"No volunteer accepted in time"* depending on whether anyone had joined |
| `onRepost` | Primary action |
| `onArchive` | Secondary action |

**Interaction:**

| Element | Tap → what happens |
|---|---|
| **Repost** | Calls `onRepost` — ⚠️ Category List passes an `alert()` stub (`:558`) |
| **Archive** | Calls `onArchive` — ⚠️ also a stub |

The component is written correctly; both callbacks handed to it are placeholders. See
[13 gap #4](./13-category-list-screen.md#7-gaps--known-issues).

**Used at:** `CategoryListScreen.js:554`.

---

## 4. `MissionSummary` + `MissionControls`

Two exports from one file (`MissionSummary.js`).

### `MissionSummary` (default)

A live mission strip: needed vs joined, a progress bar, and a per-stage breakdown
**filtered to non-zero stages only** — so empty states don't clutter the row. Stage labels
at `:135–140`; counts come from `missionBreakdown` in
[`utils/missions.js`](./24-utils-and-dead-code.md#2-missionsjs-49-lines--live).

### `MissionControls` (named)

The viewer's own join / advance / leave buttons, driven by `nextAction()` from the same
util — so the button label always reflects the user's actual stage in the mission.

**Interaction:**

| Element | Tap → what happens |
|---|---|
| Join / advance | Advances the viewer's volunteer status |
| Leave | Removes the viewer from the roster |

**Used at:** `RequestDetailsScreen.js:488–508`.

> ⚠️ Request Details never calls `setVolunteers`, `setJoinedCount` or `setTotalNeeded`
> ([14 gap #5](./14-request-details-screen.md#5-gaps--known-issues)), so these controls
> render correctly but the roster they act on is immutable.

---

## 5. `VolunteerRoster`

**`VolunteerRoster({ volunteers })`** — avatar, name and status chip for everyone on a
mission.

Tone map at `:53–57`. A deliberate design decision: **"Left mission" renders neutral grey,
not as a failure state** — dropping out is treated as normal, not as a fault.

**Interaction:** none — display only. Individual volunteers aren't tappable, so there is no
route to another user's profile anywhere in the app.

**Used at:** `RequestDetailsScreen.js:512`.

---

## 6. `SponsorCard` + `GoogleAdMobCard`

The monetisation layer — 438 lines, the largest component.

### Exports

| Export | Signature | Purpose |
|---|---|---|
| `ACTIVE_SPONSORS` | array | 2 sponsor records |
| `SponsorCard` | `({ placement, style })` | Picks a sponsor by placement and renders its creative |
| `GoogleAdMobCard` | `({ style })` | Simulated AdMob video placement |

### `ACTIVE_SPONSORS` (`:6–35`)

| id | Sponsor | Category | Creative |
|---|---|---|---|
| `SP001` | ABC Foods | Food Donation | **video** |
| `SP002` | PetCare Chennai | Animal Rescue | banner |

Every record uses placeholder assets: `example.com` CTA URLs, Unsplash logos, and Google's
public `gtv-videos-bucket` sample MP4. `ADMOB_VIDEO_URL` (`:37`) is the
`ElephantsDream.mp4` sample.

### Real video playback

`SponsorCard` uses **`expo-video`** — a genuine dependency (`package.json`, `expo-video ^57.0.2`)
that actually plays the creative. It is one of the few real device integrations in the app,
alongside `expo-clipboard` and `Linking`.

**Interaction:**

| Element | Tap → what happens |
|---|---|
| Sponsor card CTA | Opens the sponsor's `ctaUrl` — currently `example.com` |
| Video | Plays via `expo-video` |
| AdMob card | Simulated — no AdMob SDK is installed |

**Used at:**

| Screen | Line | Placement |
|---|---|---|
| Dashboard | `:230` | `placement="home"` |
| Impact Stories | `:46` | list |
| Category List | `:485` | list |
| Dashboard (AdMob) | `:271` | `<GoogleAdMobCard />` |

> The admin console has a full sponsor-campaign manager — `MOCK_SPONSORS`
> (`admin/dashboard/page.tsx:337`) with creative types, placements, dates, status and
> view/click counters, plus AdMob unit ids for Android and iOS (`:577`). **None of it
> reaches the app**: `ACTIVE_SPONSORS` is a local constant, and no impression or click is
> ever reported back, so the admin's view/click metrics can never be real.

---

## 7. Cross-cutting notes

| Observation | Detail |
|---|---|
| **All six are live** | Unlike `utils/savedStore.js` and `MapScreen.js`, every component here is imported and rendered |
| **Presentation constants are colocated** | `TONE` maps in `ExpiryBadge` and `VolunteerRoster`, `LABELS` in `MissionSummary` — a better pattern than the styling-in-data used by [09](./09-my-helps-screen.md) and [18](./18-mission-journal-screen.md) |
| **Props-only** | None reads context directly; all state arrives via props, so they're testable in isolation |
| **The expiry trio is coherent** | `expiry.js` → `ExpiryPicker` (set) → `ExpiryBadge` (display) → `ExpiredNotice` (aftermath) is the most complete feature slice in the codebase |

---

## 8. Gaps

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Sponsor data is a local constant.** `ACTIVE_SPONSORS` never comes from the server. | Campaigns can't be scheduled, paused or targeted despite the admin console offering all three. | `GET /sponsors?placement=…` |
| 2 | **No impression or click tracking.** | The admin's `views`/`clicks` columns can never populate. | Report events. |
| 3 | **Placeholder creatives everywhere** — `example.com`, Unsplash, Google sample videos. | Ads ship pointing at nothing. | Real assets before launch. |
| 4 | **AdMob is simulated.** No AdMob SDK; the ad unit ids in the admin console are unused. | No revenue path. | Integrate, or remove the UI. |
| 5 | **`ExpiredNotice` callbacks are stubs at the call site.** | Repost/Archive don't work — a component-consumer problem, not a component bug. | See [13 gap #4](./13-category-list-screen.md#7-gaps--known-issues). |
| 6 | **Volunteers aren't tappable** in the roster. | No way to view another user's profile anywhere in the app. | Product decision. |

---

**Previous:** [22 — Invite Friends](./22-invite-friends-screen.md) · **Next:** [24 — Utils & dead code](./24-utils-and-dead-code.md)
