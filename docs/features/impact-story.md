# Feature: `impact-story`

- **Status:** agreed
- **Milestone:** v0.1
- **Owner:** TBD

## Problem

A mission completes and the data proving it happened — before photo, after photo, who helped, how
long it took — sits in the database with no way for anyone to see it as a finished story, react to
it, or share it. The core loop (`docs/01_Product_Summary.md` § 2) names Impact Story as its last
step; without it the loop has no visible ending.

## Users & roles

| Role | What they can do here |
|---|---|
| Anyone with the app (participant or not) | Views the Impact Story on a completed report, likes it, comments on it (comments already public/unmoderated-by-status — see `accept-and-mission-chat.md`), shares it via the native share sheet |
| Reporter | Same as above; identity shown or hidden per the report's own `anonymous` flag, unchanged by completion |
| Volunteer(s) who helped | Same as above; appear in the story's roster |

## User stories

### US-1 — View the Impact Story

As **anyone with the app**, I can **see a completed mission's before/after photos, who helped, and
how long it took**, so that **I can see the real outcome of a report I discovered or participated
in**.

- **AC1:** Given a report's status is `completed`, when I open its Request Details, then I see the
  Impact Story layout instead of the active-request layout: the original report photo(s), the
  completion photo, a duration (`reports.createdAt` → `mission_completions.submittedAt`), the
  volunteer roster, and the completion note as the story's caption.
- **AC2:** Given the report was `anonymous`, when the Impact Story renders, then the reporter's
  name/photo/profession stay hidden, exactly as they were on the active report card — no new
  identity leak introduced by completion.
- **AC3:** Given the report is not yet `completed`, when I open Request Details, then I see the
  existing active-request layout, unchanged.

### US-2 — Like

As **anyone with the app**, I can **like a completed Impact Story**, so that **I can register
appreciation without writing a comment**.

- **AC1:** Given a report is `completed`, when I tap the Like button, then a like is recorded for
  me on that report, the count increments, and the button now reads as liked.
- **AC2:** Given I've already liked it, when I tap the same button again, then the client calls
  unlike (the button toggles between the two calls based on `likedByMe`) — this is a UI behavior,
  distinct from AC3.
- **AC3:** Given the exact same like (or unlike) request fires more than once for any reason (a
  network retry, a double-tap race), then every call beyond the first is a no-op — never a
  duplicate row and never an error. This is a server-side idempotency guarantee, true regardless of
  what the UI does.
- **AC4:** Given a report is not `completed`, when a like is attempted, then it's rejected.

### US-3 — Comment

As **anyone with the app**, I can **comment on a completed Impact Story**, so that **I can add
public context or appreciation**.

- **AC1:** Given a report is `completed`, when I view it, then the existing Community Comments
  section (`accept-and-mission-chat.md`) renders and works exactly as it does on an active report —
  no new comment system, no new gating. This already holds true today (comments carry no status
  check); this story only confirms it stays true once the Impact Story layout ships.

### US-4 — Share

As **anyone with the app**, I can **share a completed Impact Story**, so that **someone outside
the app can see what happened**.

- **AC1:** Given a report is `completed`, when I tap Share, then the native share sheet opens with
  a short text summary and a deep link (`uthavu://requests/:id`).
- **AC2:** Given the recipient has the app installed, when they open the link, then it opens
  directly to that report's Impact Story.
- **AC3:** Given the recipient does not have the app installed, when they open the link, then
  nothing resolves — no web fallback page exists in this pass (see Out of scope).

## Business rules

- **BR-1:** The Impact Story is not a separate object or a generated artifact — it's the existing
  report/mission/completion data, rendered differently once `reports.statusId` is `completed`.
  Nothing is precomputed or cached; the story is assembled at read time from data that already
  exists (`report_photos`, `mission_completions`, `mission_volunteers`, `reports`).
- **BR-2:** No new authored content. The completion `note` (already required at completion time —
  `mission-completion.md` BR-2) is reused as the story's caption. Nothing new is written at
  completion or afterward specifically for the story.
- **BR-3:** Anonymity carries through automatically. `reports.anonymous` is read the same way for
  the Impact Story as it is for the active report card — there is no separate anonymity decision
  for the story.
- **BR-4:** No opt-out. Every `completed` report gets a viewable Impact Story; there is no field or
  flow to suppress one. (Anonymity, BR-3, is the privacy lever — not suppression.)
- **BR-5:** No dedicated feed or browse surface in this pass. A story is reached the same way any
  other mission is today: My Helps (for participants) or a direct/shared link. No new list
  endpoint, no new tab.
- **BR-6:** A like requires the report to be `completed` — enforced server-side, not just hidden
  client-side (mirrors how Mission Chat send is gated the opposite way: locked once `completed`).
- **BR-7:** Liking is idempotent both ways: liking an already-liked report and unliking an
  already-unliked (or never-liked) report both succeed as no-ops rather than erroring.
- **BR-8:** One like per user per report — enforced by a unique constraint, not just an
  application-level check (same pattern as `mission_completions.mission_id`'s unique FK in
  `mission-completion.md` BR-6).
- **BR-9:** No new alert type. `AlertsService` already emits `mission_completed` to the reporter on
  completion (`mission-completion.md`); that alert already opens Request Details, which now renders
  the Impact Story automatically. A second "your story is ready" alert would be redundant.
- **BR-10:** Share produces a deep link only — no server-rendered public preview page, no
  Open Graph/social-card metadata. (See Out of scope.)

## Data touched

| Table | New / changed | Notes |
|---|---|---|
| `report_likes` | new | `id`, `report_id` (FK → `reports`, cascade delete), `user_id` (FK → `user`, cascade delete), `created_at`. Unique on `(report_id, user_id)`. |

No lookup table for likes — a like is a plain existence/toggle fact with no valid-transition rules
to enforce, same reasoning `alerts.type` already uses for staying plain text (`CLAUDE.md` § Database
carve-out).

**Invariant this introduces:** at most one `report_likes` row per `(report_id, user_id)` pair —
enforced by the unique constraint, which is also what makes like/unlike idempotent by construction.

## API surface (implied, not yet built)

- `POST /reports/:id/like` — like. 403 if the report isn't `completed`. Idempotent via
  `ON CONFLICT (report_id, user_id) DO NOTHING`.
- `DELETE /reports/:id/like` — unlike. Idempotent — deleting a non-existent like is a 200, not a
  404.
- `GET /reports/:id` (existing, extended) — response gains `likeCount: number` and
  `likedByMe: boolean`. No new GET endpoint.
- No changes to `GET/POST /reports/:id/comments` (existing, already status-unaware) or
  `GET/POST /reports/:id/messages` (Mission Chat, already gated by `mission-completion.md`).

## Screens

| Screen | Route | Page doc (after build) |
|---|---|---|
| Request Details (existing) | `/requests/:id` | Gains an `ImpactStorySection` component that replaces the active-request layout when `report.status === 'completed'`: before/after photos, duration, roster, caption, Like, Share. `CommunityComments` renders underneath, unchanged. |

No new screen or route. Deep linking (`uthavu://requests/:id` → this same route) is added via a
`linking` config on the navigation container — new config, not a new screen.

## Out of scope

- **A dedicated public feed/browse surface for Impact Stories** — explicitly deferred (BR-5). A
  story is reachable per-mission only in this pass.
- **A web fallback/preview page for share links opened without the app installed** — explicitly
  deferred (BR-10). No marketing site exists yet (`apps/marketing` unscaffolded per the App
  Profile) and building a public unauthenticated preview surface is real new scope beyond a single
  deep link.
- **Any new authored content at completion or afterward** (a title, an editorial caption, an
  AI-generated summary) — explicitly deferred (BR-2). The existing completion note is reused as-is.
- **Reporter opt-out of story publication** — explicitly deferred (BR-4). Anonymity (already built)
  is the only privacy lever in this pass.
- **Reactions beyond a single Like** (e.g. multiple emoji reactions) — not requested, not built.
- **Any change to Community Comments' behavior or moderation** — reused completely as-is.
- **Any change to Mission Completion's own flow, verification, or data model**
  (`mission-completion.md`) — this feature only reads what that one produces.

## Open questions

None — resolved during the brainstorming interview with the product owner (2026-08-20). Key
decisions made during that interview, worth recording since they narrowed scope significantly from
the issue title alone:
- "Generation" (from the issue title "Impact Story: generation + sharing") was clarified to mean a
  purely computed read of existing data — not a new authored-content or AI-generation step. This
  keeps the feature consistent with this project's standing rule against fabricated/AI-flavored
  content (`PRODUCT-DECISIONS.md` Decision 1's no-fabricated-trust-signals principle, extended here
  by analogy).
- A public browse feed and a web share-fallback page were both considered and explicitly deferred
  (BR-5, BR-10) to keep this pass reuse-heavy rather than introducing two sizeable new surfaces.

## Related docs

- Related feature: [`mission-completion.md`](./mission-completion.md) — produces every piece of
  data this feature reads (photo, note, roster, `verifiedAt`); its own Out of scope section named
  this feature as the deferred follow-up.
- Related feature: [`accept-and-mission-chat.md`](./accept-and-mission-chat.md) — the Community
  Comments system reused unchanged (US-3) and the roster this reads (US-1).
- Product decisions: [`../PRODUCT-DECISIONS.md`](../PRODUCT-DECISIONS.md) — Decision 1 (no
  fabricated trust/rating signals, extended by analogy to BR-2's no-new-authored-content rule);
  Decision 2 (Impact Story's Like/Comments/Share surface, public to everyone).
- Product summary: [`../01_Product_Summary.md`](../01_Product_Summary.md) § 2 (the core loop) and
  § 7 (trust without scores).
