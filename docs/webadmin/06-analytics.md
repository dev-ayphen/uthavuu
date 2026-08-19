# 06 — Analytics

> A single-tab reporting view: district performance, category distribution, mission trends
> and registration volume — rendered with six hand-built SVG chart components and **entirely
> static data**.

| | |
|---|---|
| **Tab** | `analytics` `:2504` |
| **Source** | `apps/web/src/app/admin/dashboard/page.tsx` |
| **Line refs valid as of** | 2026-08-18 |
| **Sidebar** | Analytics (single, no badge) |
| **Data** | `MOCK_DISTRICT_ANALYTICS` `:308` (6) + inline chart arrays |
| **Charting library** | **None** — pure SVG |

---

## 0. Layout (`:2504`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 📈 Platform Analytics              [ 7 days ][ 30 days ][ 90 days ]      │
│                                                    ↑ no effect (§2)      │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐                  │
│ │Total    ││Active   ││Total    ││Avg      ││Impact   │  ← 5 KPI tiles   │
│ │Users    ││Volunt.  ││Reports  ││Response ││Stories  │     :2535–2539   │
│ │ 12,847  ││ 3,204   ││ 8,432   ││ 4.2 min ││  184    │                  │
│ │         ││         ││         ││         ││4.9★ avg │ ← 🔴 star rating │
│ └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘                  │
├──────────────────────────────────────────────────────────────────────────┤
│ DISTRICT PERFORMANCE                                                     │
│ ( Chennai )( Coimbatore )( Madurai )( Trichy )( Salem )( Tirunelveli )   │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Total Reports │ Active Volunteers │ Completion Rate │ Active Missions│ │
│ │     :2593            :2594              :2595            :2596       │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
├───────────────────────────────────┬──────────────────────────────────────┤
│ Category Breakdown        :2614   │ Completion Rate          :2626       │
│   🍱 Food Donation                │ Volunteer Fill Rate      :2627       │
│   ❤️ Medical Support               │ Response Time SLA        :2628       │
│   🚗 Roadside Help                │  ▓▓▓▓▓▓▓▓░░ progress bars            │
│   🐶 Animal Rescue                │                                      │
│   🩸 Blood Donation               │  ⚠ 5 of 8 categories only (§4.3)     │
│   (donut chart)                   │                                      │
├───────────────────────────────────┼──────────────────────────────────────┤
│ 📅 Weekly Report Trend    :2647   │ 👥 User Registrations by Day  :2660  │
│  This Week ▓▓▓▓▓▓▓▓                │  Mon ▓▓▓  Thu ▓▓▓▓▓                  │
├───────────────────────────────────┴──────────────────────────────────────┤
│ 🏆 Top Volunteer Performance                                    :2671    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Five sections, all hand-rolled SVG** — no charting library is installed. See §4.1.

🔴 The **Impact Stories** tile carries `sub: '4.9★ avg rating'` and `icon: '⭐'` (`:2539`).
This is the **only user-visible star rating remaining in either product** and it contradicts
[Decision 1](../PRODUCT-DECISIONS.md#decision-1--no-star-ratings). The mobile app already
complies; this tile does not.

---

## 1. Interaction map

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **Timeframe chips** — Daily / Weekly / Monthly / Yearly | `:2516` | Sets `analyticsTimeframe` and turns the chip emerald. ❌ **No chart, table or number changes** — the value is read only at `:2517` and `:2519`, both purely for styling | ❌ |
| 2 | **Export CSV** | `:2526` | ❌ `alert('Exporting Analytics Report as CSV...')` — no file is produced | ❌ |
| 3 | **District row** | `:2568` | ✅ Selects the district — the row highlights emerald and the side panel switches to it | ✅ |
| 4 | Charts (donut / line / bar) | `:2615`, `:2648`, `:2661` | ❌ No tooltip, hover or click. Values readable only by eye | ❌ |
| 5 | Performance bars | `:2624` | ❌ Display only | — |
| 6 | Top Volunteer cards ×3 | `:2678` | ❌ Not clickable — no drill-through to the user or volunteer record, unlike every other surface in the console | ❌ |

**Two of six interactions do anything, and only one of those affects data.**

---

## 2. The timeframe selector does nothing

```tsx
// :2516–2519 — every use of the state
onClick={() => setAnalyticsTimeframe(tf)}
style={analyticsTimeframe === tf ? { backgroundColor: '#059669', color: '#ffffff' } : undefined}
className={`… ${analyticsTimeframe === tf ? 'shadow-sm font-bold' : `${textSec} …`}`}
```

`analyticsTimeframe` is declared at `:637` and referenced **only** in those two styling
expressions. No chart data, no district table and no metric is filtered by it.

Switching from **Daily** to **Yearly** changes one chip's colour and nothing else — while
the surrounding labels continue to read "This Week", "Last Week" and "new users this week".
See gap #1.

---

## 3. District analytics — the one interactive part

`MOCK_DISTRICT_ANALYTICS` (`:308`, 6 records):

| District | Reports | Volunteers | Completion | Active missions |
|---|---|---|---|---|
| Chennai | 142 | 86 | 94% | 8 |
| Coimbatore | 53 | 34 | 91% | 3 |
| Madurai | 38 | 22 | 88% | 2 |
| Salem | 27 | 18 | 96% | 1 |
| Trichy | 21 | 15 | 90% | 0 |
| Tirunelveli | 14 | 9 | 85% | 1 |

Clicking a row (`:2568`) sets `selectedDistrict`, which drives:

- The row's emerald highlight (`:2570`, `:2575`)
- The side panel heading — `📍 {district}` or the prompt **"Click a district"** when nothing
  is selected (`:2584–2585`)

This is genuine state with a genuine empty prompt — the best-behaved control in the tab.

> **These six districts are the same set `targetDistrict` uses on
> [broadcasts](./05-community.md#34-existing-banners-mock_banners-302).** District is modelled consistently
> across the console — and **not at all in the mobile app**, which has one free-text `city`
> field and no district concept
> ([mobile 20 §4](../mobile/20-edit-profile-screen.md#4-mobile--admin-web-connection)).

---

## 4. Page structure — five sections

| § | Line | Section | Data source |
|---|---|---|---|
| 1 | `:2508` | 📈 Platform Analytics (header + timeframe chips + Export) | — |
| 2 | `:2555` | **District Performance** | `MOCK_DISTRICT_ANALYTICS` — ✅ interactive |
| 3 | `:2614` | **Category Breakdown** (donut) | Inline, 5 categories |
| 4 | `:2647` | 📅 **Weekly Report Trend** (line) | Inline, 7 points |
| 5 | `:2660` | 👥 **User Registrations by Day** (bar) | Inline, 7 days |
| 6 | `:2671` | 🏆 **Top Volunteer Performance** | Inline, 3 volunteers |

### 4.1 Charts

All chart data is inline and hardcoded.

| Chart | Line | Data |
|---|---|---|
| **Donut** — Category Breakdown | `:2615` | Food Donation 34 · Medical Support 28 · Roadside Help 18 · Animal Rescue 12 · Blood Donation 8 |
| **Line** — Weekly Report Trend | `:2648` | `[12, 18, 14, 22, 30, 27, 35]` with a "This Week 35 / Last Week 27 / Growth +29%" strip |
| **Bar** — User Registrations by Day | `:2661` | Mon 12 · Tue 8 · Wed 19 · Thu 14 · Fri 22 · Sat 31 · Sun 17, captioned *"Peak: Saturday • Total: 123 new users this week"* |

### 4.2 🏆 Top Volunteer Performance (`:2671`)

Three medal cards — the section I'd have expected to be invented, and it isn't.

| Badge | Name | Missions | Points |
|---|---|---|---|
| 🥇 | Ravi Shankar | 24 | 850 |
| 🥈 | Priya Devi | 19 | 680 |
| 🥉 | Arun Kumar | 8 | 310 |

**These figures match `MOCK_USERS` exactly** (`:62`) — Ravi Shankar has `helps: 24,
impactPoints: 850`; Priya Devi `19 / 680`; Arun Kumar `8 / 310`.

It is still a hardcoded inline array rather than a derivation, so it will silently drift the
moment a user record changes — but it is **the only figure on this tab that agrees with the
rest of the console**. Deriving it would be a one-line change:

```ts
[...users].sort((a, b) => b.impactPoints - a.impactPoints).slice(0, 3)
```

See gap #9.

### 4.3 The donut covers only 5 of 8 categories

The platform has **8 help categories** (`MOCK_CATEGORIES`, `:123`) — and 9 in the mobile
report wizard, which adds 🔍 Lost & Found. The category donut charts five: Elderly Support,
Disaster Relief and Community Help are absent. See gap #3.

### 4.4 The numbers contradict the rest of the console

| Figure | Analytics | Elsewhere |
|---|---|---|
| Total reports | 295 across districts | `MOCK_REPORTS` has **8** |
| Total volunteers | 184 across districts | `MOCK_VOLUNTEERS` has **6** |
| New users this week | 123 | `MOCK_USERS` has **8** |
| Category counts | 100 across 5 categories | `MOCK_CATEGORIES.activeCount` totals differently |

Analytics was written against an imagined production dataset; every other tab reads its own
small mock arrays. Nothing reconciles. See gap #2.

---

## 5. Mobile ↔ Admin connection

**None.** Every figure is a literal.

Everything on this tab would, in a real system, be derived from mobile activity:

| Chart | Real source | Mobile status |
|---|---|---|
| Reports per district | Published reports | ❌ [Report Flow](../mobile/10-report-flow-screen.md) **never saves a report** |
| Volunteers per district | Mission acceptances | ❌ [Volunteer Journey](../mobile/15-volunteer-journey-screen.md) transitions are local state |
| Completion rate | Mission outcomes | ❌ Never transmitted |
| Category distribution | Report categories | ❌ Dashboard category counts are hardcoded too |
| Registrations by day | Signups | ❌ [OTP](../mobile/04-otp-screen.md) creates no account |

The mobile Dashboard shows its own invented totals — 60 need help, 13 urgent, 18 active
volunteers, 2,340 helped ([mobile 08 §7](../mobile/08-dashboard-screen.md#7-data-inventory--what-is-real)).
**Neither set of numbers agrees with the other, and neither is derived from anything.**

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **The timeframe selector filters nothing** (`:2516`). Daily/Weekly/Monthly/Yearly changes only a chip colour. | The primary control on an analytics page is decorative. Selecting "Yearly" leaves labels reading "This Week". | Filter the datasets by timeframe, or remove the control. |
| 2 | **Analytics figures contradict every other tab.** 295 reports vs `MOCK_REPORTS`' 8; 123 weekly signups vs 8 total users. | An operator comparing tabs finds no two agree. | Derive from the same state the other tabs use. |
| 3 | **The category donut shows 5 of 8 categories.** Elderly Support, Disaster Relief and Community Help are missing. | Three categories look like they have zero activity. | Map over `MOCK_CATEGORIES`. |
| 4 | **Export CSV is an alert** (`:2526`). | The one way to get data out of the console does nothing. | Generate a real CSV — it's a few lines over the arrays. |
| 5 | **Charts have no interactivity** — no tooltip, hover, legend or drill-down. | Exact values are unreadable; the donut has no legend. | Add hover tooltips. |
| 6 | **Nothing is derived from live state**, unlike the Dashboard tab whose metric cards do derive. | Two "overview" surfaces built on different principles. | Follow the Dashboard tab's pattern. |
| 7 | **No date range, comparison or segmentation.** | Cannot answer "how did last month compare?" — the core analytics question. | Add ranges once the data is real. |
| 8 | **Line and bar charts have no axis labels or gridlines.** | Values are estimates. | Add axes. |
| 9 | **Top Volunteer Performance is hardcoded** (`:2671`) even though its numbers currently match `MOCK_USERS`. | It will silently drift the moment a user's `helps` or `impactPoints` changes — showing stale leaders with no warning. | Derive: `[...users].sort((a,b) => b.impactPoints - a.impactPoints).slice(0,3)`. |
| 10 | **The donut has no legend** — labels live only in the data array. | Five colour segments with no key. | Render the labels. |

---

## 7. What works well

- **Six hand-built SVG chart components with zero dependencies** — `BarChart`, `LineChart`,
  `DonutChart`, `StatusBadge`, `PriorityBadge`, `ReliabilityBar` (`:382–505`). They're
  theme-aware via a `dark` prop and guard against divide-by-zero with
  `Math.max(...values, 1)`. `apps/web` ships only 4 runtime dependencies as a result.
- **District selection is real** — highlight plus a side panel, with a proper
  **"Click a district"** empty prompt rather than a blank space.
- **District is modelled consistently** across analytics, broadcasts and user records — the
  one dimension the console handles coherently.
- **Completion rate per district** is exactly the right operational metric for this product;
  the shape of the page is well judged, only the data isn't real.

---

## 8. QA checklist

- [ ] Switching Daily → Yearly changes only the chip colour; no chart moves (gap #1).
- [ ] Labels still read "This Week" after selecting Yearly.
- [ ] Clicking a district highlights the row and updates the side panel heading.
- [ ] With no district selected, the panel reads "Click a district".
- [ ] The donut renders 5 segments — confirm 3 categories are missing (gap #3).
- [ ] Export CSV shows an alert; no file downloads (gap #4).
- [ ] Hovering a chart does nothing (gap #5).
- [ ] Compare the district report total (295) against the Reports tab (8 rows) (gap #2).
- [ ] Charts render correctly in both light and dark themes.
- [ ] Top Volunteer Performance shows Ravi 24/850, Priya 19/680, Arun 8/310 — cross-check against the Users tab; they should match today.
- [ ] Change a user's `impactPoints` in `MOCK_USERS` — the leaderboard does **not** update (gap #9).
- [ ] Volunteer cards are not clickable (no drill-through to the user record).

---

## 9. Changing this tab

| To change… | Edit |
|---|---|
| District data | `:308` — `MOCK_DISTRICT_ANALYTICS` |
| Category donut | `:2615` |
| Mission trend line | `:2648` |
| Registrations bar | `:2661` |
| Timeframe options | `:2513` |
| Export handler | `:2526` |
| Chart components | `:382–505` |

---

**Previous:** [05 — Community](./05-community.md) · **Next:** [07 — Platform & settings](./07-platform-settings.md)
