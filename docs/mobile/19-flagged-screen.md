# 19 — Flagged Requests (stack)

> **The user's personal moderation queue.** Every request they flagged, with per-item and
> bulk removal. Backed by real context state — and lost on every app restart.

| | |
|---|---|
| **Route name** | `Flagged` |
| **Source file** | `apps/mobile/src/screens/FlaggedScreen.js` (169 lines) |
| **Registered in** | `apps/mobile/App.js:91–95` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Profile menu → "Flagged Requests (n)" |
| **Navigates to** | `RequestDetails` |
| **Context used** | ✅ `useFlags()` — `flagged`, `removeFlag`, `clearFlags` |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ‹   Flagged Requests          [🗑]      │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ ┌──────┐ 🐶 Animal Rescue          │ │
│ │ │ img  │ Injured puppy near Anna…  │ │
│ │ └──────┘ ⚑ Inappropriate image /   │ │
│ │           Needs review             │ │
│ │ ──────────────────────────────────  │ │
│ │ [Remove Flag]        [View Details] │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## 2. Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Back `‹`** | `:61` | Returns to Profile | — | `goBack()` |
| 2 | **🗑 Clear all** | `:66` | Opens a native confirm: *"Clear all flags? This removes every flagged request from this list."* with Cancel / **Clear All** (destructive) | — | — |
| 3 | ↳ "Clear All" in the dialog | `:19` | Calls `clearFlags()` — empties the context array. ⚠️ The demo rows then reappear, because an empty list falls back to `demoFlagged` | `flagged` → `[]` | — |
| 4 | ↳ "Cancel" | `:18` | Dismisses, changes nothing | — | — |
| 5 | **"Remove Flag"** on a real flagged item | `:110` | Removes just that one by key. The card disappears | `flagged` | — |
| 6 | **"Remove Flag"** on a **demo** item | `:110` | ⚠️ **Nothing visible happens.** It calls `removeFlag('demo_1')` against the real (empty) context, which matches nothing — the row stays on screen | — | — |
| 7 | **"View Details"** | `:117` | Opens the flagged request | — | `RequestDetails` `{ request: item.request }` |
| 8 | Card body / image / title | — | ❌ Not tappable — only the two footer buttons act | — | — |
| 9 | Reason line | — | ❌ Not tappable. Text comes from the flag record | — | — |

---

## 3. Real data with a demo fallback

```js
// :14
const { flagged, removeFlag, clearFlags } = useFlags();
// :56
const list = flagged.length > 0 ? flagged : demoFlagged;
```

| Source | When | Contents |
|---|---|---|
| `flagged` (context) | Any flag has been set this session | Real records created by `toggleFlag` on [13 — Category List](./13-category-list-screen.md) |
| `demoFlagged` (`:23–54`) | The list is empty | 2 fixed entries — `demo_1` 🐶 Animal Rescue *"Inappropriate image / Needs review"*, `demo_2` 🚗 Roadside Help |

### 3.1 Flag record shape

Built by `FlagContext.toggleFlag` (`FlagContext.js:19–37`):

```js
{ key: `${categoryId}:${requestId}`,   // ids restart per category, so both are needed
  reason: 'Reported by user',          // always this string — no reason picker exists
  request,                             // the whole request object
  categoryId, categoryTitle, categoryIcon }
```

**The reason depends entirely on where the flag was created** — there are exactly two call
sites and they behave differently:

| Created from | Call | Reason stored |
|---|---|---|
| [14 — Request Details](./14-request-details-screen.md) `:49` | `toggleFlag(request, category, flagReason)` | ✅ **The user's choice** from a 7-option modal — Fake / Misleading · Wrong Location · Spam · Inappropriate Content · Duplicate · Already Resolved · Other |
| [13 — Category List](./13-category-list-screen.md) `:635` | `toggleFlag(req, category)` | ❌ Falls back to the default `'Reported by user'` |

So the quick 🚩 button on a list card silently discards the reason, while the full "Report
Post to Admin" flow on the detail screen captures it properly. Same context method, two
different levels of fidelity. See gap #2.

### 3.2 Images

`injured_dog.png` and `roadside_help.png`, required at `:10–11` — used by the demo rows.
Real rows render `item.request.image`.

---

## 4. Mobile ↔ Admin web connection

**None — and this is the clearest example of a broken hand-off in the app.**

Flagging exists so a human can report bad content. The admin console has a *Flagged
Reports* tab (`apps/web/src/app/admin/dashboard/page.tsx:2067`) plus `MOCK_FLAGS` (`:90`,
5 records with Spam / Wrong Category / Duplicate / Abuse / False Information) and a
`MOCK_FAKE_REPORTS` queue (`:84`) — an entire moderation workflow, waiting for input that
never arrives.

| Mobile side | Admin side | Connected? |
|---|---|---|
| `toggleFlag()` → in-memory array | `MOCK_FLAGS` — 5 hardcoded records | ❌ |
| 7 reasons from Request Details | 5 reason categories (Spam · Wrong Category · Duplicate · Abuse · False Information) | ❌ **Vocabularies overlap but don't match** — mobile has "Fake / Misleading", admin has "False Information"; mobile has "Wrong Location", admin has "Wrong Category" |
| — | `MOCK_FAKE_REPORTS` (`:84`) — a dedicated fake/scam queue with `flagCount` | ❌ Mobile's "Fake / Misleading" flags would feed exactly this |
| `removeFlag()` / `clearFlags()` | Admin resolve/dismiss actions | ❌ |
| — | `flagCount`, `warnings`, `suspensions` per user | ❌ Never incremented |
| — | User `status`: Active / **Suspended** / **Blocked** | ❌ **Mobile has no concept of a suspended or blocked user at all** |

> **There is no "report this user" or "block user" anywhere in the mobile app** — verified
> by grep across `apps/mobile/src`. Users can only flag *content* (a request), never a
> person. The admin console can suspend and block accounts, and tracks per-user warning and
> suspension counts, but nothing in the app can raise that signal or reflect its result: a
> blocked user's app behaves identically to anyone else's.

`FlagContext.js:10` says it outright: *"UI-only for now — flags live in memory and reset
when the app reloads."* A user reporting abusive content achieves nothing beyond hiding it
from their own list until they close the app.

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Flags never leave the device and don't survive a restart.** | The core purpose — reporting bad content for review — does not function. Moderation never sees anything. | `POST /flags` on toggle; persist locally as a cache. |
| 2 | **The quick flag button discards the reason.** [13 — Category List](./13-category-list-screen.md) `:635` calls `toggleFlag(req, category)` with no third argument, so those flags are always `'Reported by user'` — while [14 — Request Details](./14-request-details-screen.md) `:49` correctly passes the user's chosen reason from a 7-option modal. | Two flag entry points with different fidelity. A flag raised from a list card tells moderators nothing about *why*, even though the vocabulary exists one screen away. | Open the same reason modal from the list card, or drop the quick button. |
| 3 | **"Remove Flag" does nothing on demo rows** (`:110`). | With no real flags — the normal state — every Remove button on screen is inert. Looks broken. | Hide the actions on demo rows, or replace the fallback with an empty state. |
| 4 | **"Clear All" appears not to work.** Clearing empties `flagged`, which re-triggers the `demoFlagged` fallback, so two rows immediately reappear. | The user confirms a destructive action and the list looks unchanged. | Track "has cleared" separately, or drop the demo data. |
| 5 | **Demo data with no label.** Nothing marks `demo_1` / `demo_2` as samples. | Users believe they flagged two requests they never touched. | Badge them, or show a real empty state. |
| 6 | **No empty state.** The fallback exists *instead of* one. | See #3–#5 — all three stem from this choice. | Add "No flagged requests" with a line explaining what flagging does. |
| 7 | **Dead style `countLabel`** (`:142`). | Minor. | Remove. |

> **Root cause of #3, #4 and #5 is a single decision:** showing demo data when the list is
> empty instead of an empty state. Fixing that one thing resolves all three.

---

## 6. What works well

- **Genuine context integration** — `flagged`, `removeFlag` and `clearFlags` are all wired,
  and the count propagates live to the Profile menu label.
- **Composite keys.** `flagKey(categoryId, requestId)` correctly handles request ids
  restarting at 101 inside every category — a real bug avoided deliberately.
- **Destructive confirmation.** "Clear all" uses `Alert.alert` with
  `style: 'destructive'` and a Cancel — the only destructive action in the app that asks
  first (compare logout on [12](./12-profile-screen.md), which doesn't).
- **The whole flagged request object is stored**, so "View Details" opens correctly without
  a lookup.

---

## 7. QA checklist

- [ ] With no flags set, two demo rows appear.
- [ ] "Remove Flag" on a demo row does nothing (gap #3).
- [ ] Flag a request on Category List → it appears here with the real image and title.
- [ ] Its reason reads "Reported by user" (gap #2).
- [ ] "Remove Flag" on a real row removes it, and the Profile count decrements.
- [ ] Removing the last real flag brings the demo rows back (gap #4).
- [ ] 🗑 shows a confirm; Cancel changes nothing; Clear All empties then shows demos again.
- [ ] "View Details" opens the right request.
- [ ] Restart the app — all real flags are gone (gap #1).

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Demo fallback data | `:23–54` |
| Fallback behaviour | `:56` |
| Clear confirmation copy | `:16–21` |
| Flag record shape / reason | `apps/mobile/src/context/FlagContext.js:19–37` |
| Where flags are created | `apps/mobile/src/screens/CategoryListScreen.js:635` |

---

**Previous:** [18 — Mission Journal](./18-mission-journal-screen.md) · **Next:** [20 — Edit Profile](./20-edit-profile-screen.md)
