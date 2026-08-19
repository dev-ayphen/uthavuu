# 16 — Impact Stories (list · stack)

> **The community feed of completed missions.** A read-only list of every published impact
> story, with the header title supplied by whoever opened it.
>
> **The cleanest file in the app** — no dead code, no unused imports, near-total design-token
> adherence.

| | |
|---|---|
| **Route name** | `ImpactStories` |
| **Source file** | `apps/mobile/src/screens/ImpactStoriesScreen.js` (155 lines) |
| **Registered in** | `apps/mobile/App.js:86–90` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Dashboard ×2 · Profile menu ×3 · My Helps |
| **Params** | `{ title }` — optional header override |
| **Navigates to** | `ImpactStory` |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ‹   My Impact Stories                  │  title from route.params
│ ┌────────┬──────────┬────────────────┐ │
│ │ 2,340  │    3     │      100%      │ │
│ │Total   │ Stories  │   Resolved     │ │  ← 2 of 3 are hardcoded
│ │Helps   │          │                │ │
│ └────────┴──────────┴────────────────┘ │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ ┌──────┐  🐶 Animal Rescue         │ │
│ │ │ img  │  Puppy Rescue Near Anna…  │ │
│ │ └──────┘  By Priya • 2 days ago    │ │
│ └────────────────────────────────────┘ │
│              … ×3 …                    │
│ ┌────────────────────────────────────┐ │
│ │          SponsorCard               │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## 2. Interaction map — every tap target

| # | Element | Line | Tap → what happens | Navigates | Params |
|---|---|---|---|---|---|
| 1 | **Back `‹`** | `:20` | Returns to whichever screen opened this one | `goBack()` | — |
| 2 | Header title | — | ❌ Not tappable. Text comes from `route.params.title` | — | — |
| 3 | Stats strip (2,340 / 3 / 100%) | `:31–39` | ❌ Not tappable. Only the middle number is real | — | — |
| 4 | **Story card ×3** | `:53` | Opens the full story — passes the **complete object** ✅ | `ImpactStory` | `{ story }` |
| 5 | Story thumbnail | — | ❌ Not separately tappable — inherits #4 | — | — |
| 6 | Sponsor card | `:46` | Handled inside `SponsorCard` | — | — |
| 7 | Pull to refresh | — | ❌ Nothing | — | — |

**Only two things on this screen do anything:** go back, and open a story. That is the
whole surface.

---

## 3. The title-only problem

Three different menu entries open this same screen and differ **only by a string**:

| Opened from | Line | Title passed | List shown |
|---|---|---|---|
| Dashboard "View All →" | `08:239` | *(none)* | All 3 stories |
| Dashboard "View All Success Stories" | `08:261` | *(none)* | All 3 stories |
| Profile → My Impact Stories | `12:38` | `My Impact Stories` | All 3 stories |
| Profile → Saved Stories | `12:45` | `Saved Impact Stories` | **All 3 stories** |
| Profile → "View All →" | `12:104` | `My Impact Stories` | All 3 stories |

`title` is the *only* thing that changes. **"Saved Impact Stories" shows every story, not
saved ones**, and "My Impact Stories" shows stories helped by other people. The screen has
no filter parameter at all.

`apps/mobile/src/utils/savedStore.js` exists precisely to back a saved list — and is
imported by nothing. See [24 — Utils & dead code](./24-utils-and-dead-code.md).

---

## 4. Data

No local arrays. Imports `IMPACT_STORIES` from `./ImpactStoryScreen:8` — 3 stories, full
shape documented in [17](./17-impact-story-screen.md#2-the-impact_stories-data-model).

| Stat | Value | Real? |
|---|---|---|
| Total Helps | `2,340` (`:31`) | ❌ Hardcoded — same literal as the Dashboard header |
| Stories | `IMPACT_STORIES.length` (`:35`) | ✅ Derived |
| Resolved | `100%` (`:39`) | ❌ Hardcoded — trivially true when only resolved stories are listed |

---

## 5. Visual specification

| Element | Spec |
|---|---|
| Screen bg | `#F8FAFC` (`COLORS.bgGrey`) |
| Header | white, back button + title |
| Stats strip | three cells with dividers |
| Story card | white, rounded, thumbnail + category + title + "By {helper} • {completedAt}" |
| Sponsor slot | `<SponsorCard>` below the list |

**Theme adherence: 24 `COLORS.*` references against 4 raw hexes** (`#9CA3AF`, `#000`) — the
best ratio of any screen in the app. Nothing to flag.

---

## 6. Mobile ↔ Admin web connection

**None.**

This is the public-facing output of the whole product loop — the thing the spec calls
*"Mission Closed → Auto Impact Story → Share"*. The admin console has a matching
`MOCK_IMPACT_STORIES` (`apps/web/src/app/admin/dashboard/page.tsx:165`) with a richer
shape — before/after images, mission team, likes/shares/views, status, and a 7-step
`timeline[]` — plus a moderation view at `:2283`.

The admin side can approve, hide or feature a story. The mobile side reads a hardcoded
array. Neither can affect the other.

| Mobile field | Admin equivalent |
|---|---|
| `title`, `category`, `icon` | same |
| `beforeImage` / `afterImage` | same |
| `helper`, `reporter` | mission team |
| — | `status` (published / hidden), `likes`, `shares`, `views`, `timeline[]` |

Mobile has no concept of a story being unpublished, so an admin hiding a story would have
no effect on the app.

---

## 7. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **"Saved Impact Stories" isn't filtered.** The title changes; the list does not. | A user taps "Saved Stories" and sees stories they never saved. Silently wrong. | Accept a `filter` param and back it with `savedStore.js`. |
| 2 | **"My Impact Stories" isn't filtered either.** | Shows missions completed by Priya and others as if they were the user's. | Filter by `helper === user.name`, or rename the menu entry. |
| 3 | **Two of three stats are hardcoded** (`:31`, `:39`). | "2,340 Total Helps" is the same invented number shown on the Dashboard. "100% Resolved" is tautological. | Derive, or remove. |
| 4 | **No empty state.** | Fine at 3 static stories; blank once the list is real and empty. | Add one before wiring the API. |
| 5 | **No pagination or refresh.** | Won't survive a real feed. | `FlatList` + `RefreshControl`. |

Only five, all product-level — there are no code defects in this file.

---

## 8. What works well

- **Zero dead code.** No unused imports, no unused styles, no orphaned variables — unique
  among the screens documented so far.
- **Best design-token adherence in the app** (24 : 4).
- **Passes the whole story object** to the detail screen (`:53`), which is exactly what
  `ImpactStoryScreen` expects — and the opposite of the stub bug in
  [18 — Mission Journal](./18-mission-journal-screen.md#6-gaps--known-issues).
- **Header title is parameterised**, so one screen serves five entry points cleanly. The
  idea is right; only the missing filter lets it down.

---

## 9. QA checklist

- [ ] Opening from the Dashboard shows the default title.
- [ ] Opening from Profile → My Impact Stories shows that title.
- [ ] Opening from Profile → Saved Stories shows the "Saved" title but the same 3 stories (gap #1).
- [ ] Tapping a story opens it fully populated — title, images, helper, note.
- [ ] The middle stat matches the number of cards listed.
- [ ] Back returns to the correct origin screen from all five entry points.

---

## 10. Changing this screen

| To change… | Edit |
|---|---|
| Story data | `apps/mobile/src/screens/ImpactStoryScreen.js:19–83` |
| Hardcoded stats | `:31`, `:39` |
| Card layout | the `IMPACT_STORIES.map` block at `:50` |
| Default header title | `:24` — the `route.params?.title` fallback |
| Sponsor placement | `:46` |

---

**Previous:** [15 — Volunteer Journey](./15-volunteer-journey-screen.md) · **Next:** [17 — Impact Story](./17-impact-story-screen.md)
