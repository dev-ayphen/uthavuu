# 24 — Utils & dead code

> The three utility modules, plus a full inventory of code that ships in the bundle and is
> never reached.

| | |
|---|---|
| **Location** | `apps/mobile/src/utils/` (+ dead files elsewhere) |
| **Line refs valid as of** | 2026-08-18 |

---

## Part 1 — Utilities

### 1. `expiry.js` (114 lines) ✅ live

Per-category auto-expiry rules and the label/tone helpers the UI renders.

| Export | Purpose |
|---|---|
| `CATEGORY_EXPIRY` | 9 category rules (`:11–66`) |
| `getExpiryRule(categoryId)` | Rule lookup |
| `formatDuration(minutes)` | "2 days", "6 hours" |
| `formatRemaining(minutes)` | "Expires in 2 days" |
| `expiryTone(minutes)` | slate / amber / red |
| `exceedsMax(categoryId, minutes)` | Validation guard |

Each rule carries `maxMinutes`, an `options[]` array, a `note`, and sometimes a `tone`.
**Disaster relief is `adminManaged`** — the reporter picks nothing.

**Imported by:** `ReportFlowScreen.js:7`, `ExpiryBadge.js:4`, `ExpiryPicker.js:5`.

> The module is explicit that it is presentation-only: nothing schedules an expiry, nothing
> persists one, and no request is ever actually closed by time. `minutesLeft` on a request
> is a static number in a mock array.

---

### 2. `missions.js` (49 lines) ✅ live

The volunteer participation state machine.

| Export | Purpose |
|---|---|
| `VOLUNTEER_STATUS` | 6 states (`:10–17`) — joined · onway · arrived · completed · left · reporter |
| `getStatus(volunteer)` | Current state |
| `nextAction(status)` | What the viewer's button should say and do |
| `countActive(volunteers)` | Active participants |
| `countByStatus(volunteers)` | Per-state tally |
| `missionBreakdown(volunteers)` | Non-zero stages for the summary strip |

A module-private `COUNTS_TOWARD_SLOTS` set decides which states occupy a mission slot — so
someone who left frees their place.

**Imported by:** `RequestDetailsScreen.js:16`, `VolunteerRoster.js:5`.

> This is the cleanest domain model in the app — a real state machine with derived actions.
> It is also purely presentational: no transition is persisted or sent anywhere.

---

### 3. `savedStore.js` (28 lines) ❌ **dead — never imported**

An in-memory pub/sub store for saved posts and stories.

| Export | Purpose |
|---|---|
| `getSavedItems()` | Read the list |
| `isSaved(id)` | Membership check |
| `toggleSaveItem(item)` | Add / remove |
| `subscribe(fn)` | Change notifications |

**Imported by: nothing.** Verified by grep across the repo — the only other references are
in `apps/mobile/FUNCTIONAL_FLOW.md` (lines 827, 979, 1011, 1034, 1089, 1134), which already
flags it as unused and recommends either wiring it up or deleting it.

**What it was for:** [12 — Profile](./12-profile-screen.md)'s "Saved Stories" menu item
(`:45`), which currently opens the full story list with only a different title —
[16 gap #1](./16-impact-stories-screen.md#7-gaps--known-issues). There is also **no save
button anywhere in the app**, so nothing could populate it even if it were wired.

**Fix:** add a save action on [17 — Impact Story](./17-impact-story-screen.md), back it with
this store, and pass a filter to the stories list. Or delete the module.

---

## Part 2 — Dead code inventory

### 4. `MapScreen.js` (407 lines) ❌ **orphaned — registered nowhere**

A complete map view: markers, category chips, a request carousel and a filter modal.

| Check | Result |
|---|---|
| Registered in `App.js`? | ❌ No — 17 stack screens, none is `MapScreen` |
| Registered in `MainTabs.js`? | ❌ No — 5 tabs, none is `MapScreen` |
| Imported anywhere? | ❌ No — grep across `apps/mobile/src` returns only its own `export default` at `:85` |

**407 lines of unreachable UI.** It is also the **only consumer of `react-native-maps`**
(`package.json:17`) — a native dependency compiled into every build for a screen no user
can open.

Ironically it has the **best design-token adherence in the entire codebase** — 70 `COLORS.*`
references against 4 raw hexes.

Its own issues, should it ever be wired up:

- Filter state `distanceRadius`, `urgencyFilter`, `sortBy` (`:90–92`) is collected but
  `filteredRequests` (`:94–97`) filters on `selectedCategory` only — **the filter modal does
  nothing**.
- 8 of 11 icon imports unused, plus `SIZES`.
- It navigates to both stack routes (`RequestDetails`, `VolunteerJourney`) and a tab route
  (`ProfileTab`), so it only works if mounted **inside** `MainTabs`.

**Decision needed:** wire it into the tab bar (the app is a location-based service with no
map), or delete it and drop `react-native-maps`.

---

### 5. `libs/shared/src/index.ts` (33 lines) ❌ **dead — imported by nothing**

The workspace's "shared" library exports **three TypeScript interfaces and no runtime code**:

| Interface | Fields |
|---|---|
| `HelpRequest` | id, category, title, description, location, distance, urgency, icon, createdAt |
| `UserProfile` | id, name, phone, location, trustScore, completedHelps, impactPoints, isVerified |
| `ImpactStory` | id, category, title, note, location, timeTaken, helperName, imageUrl |

A repo-wide grep for `@uthavu/shared` finds only path-alias declarations — `tsconfig.json:14`,
`apps/mobile/tsconfig.json:7`, and the package's own name — **never an import statement**.
`apps/web/package.json` doesn't even list it as a dependency.

**Consequence:** the two apps share nothing. Mobile is plain JavaScript with ad-hoc object
shapes; the web app re-declares its own local `Story`, `AdminRecord` and `Sponsor`
interfaces. The mismatches this allows are documented throughout — profession **id** vs
**label**, one `city` field vs `city` + `district`, 7 flag reasons vs 5.

This is the natural home for the shared design tokens and `PROFESSIONS` map.

---

### 6. Unused imports by file

Counted across the screens documented in this set:

| File | Unused imports |
|---|---|
| `MissionJournalScreen.js` | 10 — `ChevronLeft`, `MapPin`, `Clock`, `CheckCircle`, `AlertTriangle`, `Eye`, `ImageIcon`, `MessageSquare`, `User`, `Users` |
| `MapScreen.js` | 9 — 8 icons + `SIZES` |
| `VolunteerJourneyScreen.js` | 6 — `Phone`, `Users`, `Check`, `Award`, `AlertTriangle`, `SIZES` |
| `ProfileScreen.js` | 6 — `useState`, `MapPin`, `Globe`, `Edit3`, `UserCheck`, `Camera` |
| `RequestDetailsScreen.js` | 4 — `Star`, `Award`, `CheckSquare`, `Clock` |
| `CategoryListScreen.js` | 4 — `MapPin`, `Clock`, `ChevronRight`, `SIZES` |
| `MyHelpsScreen.js` | 3 — `ChevronRight`, `ImageIcon`, `injuredDogImg` |
| `ImpactStoryScreen.js` | 3 — `ExternalLink`, `MoreHorizontal`, `SIZES` |
| `ReportFlowScreen.js` | 3 — `ImageIcon`, `Sparkles`, `SIZES` |
| `AlertsScreen.js` | 3 — `Bell`, `Settings`, `SIZES` |
| `DashboardScreen.js` | 3 — `ShieldAlert`, `Sparkles`, `AlertCircle` |
| `EditProfileScreen.js` | 2 — `Shield`, `Eye` |
| `SettingsScreen.js` | 3 — `MessageSquare`, `Send`, `CheckCircle2` |
| `InviteFriendsScreen.js` | 3 — `Image`, `Users`, `Heart` |
| `ProfileSetupScreen.js` | 1 — `Platform` |

> **`SIZES` is imported and never used in 6 files.** Only `SIZES.padding` and
> `SIZES.radiusLg` are used anywhere, on the auth screens.

### 7. Dead styles

| File | Count | Notable |
|---|---|---|
| `DashboardScreen.js` | ~20 | An entire unrendered "Nearby Services / Community Partners" section — `partnerCard`, `partnerTierChip`, `partnerCallBtn`, … plus `headerQuestion` |
| `CategoryListScreen.js` | 13 | `headerTitle`, `filterChip*`, `cardDesc`, `radiusPillChip`, … |
| `ProfileScreen.js` | 2 | `verifiedBadge`, `cameraIconBadge` — remains of a removed avatar upload |
| `ImpactStoryScreen.js` | 3 | `mapsBtn`, `mapsBtnText`, `shareBtn` — tied to the dead `openMaps` |
| `RequestDetailsScreen.js` | 2 | `openLocationBtn`, `openLocationText` |
| `VolunteerJourneyScreen.js` | 1 | `statusConfidenceSub` |
| `FlaggedScreen.js` | 1 | `countLabel` |

### 8. Dead functions & variables

| File | Item | Line |
|---|---|---|
| `ReportFlowScreen.js` | `handleNext` — never called | `:47` |
| `ReportFlowScreen.js` | `photoAdded` / `setPhotoAdded` — never read or set | `:27` |
| `ReportFlowScreen.js` | `user` — destructured, never used | `:13` |
| `ImpactStoryScreen.js` | `openMaps` — a working maps deep link, never wired | `:99` |
| `CategoryListScreen.js` | `accent` — assigned, never referenced | `:243` |
| `MyHelpsScreen.js` | `totalCount` — computed, never rendered | `:56` |
| `MyHelpsScreen.js` | `injuredDogImg` — required, never used (881 KB) | `:10` |
| `InviteFriendsScreen.js` | `inviteCode` — declared, never rendered | `:11` |
| `RequestDetailsScreen.js` | `isAiScanning`, `aiScanStatus`, `pendingReview` — set, never read | `:176–178` |
| `RequestDetailsScreen.js` | `setJoinedCount`, `setTotalNeeded`, `setVolunteers` — never called | `:65`, `:66`, `:71` |

---

## Part 3 — Bundle weight

| Asset group | Count | Size |
|---|---|---|
| `apps/mobile/src/assets/*.png` | 11 | ~9.4 MB, every one 1024×1024 |
| Largest | `wedding_food_2.png` | 1.5 MB |
| Unused at their import site | `injured_dog.png` (My Helps), both My Helps images | — |
| Framework placeholders | `assets/icon.png`, `assets/splash-icon.png` | Expo defaults, unbranded |

Every image is a full-size square PNG. Resizing to display dimensions and converting to
WebP would cut this by roughly an order of magnitude.

---

## Recommended cleanup order

1. **Decide on `MapScreen.js`** — 407 lines plus a native dependency hinge on it. The app is
   a location service with no map; this is a product decision, not a cleanup one.
2. **Delete or wire `savedStore.js`** — currently makes "Saved Stories" silently wrong.
3. **Populate `libs/shared`** with design tokens, `PROFESSIONS`, and the request/user
   shapes. This is what would stop mobile and admin drifting further apart.
4. **Strip unused imports and dead styles** — mechanical, ~53 imports and ~42 styles, and it
   makes `DashboardScreen.js` and `CategoryListScreen.js` materially easier to read.
5. **Optimise images** — the single biggest bundle win.

---

**Previous:** [23 — Shared components](./23-shared-components.md) · **Next:** [25 — Forms, validation & cross-cutting](./25-forms-validation-and-cross-cutting.md)
