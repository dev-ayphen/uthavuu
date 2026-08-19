# 08 — Dashboard (Home tab)

> **The app's landing screen.** A dark slate header with live stats, then a scrolling body:
> active-mission banner, an 8-category grid, a sponsor slot, community impact stories and
> an ad slot. Two bottom-sheet modals control search radius and location.
>
> The busiest screen in the app — 728 lines.

| | |
|---|---|
| **Tab route** | `DashboardTab` (label **Home**) |
| **Source file** | `apps/mobile/src/screens/DashboardScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/src/navigation/MainTabs.js:53–69` |
| **Header** | Custom in-screen (navigator header is hidden) |
| **Data** | 100 % hardcoded — see §7 |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ Good Morning, Hari 👋          🔔•  H  │  ← slate #1E293B, full-bleed
│ 📍 Velachery, Chennai  [📍 5 km ⚙]     │     tap location → radius sheet
│ ┌────────────────────────────────────┐ │
│ │  60   │  13   │  18   │   2,340    │ │  stats strip, rgba(0,0,0,0.15)
│ │Need Help│Urgent│Active│  Helped    │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤  ← body, bg #F8FAFC
│ ┌────────────────────────────────────┐ │
│ │ 🌍 Exploring <city>   [Reset GPS]  │ │  only when isExploring
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ ● ACTIVE MISSION IN PROGRESS [LIVE]│ │  ⚠️ always rendered
│ │   Bike Tyre Breakdown on ECR…    → │ │
│ └────────────────────────────────────┘ │
│ Help Requests Nearby      [8 Categories]│
│ ● Within 5 km · Velachery, Chennai      │
│ ┌───────────┐ ┌───────────┐            │
│ │ 🐶    [3] │ │ ❤️    [2] │            │  2-col grid, 47.8 % wide
│ │ Animal    │ │ Medical   │            │
│ │ 12 Active │ │ 5 Active  │            │
│ │ View →    │ │ View →    │            │
│ └───────────┘ └───────────┘            │
│           … 8 cards total …            │
│ ┌────────────────────────────────────┐ │
│ │        SponsorCard (video)         │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ ♥ Community Impact      View All → │ │
│ │  ▸ 3 story rows                    │ │
│ │  [ View All Success Stories → ]    │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │       GoogleAdMobCard              │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

The root is a plain `View`; the header and the body each get their **own** `SafeAreaView`
so the slate colour bleeds into the status-bar area with no white gap
(`DashboardScreen.js:67`, `:124`). `scrollContent` has `paddingBottom: 110` to clear the
80 dp tab bar.

---

## ⚡ Interaction map — every tap target

The busiest screen in the app: **24 distinct tap targets** across the body and two modals.

### Header

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Location row** (pin + city + km pill) | `:72` | Opens the radius bottom sheet | `radiusModalOpen` → true | — |
| 2 | **Bell button** | `:88` | Switches to the Alerts tab. The red dot **does not clear** | — | `AlertsTab` |
| 3 | **Avatar "H"** | `:92` | Switches to the Profile tab | — | `ProfileTab` |
| 4 | Greeting text | `:71` | ❌ Nothing | — | — |
| 5 | Stats strip (60 / 13 / 18 / 2,340) | `:99` | ❌ Not tappable — no drill-down | — | — |

### Body

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 6 | **"Reset GPS"** (exploring banner) | `:141` | Returns to the home city and exits exploring mode — banner disappears, header text turns white again | `customCity`, `isExploring` → false | — |
| 7 | **Active mission banner** | `:152` | Opens the mission tracker with a **hardcoded** request object built inline (`active_1`, ECR bike tyre). Every user sees this | — | `VolunteerJourney` `{ request: {...} }` |
| 8 | "LIVE" chip / green dot | `:166–171` | ❌ Not tappable — decoration | — | — |
| 9 | **Category card ×8** | `:199` | Opens that category's request list, carrying the current search settings | — | `CategoryList` `{ category, selectedRadius, customCity, isExploring }` |
| 10 | Urgent badge on a card | `:211` | ❌ Not separately tappable — inherits #9 | — | — |
| 11 | "8 Categories" badge | `:191` | ❌ Nothing | — | — |
| 12 | **Sponsor card** | `:230` | Handled inside `SponsorCard` — plays an `expo-video` creative and exposes a CTA to the sponsor's URL | — | External |
| 13 | **"View All →"** (impact header) | `:239` | Opens the stories list | — | `ImpactStories` |
| 14 | **Story row ×3** | `:245` | Opens that story in full — passes the **whole** object ✅ | — | `ImpactStory` `{ story }` |
| 15 | **"View All Success Stories"** | `:261` | ❌ **Same destination as #13** | — | `ImpactStories` |
| 16 | **AdMob card** | `:271` | Simulated Google AdMob video placement | — | — |
| 17 | Pull to refresh | — | ❌ Nothing — no `RefreshControl` | — | — |

### Radius bottom sheet (opened by #1)

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 18 | Scrim (outside the sheet) | `:282` | Closes the sheet | `radiusModalOpen` → false |
| 19 | **Radius button ×4** (1 / 3 / 5 / 10 km) | `:296` | Sets the radius **and closes immediately** — no confirm step | `selectedRadius`, `radiusModalOpen` |
| 20 | **"🌍 Explore Another Location"** | `:312` | Closes this sheet, then opens the location sheet **300 ms later** via `setTimeout` | `radiusModalOpen` → false, then `exploreOtherOpen` → true |
| 21 | "Done" | `:323` | Closes the sheet | `radiusModalOpen` → false |

### Location sheet (opened by #20)

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 22 | Scrim | `:340` | Closes | `exploreOtherOpen` → false |
| 23 | Search field | `:355` | Filters **Popular Areas only** — Recent Locations are never filtered, and there is no geocoding | `locationSearchQuery` |
| 24 | **"Use My Current Location (GPS)"** | `:365` | ❌ **Reads no GPS.** Sets the literal string `'Velachery, Chennai'` and exits exploring mode | `customCity`, `isExploring` → false |
| 25 | **Recent location ×2** | `:377` | Selects it; exploring mode turns on unless it's the home city | `customCity`, `isExploring` |
| 26 | **Popular area ×5** | `:390` | Selects `"{area}, Tamil Nadu"` and turns exploring mode **on** | `customCity`, `isExploring` → true |
| 27 | "Cancel" | `:401` | Closes without changing anything | `exploreOtherOpen` → false |

### What "exploring mode" changes

Turning `isExploring` on (via #25/#26) alters four things at once:

1. A sky-blue notice banner appears above the mission banner
2. The header location text and pin turn `#38BDF8` and gain a 🌍 prefix
3. The section title becomes "Help Requests in {city}"
4. The GPS dot beside the sub-line turns `#0284C7`

It is switched off by #6 or #24 only.

---

## 2. Header

Background `#1E293B` (slate-800) — the only dark surface in the app.

| Element | Spec |
|---|---|
| Greeting | `12` / `500` / `rgba(255,255,255,0.85)` — **`Good Morning, Hari 👋`**, hardcoded |
| Location text | `14` / bold / `#FFFFFF`; turns `#38BDF8` + `700` while exploring |
| Radius pill | `rgba(255,255,255,0.2)` bg, radius `10`, text `11`/`700` white, `SlidersHorizontal` 10 |
| Bell button | `36 × 36` circle, `rgba(255,255,255,0.18)`, `Bell` 18 white |
| Bell dot | `8 × 8`, `#FCA5A5`, `1.5` ring `#1E293B` — **always visible** |
| Avatar badge | `36 × 36` circle, `rgba(255,255,255,0.25)`, `2` border `rgba(255,255,255,0.5)`, letter **`H`** hardcoded |

Tapping the location row opens the radius sheet. The bell goes to `AlertsTab`, the avatar
to `ProfileTab` — both tab-to-tab jumps.

### 2.1 Stats strip

Four cells in a `rgba(0,0,0,0.15)` box, radius `14`, divided by 1 dp `rgba(255,255,255,0.25)`
rules. Numbers `16`/`700` white; labels `9`/`rgba(255,255,255,0.8)`.

| Cell | Value | Source |
|---|---|---|
| Need Help | **60** | `categoryData.reduce(…activeCount)` — computed |
| Urgent | **13** | `categoryData.reduce(…urgentCount)` — computed |
| Active Vols. | **18** | Hardcoded literal in JSX (`:111`) |
| Helped | **2,340** | Hardcoded literal in JSX (`:116`) |

Two of the four are derived from the category array; two are string constants. Nothing is
live.

### 2.2 Status-bar handling — done correctly

```js
// DashboardScreen.js:41–50
useFocusEffect(React.useCallback(() => {
  StatusBar.setBarStyle('light-content');
  if (Platform.OS === 'android') StatusBar.setBackgroundColor('#1E293B');
  return () => {
    StatusBar.setBarStyle('dark-content');
    if (Platform.OS === 'android') StatusBar.setBackgroundColor('#FFFFFF');
  };
}, []));
```

Because this screen stays mounted when a stack screen is pushed over it, the light status
bar is scoped to focus and reverted on blur. The in-file comment explains exactly that.
**This is the right pattern** — worth copying to any other dark screen.

---

## 3. Category grid

Eight cards from `categoryData` (`DashboardScreen.js:12–21`) — all counts hardcoded.

| id | Title | Icon | Active | Urgent |
|---|---|---|---|---|
| `animal` | Animal Rescue | 🐶 | 12 | 3 |
| `medical` | Medical Help | ❤️ | 5 | 2 |
| `food` | Food Donation | 🍱 | 8 | 1 |
| `roadside` | Roadside Help | 🚗 | 14 | 4 |
| `elderly` | Elderly Support | 👴 | 3 | 0 |
| `blood` | Blood Donation | 🩸 | 2 | 2 |
| `disaster` | Disaster Relief | 🌧 | 6 | 1 |
| `community` | Community Help | 🤝 | 10 | 0 |

> The 9th category (🔍 Lost & Found) exists only inside the report wizard, not here.

### 3.1 Card spec

| Element | Spec |
|---|---|
| Card | `width: '47.8%'`, bg `#FFFFFF`, radius `16`, padding `13`, border `1` `#E5E7EB`, shadow `0.04`/`6`, elevation `2` |
| Grid | `flexWrap`, `gap: 12`, `marginBottom: 20` |
| Icon box | `40 × 40`, radius `12`, bg `#F3F4F6`, emoji at `20` |
| Urgent badge | bg `#FEE2E2`, radius `8`, `5 × 5` `#EF4444` dot + count `11`/bold/`#DC2626` — only when `urgentCount > 0` |
| Title | `13` / bold / `#111827` |
| Active count | `11` / `500` / `#6B7280` |
| Footer | top border `1` `#F3F4F6`, "View" `12`/bold/`#16A34A` + `ArrowRight` 13 |

Deliberately uniform — the in-file comment notes *"no per-card color, all white"*. The
emoji is the only differentiator.

Tapping a card:

```js
navigation.navigate('CategoryList', { category: cat, selectedRadius, customCity, isExploring });
```

Radius and location travel to the next screen as params.

---

## 4. Active mission banner

```jsx
// DashboardScreen.js:152–178
<TouchableOpacity onPress={() => navigation.navigate('VolunteerJourney', {
  request: { id: 'active_1', title: 'Bike Tyre Breakdown on ECR Highway',
             category: '🚗 Roadside Help', location: 'ECR Toll Gate, 3rd Km',
             distance: '2.1 km away', poster: 'Karthik' }
})}>
```

Mint card (`#F0FDF4`, border `#BBF7D0`) with a green dot, an `ACTIVE MISSION IN PROGRESS`
tag at `10`/`800`, a `LIVE` chip, the mission title and the sub-line
*"Reached location • Click to update status or complete mission"*.

**It has no condition around it.** Every user sees this banner on every launch, with the
same fabricated mission, and tapping it opens the Volunteer Journey for a mission they
never accepted. See gap #2.

---

## 5. Radius & location modals

### 5.1 Radius sheet

Opened by tapping the location row. Bottom sheet, `rgba(15,23,42,0.65)` scrim, white sheet
with top corners `24`, a `36 × 4` grab handle.

| Element | Spec |
|---|---|
| Title | `📍 Nearby Search Radius` · `17`/`800`/`#0F172A` |
| Options | `1`, `3`, `5`, `10` km — `flex: 1` buttons, radius `14` |
| Option — inactive | bg `#F8FAFC`, border `1.5` `#E2E8F0`, text `#475569` |
| Option — **active** | bg + border `#16A34A`, white text, white `Check` 14 |
| Explore button | `🌍 Explore Another Location` — mint `#F0FDF4`, border `#BBF7D0`, `Compass` 16 |
| Done | bg `#F1F5F9`, text `#475569` |

Default radius is **5 km** (`useState(5)`). Selecting a value closes the sheet immediately.

### 5.2 Explore-another-location sheet

Opened from the radius sheet via a chained timeout:

```js
// DashboardScreen.js:314–317
setRadiusModalOpen(false);
setTimeout(() => setExploreOtherOpen(true), 300);
```

Contents:

| Section | Detail |
|---|---|
| Search box | `Search` 16 + `TextInput`, 44 dp, placeholder "Search city, area or PIN code…" |
| GPS button | `Use My Current Location (GPS)` — teal `#F0FDFA`/`#0D9488`, resets to `Velachery, Chennai` |
| RECENT LOCATIONS | `Velachery, Chennai`, `Adyar, Chennai` |
| POPULAR AREAS | `Chennai`, `Madurai`, `Coimbatore`, `Trichy`, `Salem` |
| List | `maxHeight: 260`, scrollable |
| Cancel | bg `#F1F5F9` |

Search filters **only** `POPULAR_AREAS`:

```js
const filteredPopular = POPULAR_AREAS.filter(area =>
  area.toLowerCase().includes(locationSearchQuery.toLowerCase()));
```

Recent locations are never filtered, and there is no geocoding — typing a PIN code
matches nothing. See gap #5.

### 5.3 Exploring mode

Selecting a non-home location sets `isExploring = true`, which changes four things:

1. A sky-blue notice banner appears at the top of the scroll (`#E0F2FE` / `#BAE6FD`).
2. The header location text and pin turn `#38BDF8` and gain a 🌍 prefix.
3. The section title becomes `Help Requests in {customCity}`.
4. The GPS dot next to the sub-line turns `#0284C7`.

The banner's body text hardcodes the home location:
*"You are in **Velachery, Chennai**. Showing help requests within {radius} km of selected
location."* — see gap #4.

---

## 6. Other sections

| Section | Component | Notes |
|---|---|---|
| Sponsor slot | `<SponsorCard placement="home" />` | From `src/components/SponsorCard.js` — documented separately |
| Community Impact | inline | Renders `IMPACT_STORIES.slice(0, 3)` |
| Ad slot | `<GoogleAdMobCard />` | Same module as `SponsorCard` |

`IMPACT_STORIES` is imported **from a screen file** —
`import { IMPACT_STORIES } from './ImpactStoryScreen'` (`:9`). Shared data living in a
screen module is a structural smell; it belongs in `src/data/` or `libs/shared`. See gap #8.

Each story row: `36` circle `#F1F5F9` with the story emoji, title `13`/`600` (single line),
meta `By {helper} • {completedAt}`, chevron. Tapping opens `ImpactStory` with the story
object; both "View All" affordances open `ImpactStories`.

---

## 7. Data inventory — what is real

| Data | Value | Real? |
|---|---|---|
| Greeting name | `Hari` | ❌ Hardcoded string |
| Avatar letter | `H` | ❌ Hardcoded string |
| Time-of-day | Always "Good Morning" | ❌ Not computed |
| Need Help / Urgent | 60 / 13 | ⚠️ Computed from hardcoded array |
| Active Vols. / Helped | 18 / 2,340 | ❌ Hardcoded in JSX |
| Category counts | 12, 5, 8, 14, 3, 2, 6, 10 | ❌ Hardcoded array |
| Current location | `Velachery, Chennai` | ❌ No GPS — `expo-location` isn't installed |
| Active mission | ECR bike tyre breakdown | ❌ Hardcoded, always shown |
| Impact stories | `IMPACT_STORIES` | ❌ Static module |

**Nothing on this screen reflects reality.** Most importantly, the greeting ignores the
profile the user just filled in — this screen never calls `useUser()`.

---

## 8. Mobile ↔ Admin web connection

**None.** Every number is a literal.

This is the screen with the most obvious admin dependency. The admin dashboard
(`apps/web/src/app/admin/dashboard/page.tsx`) already models the same domain — categories,
active/urgent counts, volunteers, completed helps — from its own separate mock data. The
two sets of numbers were written independently and do not agree.

What should flow, once a backend exists:

| Dashboard element | Endpoint | Admin counterpart |
|---|---|---|
| Category counts | `GET /requests/summary?lat&lng&radius` | Reports by category |
| Need Help / Urgent | same response | Open + urgent totals |
| Active Vols. / Helped | `GET /stats/community` | Platform stats |
| Active mission banner | `GET /missions/active` | Mission assignment |
| Impact stories | `GET /stories?limit=3` | Story moderation queue |

The `selectedRadius` / `customCity` / `isExploring` triple is already threaded into
`CategoryList` as params, so the query shape is half-designed — it just has no server.

---

## 9. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **The greeting ignores the user's profile.** `"Good Morning, Hari 👋"` and the avatar letter `H` are hardcoded; the screen never imports `useUser()`, even though Profile Setup just saved a real name to AsyncStorage. | Every user is greeted as "Hari". The entire point of screen 06 is invisible on the very next screen. | `const { user } = useUser()` → `Good {partOfDay}, {user.name || 'there'}` and `user.name?.[0]?.toUpperCase()`. |
| 2 | **The active-mission banner is unconditional.** No state, no check — `:152` always renders it with a fabricated mission. | Every user is told they have a live mission in progress. Tapping it opens the Volunteer Journey for a request they never accepted — the most misleading element in the app. | Render only when a real active mission exists. |
| 3 | **"Good Morning" regardless of the hour.** | Wrong two-thirds of the day. | Derive from `new Date().getHours()`. |
| 4 | **Home location is hardcoded in three places.** `'Velachery, Chennai'` appears as the initial `customCity` (`:27`), inside the exploring banner copy (`:137`), and as the Reset-GPS/GPS-button target (`:143`, `:367`). No GPS is ever read. | The "Use My Current Location (GPS)" button is a lie — it sets a constant. `expo-location` isn't installed (see [05 gap #1](./05-permissions-screen.md#6-gaps--known-issues)). | Install `expo-location`, read the real position, reverse-geocode, and store it once. |
| 5 | **Location search only filters Popular Areas.** Recent Locations are never filtered, and there's no geocoding, so the PIN-code promise in the placeholder can't work. | Typing anything that isn't one of 5 city names returns an empty list. | Wire to a geocoding API; filter both lists. |
| 6 | **The bell dot is always on** (`#FCA5A5`, `:90`) — the second permanently-lit notification dot, alongside [the tab bar's](./07-main-tabs.md#8-gaps--known-issues). | Notification signals mean nothing anywhere in the app. | Drive both from one unread-count source. |
| 7 | **~20 dead styles.** `partnerCard`, `partnerTierRow`, `partnerTierChip`, `partnerTierText`, `openDot`, `partnerName`, `partnerTypeText`, `partnerMetaRow`, `partnerMetaText`, `partnerMetaDot`, `partnerServiceRow`, `partnerServiceChip`, `partnerServiceText`, `partnerActionRow`, `partnerCallBtn`, `partnerCallText`, `partnerNavBtn`, `partnerNavText`, `nearbyServicesSection`, `headerQuestion` — a whole "Nearby Services / Community Partners" section that has no JSX. | ~150 lines of misleading dead code in an already 728-line file. | Delete, or restore the section if it was meant to ship. |
| 8 | **Shared data lives in a screen file.** `IMPACT_STORIES` is imported from `./ImpactStoryScreen` (`:9`). | Circular-import risk and a confusing dependency direction. | Move to `src/data/impactStories.js`. |
| 9 | **Three unused icon imports** — `ShieldAlert`, `Sparkles`, `AlertCircle` (`:7`). | Dead weight. | Remove. |
| 10 | **Modal chaining via `setTimeout(…, 300)`** (`:316`). | Fragile — tied to an assumed animation duration; a fast tap can land between the two sheets. | Use one modal with an internal step, or `onDismiss`. |
| 11 | **`width: '47.8%'` magic number.** | Fragile two-column maths; breaks if `gap` or padding change. | `flexBasis: '48%'` with `justifyContent: 'space-between'`, or a `FlatList` with `numColumns={2}`. |
| 12 | **String-concatenated alpha** — `COLORS.primaryGreen + '18'` (`:494`). | Same fragility as the tab bar's `+'20'`. | A `withAlpha()` helper. |
| 13 | **Roughly 60 raw hex literals.** `#1E293B`, `#38BDF8`, `#0284C7`, `#0D9488`, `#FEE2E2`, `#F0FDF4`, `#BBF7D0`, `#E0F2FE`, `#BAE6FD`… against 12 tokens in `theme.js`. | This screen defines its own palette; slate/sky/teal don't appear in the design system at all. | Fold the recurring ones into `theme.js`. |
| 14 | **No pull-to-refresh and no loading states.** Nothing to refresh yet, but the structure assumes static data. | Will need rework when the API lands. | Add `RefreshControl` and skeletons alongside the data layer. |
| 15 | **Ads and sponsors ship before the product works.** `SponsorCard` and `GoogleAdMobCard` are on the home screen while core data is mocked. | Monetisation UI ahead of function. | Product call — flagged, not prescribed. |

> **Fix order:** #1 and #2 are user-visible falsehoods and cheap to fix. #4 blocks every
> location feature. #7 is a 10-minute deletion that makes the file far easier to read.

---

## 9A. What works well

- **`useFocusEffect` scopes the status bar correctly** (`:41–48`) — light content on the dark
  header while focused, restored to dark content on blur, with the Android
  `setBackgroundColor` guarded by `Platform.OS === 'android'`. **The cleanup function is the
  detail most implementations miss**: without it, every other screen in the app would inherit
  a light status bar and render invisible text on white.
- **Radius is a first-class control**, not buried in settings — `1 · 3 · 5 · 10 km` sits on
  the screen where it changes what you see.
- **Explore Another Location announces itself** — when active, the app states plainly that
  results are not from your current location, so the two modes can never be confused.
- **Category cards carry live counts**, giving the screen a reason to exist beyond navigation.

---

## 10. QA checklist

- [ ] The greeting shows the name entered in Profile Setup (blocked by gap #1).
- [ ] Header stats read 60 / 13 / 18 / 2,340 with the current hardcoded data.
- [ ] All 8 category cards render two per row with even gutters.
- [ ] Urgent badges appear on exactly the 6 categories with `urgentCount > 0`.
- [ ] Tapping a card opens Category List with radius and city in the params.
- [ ] Tapping the location row opens the radius sheet; the current radius is checked.
- [ ] Changing the radius updates both the header pill and the section sub-line.
- [ ] "Explore Another Location" opens the second sheet after the first closes.
- [ ] Choosing a popular area turns on exploring mode — blue banner, blue location text.
- [ ] "Reset GPS" clears exploring mode.
- [ ] Searching "mad" narrows Popular Areas to Madurai; Recent Locations stay put (gap #5).
- [ ] Status bar is light on this screen and dark after pushing Category List — then light
      again on return.
- [ ] The last card clears the tab bar (110 dp bottom padding).
- [ ] Tapping the bell lands on Alerts; the avatar lands on Profile.

---

## 11. Changing this screen

| To change… | Edit |
|---|---|
| Category list, counts, icons | `DashboardScreen.js:12–21` |
| Radius options | `:31` — `RADIUS_OPTIONS` |
| Recent / popular locations | `:32–33` |
| Default radius | `:24` |
| Default / home city | `:27` (and `:137`, `:143`, `:367` — see gap #4) |
| Hardcoded stats | `:111`, `:116` |
| Active mission banner | `:152–178` |
| Header colour | `styles.headerSafeArea` / `styles.header` (`:418–424`) |
| Card layout | `styles.categoryGrid` / `styles.categoryCard` (`:500–512`) |
| Number of impact stories | `:244` — `.slice(0, 3)` |

---

**Previous:** [07 — Main Tabs](./07-main-tabs.md) · **Next:** [09 — My Helps](./09-my-helps-screen.md)
