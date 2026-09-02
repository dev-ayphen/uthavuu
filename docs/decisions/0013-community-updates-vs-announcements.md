# ADR 0013: "Community Updates" is the per-report public feed; "Announcements" is a separate feature

- **Status**: Accepted
- **Date**: 2026-08-29
- **Deciders**: Product owner, after an implementation pass built the wrong feature under this name.

## Context

The admin console's sidebar carries a **Community → Community Updates** entry. Nothing in
`apps/api` implemented it, and the product docs were not consulted before an implementation pass
guessed at what it meant. That pass invented **admin-authored bilingual announcements** — a
draft/published/archived lifecycle broadcast to all citizens — and shipped it as `community_updates`
(migration `0020_wild_landau`), plus a full admin CRUD surface and a citizen `GET /updates`.

That guess was wrong, and four independent sources say so:

1. **The mobile spec.** `docs/mobile/14-request-details-screen.md:319` §1D defines Community Updates
   as *"The public information feed on an active request. Distinct from Mission Chat (§1C): anyone
   may post here and everyone can read it."* Its record shape is per-post — author, role badge, a
   `type` chip (e.g. location), a message and a "Helpful" count — and the composer disappears once
   the request completes.
2. **The prototype admin docs.** `docs/webadmin/04-reports-and-moderation.md:52` labels the same
   thing **"📣 Volunteer Field Updates"**, rendered *inside a report's detail view*;
   `docs/webadmin/05-community.md:100` is the standalone moderation tab over that same per-report
   feed.
3. **The console's own placeholder**, before it was overwritten: *"Field updates volunteers post
   while a mission is running."*
4. **The existing implementation.** That feed is already built, under a different name:
   `report_comments`, documented at `apps/api/src/db/schema/comments-schema.ts:1-5` as
   PRODUCT-DECISIONS **Decision 2** — "Community Comments (public, any authenticated user) vs
   Mission Chat (private…)" — and deliberately *not* gated by `hasActiveAccess()`, because it is the
   public counterpart to the private channel. Mobile renders it at
   `apps/mobile/src/screens/request-details/CommunityComments.tsx`. Admin already moderates it at
   `/reports/comments`, backed by `apps/api/src/admin/admin-comments.controller.ts:30,44,56`.

So the nav entry was a **second door onto content that already exists and is already moderated** —
and the feature built for it was something else entirely.

## Decision

**These are two different features and they are named and routed separately.**

1. **Community Updates = the per-report public feed.** It is `report_comments` (shipped as "Community
   Comments"). Its citizen surface is the Request Details screen; its moderation surface is
   **Reports → Comments**. The Community group's nav entry points at that existing moderation flow.
   **No second mobile `/updates` feature is built for it** — it already exists.

2. **Announcements = admin-authored broadcast.** The `community_updates` work is kept, but reframed
   and renamed **Announcements** in the UI, as its own top-level admin section — never inside
   Community. It is an **additional proposed feature**, not the implementation of the original
   Community Updates requirement, and it needs its own approval on its own merits.

**Deliberately deferred:** the API path stays `/admin/community-updates` and the table stays
`community_updates`. Renaming them would cost a migration plus a rewrite of already-seeded
`community_update.*` audit-action rows, and Announcements' long-term survival is undecided. Migration
0020 is **not** reverted — the tables are inert if unused, and dropping them costs another migration.
This is recorded naming debt, commented at the call site, not an oversight.

## Consequences

**Positive**

- The two concepts stop colliding. "Community Updates" means one thing (per-report field updates)
  and "Announcements" means another (admin broadcast), in the nav, the docs and the code.
- No duplicated work: the per-report feed is not rebuilt on mobile or in admin, because both halves
  already ship.
- Announcements survives as a real, tested feature rather than being thrown away — but it is now
  correctly labelled as unapproved scope rather than masquerading as a delivered requirement.
- No migration churn. 0020 stays applied; no 0021 to revert it.

**Negative**

- **A real naming mismatch now exists**: the UI says "Announcements" while the HTTP path says
  `community-updates` and the table says `community_updates`. Anyone reading across the layers will
  hit it. Accepted knowingly, commented in `api.ts`, and cheap to finish later — but it is debt.
- The `community_updates` tables sit in the schema possibly unused. Inert, but not free: they show
  up in schema reads and in `data.md`.
- Effort was spent building a feature nobody requested. The recoverable part is the code; the
  unrecoverable part is the time.

**Neutral**

- The Community nav group now has an entry whose href leaves `/community/` for `/reports/comments`.
  Slightly odd, and the alternative — deleting the entry — was available; whichever was chosen is
  commented in `nav.ts`.
- ADR 0012's `DELETE`-without-a-reason deviation lives inside Announcements, so it is parked until
  Announcements' fate is decided. No point polishing a feature that may be removed.

## The process rule this produced

The product owner framed this explicitly as **an engineering/process mistake, not a product decision**:

> *"The existing Community Updates/feed requirement should have been verified against the docs and
> existing schema/code first. Instead, a new `community_updates` schema was invented to implement
> what turned out to already exist through `report_comments`."*

**The rule, binding on all future work:**

> **Before building any feature that could overlap with an existing one, verify — in this order —
> the existing docs, the database schema, the API routes, and the mobile implementation. Only create
> a new table or endpoint after showing the existing one is insufficient.**

Four checks, each of which would have caught this on its own:

| Check | What it would have shown |
|---|---|
| `docs/mobile/` + `docs/webadmin/` | §1D defines Community Updates as the per-report public feed |
| `apps/api/src/db/schema/` | `report_comments` already models it, citing PRODUCT-DECISIONS Decision 2 |
| API routes | `/admin/comments` already moderates it |
| `apps/mobile/src/` | `CommunityComments.tsx` already renders it |

The cost of skipping them was a table, a migration, an API surface, an admin UI, and the correction
that followed. The cost of running them is minutes.

**Corollary, applied immediately after:** the same check was run before Monetization — and
`docs/webadmin/08-monetization.md` turned out to contain a full Sponsors specification, after this
same session had twice claimed no spec existed. The rule caught a repeat of the identical mistake
one feature later.

## Alternatives considered

- **Wire Community → Updates to the new announcements feature** (i.e. accept the guess). Rejected:
  it would cement a definition that contradicts all four sources, and merge two genuinely different
  concepts — exactly the mistake this ADR exists to undo.
- **Revert migration 0020 and delete the announcements code.** Rejected for now: it costs a
  migration `0021` to drop the tables, discards working tested code, and forecloses a decision the
  owner would rather keep open. Unused tables are cheap; deletion is not reversible for free.
- **Rename the table and endpoints to `announcements` immediately.** Rejected as premature: a
  migration plus a data change to seeded audit-action keys, spent on a feature whose survival is
  undecided. Revisit if and when Announcements is approved.
- **Build a second mobile `/updates` feed for the nav item.** Rejected outright — it would duplicate
  `report_comments`, which mobile already renders.

## Evidence in code

- `docs/mobile/14-request-details-screen.md:319` — §1D, the public per-report feed definition.
- `docs/webadmin/04-reports-and-moderation.md:52` — "📣 Volunteer Field Updates" inside report detail.
- `docs/webadmin/05-community.md:100` — the prototype's standalone moderation tab over the same feed.
- `apps/api/src/db/schema/comments-schema.ts:1-5` — `report_comments` as the public counterpart to
  Mission Chat, per PRODUCT-DECISIONS Decision 2.
- `apps/mobile/src/screens/request-details/CommunityComments.tsx` — the citizen surface, already built.
- `apps/api/src/admin/admin-comments.controller.ts:30,44,56` — the moderation API, already built.
- `apps/api/drizzle/0020_wild_landau.sql` — the Announcements tables, applied and retained.

---

*Decided by the product owner 2026-08-29, correcting an invented feature definition. Recorded so the
next reader finds an argued separation rather than two features wearing one name.*
