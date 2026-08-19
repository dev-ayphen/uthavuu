# 09 — My Helps (tab 2)

> **The user's personal queue.** Two segments: active missions in progress, and completed
> missions archived as Impact Stories.

| | |
|---|---|
| **Tab route** | `MyHelpsTab` (label **My Helps**) |
| **Source file** | `apps/mobile/src/screens/MyHelpsScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/src/navigation/MainTabs.js:70–86` |
| **Segments** | `ALL` (Active Queue) · `COMPLETED` (Impact Stories) |
| **Also reachable from** | The Profile menu — hence the conditional back arrow |
| **Data** | 2 hardcoded active helps + `IMPACT_STORIES` |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ [‹] My Helps  (2)                      │  back arrow only when deep-linked
│ Active missions & ongoing assistance…  │
│ ┌──────────────────┬─────────────────┐ │
│ │ Active Queue (2) │ Impact Stories()│ │  segmented control
│ └──────────────────┴─────────────────┘ │
├────────────────────────────────────────┤  bg #F8FAFC
│ ┌────────────────────────────────────┐ │
│ │ [🟠 Helping in Progress] 12 mins ago│ │
│ │ Bike Tyre Breakdown on ECR Highway  │ │
│ │ 🚗 Roadside Help • 📍 ECR Toll Gate │ │
│ │ ─────────────────────────────────── │ │
│ │ Posted by Karthik  [View Progress →]│ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ [🔵 Volunteer Assigned]  25 mins ago│ │
│ │ Wedding Hall Excess Food Donation   │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### 1.1 The conditional back arrow doesn't work as its comment claims

```js
// MyHelpsScreen.js:129–131
// Show a back button only when we arrived here from another screen (e.g. Profile menu).
// When accessed via the bottom tab the stack history is empty so canGoBack() returns false.
const canGoBack = navigation.canGoBack();
```

**The assumption in that comment is wrong.** `MainTabs.js` does not set `backBehavior`, so
React Navigation's bottom-tab default applies and the navigator **keeps tab history**.
`canGoBack()` therefore returns `true` on any tab reached after visiting another one — which
is every visit except a cold start on Home.

**Confirmed on device:** a screenshot of this screen with the tab bar showing **My Helps
highlighted green** — i.e. plainly reached via the tab — still renders the back arrow.

Consequences:

| Expected | Actual |
|---|---|
| Arrow appears only when pushed from the Profile menu | Arrow appears almost always |
| `goBack()` returns to Profile | `goBack()` switches to the **previously active tab** |

The idea is right; the condition doesn't distinguish the two cases. See gap #11.

---

## ⚡ Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Back arrow `‹`** | `:140` | Rendered whenever `canGoBack()` is true — which, because bottom tabs keep history, is **almost always**, including on the tab itself. Tapping it switches to the **previously active tab**, not to Profile. See §1.1 | — | `goBack()` |
| 2 | Count badge (2) | `:145` | ❌ Not tappable | — | — |
| 3 | **"Active Queue (2)" segment** | `:159` | Shows the active list. White pill slides to this side | `activeTab` → `ALL` | — |
| 4 | **"Impact Stories (n)" segment** | `:159` | Shows completed missions **and** the "Rule 10" banner | `activeTab` → `COMPLETED` | — |
| 5 | **Active card — body** (chip, title, meta, poster) | `:59` | Opens the full request | — | `RequestDetails` `{ request: item }` |
| 6 | **Active card — "View Progress →"** | `:83` | Opens the mission tracker. A nested touchable, so it **overrides** #5 when pressed | — | `VolunteerJourney` `{ request: item }` |
| 7 | Status chip (🟠/🔵) | `:66` | ❌ Not tappable — display only | — | — |
| 8 | **Completed card — body** | `:94` | Opens the story | — | `ImpactStory` `{ story }` |
| 9 | **Completed card — "♥ View Story"** | `:118` | ❌ **Same destination as #8** — duplicate action on one card | — | `ImpactStory` `{ story }` |
| 10 | Completed card thumbnail | `:108` | ❌ Not separately tappable — inherits #8 | — | `ImpactStory` |
| 11 | "Rule 10" banner | `:179` | ❌ Not tappable | — | — |
| 12 | Pull to refresh | — | ❌ Nothing — no `RefreshControl` | — | — |

> One active card has **two** different destinations depending on where you press; one
> completed card has **the same** destination from two places.

---

## 2. Data

### 2.1 Active helps (`MyHelpsScreen.js:15–51`)

Two hardcoded entries.

| Field | `active_1` | `active_2` |
|---|---|---|
| `status` | `HELPING_NOW` | `ACCEPTED` |
| `statusLabel` | 🟠 Helping in Progress | 🔵 Volunteer Assigned |
| `statusBg` / `statusColor` | `#FEF3C7` / `COLORS.warning` | `#DBEAFE` / `COLORS.secondaryBlue` |
| `title` | Bike Tyre Breakdown on ECR Highway | Wedding Hall Excess Food Donation |
| `category` | 🚗 Roadside Help | 🍱 Food Donation |
| `location` | ECR Toll Gate, 3rd Km | Royal Palace Hall, 2nd Avenue |
| `distance` | 2.1 km away | 1.4 km away |
| `time` | Assigned 12 mins ago | Accepted 25 mins ago |
| `poster` | Karthik | Anand |
| `image` | `roadside_help.png` | `wedding_food.png` |
| `lat` / `lng` | 12.8996 / 80.2209 | 13.0604 / 80.2496 |
| extra | `volunteers: 2`, `urgency: 'HIGH'`, `progressStatus`, `desc` | — |

The two objects have **different shapes** — `active_1` carries `desc`, `volunteers`,
`urgency`, `urgencyColor` and `progressStatus`; `active_2` doesn't. Any consumer has to
handle both.

> `active_1` is the same mission as the Dashboard's always-on banner
> ([08 §4](./08-dashboard-screen.md#4-active-mission-banner)) — but that banner builds its
> **own** object literal with a different shape. Same mission, two sources of truth.

### 2.2 Completed helps

Reuses `IMPACT_STORIES`, imported from `./ImpactStoryScreen` (`:8`) — the same
screen-file-as-data-module pattern flagged in
[08 gap #8](./08-dashboard-screen.md#9-gaps--known-issues).

### 2.3 Images

```js
const injuredDogImg   = require('../assets/injured_dog.png');    // ⚠️ never used
const weddingFoodImg  = require('../assets/wedding_food.png');
const roadsideHelpImg = require('../assets/roadside_help.png');
```

| Asset | Used? |
|---|---|
| `apps/mobile/src/assets/injured_dog.png` | ❌ Required at `:10`, referenced nowhere |
| `apps/mobile/src/assets/wedding_food.png` | ⚠️ Assigned to `active_2.image` |
| `apps/mobile/src/assets/roadside_help.png` | ⚠️ Assigned to `active_1.image` |

The active cards **never render `item.image`** — only completed cards show a thumbnail
(`story.afterImage`). So all three PNGs are bundled and none is displayed on this screen.

---

## 3. Visual specification

From `MyHelpsScreen.js:195–250`.

### 3.1 Header & segments

| Element | Spec |
|---|---|
| Header | bg `#FFFFFF`, `paddingHorizontal: 16`, bottom border `1` `#E5E7EB` |
| Title | `17` / `700` / `#111827` |
| Count badge | bg `#F8FAFC`, radius `10`, text `11`/`700`/`#6B7280` — shows `activeHelps.length` |
| Subtitle | `12` / `#6B7280` — "Active missions & ongoing assistance queue" |
| Segment track | bg `#F1F5F9`, radius `10`, padding `3` |
| Segment — inactive | text `11`/`600`/`#6B7280` |
| Segment — **active** | bg `#FFFFFF`, radius `8`, shadow `0.05`/`3`, text `#111827`/`700` |

iOS-style segmented control — the active pill is a white card on a grey track.

### 3.2 Card (shared by both segments)

| Element | Spec |
|---|---|
| Card | bg `#FFFFFF`, radius `16`, padding `14`, `marginBottom: 12`, border `1` `#E2E8F0`, shadow `0.03`/`6`/`0,2` |
| Status chip | radius `6`, `paddingHorizontal: 8`, text `11`/`700` — colours come from the data |
| Time | `11` / `#6B7280` |
| Title | `15` / `700` / `#111827` / `lineHeight: 20` |
| Meta row | category `12`/`600`, `•` divider, `MapPin` 12, location `12` (truncates) |
| Footer | top border `1` `#F1F5F9`, `paddingTop: 10` |
| Poster | `12` / `600` / `#111827` |
| "View Progress →" | bg `#F8FAFC`, border `1` `#CBD5E1`, radius `8`, text `12`/`700`/`#111827` |

### 3.3 Completed card extras

| Element | Spec |
|---|---|
| Status chip | bg `#F0FDF4`, text `#16A34A` — `✓ Resolved & Archived` |
| Thumbnail | `56 × 56`, radius `10`, `resizeMode="cover"` — `story.afterImage` |
| Helper line | `11` / `600` / `#16A34A` — "Helped by {helper}" |
| Quote | `11` italic `#6B7280`, single line — `"{shortDesc}"` |
| "View Story" | bg `#F0FDF4`, border `#BBF7D0`, filled `Heart` 12 green, text `12`/`700`/`#16A34A` |

---

## 4. Functionality

### 4.1 State

```js
const [activeTab, setActiveTab] = useState('ALL');
```

One piece of state. Segment labels carry live counts:
`Active Queue (2)` / `Impact Stories (n)`.

### 4.2 Navigation targets

| Tap target | Goes to | Params |
|---|---|---|
| Active card body | `RequestDetails` | `{ request: item }` |
| Active card "View Progress →" | `VolunteerJourney` | `{ request: item }` |
| Completed card body | `ImpactStory` | `{ story }` |
| Completed card "View Story" | `ImpactStory` | `{ story }` |

The active card is a `TouchableOpacity` containing another one — pressing the button fires
only the button's handler, so one card leads to two different screens depending on where
you tap.

### 4.3 The "Rule 10" banner

On the COMPLETED segment only, a mint notice renders above the list:

> 🌟 **Rule 10: Completed missions are archived in Profile & Community Feed**

This is internal specification language — "Rule 10" refers to the numbered business rules
in `apps/mobile/FUNCTIONAL_FLOW.md` — shown verbatim to end users. See gap #1.

---

## 5. Mobile ↔ Admin web connection

**None.** Both lists are static.

This screen is the user-facing half of mission lifecycle management; the admin console is
the other half. The `status` values here (`HELPING_NOW`, `ACCEPTED`) are the beginnings of
the state machine described in `FUNCTIONAL_FLOW.md §3`, but nothing transitions them — no
`COMPLETED`, `CANCELLED` or `EXPIRED` is ever produced by this screen.

Expected once wired:

| Element | Endpoint | Admin counterpart |
|---|---|---|
| Active queue | `GET /users/me/missions?status=active` | Mission assignment view |
| Completed | `GET /users/me/missions?status=completed` | Story moderation queue |
| Status chips | Mission state machine | Admin can force-close or reassign |

The admin dashboard already tracks `helps`, `completedHelps` and `cancelledHelps` per
user — those counters are exactly what this screen would feed.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Internal spec language leaks into the UI.** "🌟 Rule 10: Completed missions are archived in Profile & Community Feed" (`:181`). | Users see a reference to an internal rule number they cannot interpret. It reads like a developer note left in the build. | Rewrite as plain user copy, or remove the banner. |
| 2 | **No empty state.** The ALL segment is gated on `activeHelps.length > 0` (`:173`) with no `else`. | A user with no active missions — the normal case for a new user — sees a blank screen below the segments. No message, no CTA. | Add an empty state with a "Find help requests nearby" button back to the Dashboard. |
| 3 | **`totalCount` is computed and never used** (`:56`). | Dead code; suggests a combined badge was planned. | Remove, or show it. |
| 4 | **Unused imports:** `ChevronRight` and `Image as ImageIcon` (`:6`), plus `injuredDogImg` (`:10`). | Dead weight — and the unused `require` still bundles an 881 KB PNG. | Remove all three. |
| 5 | **Active cards never show their image.** `item.image` is set on both records but no `<Image>` renders it — **confirmed on device**: both active cards are text-only, while completed cards carry a 56 dp thumbnail. | Two large PNGs bundled for nothing, and the two segments look structurally different. | Either render the thumbnail on active cards too, or drop `image` from the data. |
| 6 | **Inconsistent record shapes.** `active_1` has `desc`, `volunteers`, `urgency`, `urgencyColor`, `progressStatus`; `active_2` has none. | `RequestDetails` and `VolunteerJourney` must defensively handle both, and `active_2` silently falls back to defaults. | Define one record shape and fill every field. |
| 7 | **Styling lives in the data.** `statusBg` and `statusColor` are stored per record (`:20–21`, `:40–41`). | When an API replaces this array, the server would have to send hex codes. | Map `status` → style in the component: `STATUS_STYLES[item.status]`. |
| 8 | **`active_1` is duplicated across screens** with a different shape than the Dashboard banner's literal. | Two definitions of one mission drift independently. | Single source in `src/data/`. |
| 9 | **Nothing marks progress.** `status`, `progressStatus` and `time` are frozen strings. | The Active Queue never changes. | Requires the mission API. |
| 10 | **`lat`/`lng` carried but unused here.** | Harmless, but no map preview despite having coordinates. | Use them, or drop them. |
| 11 | **The back arrow shows on the tab, contradicting its own comment** (`:129–131`). `MainTabs.js` sets no `backBehavior`, so the tab navigator keeps history and `canGoBack()` is `true` on any tab visited after another. Verified on device — the arrow renders with My Helps active in the tab bar. | A back arrow appears on a root tab screen, and tapping it silently switches tabs rather than returning anywhere the user recognises. No other tab screen has one, so it also looks inconsistent. | Pass an explicit param when pushing from Profile (`navigate('MyHelpsTab', { fromProfile: true })`) and gate the arrow on that, rather than on `canGoBack()`. |

---

## 6A. What works well

- **The back arrow is conditional** (`:130–139`) — `canGoBack()` is checked before rendering
  it, and the intent is documented in a comment. ⚠️ See gap #11: because bottom tabs retain
  history, `canGoBack()` is usually `true` even on the tab, so the arrow shows when it
  shouldn't. **The guard is right; the condition is too weak** — the fix is checking whether
  this screen was pushed, not whether any history exists.
- **Active and completed helps are separated**, so the queue only ever shows what still needs
  action — the behaviour Rule 13 specifies, implemented correctly.
- **Each card states the mission's stage**, so the list is scannable without opening rows.

---

## 7. QA checklist

- [ ] Opening via the tab shows **no** back arrow; opening from Profile shows one.
- [ ] The count badge reads 2 and matches the Active Queue segment label.
- [ ] Switching segments swaps the list and moves the white pill.
- [ ] Active card body opens Request Details; "View Progress →" opens Volunteer Journey.
- [ ] Completed cards render the `afterImage` thumbnail at 56 dp without distortion.
- [ ] The "Rule 10" banner appears only on the Impact Stories segment (gap #1).
- [ ] Long titles wrap to two lines without pushing the footer out of the card.
- [ ] The last card clears the tab bar (100 dp bottom padding).
- [ ] With an empty active list, something sensible renders (blocked by gap #2).

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Active helps data | `MyHelpsScreen.js:15–51` |
| Completed helps source | `:8` — the `IMPACT_STORIES` import |
| Segment labels/counts | `:155–157` |
| Status chip colours | Per-record `statusBg` / `statusColor` — see gap #7 |
| "Rule 10" banner | `:178–184` |
| Card styling | `styles.card` (`:217–221`) |

---

**Previous:** [08 — Dashboard](./08-dashboard-screen.md) · **Next:** [10 — Report Flow](./10-report-flow-screen.md)
