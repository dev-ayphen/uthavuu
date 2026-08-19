# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## App Profile (source of truth — set 2026-08-19)

> Set by the initialisation interview ([`INITIALISE.md`](INITIALISE.md)) **before any code**.
> This block is the single source of truth for the app's shape. **Every agent reads it and
> obeys it over any example in its own file.** Changing an axis here is an architectural
> decision — record an ADR and refresh the agents' context (see [`WORKFLOW.md § 6`](WORKFLOW.md)).

| Axis | Value | Notes |
|---|---|---|
| **Surfaces** | `mobile`, `admin`, `marketing` | No separate citizen-facing *app* web app — mobile is the only interactive citizen surface. `marketing` is a public landing/info site (not app functionality — no login, no reports). Not `api-only`. `apps/marketing` is not yet scaffolded; add it when marketing work starts. |
| **Form factor** | `desktop-first` (admin only) | Admin console: dense, sidebar nav, 8 sections (Dashboard, Users, Reports, Community, Analytics, Platform, Monetization, Admin) used by ops/moderators at a desk. Mobile follows native patterns, not a web breakpoint model. |
| **Tenancy** | `single-tenant` | One user = one account. No orgs/companies own data. Queries use `db` directly — no `org_id`, no `forOrg()`. |
| **Tenant unit** | n/a | Single-tenant. |
| **Audience** | `consumer` (mobile) | Mobile: public, varied skill level, warmth matters — matches Uthavu's community/emergency-help identity. Admin is internal/professional by nature regardless of this default. |
| **Localisation** | `i18n` — English + Tamil (mobile) | Mobile (citizen-facing) wires next-intl, English + Tamil, locale-aware routing, message catalogs — the product's own signals demand it (name/brand உதவு, Tamil Nadu market, a `language` field already in the profile UI). Admin (`apps/admin`) stays `english-only` UI chrome — internal staff tool — but must render Tamil user-generated content correctly (Noto Sans Tamil font, no chrome translation needed). |
| **Realtime** | `none` (for now) | The API contract (`docs/API-CONTRACT.md`) is REST-only — polled alerts (`GET /users/me/alerts`), no websocket anywhere in it. Start on request/response + FCM push for alerts. **Mission Chat** starts as REST (poll/send), gated server-side on `hasAccepted` — the same gate as the phone-number reveal. Revisit via ADR if chat/live-feed latency becomes a real problem; don't add realtime infra pre-emptively. |
| **Integrations** | email: `none` · payments: `none` · push: `fcm` · sms/OTP: `msg91` | Email: not used anywhere in the product (private profile field only). Payments: explicitly ruled out — Uthavu never charges users, money never moves between users (sponsors + AdMob are the only revenue, both admin-controlled, not touching user flows). Push: FCM — one of the 5 blocking modules (nearby-request alerts, broadcasts, mission status). SMS/OTP: `msg91` (India-region) — real SMS from the start, not deferred to a dev-mode stub. |
| **Testing** | `full` | Vitest unit + Supertest integration + 80%/100% coverage bar, **plus Playwright E2E** (Maestro on mobile) on the critical journeys: OTP login, report a request, accept/volunteer, complete a mission. This is a public product headed to production — don't defer E2E. |

## Project Overview

**Uthavu (உதவு)** — a community emergency and help network for Tamil Nadu. It connects people
who need help with nearby people who can give it, in real time, in under a minute. The name is
Tamil for "help," used as an instruction.

**Core loop:** Report → Discover (by location + radius, 1/3/5/10 km) → Accept (15-minute
confirmation window) → Help (Community Comments public + Mission Chat private) → Impact Story
(public record: before/after, who helped, how long).

**Deliberately not:** a social network, a rating platform (no star ratings — trust comes from
verification + completion history), a payment app, a gig marketplace, or a map product.

### What exists today

**Nothing is built yet — this repo starts from zero code.** `apps/api`, `apps/mobile`, and
`apps/admin` are freshly scaffolded and empty. `docs/` holds two different things, don't confuse
them:

- `docs/overview/`, `docs/features/`, `docs/branding/`, `docs/design/`, `docs/architecture/`,
  `docs/api/`, `docs/decisions/`, `docs/operations/` — the kit's forward-looking spec taxonomy.
  Empty/template scaffolding today; fill as features are planned and built (spec-first, per
  [`WORKFLOW.md`](WORKFLOW.md)).
- `docs/01_Product_Summary.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/API-CONTRACT.md`,
  `docs/USER-JOURNEYS.md`, `docs/PRODUCT-DECISIONS.md`, `docs/mobile/`, `docs/webadmin/`, etc. —
  **an AI-generated forward-looking spec, not an audit of real code.** These docs claim to be
  "verified against the code" with specific `File.js:123` citations — **that claim is false. No
  prototype exists or ever existed**, in this repo or anywhere else (confirmed with the product
  owner 2026-08-19). An earlier autonomous agent run fabricated the citations and defect reports
  wholesale while inventing a plausible-sounding spec. **Treat every file:line citation, every
  "already implemented" / "partially implemented" status, and every specific defect description
  in these docs as invented, not verified — do not cite them as evidence of anything about real
  code.** The *product* content (business rules, screen list, category set, the core loop, the
  privacy/trust model) reflects real decisions and is usable as a starting spec — but verify any
  specific technical claim before relying on it, and update a doc's status language (drop
  "verified"/"as-built" framing) as you confirm or replace its content during real implementation.
  `docs/API-CONTRACT.md` is a reasonable *draft* starting point for the real API contract, not a
  ground-truth extraction.

Use the product docs as the specification. Build `apps/api` first — it blocks everything else
(see `docs/IMPLEMENTATION-STATUS.md` § "The five modules that block everything else").

## Stack Summary

> The surfaces named in the App Profile are `mobile` + `admin` + `marketing`. `apps/marketing` is
> not yet scaffolded — add it when marketing work starts. No other separate citizen-facing web app.

- **Monorepo:** pnpm workspace, TypeScript everywhere.
- **Backend:** NestJS (modules, DI, guards, pipes) + Drizzle ORM + PostgreSQL. Queue-based
  processing (Redis) for batch/heavy work.
- **Admin web:** Next.js (App Router), `desktop-first` — dense, sidebar nav. Internal staff tool,
  `english-only` UI chrome. Not mirrored by mobile — different tool for a different audience.
- **Mobile:** Expo (React Native), single codebase iOS/Android. The only interactive citizen-facing
  surface — i18n (English + Tamil via next-intl) lives here.
- **Marketing:** public landing/info site, no login, no app functionality. Not yet scaffolded.
- **Auth:** Better Auth. Mobile: phone + OTP via `msg91` (real SMS from the start). Admin:
  session-based login. Better Auth owns its `user` / `session` / `account` / `verification` tables
  (singular) — extend, don't rename them.
- **Data layer:** Postgres for persisted data; Redis for sessions, rate-limits, and queues.
- **Tenancy:** `single-tenant` — queries use `db` directly, no org scoping anywhere.
- **Realtime:** none for now — request/response + FCM push. Mission Chat is REST (poll/send),
  gated server-side on `hasAccepted`. Revisit via ADR if latency becomes a real problem.
- **Notifications:** FCM push only (alerts, broadcasts, mission status). No email provider.
- **Payments:** none — never charge users, money never moves between users.
- **Deployment:** Vercel for `apps/admin` and `apps/api` (Vercel Functions run NestJS natively via
  Fluid Compute — no separate backend host needed). Mobile via EAS Build/Update.

See [`TECH_STACK.md`](TECH_STACK.md) for the full canonical stack and the reasoning behind each
choice.

## Commands

### Development

```bash
pnpm dev                              # Run all apps in parallel
pnpm --filter api dev                 # NestJS API
pnpm --filter admin dev               # Admin console (Next.js)
pnpm --filter mobile dev              # Expo mobile app
```

### Build

```bash
pnpm build                            # Build all packages
pnpm --filter admin build             # Build a single app
```

### Test / Lint / Type-check

```bash
pnpm test                             # Run all tests
pnpm --filter api test                # Test one package
pnpm lint                             # Lint all packages
pnpm --filter admin type-check        # Type-check one package
```

### Database (Drizzle + PostgreSQL)

```bash
pnpm db:generate                      # Generate a migration from schema changes
pnpm db:migrate                       # Run migrations (the ONLY way schema reaches any DB)
pnpm db:studio                        # Open Drizzle Studio
pnpm db:seed                          # Seed master data (roles, lookup tables, config)
```

> **`db:push` is banned** — there is no such script. Schema changes reach the database only
> through a generated, committed migration. `push` desyncs the migration history from the DB and
> the file tree; recovering from that is far more expensive than one `db:generate`.

## Workspace Layout

```
apps/
  api/            # NestJS backend                       (always)
  admin/          # Next.js admin dashboard               (moderators/ops)
  mobile/         # Expo React Native app                 (citizens)
  marketing/      # Public landing/info site               (not yet scaffolded)
libs-common/      # Shared types + API handler
libs-web/         # Web-only shared UI + utils (currently just admin's)
libs-mobile/      # Mobile-only shared UI + theme + utils
docs/             # Repo documentation (see docs/README.md)
.claude/agents/   # Specialized Claude Code agents (frontend/backend/mobile/architecture/infra/review/testing)
```

No `apps/web` — this project has no separate *interactive* citizen-facing web surface (mobile
covers that). `apps/marketing` is named in the App Profile but not yet built; scaffold it when
marketing work starts.

## Conventions

### Backend (NestJS)

- Modules under `apps/api/src/modules/` follow: `*.controller.ts`, `*.service.ts`, `*.module.ts`,
  `dto/` (Zod schemas), `utils/`.
- Guards for auth, roles/permissions (RBAC), and rate-limiting; pipes for validation.
- Validate request bodies/queries with Zod DTOs via a validation pipe. Use `z.coerce.*` for query params.
- Cross-field validation lives in the DTO (Zod `.refine()`), not the service.
- Admin role gate must come from the session, never a URL query string — the prototype's
  `?role=super` fail-open pattern (`docs/IMPLEMENTATION-STATUS.md`) is exactly what NOT to build.

### Database (Drizzle)

- Schema under `apps/api/src/db/schema/`. **UUIDv7 primary keys** (time-ordered, standard,
  btree-friendly); `created_at` / `updated_at` with timezone on every table. Infer types via
  `typeof table.$inferSelect`.
- **Status / enum values live in lookup tables** referenced by FK — not hardcoded `text` enums.
  Renaming a status is a data change, not a migration; the DB enforces valid values.
- **Migrations only** — never `db:push` (see above). One generated, committed migration per change.
- **Soft-delete only where a feature needs it** — a `deleted_at` on every table is dead weight
  and one more `isNull()` filter to forget. Add it per-table, deliberately.
- No money moves between users — no `amount_cents` ledger needed for the core product. Sponsor
  billing (if it ever needs one) is out of scope for the user-facing schema.
- **Tenancy:** `single-tenant` — no `org_id`, no `forOrg()` scoping anywhere.

### Web (Next.js) — `apps/admin` only

- App Router with route groups for auth / protected areas.
- **Layout: `desktop-first`** — dense, sidebar, desktop-down breakpoints. This is the only web
  surface's layout rule; there's no `responsive` or `mobile-first` app to reconcile it with.
- **Layout contract:** pages compose `PageLayout` (or `SubMenuPageLayout` / `SelectionPanelLayout`).
  A `page.tsx` **never** sets its own `max-w-*`, `mx-auto`, or page padding — the layout owns them.
- **Scroll ownership:** chrome never scrolls with content. Fixed chrome is offset with padding, not
  margin; inner-scroll regions need a bounded height, `svh` (never `vh`), and **every
  `overflow-y-auto` in a flex row paired with `min-h-0`** — without it the scroll escapes to the
  document and the menu scrolls away with the content. Full model in `docs/design/design-system.md`.
- **Page archetypes:** pick one (list / detail / create-edit / settings / dashboard) — it decides
  the layout primitive and scroll mode. Every data segment ships `page.tsx` + `loading.tsx` +
  `error.tsx`. State branch order is loading → error → empty → content.
- **Error architecture:** four layers — segment `error.tsx` (preferred), root `error.tsx`,
  `global-error.tsx`, and a React `ErrorBoundary` in the provider tree. The boundary is not
  redundant: `error.tsx` catches async/server errors, but a **synchronous client render throw** can
  escape it and take the app white. Each error surfaces at its own altitude — field errors inline,
  failed loads as an error state **with retry**, failed actions as a toast.
- Forms with 3+ fields use React Hook Form + `zodResolver`. Mirror backend Zod refinements on the client.
  Compute `defaultValues` with `useMemo` (**never** `useEffect` + `reset` — a background refetch wipes
  the user's input), and map the API's `validationErrors` onto fields via `setError`.
- Wrap `useSearchParams()` in a `<Suspense>` boundary.
- **No i18n** — `english-only`, plain strings, no next-intl.

### Mobile (Expo) — `apps/mobile`

- The only citizen-facing surface — there's no consumer web app to mirror. Admin (`apps/admin`)
  is a separate ops tool for a different audience; they share the API contract, not UI patterns.
- React Query for server state; bearer token in secure storage.
- Native layout patterns — bottom tabs, thumb-reachable actions — not a web breakpoint model.
- **i18n: English + Tamil**, via next-intl (or the RN equivalent message-catalog pattern) — the
  only surface with real i18n. Every user-facing string goes through the catalog; no hardcoded
  copy. Profile Setup's `language` field (free text, saved to `user.language`) records the user's
  stated preference — the actual catalog-switching UI/logic that reads it is not yet built.

## Known Gotchas

- **OTP goes through `msg91` from the start — no dev-mode stub, except right now.**
  `docs/decisions/0007-temporary-dev-otp-fallback.md` temporarily amends this: with no
  `MSG91_AUTH_KEY`/`MSG91_TEMPLATE_ID` set, `apps/api` falls back to logging the OTP code to its
  own console instead of sending real SMS, purely to unblock testing the rest of the auth flow.
  It's hard-blocked from running when `NODE_ENV=production`. Once real msg91 credentials are set
  in `.env`, this fallback stops being used automatically — no code change needed. Rate-limit both
  `/auth/otp/request` and `/auth/otp/verify` server-side (see `docs/API-CONTRACT.md` § Security
  requirements) before wiring real SMS, or the first load test becomes an msg91 bill.
  **The API runs in Docker now** (`docker compose up -d api`, see the `api` service in
  `docker-compose.yml` / `apps/api/Dockerfile`) — the console it logs to is `docker compose logs
  -f api`, not a bare terminal. `NODE_ENV` is deliberately left unset in that image so this
  fallback still activates for local/dev use; a real deploy target must set
  `NODE_ENV=production` for ADR 0007's hard-block to do its job.
- **"Web" is ambiguous in conversation — it means the admin console.** There is no separate
  citizen-facing *app* web surface in this project (marketing is a static info site, not the app).
  If someone says "the web app," confirm whether they mean `apps/admin` or are actually asking for
  new scope.
- **Mission Chat privacy is a security boundary, not just a UI filter.** It must be gated
  server-side on `hasAccepted` on every API call — the same gate that controls the reporter's
  phone-number reveal. No realtime channel auth to worry about (realtime is `none` for now — see
  App Profile). The prototype got this wrong (chat input was a placeholder, gating was
  client-only) — don't repeat it.
- **`docs/mobile/*` and `docs/webadmin/*` file:line citations point at code that isn't in this
  repo.** They describe an earlier prototype built elsewhere. Use them for behavior/business-rule
  reference only, never as an actual file path to open.
- **No star ratings, ever** (`docs/PRODUCT-DECISIONS.md` Decision 1) — trust is verification +
  completion history only. Don't reintroduce a rating field even as a "nice to have."
- **Profile photos go to local disk, not a real cloud bucket — deliberately.**
  `docs/decisions/0008-local-disk-photo-storage.md`: no S3/Supabase/Cloudinary account exists yet,
  so `POST /uploads` (`apps/api/src/uploads/`) writes to `UPLOADS_DIR` and serves it back as a
  static file. The returned `avatarUrl` is a plain URL either way, so swapping in a real provider
  later only touches the uploads module, not the schema or the mobile client.

## Tooling

- **Context7 MCP is required.** Before using a library or framework API you're not 100% current
  on — a new hook, a config option, a method signature — **look it up via Context7**, don't recall
  it from memory. The stack moves faster than the training cutoff; a confidently-wrong API is the
  most expensive bug. This applies to every agent.
- **GitHub MCP** — issues, PRs, and the board.

## Pointers

- **Start:** `INITIALISE.md` (App Profile — done, this file) → `SETUP.md` (done) →
  `GETTING_STARTED.md` (the flow, start at Stage 1).
- **Product spec:** `docs/01_Product_Summary.md` (what Uthavu is), `docs/USER-JOURNEYS.md`,
  `docs/API-CONTRACT.md` (the endpoint set to build first), `docs/PRODUCT-DECISIONS.md`.
- **Docs:** `docs/README.md` (entry point) — overview, features, branding, architecture, API, modules, pages, decisions.
- **Agents:** `.claude/agents/*.md` — frontend / backend / mobile / architecture / infra / review / testing specialists.
- **Workflow:** `WORKFLOW.md` — tracking, execution flow, the Definition of Done loop, and the change-request loop.
- **Parallel sessions:** `COORDINATION.md` + the live mailbox `docs/coordination.md` — working-copy
  isolation, the migration lock, lanes, and shared-branch hygiene when more than one session runs at once.

## Formatting

Prettier — not yet configured (no code exists). Set `.prettierrc` with the first backend scaffold
and record the choice here; let it be the sole authority afterward (agents read it, don't assume a style).

## Environment Variables

Copy `.env.example` to `.env`. Required at minimum:

- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` — auth config
- `ADMIN_URL` — CORS origin for the admin console (no separate frontend URL — mobile uses bearer tokens, not cookie CORS)
- `REDIS_URL` — queues / sessions / rate-limits
- `NEXT_PUBLIC_API_URL` (admin) / `EXPO_PUBLIC_API_URL` (mobile)
- `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` (or equivalent Firebase Admin credentials) — push notifications
- `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` — SMS/OTP, required from the first auth build (not deferred)

Add later, if the App Profile changes (write an ADR first — see `WORKFLOW.md § 6`):
- Realtime transport credentials (e.g. `PUSHER_*` or a self-hosted `soketi` URL) — only if Mission
  Chat or the admin live feed actually needs push-driven updates instead of polling.

> **Running a parallel session?** Give this `.env` its own runtime state: a separate `DATABASE_URL`
> (its own database, e.g. `app_dev_s2`), a separate `REDIS_URL` (its own logical DB or port), offset
> app ports, and the `BETTER_AUTH_URL` / CORS / `NEXT_PUBLIC_API_URL` values that derive from them —
> **offset together, or a missed reference fails in a way that looks like something else.** Record
> your offsets in `docs/coordination.md`. Full model: `COORDINATION.md § 1`.
