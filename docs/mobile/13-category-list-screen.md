# 13 — Category List (stack)

> **The request browser.** Every help request in one category, with a working search,
> filter sheet and sort. Pushed from a Dashboard category card.
>
> **The filtering on this screen genuinely works** — the first screen in the app where the
> controls actually change what you see.

| | |
|---|---|
| **Route name** | `CategoryList` |
| **Source file** | `apps/mobile/src/screens/CategoryListScreen.js` (1193 lines) |
| **Registered in** | `apps/mobile/App.js:71–75` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Dashboard category card, with `{ category, selectedRadius, customCity, isExploring }` |
| **Navigates to** | `RequestDetails` · `VolunteerJourney` |
| **Context used** | ✅ `useFlags()` |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ‹  🐶 Animal Rescue  ⌄     (switcher)  │
│ ┌──────────────────────────┐ ┌───────┐ │
│ │ 🔍 Search requests…      │ │ ⚙ Filt│ │
│ └──────────────────────────┘ └───────┘ │
│ 5 km · All · Nearby            [Reset] │  active filter summary
│ (1km)(3km)(5km)(10km)                  │  quick radius row
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ [OPEN] [HIGH PRIORITY]   [⏱ 2 days]│ │
│ │ ┌────────────────────────────────┐ │ │
│ │ │        request image           │ │ │
│ │ └────────────────────────────────┘ │ │
│ │ Injured puppy near Anna Nagar…     │ │
│ │ (R) Ravi Kumar • 💼 Software Eng.  │ │
│ │ 📍 Anna Nagar • 📏 1.2 km • 🕒 12m │ │
│ │ ────────────────────────────────── │ │
│ │ [⤴ Share] [🚩 Flag]  [View Details ›]│ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## 2. Interaction map — every tap target

### Header & filter bar

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Back `‹`** | `:414` | Returns to the Dashboard | — | `goBack()` |
| 2 | **Category title + ⌄** | `:421` | Opens the category switcher sheet | `categorySwitcherOpen` → true | — |
| 3 | Search field | `:456` | Filters the list **live on every keystroke** by title substring | `searchQuery` | — |
| 4 | **Filter button** | `:460` | Opens the filter sheet, first **syncing the draft state to the applied state** so a cancelled edit can't leak | `pending*`, `filterModalOpen` | — |
| 5 | **"Reset" (in the summary bar)** | `:475` | Instantly resets the **applied** filters to 5 km / All / Nearby — no Apply needed | `filterRadius`, `filterStatus`, `filterSort` | — |
| 6 | **Quick radius chip ×4** | `:500` | Sets `selectedRadius` directly from the header row | `selectedRadius` | — |

### Category switcher sheet

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 7 | Scrim | `:291` | Closes | `categorySwitcherOpen` → false |
| 8 | **Category row ×8** | `:303` | Switches the whole screen to that category — the list reloads from `categoryMockData` | `selectedCategory`, closes sheet |
| 9 | Close button | `:326` | Closes without switching | `categorySwitcherOpen` → false |

### Filter sheet — draft/apply pattern

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 10 | Scrim | `:344` | Closes, **discarding the draft** | `filterModalOpen` → false |
| 11 | Radius option | `:357` | Sets the **draft** radius only | `pendingRadius` |
| 12 | Status option (All / Open Only / Urgent) | `:372` | Sets the draft status | `pendingStatus` |
| 13 | Sort option (Nearby / Newest / Most Urgent) | `:388` | Sets the draft sort | `pendingSort` |
| 14 | **"Reset"** | `:400` | Resets the **draft** to 5 km / All / Nearby. ⚠️ Does **not** apply — closing the sheet without Apply keeps the old filters | `pending*` |
| 15 | **"Apply"** | `:403` | Commits draft → applied and closes | `filter*`, `filterModalOpen` |

### Request card

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 16 | Card body / image / title | `:620` | ❌ **Not tappable** — the card is a `<View>`. Only the footer buttons act | — | — |
| 17 | **"⤴ Share"** | `:627` | Opens the share sheet for that request | `shareItem` | — |
| 18 | **"🚩 Flag" / "Flagged"** | `:635` | ✅ **Real state** — toggles the flag in `FlagContext`. The icon fills red and the label switches to "Flagged". Increments the Profile menu's "Flagged Requests (n)" | `flagged` (context) | — |
| 19 | **"View Details ›"** — normal request | `:652` | Opens the request | — | `RequestDetails` `{ request, category }` |
| 20 | **"Join as Support ›"** — when `req.isMission` | `:652` | Opens the mission tracker instead. The button also turns amber `#D97706` | — | `VolunteerJourney` `{ request }` |
| 21 | Status / urgency / expiry badges | `:621–629` | ❌ Not tappable — display only | — | — |
| 22 | **"Repost"** on an expired card | `:558` | ❌ `alert('Repost "…"')` — no repost happens | — | — |
| 23 | **"Archive"** on an expired card | — | ❌ Same — an `alert()` stub | — | — |

### Share sheet

| # | Element | Line | Tap → what happens |
|---|---|---|---|
| 24 | Close ✕ | `:680` | Closes |
| 25 | **WhatsApp** | `:699` | ❌ `alert('Sharing to WhatsApp...')` — no share intent |
| 26 | **Instagram** | `:702` | ❌ `alert('Sharing to Instagram...')` |
| 27 | **Facebook** | `:705` | ❌ `alert('Sharing to Facebook...')` |
| 28 | **"📋 Copy Public Link"** | `:712` | ❌ `alert('Public story link copied!')` then closes. **Nothing is copied** — `expo-clipboard` is installed but not used here |

---

## 3. Filtering & sorting — how it actually works

```js
// :243–262
const filteredRequests = allRequests.filter(req => {
  const dist = parseDistance(req.distance);
  if (dist > filterRadius) return false;
  if (filterStatus === 'Urgent'    && req.urgency !== 'CRITICAL') return false;
  if (filterStatus === 'Open Only' && req.minutesLeft === 0)      return false;
  if (searchQuery && !req.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
  return true;
}).sort((a, b) => {
  if (filterSort === 'Nearby')      return parseDistance(a.distance) - parseDistance(b.distance);
  if (filterSort === 'Most Urgent') return (urgencyRank[a.urgency] ?? 3) - (urgencyRank[b.urgency] ?? 3);
  return 0;
});
```

| Control | Works? | Notes |
|---|---|---|
| Search | ✅ | Case-insensitive substring on `title` only — not description or location |
| Radius | ✅ | `parseDistance` reads the leading number out of `"1.2 km away"`; unparseable → `999`, so it drops out |
| Status "Urgent" | ✅ | Keeps only `CRITICAL` — note **HIGH is excluded** |
| Status "Open Only" | ✅ | Drops `minutesLeft === 0` |
| Sort "Nearby" | ✅ | Ascending distance |
| Sort "Most Urgent" | ✅ | `CRITICAL → HIGH → MEDIUM → NORMAL` |
| **Sort "Newest"** | ❌ | Falls through to `return 0` — **does nothing.** `time` is a string like "12 mins ago" with nothing to sort on |

---

## 4. Data

`categoryMockData` (`:25`) is keyed by category id and only covers **four** of the eight:
`food`, `animal`, `medical`, `roadside` — roughly 8 request objects with ids restarting at
100/201/301/401 per category.

```js
// :242
const allRequests = categoryMockData[category.id] || categoryMockData.animal;
```

**The other four categories (elderly, blood, disaster, community) silently fall back to the
animal-rescue list.** Tapping "Blood Donation" on the Dashboard shows injured dogs. See
gap #1.

Request ids restart per category, which is why `FlagContext` keys flags as
`` `${categoryId}:${requestId}` `` (`FlagContext.js:7`).

### 4.1 Images

Three assets, required at `:10–12` — and then **re-`require`d inline** at `:129`, `:156`
and `:173` inside the data array instead of reusing the constants.

`injured_dog.png` · `wedding_food.png` · `roadside_help.png`

---

## 5. Components used

| Component | Where | Purpose |
|---|---|---|
| `ExpiryBadge` | `:519` | Countdown pill; escalates slate → amber → red as the window closes |
| `ExpiredNotice` | `:554` | Replaces the card actions once `minutesLeft === 0`, offering Repost / Archive |
| `SponsorCard` | `:485` | Sponsored placement inside the list |

Documented in [23 — Shared components](./23-shared-components.md).

---

## 6. Mobile ↔ Admin web connection

**None.** The list is static per category.

This is the screen the admin console's *All Reports* tab
(`apps/web/src/app/admin/dashboard/page.tsx:1538`) mirrors — same records, same status and
urgency vocabulary, separately invented. The admin `MOCK_REPORTS` has 8 records; this
screen has ~8 across four categories. Neither knows about the other.

The **flag action (#18) is the one interaction here with real consequences** — but they
stay in memory. `FlagContext` states plainly that flags reset on reload
(`FlagContext.js:10`), so a user's report of abusive content never reaches the moderation
queue that the admin's *Flagged Reports* tab (`:2067`) exists to serve.

---

## 7. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Four of eight categories show the wrong data.** `categoryMockData` only has `food`, `animal`, `medical`, `roadside`; everything else falls back to animal rescue (`:242`). | Tapping "Blood Donation" or "Elderly Support" from the Dashboard shows injured-dog reports under a blood-donation header. Very visible. | Add the four missing keys, or show an empty state instead of falling back. |
| 2 | **"Newest" sort does nothing** (`:261`). | A sort option that silently no-ops. | Add real timestamps and sort on them, or remove the option. |
| 3 | **Sharing is four `alert()` stubs** (`:699`, `:702`, `:705`, `:712`). | Nothing is shared and nothing is copied — despite `expo-clipboard` being installed. Use RN's `Share` API for the socials and `expo-clipboard` for the link. | Wire both. |
| 4 | **Repost and Archive are `alert()` stubs** (`:558`). | An expired report can't actually be reposted, which is the whole point of `ExpiredNotice`. | Wire to the report API. |
| 5 | **Flags don't persist.** `FlagContext` is memory-only. | A user flags abuse; an app restart erases it. Never reaches moderation. | Persist to AsyncStorage and POST to the server. |
| 6 | **Card body isn't tappable** (`:620`) — only the footer button is. | Users expect the whole card to open the detail. | Wrap the card in a `TouchableOpacity`. |
| 7 | **Filter "Reset" doesn't apply** (`:400`) — it only resets the draft, so closing without Apply keeps the old filters. | Confusing: Reset appears to do nothing. Note the *summary bar's* Reset (`:475`) does apply — two Resets with different behaviour. | Make the sheet's Reset apply, or rename it "Clear". |
| 8 | **"Urgent" excludes HIGH** (`:246`) — only `CRITICAL` survives. | A HIGH-priority request is hidden by a filter called "Urgent". | Include `HIGH`. |
| 9 | **Two radius controls that don't agree.** The quick chips (`:500`) set `selectedRadius`; the filter sheet sets `filterRadius`. **Only `filterRadius` is used in filtering.** | Tapping a quick radius chip changes the highlight but **does not filter the list**. | Point both at the same state. |
| 10 | **Reporter details are faked per card.** `req.profession \|\| 'Software Engineer'` and `(req.postedBy \|\| 'Ravi Kumar')` (`:641`, `:645`). | Every reporter without a profession is labelled "Software Engineer". | Don't invent fallbacks — hide the field. |
| 11 | **Dead code:** `accent` (`:243`) assigned and never used; **13 dead styles** (`headerIconBox`, `headerIcon`, `headerTitleContainer`, `headerTitle`, `filterChipsRow`, `filterChip`, `filterChipActive`, `filterChipText`, `filterChipTextActive`, `reporterStripRating`, `cardDesc`, `radiusPillChip`, `radiusPillChipText`); unused imports `MapPin`, `Clock`, `ChevronRight`, `SIZES`. | ~1200-line file made harder to read. | Delete. |
| 12 | **Assets re-`require`d inline** (`:129`, `:156`, `:173`) despite module consts at `:10–12`. | Duplicate work; easy to let the two drift. | Use the constants. |
| 13 | **74 raw hexes alongside 93 `COLORS.*` references.** | Half-migrated to the design system. | Finish the migration. |

---

## 8. What works well

- **Draft/apply filter pattern** (`:219–239`). The sheet edits `pending*` state and only
  commits on Apply, with `openFilterModal` re-syncing the draft first. Textbook.
- **Search, radius, status and two of three sorts genuinely filter the list** — the only
  screen so far where controls affect output.
- **Flag state is real** and shared through context, so it shows up on the Profile menu and
  the Flagged screen.
- **Expired requests degrade gracefully** — `ExpiredNotice` replaces the actions rather than
  leaving dead buttons.
- **Anonymous posts are handled** — `req.isAnonymous` swaps the name for "Anonymous" and the
  avatar for 👤, and suppresses the profession line.

---

## 9. QA checklist

- [ ] Opening from a Dashboard card shows that category's title and icon.
- [ ] Opening "Blood Donation" shows blood requests, not dogs (blocked by gap #1).
- [ ] Typing in search narrows the list live; clearing restores it.
- [ ] Filter → 1 km → Apply removes anything further away.
- [ ] Filter → "Urgent" leaves only CRITICAL — confirm HIGH disappears (gap #8).
- [ ] Sort "Most Urgent" reorders; sort "Newest" does nothing (gap #2).
- [ ] Quick radius chips change the highlight — confirm the list does **not** change (gap #9).
- [ ] Filter sheet Reset + close (no Apply) keeps the old filters (gap #7).
- [ ] Category switcher swaps the entire list.
- [ ] Flag a request → label becomes "Flagged", icon fills red → Profile shows "Flagged Requests (1)" → Flagged screen lists it.
- [ ] Unflag from either screen and the count decrements.
- [ ] Share buttons show alerts only (gap #3).
- [ ] An expired card shows `ExpiredNotice` instead of the normal actions.

---

## 10. Changing this screen

| To change… | Edit |
|---|---|
| Request data per category | `:25` — `categoryMockData` |
| Category switcher list | `:14` — `ALL_CATEGORIES` |
| Filter/sort logic | `:243–262` |
| Filter options | `:357` (radius), `:372` (status), `:388` (sort) |
| Share actions | `:699–712` |
| Card layout | `styles.card` and the block at `:620` |

---

**Previous:** [12 — Profile](./12-profile-screen.md) · **Next:** [14 — Request Details](./14-request-details-screen.md)
