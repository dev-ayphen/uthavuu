# 17 — Impact Story (detail · stack)

> **The public face of a completed mission.** Photo carousel, before/after comparison, the
> volunteer's note, and a share sheet.
>
> **The share implementation is the best-engineered code in the app** — real deep links with
> fallbacks, real clipboard, proper error handling.

| | |
|---|---|
| **Route name** | `ImpactStory` |
| **Source file** | `apps/mobile/src/screens/ImpactStoryScreen.js` (699 lines) |
| **Registered in** | `apps/mobile/App.js:96–100` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Impact Stories list · Dashboard · Profile · My Helps · Volunteer Journey · Mission Journal ⚠️ |
| **Params** | `{ story }` — the whole object |
| **Owns** | `IMPACT_STORIES` — exported and imported by 5 other screens |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ‹   Impact Story              [⤴]      │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │     photo carousel (swipeable)     │ │
│ │            ● ○ ○                   │ │
│ └────────────────────────────────────┘ │
│ 🐶 Animal Rescue                       │
│ Puppy Rescue Completed                 │
│ ┌──────────────┬───────────────────┐  │
│ │   BEFORE     │      AFTER        │  │  tap either → full-screen
│ │   [image]    │     [image]       │  │
│ └──────────────┴───────────────────┘  │
│ 💬 Volunteer's Note                    │
│ "Found the puppy near the bus stop…"   │
│ 📍 Anna Nagar Bus Stop · 0.8 km        │
│ 👤 Reported by Hari                    │
│ 🙌 Helped by Priya                     │
│ ⏱ 35 minutes · 2 volunteers            │
│ ┌────────────────────────────────────┐ │
│ │        ⤴ Share this story          │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## 2. The `IMPACT_STORIES` data model

Defined and **exported** here (`:19–83`) — the app's most-shared data structure, imported by
`ImpactStoriesScreen`, `DashboardScreen`, `ProfileScreen` and `MyHelpsScreen`.

```js
{
  id: 'impact_1',
  icon: '🐶',
  category: 'Animal Rescue',
  title: 'Puppy Rescue Completed',
  shortDesc: 'Helped an injured puppy near Anna Nagar',
  completionNote: 'Found the puppy near the bus stop unable to walk…',
  beforeImage: injuredDogImg,
  afterImage:  injuredDogImg,          // ⚠️ same asset as beforeImage
  photos: [injuredDogImg, roadsideHelpImg, weddingFoodImg],
  location: 'Anna Nagar Bus Stop',
  distance: '0.8 km',
  reporter: 'Hari',
  helper:   'Priya',
  timeElapsed: '35 minutes',
  completedAt: '2 hours ago',
  volunteers: 2,
  lat: 13.0827, lng: 80.2707,
}
```

**3 stories:** `impact_1` Puppy Rescue · `impact_2` 75 Meals Distributed · `impact_3` Bike
Breakdown ECR.

> **A screen file exporting shared data is a structural smell.** Five screens import from
> `./ImpactStoryScreen`, which also default-exports a React component — pulling the whole
> screen into every importer's module graph. It belongs in `src/data/`.

### 2.1 Defensive fallbacks

```js
const story      = route.params?.story || IMPACT_STORIES[0];        // :86
const photosList = story.photos || [story.afterImage || story.beforeImage];  // :91
```

Sensible in isolation, but `:86` is what lets
[18 — Mission Journal](./18-mission-journal-screen.md#3--the-stub-object-bug)'s stub object
through: `{ id: 'impact_1' }` is truthy, so the fallback never fires and the screen renders
blank.

---

## 3. Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 1 | **Back `‹`** | `:200` | Returns to the origin screen | — |
| 2 | **⤴ Share (header)** | `:204` | Opens the share sheet | `showShareModal` |
| 3 | **Photo carousel** | `:223` | Swipe to page through `photos`; the dot indicator tracks via `onScroll` | `activePhotoIndex` |
| 4 | Carousel tap | `:223` | Sets the full-screen viewer to `before` (first slide) or `after` | `photoView` |
| 5 | **BEFORE card** | `:281` | Opens the before image full-screen | `photoView` → `'before'` |
| 6 | **AFTER card** | `:292` | Opens the after image full-screen | `photoView` → `'after'` |
| 7 | Viewer close ✕ | `:397` | Closes the full-screen viewer | `photoView` → null |
| 8 | **"⤴ Share this story"** | `:388` | Opens the share sheet — same as #2 | `showShareModal` |
| 9 | Location / reporter / helper rows | — | ❌ Not tappable. `openMaps` exists but is **never wired** — see gap #1 | — |

### Share sheet

| # | Element | Line | Tap → what happens |
|---|---|---|---|
| 10 | Close ✕ | `:421` | Closes |
| 11 | **WhatsApp** | `:452` | ✅ Opens `whatsapp://send?text=…`; if unavailable falls back to `https://wa.me/?text=…`; if neither opens, alerts *"WhatsApp is not installed on this device."* |
| 12 | **Instagram** | `:471` | ✅ Hands to the **system share sheet** — Instagram exposes no prefilled-text URL, and the code says so in a comment |
| 13 | **Facebook** | `:496` | ✅ Opens the Facebook sharer URL; falls back to the system sheet |
| 14 | **More** | `:510` | ✅ Opens the system share sheet directly |
| 15 | **📋 Copy Link** | `:524` | ✅ **Really copies** `https://uthavuu.org/impact/story/{id}` via `expo-clipboard`, then alerts with the URL |

**Every share path works.** This is the only screen where all five do.

---

## 4. The share implementation

```js
// :165–170 — try each URL, stop at the first the OS can open
const openFirst = async (urls) => {
  for (const url of urls) {
    try { await Linking.openURL(url); return true; } catch { /* next candidate */ }
  }
  return false;
};
```

```js
// :150–156
const handleShare = async (platform = '') => {
  setShowShareModal(false);
  // Let the modal finish dismissing before handing off to another app.
  await new Promise((resolve) => setTimeout(resolve, 300));
  …
```

Notable engineering:

- **Ordered fallback chain** — app scheme → web URL → system sheet → alert.
- **The modal is dismissed and awaited** before handing off, so the sheet doesn't fight the
  outgoing app transition.
- **A single `try/catch`** wraps everything, surfacing `error.message` in an alert.
- **Comments explain the *why*** — why Instagram takes a different path, why `wa.me`
  exists, why the 300 ms wait is there.

### 4.1 The share message

A formatted rich-text block (`:108–128`) using WhatsApp's `*bold*` / `_italic_` markers:

```
❤️ *உதவு — Community Help Story* ❤️
*Puppy Rescue Completed*
📸 _Helped an injured puppy near Anna Nagar_
💬 *Volunteer's Note:*  "…"
📍 *Location:* …   👤 *Reported by:* …   🙌 *Helped by:* …   ⏱️ *Time Taken:* …
🌐 *View full story & impact on Uthavu:*  https://uthavuu.org/impact/story/impact_1
_Join உதவு — help someone near you today._
```

---

## 5. Mobile ↔ Admin web connection

**None**, though this is the product's public output.

The admin console's *Impact Stories* tab (`apps/web/src/app/admin/dashboard/page.tsx:2283`,
`MOCK_IMPACT_STORIES:165`) models a richer version: `status`, `likes`, `shares`, `views`,
and a 7-step `timeline[]`.

| Mobile | Admin | Connected? |
|---|---|---|
| `title`, `category`, `completionNote` | same | ❌ |
| `beforeImage` / `afterImage` | same | ❌ |
| `reporter`, `helper` | mission team | ❌ |
| — | `status` (published/hidden), moderation actions | ❌ Mobile has no concept of unpublished |
| — | `likes`, `shares`, `views` | ❌ **Shares are never counted** |

Every share here is invisible to the platform: the URL points at `uthavuu.org`, which the
repo doesn't serve, and no share event is recorded. The admin's share counter can never
move.

> **Domain inconsistency:** this screen shares `https://uthavuu.org/…` (double `u`), while
> [22 — Invite Friends](./22-invite-friends-screen.md) uses `https://uthavu.org/…` (single
> `u`). At most one can be right; neither has a route in `apps/web`.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **`openMaps` is dead code** (`:99–102`). A working Google Maps deep link is defined and **never called**; its styles `mapsBtn` and `mapsBtnText` are dead too, as is `shareBtn`. | The story shows a location and `lat`/`lng`, but there's no way to navigate to it — even though the code to do so is right there. | Wire it to the location row. |
| 2 | **`beforeImage === afterImage` on every story** (`:27–28`). | The before/after comparison — the emotional core of an impact story — shows the same photo twice. | Supply genuinely different images. |
| 3 | **The story URL 404s.** `uthavuu.org/impact/story/{id}` has no route in `apps/web`. | Every shared link is dead. Recipients can't see the story, so sharing can't drive signups. | Add a public story route. |
| 4 | **Domain conflicts with Invite Friends** — `uthavuu.org` vs `uthavu.org`. | Two different domains shared from one app. | Pick one; put it in a shared config. |
| 5 | **Shares aren't counted.** No event, local or remote. | The admin's `shares` metric can never be real. | `POST /stories/:id/share`. |
| 6 | **Truthy-stub fallback lets bad params through** (`:86`). | Enables [18 gap #1](./18-mission-journal-screen.md#6-gaps--known-issues)'s blank screen. | Validate the shape: `route.params?.story?.title ? … : IMPACT_STORIES[0]`. |
| 7 | **Global `alert()` in `openMaps`** (`:101`) instead of `Alert.alert` — inconsistent with the rest of the file, which uses `Alert.alert` correctly. | Cosmetic; unstyleable. | Use `Alert.alert`. |
| 8 | **Unused imports:** `ExternalLink`, `MoreHorizontal`, `SIZES`. | `ExternalLink` was presumably for the dead `openMaps` button. | Remove, or restore the feature. |
| 9 | **Shared data lives in a screen module.** | Five screens import a file that also default-exports a component. | Move `IMPACT_STORIES` to `src/data/`. |
| 10 | **No like or comment affordance**, though the admin models both. | Read-only feed. | Product decision. |

---

## 7. What works well

**This file contains the best code in the app.**

- **Layered share fallbacks** (`:165–170`) — `openFirst` walks candidate URLs and stops at
  the first the OS handles, instead of assuming an app is installed.
- **Platform-aware routing** — WhatsApp gets a deep link, Facebook a sharer URL, Instagram
  the system sheet (with a comment explaining that Instagram has no prefill API).
- **The modal dismissal is awaited** before handing off (`:154`), avoiding a transition
  clash.
- **Real error handling** — a `try/catch` that surfaces the message, and a specific
  "WhatsApp is not installed" alert rather than silent failure.
- **`expo-clipboard` used properly** for the copy-link path, with confirmation.
- **Comments explain the reasoning**, not the syntax — rare in this codebase.
- **The rich share message** is thoughtfully formatted for WhatsApp, bilingual, and ends
  with a call to action.

Compare [13 — Category List](./13-category-list-screen.md), whose share sheet is four
`alert()` stubs. Same feature, same app, opposite quality.

---

## 8. QA checklist

- [ ] Opening from the stories list shows a fully populated story.
- [ ] Opening from Mission Journal shows a **blank** story ([18 gap #1](./18-mission-journal-screen.md#6-gaps--known-issues)).
- [ ] The carousel swipes through 3 photos and the dots track.
- [ ] BEFORE and AFTER open full-screen; ✕ closes.
- [ ] Before and after show the same image (gap #2).
- [ ] WhatsApp share opens WhatsApp with the message prefilled.
- [ ] With WhatsApp uninstalled, `wa.me` opens in a browser; failing that, an alert appears.
- [ ] Facebook opens the sharer; Instagram and More open the system sheet.
- [ ] Copy Link copies `uthavuu.org/impact/story/impact_1` — paste to verify.
- [ ] Opening that URL in a browser 404s (gap #3).
- [ ] The location row is not tappable despite coordinates being present (gap #1).

---

## 9. Changing this screen

| To change… | Edit |
|---|---|
| Story data | `:19–83` — `IMPACT_STORIES` |
| Share message | `:108–128` |
| Share URL / domain | `:105` — `storyUrl` |
| Per-platform share logic | `:150–192` — `handleShare` |
| Wire up maps (fix gap #1) | `:99–102` — `openMaps` |
| Before/after layout | `:281–292` |

---

**Previous:** [16 — Impact Stories](./16-impact-stories-screen.md) · **Next:** [18 — Mission Journal](./18-mission-journal-screen.md)
