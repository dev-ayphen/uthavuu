# CORE_DOCUMENT.md — Application Definition

Filled during initialisation (2026-08-19), from the existing product documentation in `docs/`
(`01_Product_Summary.md`, `PRODUCT-DECISIONS.md`) rather than a live kickoff meeting. Revisit and
update if the direction changes.

---

## Application Name

**Uthavu (உதவு)** — Tamil for "help," used as an instruction.

## Users

- **Primary:** Citizens in Tamil Nadu, in three interchangeable roles on the same account —
  **Reporter** (posts a help request), **Volunteer** (accepts and helps), **Bystander** (adds
  public information to an active request). There is no separate "volunteer account" — the same
  person reports one day and helps the next.
- **Secondary:** **Moderator (Ops)** — reviews flagged content, manages reports, via the admin
  console. **Administrator** — platform settings, categories, broadcasts, sponsors, via the same
  admin console with elevated permissions.

## Goal

Connect people who need help with nearby people who can give it, in real time, in under a minute
— for everyday situations (an injured animal, surplus food, an elderly neighbour needing
medicine, a stranded motorist, an urgent blood requirement) that go unresolved only because the
people who could help never find out.

## Problems Solving

- Ordinary local emergencies and needs go unaddressed because there's no channel connecting the
  person who needs help to the people nearby who would help if they knew.
- Existing options don't fit: social media isn't location/radius-scoped or urgency-aware; calling
  around is slow and ad hoc; official emergency services don't cover most of these cases (a
  surplus-food handoff, a lost pet, an elderly neighbour's errand).
- Trust in an anonymous-adjacent, emergency context — without resorting to a rating system that
  would penalise genuine requests for help.

## Subscription Model

**Free for everyone, always.** Users never pay and money never moves between users — no wallet,
no donations between people, no transaction fees, no per-user or per-org billing. The platform
sustains itself through two channels that never touch the user flow:

- **Sponsors** — local organisations funding relevant missions (e.g. a pet clinic sponsoring
  animal-rescue requests), sold and placed directly by Uthavu.
- **Google AdMob** — standard advertising in defined slots; Google supplies the ads, Uthavu
  controls placement and frequency only.

## Primary Platforms

- **Mobile app** (Expo/React Native, iOS + Android) — where help actually happens: discover
  nearby requests, report, accept/join, coordinate, complete, see Impact Stories. Ships first —
  this is the product.
- **Admin web console** (Next.js) — oversight and moderation for ops/admin staff: dashboard,
  users, reports/flagged content, community (impact stories, broadcasts), analytics, platform
  settings, monetisation, admin management. Not a copy of the mobile app — staff never respond to
  requests through it.

No separate *interactive* citizen-facing web app — a public marketing/info site (`apps/marketing`,
not yet built) is planned alongside mobile + admin. See the **App Profile** in `CLAUDE.md` for the
precise technical shape (`single-tenant`, `desktop-first` admin, i18n English + Tamil on mobile,
no realtime transport yet).

## Success Metrics

- **Time-to-help:** median time from a report going live to the first volunteer accepting it
  (target: minutes, not hours) — the core promise ("in real time, in under a minute" refers to
  reporting; discovery-to-accept latency is the metric to watch once real users are on it).
- **Completion rate:** share of accepted missions that reach a completed Impact Story, vs.
  abandoned/auto-released after the 15-minute confirmation window.
- **Radius density:** active requests + volunteers within a 1/3/5 km radius in launch districts —
  proxy for whether the "help is local" model has enough density to work at all.
- **Trust signal adoption:** share of reporters who complete verification (Verified Reporter
  status) — proxy for whether the no-star-rating trust model is working without it.

## Non-goals

- Not a social network — no follows, no feeds, no profiles to browse.
- Not a rating platform — no star ratings; a person asking for help in an emergency is not a
  service to be scored (`docs/PRODUCT-DECISIONS.md` Decision 1).
- Not a payment app — no wallet, no transfers, no fees, ever.
- Not a gig marketplace — volunteers aren't workers and aren't paid.
- Not a directory of every district — discovery is local by design, no state-wide/district-first
  browse.
- Not a map product — the map serves the request; the request isn't a pin on a map.
- No realtime transport at launch — Mission Chat and live alerts run on request/response + FCM
  push; add realtime only via a deliberate ADR if polling proves insufficient, not ad hoc.
