# 15 — Volunteer Journey (stack)

> **The mission lifecycle screen.** A volunteer's live view of a mission they accepted:
> a 15-minute response countdown, team roster, status broadcasts, chat, a completion form
> and the resulting impact story.
>
> The most stateful screen in the app — and the one with the **most fallback content**,
> which is why several other screens land here showing the wrong mission.

| | |
|---|---|
| **Route name** | `VolunteerJourney` |
| **Source file** | `apps/mobile/src/screens/VolunteerJourneyScreen.js` (840 lines) |
| **Registered in** | `apps/mobile/App.js:81–85` (animation `slide_from_bottom`) |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Dashboard banner · My Helps · Category List · Request Details ×4 · **Alerts (no params)** |
| **Params** | `{ request }` — optional; **everything falls back** |
| **Context used** | ❌ None |
| **Talks to admin web** | No |

---

## 0. Layout — step 1 (assigned)

```
┌─────────────────────────────────────────────────────────┐
│  ←            Volunteer Journey                         │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ● Volunteer Joined (Priya)                          │ │ ← status banner
│ │   Post remains open for backup volunteers.          │ │
│ └─────────────────────────────────────────────────────┘ │
│ ╔═════════════════════════════════════════════════════╗ │
│ ║ ┌────────────────────┐                       14:57  ║ │ ← amber card
│ ║ │ 🕐 Response Timer  │                              ║ │
│ ║ └────────────────────┘                              ║ │
│ ║ You have 15 minutes to start your journey           ║ │
│ ║ Tap Start Helping below to confirm you are on your  ║ │
│ ║ way. If unconfirmed in 15 minutes, the request      ║ │
│ ║ automatically reopens for nearby volunteers.        ║ │
│ ║ ┌─────────────────────────────────────────────────┐ ║ │
│ ║ │            →  Start Helping                     │ ║ │
│ ║ └─────────────────────────────────────────────────┘ ║ │
│ ╚═════════════════════════════════════════════════════╝ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🐶 Animal Rescue                    [ 2.4 km away ] │ │
│ │ Wedding Hall Excess Food Donation                   │ │ ← ⚠ mismatched
│ │ 📍 Royal Palace Hall, 2nd Avenue                    │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │   ➤  Navigate via Google Maps               ↗   │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │ Mission Team (1 / 5 Ready)                          │ │
│ │ ( Priya (Lead) ) ( + Join Team )                    │ │
│ │                                                     │ │
│ │ Quick Status Update (Team Broadcast):               │ │
│ │ (🚗 On the way)(📍 Reached location)(🐶 Rescued)→→→ │ │ ← h-scroll, 5
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │   💬 Temporary Mission Chat (1)                 │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Update Your Status                                  │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ On the way / Helping now                        │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │ … Need additional support · I cannot continue …     │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**No bottom tab bar** — this is a root-stack screen presented `slide_from_bottom`.

### 0.1 Element reference

| Element | Line | Notes |
|---|---|---|
| Status banner | `:160–168` | Text is `statusMessage` state, seeded `'Volunteer Joined (Priya)'` (`:73`). Subtitle switches to *"Active mission in progress."* at step ≥ 2 (`:166`) |
| 🕐 **Response Timer** badge + `MM:SS` | `:176–180` | Amber card, only at step 1. `formatTimer` (`:45`) |
| **Start Helping** | `:189` | Green CTA inside the timer card |
| Category · distance | `:201` | `request?.category` / distance chip |
| Title · location | `:205`, `:209` | Both fall back — see §3 |
| **Navigate via Google Maps** | `:213–217` | `Navigation` + `ExternalLink` icons. ⚠️ Hardcoded coords (gap #4) |
| **Mission Team (n / N Ready)** | `:224–226` | `extraVolunteers.length` / `request?.totalNeeded \|\| 5` |
| Member chips · **+ Join Team** | `:232`, `:246` | `Priya (Lead)` is seeded at `:17` |
| **Quick Status Update (Team Broadcast):** | `:255` | Label above the pill row |
| Status pills | `:257–275` | **5 pills in a horizontal `ScrollView`** — only ~3 fit on screen; the last two need scrolling |
| **Temporary Mission Chat (n)** | `:281–284` | Count is the roster size, **not** the message count |
| **Update Your Status** card | `:289–291` | Separate card below; hidden at step ≥ 3 |

⚠️ **The screen contradicts itself in the mission card.** With no params it renders the
fallback category *"🐶 Animal Rescue"* alongside whatever title is passed — so a food-donation
mission opened from Alerts shows an animal-rescue label. See §3.

⚠️ **Two status systems, side by side.** "Quick Status Update" pills broadcast a message
(cosmetic, 3-second banner); the "Update Your Status" card below advances `lifecycleStep`
(real). Both are labelled "status" and neither says which one the team actually sees.

---

## 1. The lifecycle

```js
// :12–15
// Lifecycle steps:
// 1: Volunteer Assigned (15 min timer active)
// 2: Helping in Progress
// 3: Complete Help
const [lifecycleStep, setLifecycleStep] = useState(1);
```

```
STEP 1                    STEP 2                    STEP 4
Volunteer Assigned   →    Helping in Progress  →    Completed
⏱ 15:00 counting          timer stopped             impact story
[Start Helping]           [Arrived] [Complete]      published
     │
     └─ 15 min elapsed → Alert "Volunteer Did Not Respond"
                          → request released → goBack()
```

Step 3 is named in the comment but never set directly — `handleSubmitCompletion` jumps
from 2 to **4**.

### 1.1 The 15-minute countdown

```js
// :22–43
useEffect(() => {
  let timerInterval = null;
  if (isTimerActive && lifecycleStep === 1 && secondsLeft > 0) {
    timerInterval = setInterval(() => setSecondsLeft(prev => prev - 1), 1000);
  } else if (secondsLeft === 0 && lifecycleStep === 1) {
    setIsTimerActive(false);
    Alert.alert('Volunteer Did Not Respond',
      'You did not press Start Helping within 15 minutes. This request has been automatically released back to the open queue for nearby volunteers.',
      [{ text: 'Return to Requests', onPress: () => navigation.goBack() }]);
  }
  return () => clearInterval(timerInterval);
}, [isTimerActive, lifecycleStep, secondsLeft]);
```

Implements Rule 4 of the product spec — an unconfirmed acceptance auto-releases. The alert
is informative and the only exit is "Return to Requests".

⚠️ Like [04 — OTP](./04-otp-screen.md#33-resend-countdown), the effect depends on
`secondsLeft`, so the interval is torn down and rebuilt **every second**. It works and
doesn't leak, but it's the same anti-pattern.

---

## 2. Interaction map — every tap target

### Step 1 — assigned

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 1 | **Back `‹`** | `:152` | Leaves the mission. No confirmation, no release | — |
| 2 | **"Start Helping"** | `:189` | Stops the countdown and moves to step 2. Sets status *"Priya is on the way / Helping in progress"* | `lifecycleStep` → 2, `isTimerActive` → false, `statusMessage` |
| 3 | ↳ Timer hits 00:00 | `:37` | Alert → "Return to Requests" → `goBack()` | — |

### Team & communication (steps 1–2)

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 4 | **"+ Join Team"** | `:240` | Appends the next name from the fixed list `['Arun','Lakshmi','Ravi','Kumar']`, falling back to `Volunteer N`. Hidden once the roster reaches `totalNeeded` (default 5) or at step 3 | `extraVolunteers` |
| 5 | **Quick status pill ×5** | `:267` | Sets the status message and flashes a broadcast notice for **3 seconds**. Labels: 🚗 On the way · 📍 Reached location · 🐶 Rescued · 🏥 Taking to hospital · ✅ Mission Done | `statusMessage`, `showBackupNotice` |
| 6 | **"Temporary Mission Chat (n)"** | `:281` | Opens the chat modal | `showChatModal` |
| 7 | **"Navigate via Google Maps"** | `:213` | ✅ Opens a real maps deep link — but to **hardcoded coordinates** `13.0827, 80.2707`, ignoring the passed request | — |

### Status controls (steps 1–2)

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 8 | **"On the way / Helping now"** | `:294` | Sets step 2 directly | `lifecycleStep` → 2 |
| 9 | **"Need additional support / Backup"** | `:301` | Shows a backup-requested notice for **4 seconds**; sets status *"Additional Volunteers Requested"*. ❌ No one is actually notified | `showBackupNotice`, `statusMessage` |
| 10 | **"I cannot continue (Release request)"** | `:308` | ❌ Just calls `navigation.goBack()`. **The request is not released, nobody is told, no state changes** | — |
| 11 | **"Arrived"** | `:319` | Sets step 2 and status *"Priya arrived at location"* | `lifecycleStep` → 2, `statusMessage` |
| 12 | **"Complete Help"** | `:325` | Opens the completion form | `showCompletionModal` |

### Reporter confirmation

| # | Element | Line | Tap → what happens |
|---|---|---|---|
| 13 | **"No"** | `:336` | ❌ `alert('Marked as not yet resolved.')` — nothing changes |
| 14 | **"Yes"** | `:339` | `handlePosterConfirm` — confirms resolution |

### Completion modal

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 15 | Close ✕ | `:441` | Closes without submitting | `showCompletionModal` |
| 16 | Completion note field | `:463` | Multiline — **pre-filled** with a full narrative about rescuing a puppy | `completionNote` |
| 17 | **"Submit"** | `:467` | Closes the modal, sets step 4, then after a delay navigates to `ImpactStory` with a **newly built story object**. ❌ No photo is required despite Rule 1 | `lifecycleStep` → 4 |

### Chat modal

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 18 | Close ✕ | `:485` | Closes | `showChatModal` |
| 19 | Message field | `:508` | Text input | `chatInput` |
| 20 | **Send** | `:512` | ✅ Appends the message to the local list. ❌ Nobody receives it — no network, no replies | `chatMessages` |

### Impact / share modals

| # | Element | Line | Tap → what happens |
|---|---|---|---|
| 21 | Impact modal ✕ | `:540` | Closes |
| 22 | **"Share"** (impact modal) | `:577` | Opens the share modal |
| 23 | **"Save to profile"** | `:585` | ❌ `alert('Saved to your Profile Impact Story collection!')` — saves nothing |
| 24 | **"View Impact Story"** | `:400` | Navigates to `ImpactStory` with a **second, duplicated** story literal |
| 25 | Share modal ✕ | `:607` | Closes |
| 26 | **WhatsApp** | `:626` | ❌ `alert('Sharing to WhatsApp...')` |
| 27 | **Instagram** | `:629` | ❌ `alert('Sharing to Instagram...')` |
| 28 | **Facebook** | `:632` | ❌ `alert('Sharing to Facebook...')` |
| 29 | **Copy link** | `:639` | ❌ `alert('Story public link copied to clipboard!')` — copies nothing |

> Note #26–#29: this screen's share sheet is four `alert()` stubs, while
> [17 — Impact Story](./17-impact-story-screen.md#4-the-share-implementation) implements the
> same sheet properly with deep links, fallbacks and real clipboard. Two implementations of
> one feature, in one app.

---

## 3. Fallback content — why the wrong mission appears

```js
const { request } = route.params || {};                                   // :10
{request?.title    || 'Injured stray dog needs vet transport'}            // :205
{request?.category || '🐶 Animal Rescue'}                                 // :201
{request?.location || 'Anna Nagar Bus Stop'}                              // :209
{request?.poster   || 'Hari'}                                             // :384
{request?.totalNeeded || 5}                                               // :225
```

Every field has a hardcoded default, so the screen **never fails visibly** when opened
without params — it silently shows a fabricated dog-rescue mission.

That is exactly what happens from [11 — Alerts](./11-alerts-screen.md#6-gaps--known-issues):
all three action buttons call `navigate('VolunteerJourney')` with no params, so tapping
"Respond Now" on *"Senior Citizen needs medicine pickup"* renders *"Injured stray dog needs
vet transport"*.

**Defensive defaults turned a missing-params bug into a wrong-content bug** — harder to
notice and harder to diagnose.

Hardcoded seeds: `extraVolunteers = ['Priya (Lead)']` (`:17`); chat seeded with two
messages from Priya and Arun (`:63`); `completionNote` pre-filled (`:69`).

---

## 4. Mobile ↔ Admin web connection

**None.** Every lifecycle transition is local `useState`.

This screen implements the heart of the product spec — Rules 1–4 of
`apps/mobile/FUNCTIONAL_FLOW.md`. The admin console has the matching surface: mission
assignment, volunteer reliability (`MOCK_VOLUNTEERS:98`), and the story queue.

| Event here | Should emit | Admin sees |
|---|---|---|
| Start Helping | `PATCH /missions/:id { status: 'in_progress' }` | Mission status |
| Timer expiry | Auto-release back to queue | Report returns to open |
| + Join Team | `POST /missions/:id/volunteers` | Roster |
| Quick status | Broadcast to team | Activity feed |
| Release request | `DELETE /missions/:id/volunteers/me` | Reliability score |
| Submit completion | `POST /missions/:id/complete` + photo | Verification pipeline |
| Chat | Message thread | — |

`handleSubmitCompletion` even carries a comment referencing *"Rule 2 & 3: Automated
verification pipeline validates live camera capture & closes mission immediately"* — but
no camera is opened and no verification runs.

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **"I cannot continue (Release request)" releases nothing** (`:308`). It calls `goBack()`. | The button promises to return the request to the queue so someone else can help. In an emergency-response app, a volunteer who drops out believing they released the request leaves it unattended. **The most dangerous stub in the app.** | Release server-side, or state plainly that it only leaves the screen. |
| 2 | **Completion requires no photo.** The modal takes a note and submits — no camera, despite Rule 1 mandating live-camera proof and the code comment claiming verification runs. | Missions complete with no evidence. | Require a captured photo before enabling Submit. **Full spec: [20 §2A](./20-edit-profile-screen.md#2a-profile-photo-upload--full-specification)** |
| 3 | **Fallback defaults mask missing params** (`:201–225`). | Turns Alerts' no-params bug into silently wrong content. | Render an error state when `request` is absent. |
| 4 | **Google Maps opens hardcoded coordinates** `13.0827, 80.2707` (`:76–77`), ignoring the request. | Navigation sends the volunteer to a fixed point in Chennai regardless of the actual mission. | Use `request.lat` / `request.lng`. |
| 5 | **"+ Join Team" invents volunteers** from a fixed name list (`:241`). | Tapping it three times adds Arun, Lakshmi and Ravi — people who never joined. | Wire to a real join request. |
| 6 | **Chat sends into the void** (`:512`). | Messages append locally with no delivery and no replies; the two seeded messages imply an active conversation. | Real messaging, or remove. |
| 7 | **Backup request notifies nobody** (`:301`). | A 4-second banner and nothing else. | Notify nearby volunteers. |
| 8 | **The story object is duplicated** at `:103` and `:400` — two literals for one story. | They will drift. | Build once. |
| 9 | **Share sheet is four `alert()` stubs** (`:626–639`) while [17](./17-impact-story-screen.md) does it properly. | Same feature, two qualities. | Reuse 17's `handleShare`. |
| 10 | **"Save to profile" saves nothing** (`:585`). | Alerts success falsely. | Persist, or remove. |
| 11 | **Timer interval rebuilds every second** (`:43` dependency array). | Works; wasteful and fragile. | Depend on `[]` with a functional updater. |
| 12 | **`handleStartHelping` calls `setStatusMessage` 22 lines before it's declared** (`:51` vs `:73`). | Fine at runtime — the call happens after render — but a TDZ hazard if refactored. | Move the declaration up. |
| 13 | **Step 3 is defined but skipped** — `handleSubmitCompletion` jumps 2 → 4. | The lifecycle comment doesn't match the code. | Align them. |
| 14 | **Global `alert()` at `:79`** instead of the imported `Alert.alert`. | Inconsistent. | Use `Alert.alert`. |
| 15 | **Unused imports:** `Phone`, `Users`, `Check`, `Award`, `AlertTriangle`, `SIZES`. `Phone` is notable — there's no call action despite a contact section. | Dead weight. | Remove, or add the call button. |
| 16 | **Dead style `statusConfidenceSub`.** | Minor. | Remove. |

> **Fix order:** #1 first — a safety issue, not a polish one. Then #2 (the spec's core
> rule), then #4.

---

## 6. What works well

- **The 15-minute auto-release is fully implemented** (`:22–43`) — countdown, expiry alert
  with clear copy, and a forced exit. The only product rule implemented end to end.
- **`formatTimer`** (`:45–49`) pads correctly to `MM:SS`.
- **Google Maps deep linking works** — real `Linking.openURL` with a `.catch`. Only the
  coordinates are wrong.
- **The lifecycle is genuinely staged** — controls appear and disappear by step, and
  "+ Join Team" correctly hides at capacity or after step 3.
- **Quick status broadcasts** are a good idea, with clear labels covering the real arc of a
  rescue.

---

## 7. QA checklist

- [ ] Opening from My Helps shows that mission's title and location.
- [ ] Opening from an Alerts action shows the dog-rescue fallback (gap #3).
- [ ] The countdown starts at 15:00 and decrements once per second.
- [ ] Letting it reach 00:00 shows the release alert; "Return to Requests" exits.
- [ ] "Start Helping" stops the timer and moves to step 2.
- [ ] "+ Join Team" adds Arun, then Lakshmi, then Ravi; it disappears at 5.
- [ ] Quick status pills flash a broadcast notice for ~3 s.
- [ ] "Navigate via Google Maps" goes to the same location for every mission (gap #4).
- [ ] "I cannot continue" only navigates back (gap #1).
- [ ] Chat send appends locally; no reply arrives.
- [ ] Completion submits with no photo (gap #2).
- [ ] After completing, the impact story shows the new mission.
- [ ] Share buttons show alerts only (gap #9).

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Countdown length | `:20` — `15 * 60` |
| Lifecycle transitions | `:51`, `:80`, `:96` |
| Quick status pills | `:258–263` |
| Auto-added volunteer names | `:241` |
| Maps coordinates (fix gap #4) | `:76–77` |
| Completion note default | `:69` |
| Generated story object | `:103` and `:400` |

---

**Previous:** [14 — Request Details](./14-request-details-screen.md) · **Next:** [16 — Impact Stories](./16-impact-stories-screen.md)
