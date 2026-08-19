# 18 — Mission Journal (stack)

> **The user's private activity log.** Every mission they took part in, filterable by
> outcome, with a detail sheet per entry.
>
> Contains the app's **most visibly broken navigation** — a stub object that renders an
> empty Impact Story.

| | |
|---|---|
| **Route name** | `MissionJournal` |
| **Source file** | `apps/mobile/src/screens/MissionJournalScreen.js` (441 lines) |
| **Registered in** | `apps/mobile/App.js:111–115` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Profile menu → "📖 Mission Journal (My Activity)" |
| **Navigates to** | `ImpactStory` ⚠️ (broken — see gap #1) |
| **Context used** | ❌ None — fully hardcoded, despite entries labelled "Hari (You)" |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ‹   Mission Journal                    │
│ (All)(Resolved)(Partial)(Unresolved)…  │  7 filter chips, scrollable
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ [RESOLVED]          2 days ago     │ │
│ │ Puppy Rescue Near Anna Nagar       │ │
│ │ 🐶 Animal Rescue                   │ │
│ │ Role: Lead Volunteer               │ │
│ │ ──────────────────────────────────  │ │
│ │              [ View Summary ]      │ │
│ └────────────────────────────────────┘ │
│              … ×4 …                    │
└────────────────────────────────────────┘
```

---

## 2. Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Back `‹`** | `:155` | Returns to Profile | — | `goBack()` |
| 2 | **Filter chip ×7** | `:172` | Filters the list by outcome | `activeFilter` | — |
| 3 | **Entry card (body)** | `:188` | Opens the detail sheet for that mission | `selectedEntry` | — |
| 4 | **"View Summary"** | `:220` | ❌ **Same as #3** — duplicate trigger on the same card | `selectedEntry` | — |
| 5 | Status badge | — | ❌ Not tappable — colours come from the data | — | — |
| 6 | **Detail sheet ✕** | `:252` | Closes the sheet | `selectedEntry` → null | — |
| 7 | **"View Public Impact Story →"** | `:341` | ⚠️ **Opens a blank story.** Closes the sheet, then navigates passing only `{ story: { id } }` — a stub with no other fields | `selectedEntry` → null | `ImpactStory` (broken) |
| 8 | Proof image in the sheet | — | ❌ Not tappable — no lightbox. `mj_4` has none at all | — | — |
| 9 | Pull to refresh | — | ❌ Nothing | — | — |

Only #7 leaves this screen, and it is broken.

---

## 3. ⚠️ The stub-object bug

```js
// :341–343
onPress={() => {
  setSelectedEntry(null);
  navigation.navigate('ImpactStory', { story: { id: selectedEntry.impactStoryId } });
}}
```

The receiving screen guards like this:

```js
// ImpactStoryScreen.js:86
const story = route.params?.story || IMPACT_STORIES[0];
```

`{ id: 'impact_1' }` is a **truthy object**, so the `||` fallback never fires. The story
screen then renders with every other field `undefined`:

| Field | Renders as |
|---|---|
| `story.title` | blank |
| `story.completionNote` | blank |
| `story.location`, `story.reporter`, `story.helper`, `story.timeElapsed`, `story.completedAt` | blank |
| `story.photos` | `photosList` becomes `[undefined]` (`ImpactStoryScreen.js:91`) → an `<Image source={undefined}>` |

**Result: a fully blank Impact Story screen with an empty image slot.** No crash, no error —
just nothing.

**Fix:**
```js
const story = IMPACT_STORIES.find(s => s.id === selectedEntry.impactStoryId);
if (story) navigation.navigate('ImpactStory', { story });
```

Every other caller passes the whole object correctly —
[16 — Impact Stories](./16-impact-stories-screen.md) `:53`,
[08 — Dashboard](./08-dashboard-screen.md) `:245`,
[12 — Profile](./12-profile-screen.md) `:114`,
[15 — Volunteer Journey](./15-volunteer-journey-screen.md) `:103`. This screen is the only
outlier.

---

## 4. Data

`JOURNAL_ENTRIES` (`:18–124`) — 4 entries, ~22 fields each, deliberately covering all four
outcomes:

| id | Outcome | Mission | Role | Impact story? |
|---|---|---|---|---|
| `mj_1` | **RESOLVED** | Puppy rescue | Lead Volunteer | ✅ |
| `mj_2` | **PARTIAL** | Food distribution | Support | ✅ |
| `mj_3` | **UNRESOLVED** | Roadside breakdown | Support | ❌ |
| `mj_4` | **EXPIRED** | — | — | ❌ no `proofImage` |

Filters (`:130`) — 7 chips, including outcomes with no matching entries.

### 4.1 Styling stored in data

Each record carries `roleColor` and `statusBg` as raw hex strings, which is why this file
reads as **43 raw hexes against 23 `COLORS.*` references**. The colours aren't in the
stylesheet — they're in the array.

Same anti-pattern as [09 — My Helps](./09-my-helps-screen.md#6-gaps--known-issues) gap #7:
when an API replaces this array, the server would have to send hex codes.

### 4.2 Images

Required at `:13–15` — `injured_dog.png`, `wedding_food.png`, `roadside_help.png`. Used as
`proofImage` on the first three entries.

---

## 5. Mobile ↔ Admin web connection

**None.**

A mission journal is a per-user audit trail — the mobile mirror of the admin's *Audit Logs*
tab (`apps/web/src/app/admin/dashboard/page.tsx:3200`, `MOCK_AUDIT_LOGS:268`). The admin
also tracks `helps`, `completedHelps` and `cancelledHelps` per user (`MOCK_USERS:62`),
which is exactly what this screen's four outcomes would produce.

| This screen | Admin counterpart | Connected? |
|---|---|---|
| RESOLVED / PARTIAL / UNRESOLVED / EXPIRED | `completedHelps` / `cancelledHelps` | ❌ |
| `proofImage` | Story before/after images | ❌ |
| Role (Lead / Support) | Volunteer roster role | ❌ |
| `impactStoryId` | `MOCK_IMPACT_STORIES` id | ❌ Different id spaces |

The admin's user row for "Hari Krishnan" says 12 helps / 11 completed / 1 cancelled; this
screen shows 4 entries. Both invented, neither aware of the other.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Stub-object navigation renders a blank story** (`:343`). | **The most visibly broken interaction in the app.** Tapping "View Public Impact Story" produces an empty screen with a broken image and no error. Every other caller passes the full object. | Look up the story by id — see §3. |
| 2 | **Entirely hardcoded despite claiming to be personal.** Entries are labelled "Hari (You)" but the screen never calls `useUser()`. | A user named anything else still sees "Hari (You)" attached to four missions they never did. | Read the name from context; load real missions. |
| 3 | **Duplicate open triggers.** The card (#3) and "View Summary" (#4) do the same thing. | Redundant. | Keep the card tap; drop the button, or give it a distinct action. |
| 4 | **Styling lives in the data** — `roleColor`, `statusBg` per record. | Blocks any API swap and inflates the hex count. | Map outcome → style in the component. |
| 5 | **Filters exist for outcomes with no data.** 7 chips, 4 entries. | Several filters can never return a result — they always land on the empty state. | Derive the chips from the data present. |
| 7 | **`mj_4` has no `proofImage`.** | The detail sheet renders a gap where an image should be. | Guard the render. |
| 8 | **10 unused imports** — `ChevronLeft`, `MapPin`, `Clock`, `CheckCircle`, `AlertTriangle`, `Eye`, `ImageIcon`, `MessageSquare`, `User`, `Users` (`:1–12`). The most of any file in the app. | Dead weight; suggests a much richer screen was planned. | Remove. |
| 9 | **43 raw hexes vs 23 tokens** — largely a consequence of #4. | Weak design-system adherence. | Fix #4 first. |
| 10 | **Proof images aren't zoomable.** | Proof photos are the evidence for a mission outcome, shown at thumbnail size only. | Add a lightbox — [17](./17-impact-story-screen.md) already has one. |

> **Fix #1 first.** It is a one-line change with a visible payoff.

---

## 7. What works well

- **All four mission outcomes are modelled**, including EXPIRED and PARTIAL — most screens
  only imagine the happy path. This is the only place in the app where a mission can have
  failed.
- **The detail sheet is genuinely informative** — role, timeline, proof image and outcome in
  one view.
- **`hasImpactStory` correctly gates the story button** (`:338`), so entries without a story
  don't offer a dead link — the gating is right; only the payload is wrong.
- **A proper empty state** (`:227–233`) — `BookOpen` icon, "No missions found", and the
  explanatory line "No journal entries match your selected filter." One of only **two**
  empty states in the entire app (the other is [11 — Alerts](./11-alerts-screen.md#34-empty-state)).

---

## 8. QA checklist

- [ ] Four entries render with distinct outcome badges.
- [ ] Each of the 7 filter chips filters correctly; several show empty (gap #5).
- [ ] Tapping a card and tapping "View Summary" both open the same sheet.
- [ ] ✕ closes the sheet.
- [ ] "View Public Impact Story →" on `mj_1` opens a **blank** story (gap #1).
- [ ] `mj_3` and `mj_4` show no story button.
- [ ] `mj_4` renders without a proof image (gap #7).
- [ ] Entries still read "Hari (You)" after changing the profile name (gap #2).

---

## 9. Changing this screen

| To change… | Edit |
|---|---|
| Journal entries | `:18–124` |
| Filter chips | `:130` |
| The story navigation (fix gap #1) | `:341–343` |
| Detail sheet layout | the modal block at `:250` |
| Status / role colours | Per-record `statusBg` / `roleColor` — see gap #4 |

---

**Previous:** [17 — Impact Story](./17-impact-story-screen.md) · **Next:** [19 — Flagged Requests](./19-flagged-screen.md)
