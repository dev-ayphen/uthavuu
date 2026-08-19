# 10 — Report Flow (tab 3 · the centre FAB)

> **The app's core action.** A 3-step wizard for publishing a help request: category and
> details → location and privacy → success. Reached by the green **＋** button in the
> middle of the tab bar.

| | |
|---|---|
| **Tab route** | `ReportTab` (no label — the FAB) |
| **Source file** | `apps/mobile/src/screens/ReportFlowScreen.js` (523 lines) |
| **Registered in** | `apps/mobile/src/navigation/MainTabs.js:87–94` |
| **Line refs valid as of** | 2026-08-18 |
| **Steps** | 3 (progress bar shows 2) |
| **Writes data** | Only the email, via `saveEmail()`. **The report itself is never saved.** |
| **Talks to admin web** | No |

---

## 1. Layout by step

```
STEP 1                      STEP 2                      STEP 3
┌────────────────────┐      ┌────────────────────┐      ┌────────────────────┐
│ ‹  Report Help     │      │ ‹  Report Help     │      │                    │
│ ▓▓▓▓▓▓▓░░░░░░░░░░░ │      │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │      │        ╭───╮       │
│ Report Need for    │      │ Location &         │      │        │ ✓ │       │
│ Help               │      │ Preferences        │      │        ╰───╯       │
│ (🐶)(❤️)(🍱)(🚗)…  │      │ ┌────────────────┐ │      │  Your report has   │
│ ┌────────────────┐ │      │ │📍 Anna Nagar,  │ │      │  been published.   │
│ │ Report Title   │ │      │ │   Chennai      │ │      │  Nearby volunteers │
│ ├────────────────┤ │      │ │GPS: High (5m)  │ │      │  have been notified│
│ │ Description    │ │      │ └────────────────┘ │      │                    │
│ │                │ │      │ ┌────────────────┐ │      │ ┌────────────────┐ │
│ └────────────────┘ │      │ │ Landmark       │ │      │ │  Track Report  │ │
│ ┌────────────────┐ │      │ └────────────────┘ │      │ └────────────────┘ │
│ │ camera preview │ │      │ Expected help      │      │    Back Home       │
│ └────────────────┘ │      │ window  [picker]   │      │                    │
│ [Take Photo][Upload]│     │ ⚪ Post Anonymously│      │  (no header,       │
│ Urgency Level      │      │ ⚪ Share phone     │      │   no progress bar, │
│ (Low)(Med)(Hi)(Crit)│     │ ⚫ Share with NGOs │      │   no footer)       │
├────────────────────┤      ├────────────────────┤      │                    │
│[Next: Location →]  │      │ [Publish Report 🚀]│      │                    │
└────────────────────┘      └────────────────────┘      └────────────────────┘
```

The header, progress bar and footer are all wrapped in `step < 3` guards
(`:283`, `:310`) — step 3 is a bare full-screen confirmation.

---

## 2. Interaction map — every tap target

### Step 1

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | Back arrow `‹` | `:286` | `step > 1` → previous step. On step 1 → `navigation.goBack()`, which from a **tab root** has no history, so **nothing happens** | `step` | — |
| 2 | Category chip ×9 | `:122` | Selects the category **and resets the help window** to that category's max — a longer window can never carry over | `category`, `expiryMinutes` | — |
| 3 | Report Title field | `:136` | Controlled text input | `title` | — |
| 4 | Description field | `:145` | Controlled multiline input | `description` | — |
| 5 | **"Take Photo"** | `:159` | ❌ **Nothing — no `onPress` handler.** Looks like a button, is inert | — | — |
| 6 | **"Upload"** | `:163` | ❌ **Nothing — no `onPress` handler** | — | — |
| 7 | Urgency pill ×4 | `:173` | Selects Low / Medium / High / Critical | `urgency` | — |
| 8 | **"Next: Location & Privacy →"** | `:312` | Calls `handlePublishPress()`, which on step 1 just does `setStep(2)`. **Never disabled** — see gap #1 | `step` → 2 | — |

### Step 2

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 9 | Back arrow `‹` | `:286` | → step 1, keeping all entered values | `step` → 1 | — |
| 10 | Location card | `:198` | ❌ Not tappable. Static text: "Anna Nagar, Chennai" / "GPS Accuracy: High (5m)" | — | — |
| 11 | **Landmark field** | `:202` | Accepts typing, but has **no `value` and no `onChangeText`** — whatever is typed is discarded on unmount | ❌ none | — |
| 12 | Expiry picker | `:211` | Expands to show only the durations the chosen category allows; picking one sets the window. Disaster relief is admin-managed and offers no choice. **With no category selected it shows an ⓘ note instead: _"Pick a category first — it sets how long this request stays open."_** (`ExpiryPicker.js:27`) | `expiryMinutes` | — |
| 13 | "Post Anonymously" toggle | `:223` | Flips anonymity **and force-disables phone sharing** | `anonymous`, `phoneVisible` → false | — |
| 14 | "Share phone number with volunteers" toggle | `:242` | Flips phone visibility. **Disabled while `anonymous` is on.** Its helper line changes with state — when off it reads _"Phone hidden — volunteers contact via in-app chat only."_ (`:239`) | `phoneVisible` | — |
| 15 | "Share with local NGOs" toggle | `:252` | Flips NGO sharing (defaults **on**) | `shareNGO` | — |
| 16 | **"Publish Report 🚀"** | `:312` | If the profile already has an email → jumps straight to step 3. If not → opens the Complete Profile modal. Greyed and unpressable while `!canPublish` | `step` → 3, or `showEmailModal` | — |

### Complete Profile modal (only when the profile has no email)

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 17 | Email field | `:341` | Controlled input | `modalEmail` | — |
| 18 | ✕ close | `:331` | Dismisses the modal. **The report is abandoned** — it does not publish | `showEmailModal` | — |
| 19 | Agreement checkbox | `:358` | Toggles consent | `agreed` | — |
| 20 | **Save & Publish** | `:372` | Validates the email by regex. Invalid → shows an inline error. Valid but **unchecked box → silently does nothing** (`return` at `:103`, no message). Both valid → `saveEmail()` writes to the profile, modal closes, step 3 | `emailInputError` or `showEmailModal` + `step` | — |

### Step 3

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 21 | **"Track Report"** | `:267` | Goes to the Home tab | — | `DashboardTab` |
| 22 | **"Back Home"** | `:270` | Goes to the Home tab — **identical to #21** | — | `DashboardTab` |

> Both step-3 buttons call `navigation.navigate('DashboardTab')` with no params. "Track
> Report" tracks nothing.

---

## 3. Categories (`:35–45`)

Nine options — one more than the Dashboard's eight. **🔍 Lost & Found exists only here.**

| id | Label | Icon | Colour |
|---|---|---|---|
| `animal` | Animal Rescue | 🐶 | `COLORS.animal` |
| `medical` | Medical Help | ❤️ | `COLORS.emergency` |
| `food` | Food Donation | 🍱 | `COLORS.food` |
| `roadside` | Roadside Assist | 🚗 | `COLORS.secondaryBlue` |
| `elderly` | Elderly Support | 👴 | `COLORS.primaryGreen` |
| `disaster` | Disaster | 🌧 | `COLORS.warning` |
| `community` | Community Help | 🤝 | `COLORS.community` |
| `blood` | Blood Donation | 🩸 | `COLORS.emergency` |
| `lost` | **Lost & Found** | 🔍 | `COLORS.textSecondary` |

Selected chip tint uses the runtime template `` `${cat.color}15` `` (`:125`) — the same
string-concatenation alpha pattern as the tab bar and dashboard.

---

## 4. The expiry system

This screen is the only consumer of `apps/mobile/src/utils/expiry.js`, via
`<ExpiryPicker>` (`apps/mobile/src/components/ExpiryPicker.js`).

```js
// :56–60
const handleSelectCategory = (catId) => {
  setCategory(catId);
  const rule = getExpiryRule(catId);
  setExpiryMinutes(rule && !rule.adminManaged ? rule.maxMinutes : null);
};
```

Each of the 9 categories has its own rule (`utils/expiry.js:11–66`) — a `maxMinutes`, a set
of allowed `options`, and a note. **Disaster relief is `adminManaged`**: the reporter gets
no choice, and it's explicitly excluded from the blocking check.

### 4.1 What actually gates publishing

```js
// :62–66
const expiryRule    = getExpiryRule(category);
const expiryInvalid = exceedsMax(category, expiryMinutes);
const expiryMissing = !!category && !expiryRule?.adminManaged && !expiryMinutes;
const canPublish    = !expiryInvalid && !expiryMissing;
```

`canPublish` checks **the expiry window and nothing else**. Title, description, category
and photo are never validated. And because `expiryMissing` starts with `!!category`, a
report with **no category at all** short-circuits to `false` → `canPublish` is `true`.

**Net effect: you can publish a completely empty report.** See gap #1.

### 4.2 Validation matrix — every field in the report

| # | Field | Line | Required by UI? | Validated? | Blocks publish? | Notes |
|---|---|---|---|---|---|---|
| 1 | **Category** | `:122` | Implied — the expiry picker says *"Pick a category first"* | ❌ **No** | ❌ **No** | `expiryMissing` starts with `!!category`, so **no category makes the check pass** |
| 2 | **Report Title** | `:136` | Labelled "Report Title", no `*` | ❌ No | ❌ No | Any string, including empty. No `maxLength` |
| 3 | **Description** | `:145` | No marker | ❌ No | ❌ No | Any string, including empty. Unbounded |
| 4 | **Photo** | `:157` | *"Add Photo (Live Camera Recommended)"* | ❌ No | ❌ No | Cannot be attached at all — both buttons lack `onPress` |
| 5 | **Urgency** | `:173` | — | n/a | ❌ No | Defaults to `'Medium'`, always valid |
| 6 | **Location** | `:198` | — | n/a | ❌ No | Hardcoded string; not user-editable |
| 7 | **Landmark** | `:202` | "(Optional)" | ❌ No | ❌ No | **Input is discarded** — no `value`, no `onChangeText` |
| 8 | **Expiry window** | `:211` | Implied | ✅ **Yes** — `exceedsMax()` + presence check | ✅ **Yes** | **The only field that gates publishing** |
| 9 | Post Anonymously | `:223` | — | n/a | ❌ No | Boolean; force-disables #10 |
| 10 | Share phone | `:242` | — | n/a | ❌ No | Boolean; disabled while #9 is on |
| 11 | Share with NGOs | `:252` | — | n/a | ❌ No | Boolean, defaults on |
| 12 | **Email** (modal) | `:341` | Yes, when the profile has none | ✅ **Yes** — regex `:98` | ✅ Blocks the modal | Shows an inline error when invalid |
| 13 | **Agreement checkbox** (modal) | `:358` | Yes | ⚠️ Checked but **silent** | ⚠️ Blocks silently | `return` at `:103` with no message; the button is dimmed but **not `disabled`** |

**Summary: 13 fields, 2 validated.** Only the expiry window and the modal email are checked.
Neither of the two fields a human would call mandatory — category and title — is enforced.

### Step gating

| Step | Button | `disabled` condition | Effective behaviour |
|---|---|---|---|
| 1 | "Next: Location & Privacy →" | **none** (`:315` applies only when `step === 2`) | **Always tappable** — advances with an empty form |
| 2 | "Publish Report 🚀" | `step === 2 && !canPublish` | Blocks only on a missing/invalid expiry window **when a category is set** |
| 3 | Track Report / Back Home | — | Both go to `DashboardTab` |

```js
// :313–315 — the disabled prop is scoped to step 2 only
style={[styles.primaryButton, step === 2 && !canPublish && styles.primaryButtonDisabled]}
disabled={step === 2 && !canPublish}
```

### 4.3 Confirmed on device

A screenshot of step 2 with **no category selected** shows the expiry picker displaying
*"Pick a category first — it sets how long this request stays open."* while
**"Publish Report 🚀" renders fully green and enabled** directly below it.

The screen states the report is not ready and offers to publish it in the same view. That
is `canPublish` evaluating to `true` because `expiryMissing` short-circuits on
`!!category` — the bug is visible without reading any code.

---

## 5. Visual specification

| Element | Spec |
|---|---|
| Screen bg | `#FFFFFF` |
| Header | row, `ChevronLeft` 22 + "Report Help" + a 22 dp spacer to centre the title |
| Progress bar | 2 segments; filled `#16A34A` when `i <= step`, else `#E2E8F0` |
| Category chip — selected | tint `` `${cat.color}15` `` with a coloured border |
| Camera preview | `camera_preview.png`, static |
| Urgency pill — selected | filled with the urgency colour |
| Primary button | `#16A34A`, full width; disabled variant `styles.primaryButtonDisabled` |
| Modal | bottom sheet, `rgba(0,0,0,0.45)` scrim |
| Success circle | `80 × 80`, bg `#DCFCE7`, `CheckCircle` 48 green |

Raw hexes used: `#FFFFFF`, `#F1F5F9`, `#DCFCE7`, `#E2E8F0`, `#F8FAFC`, `#F0FDF4`,
`#BBF7D0`, `#CBD5E1`, `rgba(0,0,0,0.45)`. `COLORS` is imported and used heavily; `SIZES`
is imported and never used.

### 5.1 Image asset

![Camera preview](../../apps/mobile/src/assets/camera_preview.png)

`apps/mobile/src/assets/camera_preview.png` — 1024 × 1024, 804 KB. Rendered at `:157` as a
fake viewfinder. It is a **picture of a camera view**, not a camera.

---

## 6. Mobile ↔ Admin web connection

**None — and this is the most consequential gap in the whole app.**

Publishing is the single most important write in the product. Nothing is written. The
values collected — `category`, `title`, `description`, `urgency`, `expiryMinutes`,
`anonymous`, `phoneVisible`, `shareNGO` — exist only as component state and are destroyed
when the screen unmounts. Step 3 is a static success screen that follows no action.

Everything downstream is therefore fiction: the Dashboard's category counts, My Helps'
queue, the admin console's `MOCK_REPORTS` — none of them can ever contain a report a user
actually filed.

Expected once wired:

```
POST /reports
  { category, title, description, urgency, expiryMinutes,
    anonymous, phoneVisible, shareNGO, lat, lng, landmark, photoUrl }
  → 201 { id }  → step 3, "Track Report" opens RequestDetails with that id
```

| This screen collects | Admin console field | Where |
|---|---|---|
| `category` | `category` + `catImage` | `MOCK_REPORTS`, `admin/dashboard/page.tsx:73` |
| `title` | `title` | same |
| `urgency` | priority badge | same |
| `anonymous` / `phoneVisible` | reporter `phone` visibility | same |
| `expiryMinutes` | `expiryHours` setting | admin settings object `:636` |
| photo | proof image | story/report media |

The admin side already has an expiry setting and a fake-report queue built for exactly this
data.

---

## 7. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Nothing is validated except the expiry window.** `canPublish` (`:66`) ignores category, title and description, and its `!!category` guard means a report with no category passes. Step 1's button is never disabled at all. | A user can tap through and "publish" a report with no category, no title, no description and no photo — and get the success screen. | Gate step 1 on `category && title.trim()`, and include those in `canPublish`. |
| 2 | **The report is never saved anywhere.** No API call, no context write, no AsyncStorage. Step 3 is cosmetic. | The core action of the app does nothing. Everything downstream is mock data. | `POST /reports`; on success move to step 3 with the returned id. |
| 3 | **"Take Photo" and "Upload" have no `onPress`** (`:159`, `:163`), and the preview is a static PNG. No `expo-camera` or `expo-image-picker` is installed. | Photo capture — required by Rule 1 of the product spec for mission completion — does not exist. Both buttons are decoration. Note the admin console defines `maxPhotos: 4` per report (`admin/dashboard/page.tsx:650`) which this screen never reads. | `npx expo install expo-image-picker expo-camera`; wire both handlers. **Full spec: [20 §2A](./20-edit-profile-screen.md#2a-profile-photo-upload--full-specification)** |
| 4 | **The landmark field discards its input** (`:202`) — no `value`, no `onChangeText`. | The user types a landmark, it vanishes. No error, no hint. | Add `landmark` state and bind it. |
| 5 | **Location is hardcoded.** "Anna Nagar, Chennai" and "GPS Accuracy: High (5m)" are literals (`:198–199`). | The claimed 5-metre GPS accuracy is invented. Reports carry no coordinates. | Read a real position via `expo-location`. |
| 6 | **The unchecked agreement box fails silently.** `handleSaveEmailAndPublish` returns at `:103` with no feedback, and the button is dimmed but **not `disabled`** (`:372`). | The user taps Save repeatedly and nothing happens — the email field shows errors but the checkbox never does. | Set `disabled={!agreed}`, or show an inline error. |
| 7 | **Both step-3 buttons do the same thing** (`:267`, `:270`) — "Track Report" and "Back Home" both go to `DashboardTab`. | "Track Report" implies opening the new report. | Route Track to `RequestDetails` with the created id. |
| 8 | **Back on step 1 does nothing.** `navigation.goBack()` from a tab root has no history (`:286`). | The back arrow is visible and inert on the first screen. | Hide it on step 1, or switch to the Home tab. |
| 9 | **Progress bar shows 2 segments for a 3-step flow** (`:295`). | Minor — step 3 hides the bar, so it's defensible, but it reads as "2 steps" throughout. | Label it "Step 1 of 2" for honesty. |
| 10 | **Dead code:** `handleNext` (`:47`) never called; `photoAdded`/`setPhotoAdded` (`:27`) never read or set; `user` destructured at `:13` and never used. | Confusion — `handleNext` looks like the wizard's navigation but isn't. | Delete all three. |
| 11 | **Unused imports:** `ImageIcon`, `Sparkles` (`:3`), `SIZES` (`:4`). | Dead weight. | Remove. |
| 12 | **Losing the wizard is silent.** The flow lives in a tab, so tapping Home mid-report discards everything with no warning. | Partially-entered reports vanish. | Warn on tab change when the form is dirty — see [07 gap #9](./07-main-tabs.md#8-gaps--known-issues). |

> **Fix order:** #1 and #2 together — validation is pointless without a save, and a save is
> dangerous without validation. Then #3, which Rule 1 of the product spec depends on.

---

## 8. What works well

- **Category change resets the help window** (`:56–60`) with a comment explaining why a
  longer window must never carry over from a previous category. Careful, deliberate logic.
- **`adminManaged` categories are excluded from the blocking check** (`:65`) — disaster
  relief correctly can't block publishing on a window the reporter isn't allowed to set.
- **Email is asked once and stored on the profile, not on the report** (`:91–95`, with a
  comment saying exactly that). Correct single-source-of-truth thinking.
- **Anonymity force-disables phone sharing** (`:223`) rather than leaving a contradictory
  pair of toggles.

---

## 9. QA checklist

- [ ] Selecting a category updates the expiry picker's options and default.
- [ ] Switching from a long-window category to a short one lowers the selected window.
- [ ] Disaster relief shows an admin-managed note and no duration choice.
- [ ] "Take Photo" and "Upload" do nothing (gap #3).
- [ ] Typing a landmark and returning to step 2 — the text is gone (gap #4).
- [ ] "Post Anonymously" on immediately turns "Share phone number" off and disables it.
- [ ] Publish with no category and no title — currently succeeds (gap #1).
- [ ] With no email on the profile, Publish opens the modal; with one, it goes straight to step 3.
- [ ] Modal: invalid email shows an error; valid email + unchecked box does nothing (gap #6).
- [ ] After saving the email once, publishing a second report skips the modal.
- [ ] Both step-3 buttons land on Home.
- [ ] Leaving mid-wizard via another tab and returning — confirm state is lost.

---

## 10. Changing this screen

| To change… | Edit |
|---|---|
| Categories | `:35–45` |
| Urgency levels | `:173` — inline array |
| Expiry rules per category | `apps/mobile/src/utils/expiry.js:11–66` |
| Publish gating | `:62–66` — `canPublish` |
| Publish behaviour | `:73–89` — `handlePublishPress` |
| Email modal logic | `:96–108` |
| Hardcoded location | `:198–199` |
| Step-3 destinations | `:267`, `:270` |
| Camera preview image | `apps/mobile/src/assets/camera_preview.png` |

---

**Previous:** [09 — My Helps](./09-my-helps-screen.md) · **Next:** [11 — Alerts](./11-alerts-screen.md)
