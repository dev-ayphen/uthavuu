# 11 — Alerts / Notifications (tab 4)

> **The notification centre.** A filterable list of 7 mock alerts with real unread state and
> a working "Mark all read". The only screen in the app with functioning read/unread logic.

| | |
|---|---|
| **Tab route** | `AlertsTab` (label **Alerts**) |
| **Source file** | `apps/mobile/src/screens/AlertsScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/src/navigation/MainTabs.js:95–113` |
| **Filters** | All · Requests · Updates · Nearby · System |
| **Also reachable from** | The Dashboard header bell |
| **Data** | 7 hardcoded alerts |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ Notifications  [4 New]  [✓✓ Mark all…] │  white header
│ (All)(Requests)(Updates)(Nearby)(System)│  horizontal chips
├────────────────────────────────────────┤  bg #F8FAFC
│ ┃┌───────────────────────────────────┐ │  ┃ = 3 dp green left border
│ ┃│ ● 🐶 Animal Rescue      2 mins ago│ │      (unread only)
│ ┃│ Volunteer Accepted                │ │
│ ┃│ Priya is heading to help the…     │ │
│ ┃│ [ View Live → ]                   │ │
│ ┃└───────────────────────────────────┘ │
│  ┌───────────────────────────────────┐ │
│  │ 🚗 Roadside            3 hours ago│ │  read = no border, no dot
│  │ Assistance completed              │ │
│  │ The flat tyre report on ECR has…  │ │  no action button
│  └───────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## ⚡ Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **"Mark all read"** | `:126` | Sets `unread: false` on **every** alert at once — badge, green left borders and dots all disappear. ⚠️ Not persisted; a restart brings them back | `alerts` | — |
| 2 | "{n} New" badge | `:120` | ❌ Not tappable. Hidden entirely when the count is 0 | — | — |
| 3 | **Filter chip ×5** (All / Requests / Updates / Nearby / System) | `:135` | Filters the list by `type`. The chip turns near-black `#111827` with white text | `activeFilter` | — |
| 4 | **Alert card — body** | `:156` | ❌ **Nothing.** The card is a plain `<View>`, not a touchable — reading an alert cannot mark it read | — | — |
| 5 | **"View Live"** (alert 1) | `:169` | Opens the mission tracker — **with no params** | — | `VolunteerJourney` (no params) |
| 6 | **"Respond Now"** (alerts 3, 7) | `:169` | ❌ **Same handler, same destination as #5.** Shows Volunteer Journey's hardcoded fallback mission — *"Injured stray dog needs vet transport"* — regardless of which alert was tapped | — | `VolunteerJourney` (no params) |
| 7 | **"View Details"** (alert 4) | `:169` | ❌ **Same as #5 and #6** | — | `VolunteerJourney` (no params) |
| 8 | Unread dot / green left border | `:159`, `:242` | ❌ Not tappable — state indicators only | — | — |
| 9 | Alerts 2, 5, 6 | — | ❌ No action button at all — `action: null`, so nothing on those cards responds | — | — |
| 10 | Pull to refresh | — | ❌ Nothing — no `RefreshControl` | — | — |

All three action labels route through one handler:

```js
// :100–103
const handleAction = () => {
  const rootNav = navigation.getParent() || navigation;
  rootNav.navigate('VolunteerJourney');   // ← no params
};
```

Three different promises — watch a mission, respond to an emergency, view details — one
destination, wrong content. See gap #1.

---

## 2. Data

Seven hardcoded alerts (`AlertsScreen.js:6–88`). No images — the category emoji is inline
text.

| id | type | Category | Title | Action | Unread |
|---|---|---|---|---|---|
| 1 | Requests | 🐶 Animal Rescue | Volunteer Accepted | **View Live** | ✅ |
| 2 | Updates | 🍱 Food Donation | Food collected successfully | — | ✅ |
| 3 | Nearby | ❤️ Emergency | Critical request nearby | **Respond Now** | ✅ |
| 4 | Requests | 🤝 Community | NGO joined your request | **View Details** | ❌ |
| 5 | Updates | 🚗 Roadside | Assistance completed | — | ❌ |
| 6 | System | ⚡ System Alert | Profile Badge Unlocked! 🏆 | — | ❌ |
| 7 | Nearby | 👴 Elderly Support | Senior Citizen needs medicine pickup | **Respond Now** | ✅ |

Initial unread count: **4**.

Each record also carries `categoryColor` (from `COLORS`) and `actionColor` — both are
**declared but never rendered**. See gap #4.

---

## 3. Visual specification

From `AlertsScreen.js:185–275`.

### 3.1 Header

| Element | Spec |
|---|---|
| Container | bg `#FFFFFF`, `paddingHorizontal: 16`, `paddingVertical: 10`, bottom border `1` `#E2E8F0` |
| Title | `17` / `700` / `#111827` — "Notifications" |
| Unread badge | bg `#FEF2F2`, radius `8`, text `11`/`700`/`#DC2626` — `{n} New`, hidden at 0 |
| Mark all read | bg `#F0FDF4`, border `1` `#DCFCE7`, radius `8`, `CheckCheck` 14 + text `11`/`700`/`#16A34A` |

> The screen title is **"Notifications"** but the tab label is **"Alerts"**. See gap #5.

### 3.2 Filter chips

Horizontal `ScrollView`, `marginRight: 6` between chips.

| State | Spec |
|---|---|
| Inactive | bg `#F8FAFC`, border `1` `#E2E8F0`, radius `14`, text `11`/`600`/`#6B7280` |
| **Active** | bg + border `#111827` (`COLORS.textPrimary`), text `#FFFFFF`/`700` |

The active chip is near-black — not the brand green used for active states elsewhere.

### 3.3 Alert card

| Element | Spec |
|---|---|
| Card | bg `#FFFFFF`, radius `14`, padding `14`, `marginBottom: 10`, border `1` `#E2E8F0`, shadow `0.02`/`4` |
| **Unread** | adds `borderLeftWidth: 3`, `borderLeftColor: #16A34A` |
| Unread dot | `6 × 6` circle, `#16A34A`, inline before the category |
| Category | `12` / `600` / `#6B7280` |
| Time | `11` / `#6B7280` |
| Title | `14` / `700` / `#111827` / `lineHeight: 18` |
| Description | `12` / `#6B7280` / `lineHeight: 17` |
| Action button | `alignSelf: 'flex-start'`, bg `#F8FAFC`, border `1` `#E2E8F0`, radius `8`, text `11`/`700`/`#111827` + `ArrowRight` 13 |

### 3.4 Empty state

```jsx
// AlertsScreen.js:150–153
{filteredAlerts.length === 0 ? (
  <View style={styles.emptyState}>
    <Text style={styles.emptyText}>No notifications found for {activeFilter}</Text>
  </View>
) : ( … )}
```

The only screen so far with a proper empty state. `padding: 40`, centred, `13`/`#6B7280`.

---

## 4. Functionality

### 4.1 State

```js
const [activeFilter, setActiveFilter] = useState('All');
const [alerts, setAlerts]             = useState(allMockAlerts);
```

Unlike every other screen, the list itself is **stateful** — alerts are copied into state
so they can be mutated.

### 4.2 Filtering

```js
const filteredAlerts = alerts.filter(a => activeFilter === 'All' ? true : a.type === activeFilter);
const unreadCount    = alerts.filter(a => a.unread).length;
```

Both derive on every render. `unreadCount` is computed from **all** alerts, not the
filtered subset — correct behaviour for a badge.

### 4.3 Mark all read — actually works

```js
const markAllRead = () => setAlerts(alerts.map(a => ({ ...a, unread: false })));
```

Sets every alert to read. The badge disappears, the green left borders and dots vanish.
Genuine state, immediately reflected in the UI.

**But it's local and ephemeral:** the screen is a tab, so it stays mounted while the app
runs, but nothing is persisted. A restart resets all four alerts to unread.

### 4.4 Action buttons — all go to the same place

```js
// AlertsScreen.js:100–103
const handleAction = () => {
  const rootNav = navigation.getParent() || navigation;
  rootNav.navigate('VolunteerJourney');
};
```

One handler for all three action types. Note it navigates with **no params**.
`VolunteerJourneyScreen.js:10` reads `const { request } = route.params || {}` and falls back
throughout (`request?.title || 'Injured stray dog needs vet transport'`), so it doesn't
crash — it renders a completely unrelated default mission. See gap #1.

The `getParent()` call is correct: `VolunteerJourney` lives on the parent stack, not the
tab navigator.

---

## 5. Mobile ↔ Admin web connection

**None** — and this is the screen where the absence matters most.

Alerts are, by definition, server-pushed. Every row here describes an event that originates
elsewhere: a volunteer accepting, an NGO joining, a nearby emergency, a badge award. All
seven are local constants.

| Alert type | Real source | Admin involvement |
|---|---|---|
| Requests | Mission state change | Admin assigns/approves |
| Updates | Mission progress | — |
| Nearby | Geo-matched new report | Admin can broadcast |
| System | Platform events, badges | Admin-triggered |

Requires `expo-notifications` (not installed) plus a push token registered at
[screen 05](./05-permissions-screen.md), which currently requests nothing.

### 5.1 The unread-count irony

This screen **computes a correct `unreadCount`** (`:110`) and shows it as a `{n} New`
badge — while the two notification dots that users actually see are hardcoded:

| Indicator | Source | Driven by data? |
|---|---|---|
| `{n} New` badge, here | `alerts.filter(a => a.unread).length` | ✅ Yes |
| Tab bar red dot | `<View style={styles.notifDot} />` — [07](./07-main-tabs.md#43-notification-dot-alerts-tab-only) | ❌ Always on |
| Dashboard header bell dot | `<View style={styles.bellDot} />` — [08](./08-dashboard-screen.md#2-header) | ❌ Always on |

The data for a correct badge already exists. Lifting `alerts` into a context would fix all
three at once — the smallest high-value refactor in the app.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Every action button opens the same screen with no params.** "View Live", "Respond Now" and "View Details" all call `handleAction()` → `VolunteerJourney` with no `request`. | The user taps "Respond Now" on *"Senior Citizen needs medicine pickup"* and lands on **"Injured stray dog needs vet transport"** — Volunteer Journey's hardcoded fallback. Wrong content, silently. Also wrong destination: "Respond Now" on a nearby request should open `RequestDetails`, not a journey already in progress. | Give each alert a `target` + `params`, and route per action. |
| 2 | **Unread state doesn't survive a restart.** `useState(allMockAlerts)` re-initialises from the constant. | "Mark all read" is undone on every cold start. | Persist to AsyncStorage, or move to context + server. |
| 3 | **No per-alert read.** Only the bulk action exists; tapping a card does nothing. | Users can't dismiss one item, and reading an alert doesn't mark it read. | Make the card pressable → mark read + navigate. |
| 4 | **`categoryColor` and `actionColor` are dead data.** Every record defines them (`:11`, `:16`, …) but no style consumes them. | ~14 unused properties; the visual variety they imply never appears. | Apply them to the category text / action button, or delete. |
| 5 | **Title says "Notifications", tab says "Alerts".** | Inconsistent naming for the same destination. | Pick one. |
| 6 | **Unused imports:** `Bell` and `Settings` from lucide (`:3`), and `SIZES` from the theme (`:4`). | Dead weight. | Remove. |
| 7 | **Active filter chip is `#111827`, not brand green.** | Active-state colour differs from every other screen. | Use `COLORS.primaryGreen`. |
| 8 | **No timestamps, only strings.** `'2 mins ago'` is frozen text. | An alert stays "2 mins ago" forever. | Store ISO dates; format at render. |
| 9 | **No grouping, no pagination, no pull-to-refresh.** | Fine at 7 items; unusable at 200. | Add `SectionList` by day + `RefreshControl`. |
| 10 | **Cards aren't accessible as list items.** No `accessibilityRole`, and the unread state is conveyed only by a colour border and a dot. | Screen readers can't distinguish read from unread. | Add `accessibilityLabel` including read state. |

---

## 6A. What works well

- **The empty state is real and filter-aware** (`:151–152`) — *"No notifications found for
  {activeFilter}"* names the active filter instead of showing a bare blank list, so a user who
  filters into an empty set understands why.
- **Filters are a single array**, so adding a category is a one-line change.
- **Unread state is visually distinct**, not just ordered differently.

---

## 7. QA checklist

- [ ] Header opens with a red `4 New` badge.
- [ ] Four cards show a green left border and inline dot; three do not.
- [ ] "Mark all read" clears the badge, all borders and all dots at once.
- [ ] Filter chips switch the list: Requests → 2, Updates → 2, Nearby → 2, System → 1.
- [ ] The active chip turns near-black with white text.
- [ ] A filter with no results shows "No notifications found for {filter}".
- [ ] Only alerts 1, 3, 4 and 7 show an action button.
- [ ] Tapping "Respond Now" opens content matching that alert (blocked by gap #1).
- [ ] Force-quit and relaunch — confirm unread state resets (gap #2).
- [ ] Chips scroll horizontally on a narrow device without clipping "System".

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Alert data | `AlertsScreen.js:6–88` |
| Filter list | `:90` — the `filters` array (must match `type` values) |
| Action routing | `:100–103` — `handleAction` |
| Mark-all behaviour | `:96–98` |
| Unread card styling | `styles.alertCardUnread` / `styles.unreadDotInline` (`:242–251`) |
| Active chip colour | `styles.activeChip` (`:223`) |
| Empty-state copy | `:152` |

---

**Previous:** [10 — Report Flow](./10-report-flow-screen.md) · **Next:** [12 — Profile](./12-profile-screen.md)
