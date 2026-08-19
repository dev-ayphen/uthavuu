# 14 — Request Details (stack)

> **The largest screen in the app — 1,789 lines.** Full view of a help request: mission
> roster and join flow, community updates feed with a simulated AI moderation scan,
> accept-gated contact actions, and the **"Report Post to Admin"** flow.
>
> This is where fake/spam reporting lives, and where the app's contact-privacy rules are
> enforced.

| | |
|---|---|
| **Route name** | `RequestDetails` |
| **Source file** | `apps/mobile/src/screens/RequestDetailsScreen.js` (1789 lines) |
| **Registered in** | `apps/mobile/App.js:76–80` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Category List · My Helps · Flagged |
| **Navigates to** | `VolunteerJourney` (×4 call sites) |
| **Context used** | ✅ **Both** `useUser()` and `useFlags()` — the only screen that uses both |
| **Talks to admin web** | No (but claims to — see §4) |

---

## 1. Interaction map — every tap target

### Header & hero

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Back `‹`** | `:317` | Returns to the list | — | `goBack()` |
| 2 | **🚩 Flag (header)** | `:322` | Opens the **Report Post to Admin** modal | `showFlagModal` | — |
| 3 | **⤴ Share (header)** | `:325` | Opens the share sheet | `showShareModal` | — |
| 4 | **Open in Google Maps** | `:381` | ✅ Real `Linking.openURL` to a maps direction URL | — | External |

### Mission & contact (accept-gated)

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 5 | **Mission chat** | `:536` | Opens the chat modal | `showChatModal` |
| 6 | **📞 Call reporter** | `:547` | ✅ Real `Linking.openURL('tel:…')`. **Only rendered once the volunteer has accepted** | — |
| 7 | **Join / advance mission** | `:1092`, `:1141` | Handled by `MissionControls` inside the mission modal | mission state |
| 8 | **Needed count − / +** | `:1117`, `:1124` | Adjusts how many volunteers are needed, clamped **2–20** | `neededCount` |
| 9 | **Leave mission** | `:749` | `handleConfirmLeave` after a confirmation sheet | mission state |
| 10 | Leave — Cancel | `:742` | Dismisses | `showLeaveConfirm` |

### Community updates feed

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 11 | **"Post an update"** | `:587`, `:709` | Opens the update composer | `showUpdateModal` |
| 12 | **👍 Helpful** | `:667` | Toggles a helpful vote on that update | `updates` |
| 13 | **Report this update** | `:682` | ❌ `Alert.alert('Report', 'This update has been reported for review.')` — **nothing is recorded**. A second, weaker reporting path than #2 | — |
| 14 | **Approve pending review** | `:655` | `handleApprovePendingReview(update.id)` | `updates` |
| 15 | **Show more / less** | `:694` | Expands the feed | `showAllUpdates` |

### Update composer modal

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 16 | Close ✕ | `:773`, `:887` | Closes | `showUpdateModal` |
| 17 | **Type chip ×4** | `:793` | 📍 Location Update · ℹ️ Information · 🚨 Urgent · ✅ Status Update | `newUpdateType` |
| 18 | **Resolution outcome ×3** | `:821` | Fully resolved · Partially resolved · Unresolved | `resolutionStatus` |
| 19 | **📷 Attach photo** | `:859` | ❌ **Fake.** Sets a hardcoded Unsplash URL and alerts *"Proof photo attached successfully!"* — no camera, no picker | `attachedPhoto` |
| 20 | **Post** | `:893` | Runs the simulated AI scan (§3), then publishes or holds the update | `updates`, scan state |

### Share sheet

| # | Element | Line | Tap → what happens |
|---|---|---|---|
| 21 | Close ✕ | `:1040` | Closes |
| 22 | **WhatsApp** | `:1055` | ❌ `alert('Sharing to WhatsApp...')` |
| 23 | **Instagram** | `:1058` | ❌ `alert('Sharing to Instagram...')` |
| 24 | **Facebook** | `:1061` | ❌ `alert('Sharing to Facebook...')` |
| 25 | **Copy link** | `:1065` | ❌ `alert('Link copied!')` then closes — copies nothing |

### 🚩 Report Post to Admin modal

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 26 | Close ✕ | `:1279` | Closes without reporting | `showFlagModal` |
| 27 | **Reason radio ×7** | `:1289` | Selects one reason; the row turns red-bordered with a filled radio | `flagReason` |
| 28 | Cancel | `:1313` | Closes | `showFlagModal` |
| 29 | **Submit report** | `:1316` | `handleFlagSubmit` — writes the flag **with the chosen reason** into `FlagContext`, closes, and alerts *"🚩 Report Submitted to Admin"* | `flagged` (context) |

---

## 1A. The **REPORTED BY** trust card (`:397–484`)

The single richest component on the screen, and the implementation of **Rule 10** (reporter
trust *without* ratings). It is an IIFE — `{(() => { … })()}` — that resolves privacy flags
first, then renders.

```
┌─────────────────────────────────────────────────────────┐
│ REPORTED BY                                             │
│  ╭───╮  Ravi Kumar            ┌─────────────┐           │
│  │ R │                        │ ⛨ Verified  │           │
│  ╰───╯  💼 Software Engineer  ·  🏅 Top Reporter        │
│         📅 Member since Jan 2026                        │
│ ─────────────────────────────────────────────────────── │
│      96%       │       38        │       34             │
│   Reliability  │    Reports      │    Resolved          │
└─────────────────────────────────────────────────────────┘
```

### 1A.1 Privacy resolution — five flags, evaluated before render

Every flag defaults to **shown**, using `!== false` so an absent field is treated as consent
already given.

| Flag | Line | Default | When false |
|---|---|---|---|
| `isAnonymous` | `:400` | `false` | Name becomes **"Anonymous Reporter"**, and `showName` is forced `false` |
| `showNamePublicly` | `:405` | shown | Renders "Anonymous Reporter" in place of the name |
| `showProfession` | `:406` | shown | `profession` resolves to `null` → the 💼 segment disappears |
| `showPhotoPublicly` | `:407` | shown | Avatar renders **👤** instead of the name initial |
| `showCommunityStats` | `:408` | shown | **Hides the whole 3-stat strip and the 🏅 badge** |

```js
// :400–404 — anonymity wins over name preference
const isAnonymous  = request?.isAnonymous || false;
const reporterName = isAnonymous ? 'Anonymous Reporter'
                   : (request?.poster || request?.postedBy || 'Ravi Kumar');
const showName     = isAnonymous ? false : (request?.showNamePublicly !== false);
```

✅ **The precedence is correct** — `isAnonymous` is evaluated first and overrides
`showNamePublicly`, so a reporter cannot be de-anonymised by a stale per-field flag.

⚠️ The avatar still renders `reporterName[0]` when `showPhoto` is true — for an anonymous
reporter that is **"A"**, derived from the literal *"Anonymous Reporter"*, so no identity
leaks. Correct by accident rather than by design; a rename of that string would change it.

### 1A.2 Rule 10 — ✅ satisfied: no star rating is rendered

**Verified 2026-08-18 against the running screen.** The card shows **Verified · Reliability ·
Reports · Resolved** — and no stars.

```js
// :411 — declared, and never referenced again anywhere in the file
const rating = request?.rating || '4.9';
```

`rating` is a **dead variable**. It is assigned and never read: it appears exactly once in
1,789 lines, and no JSX consumes it.

> **Correction.** Earlier revisions of this document stated that `rating` *"renders ⭐ 4.9 on
> every reporter card"*. That was wrong — the declaration was mistaken for a render. The UI
> has never shown it.

| Value | Line | Rendered? | Action |
|---|---|---|---|
| `isVerified` | `:417` | ✅ `⛨ Verified` chip | Keep |
| `profession` | `:410` | ✅ `💼 …` | Keep |
| `communityBadge` | `:416` | ✅ `🏅 Top Reporter` (stats-gated) | Keep |
| `memberSince` | `:415` | ✅ `📅 Member since …` | Keep |
| `reliability` · `reportCount` · `resolvedCount` | `:412–414` | ✅ 3-stat strip | Keep |
| **`rating`** | **`:411`** | ❌ **Never rendered** | **Delete the line** — dead code, not a policy breach |

**Remaining star-rating code in the repo — both dead, one live:**

| Location | What | Status |
|---|---|---|
| `RequestDetailsScreen.js:411` | `const rating = …` | 🟡 Dead variable — delete |
| `CategoryListScreen.js:797` | `reporterStripRating` style | 🟡 Dead style — delete |
| `admin/dashboard/page.tsx:2539` | Impact Stories tile, `sub: '4.9★ avg rating'` | 🔴 **Live and rendering** — the only real Rule 10 violation left |

See [PRODUCT-DECISIONS · Decision 1](../PRODUCT-DECISIONS.md#decision-1--no-star-ratings).

### 1A.3 Fallbacks

Every field falls back to a literal, so the card **never renders empty** — and never renders
the real reporter either, since no request record carries any of these fields:

`'Ravi Kumar'` · `'Software Engineer'` · `'96%'` · `38` · `34` · `'Jan 2026'` ·
`'🏅 Top Reporter'` · `isVerified` defaults **true**.

⚠️ **Every reporter in the app is shown as Verified with 96% reliability**, because
`isVerified` uses `!== false` and nothing sets it. This is the same defensive-default trap
as [15 §3](./15-volunteer-journey-screen.md#3-fallback-content--why-the-wrong-mission-appears)
— a missing-data bug presented as confident, wrong data. Trust indicators are the worst
place for it.

---

## 1B. Mission summary & volunteer roster

Rendered by the shared [`MissionSummary` / `MissionControls`](./23-shared-components.md)
(`:485–500`) and `VolunteerRoster`, gated on `!isCompleted`.

```
┌─────────────────────────────────────────────────────────┐
│ VOLUNTEERS NEEDED        ┌────────────────────────────┐ │
│ 1 of 5                   │ ⚠ Expires in 45 mins       │ │
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░ └────────────────────────────┘ │
│ 👥 4 more volunteers needed                             │
│ ─────────────────────────────────────────────────────── │
│ 📍 1 Arrived                                            │
│ ┌─────────────────────────────────────────────────────┐ │
│ │            👥  Join mission                         │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

👥 Volunteers  ⟨3⟩
┌─────────────────────────────────────────────────────────┐
│ ⓗ Hari                                     [ Reporter ] │
│ ⓟ Priya                                   [ ● Arrived ] │
│ ⓐ Arun  (dimmed)                      [ Left mission ]  │
└─────────────────────────────────────────────────────────┘
```

| Element | Source | Behaviour |
|---|---|---|
| `1 of 5` + progress bar | `missionActive` / `missionNeeded` | Fills proportionally |
| `⚠ Expires in 45 mins` | `ExpiryBadge` ← `expiry.js` | Amber under 1 h; hidden when `adminManaged` |
| `n Arrived` | `missionStages` breakdown | Counts roster members at `ARRIVED` |
| **Join mission** | `handleJoinMission` | Label advances with `myStatus`; disabled when `missionFull` |
| Roster chips | `missions.js` state machine | `Reporter` (grey) · `● Arrived` (green) · `Left mission` (grey, row dimmed) |

The roster is the one place the **6-state volunteer machine** in
[`missions.js`](./24-utils-and-dead-code.md) is visible to a user. `Left mission` dims the
whole row rather than removing it — a deliberate and good choice: it preserves the record
that someone dropped out, which matters when deciding whether to join.

---

## 1C. Mission Temporary Chat — lifecycle & privacy

The chat is scoped to **one mission**, not a persistent conversation between two users. It
exists so a reporter and the volunteers who accepted can coordinate *this* help request.

```
Reporter posts a request
   ↓
Volunteer taps "I'll Help"
   ↓
Volunteer accepted / joined
   ↓  💬 Mission Chat unlocks
Coordinate the help
   ↓
Completion proof submitted → verification
   ↓
Mission COMPLETED
   ↓  🔒 Chat locked → Read Only → Archived
```

### 1C.1 The three states — 1 of 3 built correctly

| State | Should show | **Actually shows** | Status |
|---|---|---|---|
| **Before accepting** | 🔒 *"Chat available after you join this mission"* | ❌ **Nothing at all** — the whole contact card is hidden with no explanation | 🔵 |
| **After accepting** | 💬 Mission Chat | ✅ Chat card with *"Always on"* | 🟢 **Correct** |
| **After completion** | 🔒 *"Mission Chat — Read Only"* + past messages | ❌ **The chat disappears entirely** — history is unreachable | 🔵 |

```jsx
// :518 — one condition controls both hidden states
{hasAccepted && !isCompleted && (
  <View style={styles.contactCard}>   // Chat + Phone live here
```

```js
// :109
const isCompleted = request?.status === 'COMPLETED';
```

⚠️ **`!isCompleted` hides the card rather than locking it.** Rule 15 requires
*Locked → Read Only → Archived*, where past messages stay viewable. Today a completed
mission's conversation is simply gone — the opposite of archived.

> `FUNCTIONAL_FLOW.md` §4 already records this: **❌ Rule 15 — chat never locks.** The
> nuance the spec misses is that the chat doesn't *stay open* either; it vanishes.

### 1C.2 ✅ Privacy is implemented correctly

This is one of the better-designed parts of the app, and the source comment states the
intent plainly:

```jsx
// :514–517
/* ── Post-Accept Contact Card ──
   Chat is always shown after accepting.
   Phone is shown only if reporter enabled phone sharing.
   Before accepting — this section is hidden entirely (privacy-first). */
```

| Rule | Status |
|---|---|
| Chat unlocks only after accepting / joining | 🟢 Gated on `hasAccepted` |
| **Chat never exposes a phone number** | 🟢 Chat and phone are separate controls |
| Phone shown **only** if the reporter opted in | 🟢 Gated on `phoneVisible` (`:407`) |
| With phone sharing OFF, chat still works | 🟢 Chat is labelled *"Always on"* |
| Public Impact Stories never expose contact details | 🟢 No contact fields on [17](./17-impact-story-screen.md) |

The reporter's `phoneVisible` choice comes from the report wizard's *"Share phone number
with volunteers"* toggle, which is force-disabled when posting anonymously
([10](./10-report-flow-screen.md#2-interaction-map--every-tap-target) #13/#14).

### 1C.3 ✅ No permanent Chat tab — correct by design

There is **no Chat entry in the tab bar** and no inbox. The chat is reachable only from the
mission it belongs to. That is the intended model: temporary coordination, not a messaging
product.

Verified — the 5 tabs are Home · My Helps · Report · Alerts · Profile
([07](./07-main-tabs.md)).

### 1C.4 What to build

- [ ] **Before accepting:** show a disabled row — 🔒 *"Chat available after you join this mission"* — instead of hiding the card
- [ ] **After completion:** render the card in a read-only state rather than removing it —
      past messages visible, composer disabled, header 🔒 *"Mission Chat — Read Only"*
- [ ] Replace the `<Text>` placeholder input with a real `TextInput` *(defect #8)*
- [ ] Persist messages so "archived" means something — today they are local `useState`

Changing `!isCompleted` from *hide* to *read-only* is the substantive fix; the gating logic
around it is already right.

---

## 1D. Community Updates — the full flow

The public information feed on an active request. Distinct from Mission Chat (§1C): **anyone
may post here and everyone can read it**, whereas chat is participants-only.

See [PRODUCT-DECISIONS · Decision 3](../PRODUCT-DECISIONS.md) for why the two are separate.

### 1D.1 Layout (`:571–716`)

```
─────────────────────────────────────────────────────────
💬 Community Updates ⟨6⟩              [ + Add Update ]
Share information that helps resolve this request.

┌───────────────────────────────────────────────────────┐
│ ⓐ Arun  [🦺 Volunteer]                          ┌───┐ │
│    2 mins ago                                   │📍 │ │
│                                                 └───┘ │
│ Dog has moved near the temple entrance. Look          │
│ behind the white wall.                                │
│ ───────────────────────────────────────────────────── │
│ 👍 Helpful (5)                                 Report │
└───────────────────────────────────────────────────────┘
        … 2 more cards (3 shown by default) …

          [ Show All 6 Updates ]

┌───────────────────────────────────────────────────────┐
│ ⓨ  Share a helpful update...                       ➤ │
└───────────────────────────────────────────────────────┘
```

The header subtitle **changes with lifecycle state** (`:596`):

| State | Subtitle | Composer |
|---|---|---|
| Active | *"Share information that helps resolve this request."* | ✅ Shown |
| Completed | *"Timeline of how the community resolved this request."* | ❌ `+ Add Update` and the quick input are both hidden |

✅ **This is the read-only-archive pattern that Mission Chat should have used** and doesn't
([§1C.1](#1c1-the-three-states--1-of-3-built-correctly)). The same file solves the same
problem correctly 60 lines away: history stays visible, composing stops.

### 1D.2 Data shape — `SAMPLE_UPDATES` (`:134–166`, 6 records)

```js
{ id: 1, userName: 'Arun', role: 'volunteer', badge: '🦺 Volunteer',
  type: 'location', message: 'Dog has moved near the temple entrance…',
  time: '2 mins ago', helpful: 5, isHelpful: false }
```

| Field | Purpose |
|---|---|
| `role` | Drives the badge colour — **not** permissions |
| `badge` | Display label, stored redundantly alongside `role` |
| `type` | One of the 4 `UPDATE_TYPES`, drives the corner chip |
| `helpful` / `isHelpful` | Count and the current user's vote |
| `proofImage` | Optional — renders a thumbnail + "AWS Rekognition Auto-Scan Passed ✓" |
| `status` | Only `'PENDING_REPORTER_REVIEW'` / `'APPROVED'` are used |

**Three roles, colour-coded** (`:290–301`):

| Role | Badge | Background | Text |
|---|---|---|---|
| `reporter` | 👤 Reporter | `#FEF3C7` amber | `#D97706` |
| `volunteer` | 🦺 Volunteer | `#F0FDF4` green | `#16A34A` |
| `resident` | 📍 Nearby Resident | `#F0F9FF` blue | `#0284C7` |

`role` is **cosmetic only** — it is never checked before allowing an action. Anyone can post
as any type, and every locally-composed update is hardcoded to `role: 'volunteer'` /
`'🦺 Volunteer'` (`:265–266`) **regardless of who the user actually is**. A reporter posting
on their own request is labelled a volunteer.

### 1D.3 Update types (`UPDATE_TYPES`, `:119–124`)

| id | Label | Icon | Colour | Special behaviour |
|---|---|---|---|---|
| `location` | Location Update | 📍 | `#3B82F6` | — |
| `info` | Information | ℹ️ | `#8B5CF6` | **Default** (`:170`) |
| `urgent` | Urgent | 🚨 | `#EF4444` | — |
| `status` | Status Update | ✅ | `#16A34A` | ⚠️ **Routes into the reporter-approval branch** |

Selecting **Status Update** silently changes what the Post button does — it becomes a
completion-proof submission rather than a comment. Nothing in the composer says so.

### 1D.4 The post pipeline — `postUpdate()` (`:196–255`)

```
                      [ Post ]
                          │
              ┌───────────┴───────────┐
              │  attachedPhoto set?   │
              └───────────┬───────────┘
                 no │           │ yes
                    ▼           ▼
            commitUpdate()   isAiScanning = true
            posts instantly   setTimeout 1200 ms
            NO scan at all           │
                                     ▼
                    ┌────────────────────────────────┐
                    │ text contains 'unsafe'         │
                    │      or 'nudity'?              │
                    └────────────────┬───────────────┘
                          yes │             │ no
                              ▼             ▼
                  FLAGGED_FOR_ADMIN    type === 'status'?
                  Alert: "AWS Content       │        │
                  Moderation detected   yes ▼        ▼ no
                  sensitive content"   PENDING_    commitUpdate()
                  → discarded,         REPORTER_   published
                    posted nowhere     REVIEW
```

**Three findings, in order of seriousness:**

1. **No photo → no moderation at all** (`:256`). The scan only runs inside
   `if (attachedPhoto)`. A text-only update posts instantly, unscanned — so the word filter
   that supposedly guards the feed is trivially bypassed by not attaching a photo.
2. **The scan reads the caption, never the image** (`:206`). `newUpdateText.toLowerCase()
   .includes('unsafe' | 'nudity')` — a `setTimeout` and a substring test. No image data is
   examined by anything.
3. **The flagged update is silently destroyed** (`:212–218`). The user is told it *"has been
   sent to Uthavu Admins for review"*. It is not: state is cleared, the modal closes, and no
   record is written anywhere. The comment at `:205` also says it flags on `'accident'` — the
   code does not.

⚠️ The literal string shown to users — *"AWS Content Moderation detected sensitive
content"* — **names a third-party service that is not integrated**. See §3.

### 1D.5 The reporter-approval branch (`:221–247`)

When `type === 'status'` **and** a photo is attached, the update becomes a completion proof:

```js
message: `[${resolutionStatus} RESOLUTION] ${newUpdateText.trim()}`,
status:  'PENDING_REPORTER_REVIEW',
time:    'Just now (Pending Reporter Approval)',
```

`RESOLUTION_OUTCOMES` (`:128–132`) — ordered best → worst, each with a consequence hint:

| id | Label | Hint |
|---|---|---|
| `FULL` | Fully resolved | Nothing further is needed |
| `PARTIAL` | Partially resolved | More help is still needed |
| `UNRESOLVED` | Unresolved | The request stays open |

✅ **Well-designed copy** — the label states the outcome, the hint states what it means for
the request, so the two never repeat each other.

The card then renders a **pending banner** with an `Approve & Convert` button (`:644–660`),
promising: *"Reporter has 3 days to approve. Reminders sent via email & push. Escalates to
Admin if unreviewed."*

**None of that machinery exists.** No timer, no email, no push, no escalation path, no admin
queue. And the approve button is rendered **to whoever is looking at the screen** — there is
no check that the viewer is the reporter, so the volunteer who submitted the proof can
approve their own completion by tapping it.

`handleApprovePendingReview` (`:279–286`) then alerts *"This mission has officially converted
into an Impact Story."* — it only rewrites a local `status` field. **No story is created.**

### 1D.6 Interaction map

| # | Element | Line | Tap → what happens | Real? |
|---|---|---|---|---|
| a | **+ Add Update** | `:587` | Opens the composer. Hidden when completed | ✅ |
| b | **Quick input row** | `:708` | Same composer; shows the user's initial from `useUser()` | ✅ |
| c | **👍 Helpful** | `:667` | `toggleHelpful` — increments/decrements and fills the icon | ✅ local |
| d | **Report** | `:682` | ❌ `Alert.alert('Report', 'This update has been reported for review.')` — **records nothing**. Weaker than the header 🚩 flow, which does write to `FlagContext` | ❌ |
| e | **Show All *n* Updates / Show Less** | `:691` | Toggles the 3-item slice (`:287`). Only rendered when `length > 3` | ✅ |
| f | **Approve & Convert** | `:655` | Local status rewrite + a false success alert | ❌ |
| g | Proof thumbnail | `:634` | Static `Image`, not tappable — no lightbox | — |

### 1D.7 Mobile ↔ Admin — the updates path

Admin has a matching surface: **Community → Community Updates**
([webadmin 05 §2](../webadmin/05-community.md#2-community-updates-2253)).

| Mobile | Admin `MOCK_UPDATES` (`:107`) |
|---|---|
| `message` | `update` |
| `userName` | `postedBy` |
| — (no request linkage) | `reportTitle` + `reportId` |
| `helpful` | `likes` |
| `time` | `time` |
| `status: PENDING_REPORTER_REVIEW` | ❌ **No equivalent** — the table hardcodes every row to "Published" |
| `type` (4 kinds) | ❌ Not modelled |
| `role` / `badge` | ❌ Not modelled |

**The two ends disagree on the shape.** Mobile updates carry no `reportId`, so an update
composed here could not be attached to a report even if a backend existed. Admin has
`hidden` and `pinned` fields that mobile never sends, and mobile has a moderation state that
admin cannot display — the flagged-for-review update the app claims to escalate has **no
inbox to arrive in**.

Required: `POST /reports/:id/updates`, `POST /updates/:id/helpful`,
`POST /updates/:id/report`, and a moderation queue keyed on `PENDING_REPORTER_REVIEW`.

---

## 2. Reporting fake / spam content

This is the app's **only** real content-moderation entry point.

```js
// :38–46
const FLAG_REASONS = [
  'Fake / Misleading',
  'Wrong Location',
  'Spam',
  'Inappropriate Content',
  'Duplicate',
  'Already Resolved',
  'Other'
];
```

Default selection is **"Fake / Misleading"** (`:36`).

```js
// :48–55
const handleFlagSubmit = () => {
  toggleFlag(
    request || { id: '101', title: 'Help Request' },
    { id: request?.categoryId || 'animal', title: request?.category || 'Animal Rescue', icon: '🐶' },
    flagReason                                  // ← the reason IS passed
  );
  setShowFlagModal(false);
  Alert.alert('🚩 Report Submitted to Admin',
    'Thank you for keeping Udhavu safe. Uthavu Admins will review this report in the Flagged Reports queue.');
};
```

**This is the correct flag path.** Compare the quick 🚩 button on
[13 — Category List](./13-category-list-screen.md) `:635`, which calls
`toggleFlag(req, category)` with no reason and silently stores `'Reported by user'`.

| Path | Reason captured? |
|---|---|
| Request Details → Report Post to Admin (7 options) | ✅ Yes |
| Category List → quick 🚩 | ❌ No — defaults |
| Update feed → "Report this update" (`:682`) | ❌ **Nothing at all** — an alert only |

⚠️ The confirmation alert spells the brand **both ways in one sentence** — "keeping
**Udhavu** safe. **Uthavu** Admins will review…".

### 2.1 What the app cannot report

Verified by grep across `apps/mobile/src`: there is **no report-user, block-user, or
mute-user action anywhere in the mobile app.** Users can flag *content* only. The admin
console tracks per-user `flags`, `warnings`, `suspensions` and a `status` of Active /
Suspended / Blocked (`admin/dashboard/page.tsx:62`) — none of which the app can raise or
respond to.

---

## 3. The simulated AI moderation scan

```js
// :196–215 (abridged)
const postUpdate = () => {
  if (!newUpdateText.trim()) return;
  // Simulated AWS AI Rekognition Auto-Scan for Safety
  if (attachedPhoto) {
    setIsAiScanning(true);
    setTimeout(() => {
      setIsAiScanning(false);
      const isFlaggedByAws = newUpdateText.toLowerCase().includes('unsafe')
                          || newUpdateText.toLowerCase().includes('nudity');
      if (isFlaggedByAws) {
        setAiScanStatus('FLAGGED_FOR_ADMIN');
        Alert.alert('⚠️ Image Flagged by AWS Moderation',
          'AWS Content Moderation detected sensitive content. This update has been sent to Uthavu Admins for review before public publishing.', …);
```

| Claim | Reality |
|---|---|
| "AWS Rekognition auto-scan" | No AWS SDK, no network call — a `setTimeout` |
| "Detected sensitive content" **in the image** | It searches the **caption text**, never the photo |
| Trigger words | `'unsafe'` or `'nudity'` |
| The code comment says | `'accident'` or `'unsafe'` — **the comment and the code disagree** |
| "Sent to Uthavu Admins" | Nothing is sent anywhere |

The alert tells the user an image-moderation system inspected their photo. Nothing
inspected anything, and the photo itself is a hardcoded Unsplash URL (#19).

**Write-only scan state:** `isAiScanning` (`:176`), `aiScanStatus` (`:177`) and
`pendingReview` (`:178`) all have setters that fire (`:201`, `:203`, `:209`, `:238`, `:283`)
but **are never read** anywhere in the render. The moderation UI is wired at one end only.

---

## 4. Mobile ↔ Admin web connection

**None — and this screen states otherwise to the user.**

Two alerts promise an admin hand-off that does not exist:

1. *"Uthavu Admins will review this report in the Flagged Reports queue"* (`:53`)
2. *"This update has been sent to Uthavu Admins for review before public publishing"* (`:206`)

The admin console does have both destinations — *Flagged Reports* (`:2067`),
`MOCK_FLAGS` (`:90`), `MOCK_FAKE_REPORTS` (`:84`) and *Community Updates* (`:2246`) — all
populated with hardcoded records. The flag written here stays in an in-memory context that
`FlagContext.js:10` says resets on reload.

| This screen | Admin counterpart | Connected? |
|---|---|---|
| 7 flag reasons | 5 reason categories | ❌ Vocabularies differ |
| "Fake / Misleading" | `MOCK_FAKE_REPORTS` queue | ❌ |
| Update feed + AI scan | *Community Updates*, hide/approve | ❌ |
| Accept-gated phone reveal | Reporter `phone` column | ❌ |
| Mission roster / needed count | `MOCK_VOLUNTEERS`, mission assignment | ❌ |

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **The app tells users their report reached moderators. It didn't.** (`:53`, `:206`) | Not a stub — a false statement. A user who reports a fake emergency believes an admin will review it; the flag dies in memory on the next reload. In a safety app this is the most serious defect documented. | Wire `POST /flags`; until then, don't claim admin review. |
| 2 | **The "AWS moderation" scan is theatre** (`:196–215`). It greps the caption for `'unsafe'`/`'nudity'`, never touches the image, and calls no service. | Users are told an AI inspected their photo. Genuinely unsafe images pass; a caption containing "unsafe" is held. | Integrate real moderation, or remove the claim. |
| 3 | **Photo attachment is fake** (`:190`). Sets a hardcoded Unsplash URL and alerts "Proof photo attached successfully!". | Every "proof photo" in the app is the same stock image. Rule 1 requires live-camera proof. | `expo-image-picker` / `expo-camera`. **Full spec: [20 §2A](./20-edit-profile-screen.md#2a-profile-photo-upload--full-specification)** |
| 4 | **Write-only scan state.** `isAiScanning`, `aiScanStatus`, `pendingReview` are set but never read. | The moderation UI can never display a result. | Render them, or delete. |
| 5 | **Write-only mission state.** `setJoinedCount`, `setTotalNeeded`, `setVolunteers` (`:65`, `:66`, `:71`) are **never called** — the roster is immutable despite being state. | Joining a mission can't change the roster. | Wire the setters, or make them constants. |
| 6 | **Three ways to report, three fidelities.** Full modal (reason captured) → quick 🚩 (reason lost) → "Report this update" (nothing at all). | Inconsistent moderation quality depending on where the user taps. | One reporting component everywhere. |
| 7 | **Share sheet is four `alert()` stubs** (`:1055–1065`) — the third identical copy in the app, while [17](./17-impact-story-screen.md) implements it properly. | Same feature, two qualities, three copies. | Extract 17's `handleShare` into a shared component. |
| 8 | **Comment contradicts code** (`:200`): comment says `'accident'` or `'unsafe'`; code checks `'unsafe'` or `'nudity'`. | Anyone maintaining this will trust the comment. | Fix the comment. |
| 9 | **Brand spelled both ways in one alert** (`:53`) — "Udhavu" and "Uthavu". | Visible in a trust-critical message. | Fix. |
| 10 | **Worst design-token adherence in the app** — 158 raw hexes vs 120 `COLORS.*`. | Hardest file to restyle. | Migrate. |
| 11 | **Unused imports:** `Star`, `Award`, `CheckSquare`, `Clock`. Dead styles `openLocationBtn`, `openLocationText`. | Dead weight in a 1,789-line file. | Remove. |
| 12 | **1,789 lines in one component** with 6 modals inline. | Very hard to maintain or test. | Extract each modal. |
| 13 | **The Call modal is unreachable.** `showCallModal` is declared (`:33`) and the modal renders (`:1163`) with close handlers at `:1172` and `:1195` — but **no `setShowCallModal(true)` exists anywhere in the file**. | An entire contact modal ships in the bundle and can never be opened. The only working contact path is the direct `tel:` link at `:547`. | Wire an open trigger, or delete the modal. |
| 14 | **Text-only updates skip moderation entirely** (`:256`). The scan is inside `if (attachedPhoto)`; the `else` branch calls `commitUpdate()` directly. | The word filter guarding the public feed is bypassed by simply not attaching a photo — which is the default. | Scan text on every path. |
| 15 | **A flagged update is destroyed, not escalated** (`:212–218`). The user is told it went to Uthavu Admins; state is cleared and nothing is written. | Same class as gap #1 — a false statement about moderation, and the user's content is lost with no way to recover or appeal it. | Persist to a real queue before clearing. |
| 16 | **"Approve & Convert" is shown to everyone** (`:655`). No check that the viewer is the reporter. | The volunteer who submitted their own completion proof can approve it themselves — the approval step it exists to enforce can be self-served. | Gate on `viewer.id === request.reporterId`. |
| 17 | **The pending banner promises machinery that does not exist** (`:650–652`): 3-day timer, email + push reminders, admin escalation. | Four specific commitments, none implemented. A reporter who never approves causes nothing to happen — the proof sits forever. | Build the escalation job, or remove the copy. |
| 18 | **Every locally-composed update is labelled 🦺 Volunteer** (`:265–266`), hardcoded regardless of the poster. | A reporter posting on their own request appears as a volunteer; the role badge misinforms exactly when provenance matters most. | Derive `role` from the viewer's relationship to the request. |
| 19 | **`isVerified` defaults to `true`** (`:417`, `!== false`), and no code ever sets it. | **Every reporter in the app displays a ✓ Verified badge**, with 96% reliability and 34 resolved reports — all fallback literals. Fabricated trust signals are worse than absent ones. | Default unverified; render the badge only on a real flag. |
| 20 | **Selecting "Status Update" silently changes what Post does** (`:222`) — it becomes a completion-proof submission requiring reporter approval. | Nothing in the composer indicates this. A user picking the closest-matching type triggers a workflow they didn't intend. | Label the type, or split it out of the composer. |

### 5.1 A defect the repo's own docs report that does **not** exist

`apps/mobile/FUNCTIONAL_FLOW.md §12 #2` lists an open crash: *"the `Alert` import crash in
`RequestDetailsScreen` — still open across five revisions."*

**`Alert` is imported correctly** at `:4`:

```js
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
         SafeAreaView, Image, Modal, Linking, Alert, TextInput } from 'react-native';
```

All 12 `Alert.alert(…)` call sites resolve. Verified by reading the import and every usage.
**The bug is fixed; the documentation was never updated.** `FUNCTIONAL_FLOW.md` should drop
the entry.

---

## 6. What works well

- **Contact actions are genuinely accept-gated.** The phone reveal and `tel:` link (`:547`)
  only render once `hasAccepted` is true — a real privacy rule, enforced.
- **Real `tel:` and maps deep links** via `Linking.openURL` (`:547`, `:381`).
- **A proper 7-reason report modal** with radio selection, a default, Cancel/Submit, and
  the reason actually passed through to context. The best moderation UI in the app.
- **`RESOLUTION_OUTCOMES` is thoughtfully written** (`:128`) — ordered best→worst, with a
  comment noting that the label states the outcome and the hint states the consequence "so
  the two never do the same job".
- **Needed-count clamped 2–20** (`:1117`, `:1124`) — real bounds checking.
- **Uses both contexts**, the only screen that does.

---

## 7. QA checklist

- [ ] Opening from Category List shows that request's title, image and location.
- [ ] "Open in Google Maps" launches maps.
- [ ] Before accepting, the reporter's phone and call button are hidden.
- [ ] After accepting, the call button appears and dials.
- [ ] 🚩 header → modal lists 7 reasons with "Fake / Misleading" preselected.
- [ ] Selecting a reason moves the red radio.
- [ ] Submit shows the "Report Submitted to Admin" alert — note both brand spellings (gap #9).
- [ ] The flag appears on the Flagged screen **with the chosen reason** (unlike a quick flag from the list).
- [ ] Restart the app — the flag is gone (gap #1).
- [ ] Compose an update with the word "unsafe" **and** a photo → the AWS moderation alert fires.
- [ ] The same word with no photo → no scan runs.
- [ ] Attach photo always yields the same stock image (gap #3).
- [ ] "Report this update" only shows an alert (gap #6).
- [ ] Needed count won't go below 2 or above 20.
- [ ] Share buttons show alerts only (gap #7).

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Flag reasons | `:38–46` |
| Flag submission | `:48–55` |
| Update types | `:119` |
| Resolution outcomes | `:128` |
| Sample updates | `:134` |
| AI scan trigger words | `:200` |
| Photo attachment | `:190` |
| Needed-count bounds | `:1117`, `:1124` |

---

**Previous:** [13 — Category List](./13-category-list-screen.md) · **Next:** [15 — Volunteer Journey](./15-volunteer-journey-screen.md)
