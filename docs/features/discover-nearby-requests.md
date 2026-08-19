# Feature: `discover-nearby-requests`

- **Status:** agreed
- **Milestone:** v0.1
- **Owner:** TBD

## Problem

Citizens need to quickly see what needs help near them — filtered by distance and category —
without a map product or a district-wide browse. "Help is local, or it isn't help": the default
experience has to answer *what needs help near me right now*, not invite endless scrolling
through an entire state.

## Users & roles

| Role | What they can do here |
|---|---|
| Citizen (authenticated) | View the category grid with live counts, browse category lists filtered by radius, search another location |

## User stories

### US-1 — See what's nearby at a glance

As a **citizen**, I can **see a category grid with live active/urgent counts** so that **I can
quickly gauge what needs help near me**.

- **AC1:** Given I open Discover (Home), when it loads, then I see all 8 citizen-reportable
  categories as tiles, each showing an active count and an urgent count within my current radius
  (default 5 km, BR-1).

### US-2 — Change the search radius

As a **citizen**, I can **change my search radius** so that **I control how wide "nearby"
means**.

- **AC1:** Given I select a different radius (1 / 3 / 5 / 10 km, BR-2), when I confirm it, then
  category counts and any open list update to reflect the new radius, and my choice persists for
  future sessions (BR-1).

### US-3 — Browse a category's open requests

As a **citizen**, I can **tap a category to see its open requests, nearest first** so that **I
can act on the closest one**.

- **AC1:** Given I tap a category tile, when the list loads, then I see open requests in that
  category within my radius, sorted nearest-first (BR-3).
- **AC2:** Given I pull down on the list, when I release, then it refetches the latest open
  requests (BR-4).
- **AC3:** Given I navigate away and return to this screen, when it regains focus, then it
  refetches automatically (BR-4).

### US-4 — Check another location

As a **citizen**, I can **search another location to check on it** so that **I can look in on
family elsewhere, or plan ahead, without confusing it with my own area**.

- **AC1:** Given I open "Explore Another Location," when I type a place name, then I see
  type-ahead search results to pick from.
- **AC2:** Given I've selected another location, when I view Discover, then the screen clearly
  states I'm exploring it, not my current location (e.g. "🌍 Exploring Trichy — not your current
  location").
- **AC3:** Given I close and reopen the app, when Discover loads, then it resets to my actual
  current location — the explored location never becomes a new default (BR-5).

## Business rules

- **BR-1:** Default radius on first use is **5 km**; once changed, the choice persists across
  sessions (stored on the user's profile).
- **BR-2:** Radius options are fixed: **1, 3, 5, 10 km**. No custom/arbitrary radius input.
- **BR-3:** Category lists sort **nearest-first** by default. No alternate sort (e.g. by urgency)
  in v0.1 — a later addition, not a schema change.
- **BR-4:** No realtime transport (ADR 0005) — freshness comes from pull-to-refresh and
  refetch-on-focus only. No background polling.
- **BR-5:** "Explore Another Location" is always a temporary, per-session override. The app
  always returns to the user's actual current location on next app open — it never persists as a
  new "home" location.
- **BR-6:** Discovery is strictly **category-first** — there is no merged, all-categories feed.
  The category grid (with live counts) is the only entry point into browsing.

## Data touched

| Table | New / changed | Notes |
|---|---|---|
| `user` | new column | `preferred_radius` (int, km, default 5) — persists BR-1 |
| `reports` | read-only | Consumed from `report-a-request.md`'s schema; no changes here |

**Invariants this introduces:** none new — this feature only reads `reports` and the user's
location/radius. The nearest-first sort (BR-3) depends on `reports.lat`/`lng` always being real
GPS coordinates (established as an invariant in `report-a-request.md`), not the landmark text.

## Screens

| Screen | Route | Page doc (after build) |
|---|---|---|
| Discover / Home (category grid) | `/` | `pages/discover-home.md` |
| Category list (filtered, nearest-first) | `/category/:category` | `pages/category-list.md` |
| Explore Another Location (place search) | `/discover/explore` | `pages/discover-explore.md` |

`/category/:category` is shared with `report-a-request.md`'s Category List screen — same screen
serves both "browse" and "where do I report this."

## Out of scope

- **Merged all-categories feed** — deferred (BR-6); category-first only for v0.1.
- **Custom/arbitrary radius input** — fixed 1/3/5/10 km only (BR-2).
- **Map view** — the product is explicitly not a map product (product docs § 11).
- **Saved/favorite locations** for repeated "explore" use — one-off search only in v0.1.

## Open questions

None — resolved during the brainstorming interview with the product owner (2026-08-19).

## Related docs

- Product: [`../01_Product_Summary.md`](../01_Product_Summary.md) § 5 (how discovery works)
- Data: [`../architecture/data.md`](../architecture/data.md)
- Related features: [`report-a-request.md`](./report-a-request.md) (the `reports` schema this
  reads), [`auth.md`](./auth.md) (the `user.last_lat`/`last_lng` this defaults from)
- ADRs: [`../decisions/0005-no-realtime-transport-yet.md`](../decisions/0005-no-realtime-transport-yet.md)
