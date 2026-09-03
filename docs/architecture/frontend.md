# Frontend Architecture — `apps/admin`

> **Shape (from the App Profile in [`CLAUDE.md`](../../CLAUDE.md)):** Form factor `desktop-first`
> (admin only) · Localisation **english-only chrome** · Audience: internal staff.
>
> **"Frontend" here means the admin console and nothing else.** There is no citizen-facing web app —
> `apps/mobile` is the only interactive citizen surface ([`mobile.md`](./mobile.md)), and
> `apps/marketing` is named in the App Profile but not yet scaffolded. If someone says "the web app",
> confirm which they mean before building.

Written by reading `apps/admin/src` and `libs-web`. Every `path:line` below was opened.

---

## Overview

Next.js **16.3.3** App Router, React 19.2.3, TypeScript strict, on port **3002**
(`apps/admin/package.json`). **326 files / ~37,100 lines.** Server state is TanStack Query; there is
no Redux and no global client store — filters, sort, page and search live entirely in the URL.
Styling is Tailwind **v4 CSS-first** with no `tailwind.config.*` anywhere in the repo. Auth is a
better-auth **session cookie**, checked in a server component, not in middleware.

Two things about this surface are genuinely exemplary and are the reason it is worth documenting
carefully rather than rewriting: the **route-file discipline** and the **state-management
discipline**. Both are verified below, not asserted.

---

## Routing

App Router with two route groups. **105 files under `src/app/**`** — 31 `page.tsx`,
33 `loading.tsx`, 34 `error.tsx`, 4 `layout.tsx`.

```
src/app/
├── layout.tsx              # root: fonts, Providers, suppressHydrationWarning
├── page.tsx                # redirect("/dashboard")  — page.tsx:10
├── error.tsx               # "ERROR LAYER 2 of 4"    — error.tsx:8
├── global-error.tsx        # "ERROR LAYER 3 of 4"    — global-error.tsx:4
├── not-found.tsx
├── globals.css             # the entire theme, 427 lines
│
├── (auth)/                 # unauthenticated
│   ├── layout.tsx          # pins data-theme="dark" on a wrapper — (auth)/layout.tsx:16
│   └── login/
│
└── (console)/              # everything behind the session check
    ├── layout.tsx          # the auth gate
    ├── dashboard/  users/[id]  reports/[id]  reports/comments  reports/flagged
    ├── announcements/[id]  announcements/new
    ├── community/          # no page.tsx — nav grouping only
    │   ├── broadcasts/[id] broadcasts/new
    │   └── impact-stories/[id]
    ├── monetization/  monetization/admob  monetization/sponsors/[id]  sponsors/new
    ├── platform/           # no page.tsx — has its own layout.tsx for children
    │   ├── audit-logs  categories  settings  support/[id]  system-health
    ├── analytics/
    └── admins/[id]
```

**There is no `middleware.ts` anywhere in the repo.** `find . -name middleware.ts` returns nothing.
Every authorization decision is a server component `await`, which means it is visible in the file
that renders the page rather than in a file nobody opens.

**`typedRoutes: true`** (`apps/admin/next.config.ts:21`) — a typo'd `href` is a compile error.

### Route-file discipline — verified, with zero exceptions

**All 31 segments that own a `page.tsx` also own a `loading.tsx` and an `error.tsx`.** Not one leaf
is missing any of the three. This is the single strongest structural thing in the repo, and it is
exactly what `CLAUDE.md:190-192` asks for.

Two segments carry `loading.tsx` + `error.tsx` and deliberately **no** `page.tsx`:
`(console)/community` and `(console)/platform`. Both are nav groupings, not routes — `/community`
and `/platform` 404 on purpose, and `src/config/nav.ts:133-142` records that a group section *"has
NO href and NO permission of its own."* The sidebar points at `/community/impact-stories` and
`/platform/support` instead.

### Error architecture — four named layers

The layers are labelled in the source, in order, which is why they are easy to reason about at 2am:

| Layer | File | Catches |
|---|---|---|
| 1 | `(console)/error.tsx:8` — *"the preferred boundary"* | a console page throw, **inside the shell** — sidebar and header survive |
| 2 | `app/error.tsx:8` | a throw above the console layout |
| 3 | `app/global-error.tsx:4` | the root layout itself failed — renders its own `<html>`/`<body>` with **inline styles only** (`:23-35`), because it never receives `globals.css` |
| 4 | 31 per-segment `error.tsx` files | a single data leaf failing without taking its siblings down |

Plus a React `ErrorBoundary` in the provider tree (`src/components/providers/error-boundary.tsx`),
which is not redundant: `error.tsx` catches async and server errors, but a **synchronous client
render throw** can escape it.

> **Next 16.3 renamed the boundary prop from `reset` to `retry`.** All error components here take
> `retry` — documented at `app/error.tsx:14-16`. Copying a boundary from an older tutorial silently
> produces a button that does nothing.

Error altitude, as actually implemented: field errors inline via `setError`; failed loads as an
error state **with retry**; failed actions as a `sonner` toast; permission denials get their own
copy, never a 404.

---

## The auth gate

`src/app/(console)/layout.tsx` — 46 lines, and the whole protected area hangs off three of them:

```
:30   const { session, denial } = await getAdminSessionResult();
:32   if (denial === "signed-out") redirect("/login");
:34   if (!session) return <AccessDenied denial={denial} />;
:38   <AppLayout session={{ name, role }} permissions={session.permissions}>
```

The session comes from the API, not from a local token: `src/lib/session.ts:68` calls
`serverApiFetch<AdminMeResponse>("/admin/me")` and shape-validates the response at `:72`. **The
console never decides who is an admin** — it asks the API, which resolves the role from the database
(see [`backend.md`](./backend.md#admin-rbac)).

`classifyDenial()` (`session.ts:92-101`) keeps three failures distinct rather than collapsing them,
and the distinction is the point:

| Denial | Cause | Result |
|---|---|---|
| `signed-out` | no/expired session | `redirect("/login")` |
| `not-admin` | signed in, `ADMIN_NOT_AN_ADMIN` | an explanatory panel — **not** a login loop |
| `unreachable` | `error.isNetworkFailure` (`api-error.ts:39-41`) | "the console couldn't reach the API" + a retry |

Collapsing `unreachable` into `signed-out` would bounce an admin to the login screen every time the
API restarted, where their perfectly valid cookie would appear to be rejected.

**`permissions` passed to `AppLayout` is UX only and enforces nothing** — `(console)/layout.tsx:23-27`
says so explicitly. It drives which sidebar entries render. The API is the gate.

### Login

`(auth)/login/page.tsx` — React Hook Form + `zodResolver` (`:34-38`, `:59`), posting to
better-auth's `POST /api/auth/sign-in/email` (`:66-69`). On success it calls `router.replace()`
**then `router.refresh()`** (`:74-75`) — the refresh is what makes the console layout's server-side
session lookup see the freshly-set cookie.

Two deliberate absences: the network-failure branch never says "wrong password" (`:77-80`), and
**"Forgot password" is not a link** (`:213-216`) because `POST /api/auth/forget-password` returns
400 — there is no email provider ([ADR 0003](../decisions/0003-no-email-provider-at-launch.md)).

Dev quick-fill credentials are behind **two independent locks** —
`NODE_ENV !== "production"` **and** `NEXT_PUBLIC_ENABLE_LOGIN_DEV_TOOLS === "true"`
(`src/lib/env.ts:24-26`) — and are read from env, never hardcoded (`:32-33` records that the
prototype shipped `admin@uthavu.org / Admin@123` in source).

### Page-level permission gating is applied to 12 of 31 pages

Ten `permission.ts` mirror modules (445 lines total) each resolve
`getAdminSession()?.permissions.includes(<key>)` server-side and let the page render an
`AccessDenied` panel instead of a broken table.

**Gated:** admins (+`[id]`), announcements (+`new`/`[id]`), broadcasts (+`new`/`[id]`), dashboard,
monetization (+admob/sponsors/`new`/`[id]`), platform/settings, platform/support (+`[id]`).

**Not gated:** analytics, users (+`[id]`), reports (+`[id]`/comments/flagged), community/impact-stories
(+`[id]`), platform/categories, platform/audit-logs, platform/system-health.

Those thirteen rely on the API 403, generalised by `src/lib/list-failure.ts:21-23` — which states its
own purpose plainly: *"`admins/page.tsx` makes this distinction by hand for one route. This module is
that behaviour, generalised, so all 13 list pages inherit it."* **Safe, since the API is the real
gate — but inconsistent UX**: an ops admin gets an in-table failure state on those pages instead of
the calm page-level explanation its siblings give.

**Two permission mirrors are dead code** — `features/users/permission.ts` and
`features/report-categories/permission.ts` have zero call sites outside their own definition files.
So does `ACCESS_DENIED.categories` (`src/lib/access-denied-copy.ts:41`). Modules drifting
unreferenced are how a gate silently stops existing; filed in [`../_audit/issues.md`](../_audit/issues.md).

---

## Data fetching & client state

### Two fetch wrappers, and the split is justified

Not duplication — they solve genuinely different problems, and each documents the other.

| | `src/lib/api-client.ts` (browser) | `src/lib/server-api.ts` (RSC) |
|---|---|---|
| Cookies | `credentials: "include"` — `:46`, commented *"The whole point of this module."* | manual: `(await cookies()).toString()` forwarded as a header — `:33`, `:38-40` |
| Methods | **`"GET" \| "POST"` only** — `:20` | **GET only** — no method option at all |
| Cache | `no-store` `:55` | `no-store` `:43` — a cached admin dashboard would serve one admin's view to the next (`:41-42`) |
| Preflight | `content-type` sent only when a body exists, so a bare GET stays a "simple" request (`:47-53`) | n/a |

Both funnel non-OK responses through the same `toApiError` and both return `undefined` on 204.

**The known cost:** because `api-client.ts:20` types `method` as `"GET" | "POST"` only, six features
hand-rolled a near-identical mutating client rather than widen that union —
`features/{moderation,sponsors,report-categories,broadcasts,admin-accounts,announcements}/api.ts`.
Each file's own header acknowledges the duplication and names the one-line fix. A transport-contract
change (a header, a trace id, a timeout) currently lands in seven places.

### Error normalisation

`src/lib/api-error.ts` handles **both** server envelopes — better-auth's `{ message, code }` and
NestJS+Zod's `{ statusCode, message, errors[] }` (`:47-50`, `:56-74`) — and flattens Zod paths into
`fieldErrors` (`:77-98`). `isNetworkFailure` is `status === null` (`:39-41`), which is what makes the
`unreachable` denial above possible.

`ApiError` deliberately has **no** `"server-only"` marker (`:4`) — it is shared by both wrappers.

### QueryClient

`src/components/providers/query-provider.tsx:16-23` — `staleTime: 30_000`, `retry: 1`,
`refetchOnWindowFocus: true`. Created inside `useState` so each browser session gets one instance
and no module-level client leaks across server requests (`:9-11`).

Provider order (`providers.tsx:16-35`): `ThemeProvider` → `ErrorBoundary` → `QueryProvider` →
children + `<Toaster />`. ThemeProvider is outermost **so the error fallback is themed** (`:12-14`).

### State management — verified, and it is exemplary

Across all of `apps/admin/src`:

- **zero** server data mirrored into `useState`
- **zero** props→state sync effects
- all 8 forms compute `defaultValues` via `useMemo`, never `useEffect` + `reset`
- filters, sort, page and search are **entirely URL-backed** — `src/lib/list-params.ts` (395 lines)
  is pure functions, no React and no fetching (`:1`), on three rules (`:12-24`): defaults are never
  written to the URL, everything is clamped on the way in, and the URL shape may differ from the API
  shape (`sort=createdAt:desc` vs `sort=createdAt&order=desc`)
- **the branch order `loading → error → empty → content` is enforced by type**:
  `src/hooks/use-list-query.ts:222-229` is a discriminated union, so "empty before error" is
  *unrepresentable*

That last point is worth copying into any new surface. It is the difference between a convention and
a guarantee.

### Where it is less clean

Three API patterns coexist: `features/*/api.ts` (7 features), a `use-*.ts` hook calling `apiFetch`
(8 features), and `apiFetch` **inline in the table component** (6 features — `reports-table.tsx:234`,
`users-table.tsx:173`, `sponsors-table.tsx:155`, and the comments/announcements/broadcasts
equivalents). Those six tables cannot be rendered in a test or a second context without hitting the
network.

Query keys are inline literals at 16 sites with only two named constants, and
`features/moderation/actions.ts:40` invalidates by literal array — a typo'd invalidate silently
no-ops.

---

## Component layers

```
src/components/
├── data/       11 files, 2,001 lines   # DataTable, Pagination, FilterBar, cells, list-pane…
├── layout/     12 files, 1,014 lines   # AppLayout, PageLayout, AppSidebar, SubMenuPageLayout…
├── providers/   4 files,   171 lines
└── ui/          3 files,     164 lines # ← a re-export shim, see below
```

`components/data/index.ts` is a barrel that re-exports hooks and helpers alongside components
(`:62-98`) so a page needs one import path.

### `components/ui/` is a deliberate re-export shim over `@uthavu/libs-web`

Three files only. `src/components/ui/index.ts:1-17` states the whole rationale:

> These primitives used to be implemented in this directory. They are app-agnostic token consumers…
> so they now live in `@uthavu/libs-web`, where `apps/marketing` can reach them too.
>
> The shim stays because ~150 files across `src/features/**` import `@/components/ui`, and several of
> those features are being edited concurrently. Rewriting every one of those imports … is a
> mechanical follow-up for when those lanes are quiet — not a change worth colliding with five
> sessions over. Until then this file is the seam, and it must forward the package's surface verbatim.

`index.ts:18-67` is one `export { … } from "@uthavu/libs-web/components"` covering 35 values and 13
types; it matches the `libs-web` barrel item-for-item. `button.ts:7` is a second deep-path shim
existing solely because `components/layout/access-denied.tsx:3` imports `@/components/ui/button`
directly.

**`components/ui/back-button.tsx` (88 lines) is the one file in that directory that is NOT a
re-export.** It is a real local implementation, and correctly so: it imports `next/link` and
`useRouter`, which fails `libs-web`'s own entry test verbatim (`libs-web/README.md:15` — *"a
primitive that needs the router is not a primitive"*). It is re-exported from the barrel at
`index.ts:69`.

> It is also the console's largest single design-system deviation — `rounded-full` instead of
> `rounded-pill`, `shadow-xs`/`shadow-sm` instead of the elevation tokens, its own
> `duration-200`/`ease-out`, and **the only `dark:` variant in the entire codebase**. Filed in
> [`../_audit/issues.md`](../_audit/issues.md).

### `libs-web` — the shared UI package

23 component files / 1,610 lines plus `lib/cn.ts`. **No build step** — consumers compile the
TypeScript source; Next transpiles pnpm workspace packages automatically, so no `transpilePackages`
entry is needed (`libs-web/README.md:59-60`). No `main`, no `exports` map.

Its two contracts are worth obeying:

- **Entry test** (`README.md:11-20`): a component belongs here only if it knows about design tokens
  and nothing else. Disqualifiers: the router, session/role/permission, an API client or query hook,
  `server-only`.
- **Styling contract** (`README.md:41-44`): pure semantic-token consumers, no raw hex, **no `dark:`
  overrides** — *"A component that reaches for a `dark:` variant is telling you a token is missing;
  add the token."*
- **Tailwind source registration** (`README.md:46-57`): every consuming app must add
  `@source "../../../../libs-web";` because Tailwind v4 never scans `node_modules`. Missing it fails
  **silently**. Admin has it at `globals.css:15`.

**No lib imports an app.** `libs-common`, `libs-web` and `libs-mobile` are clean in that direction —
the dependency arrow never inverts.

---

## Theme — Tailwind v4, CSS-first

**There is no `tailwind.config.*` anywhere in the repo.** The entire theme is
`src/app/globals.css`, 427 lines, driven by PostCSS with the single `@tailwindcss/postcss` plugin.
Tailwind `^4.3.3`.

| Lines | Block | Tokens |
|---|---|---|
| 1 | `@import "tailwindcss";` | — |
| 15 | `@source "../../../../libs-web";` | — |
| 25 | `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` | — |
| **38–147** | `:root` — raw token layer, light is the base | **67** |
| **149–223** | `[data-theme="dark"]` — the remap | **53** |
| **232–252** | `:root` — semantic alias layer | **15** |
| **260–346** | `@theme inline` — Tailwind utility mapping | **72** |
| 351–408 | `@layer base` | 8 rules |
| 411–427 | `@layer utilities` | `.scrollbar-slim` |

**The 67 / 53 gap is correct, not a bug.** The dark block re-declares every *colour* and deliberately
omits the 14 non-colour tokens — 7 layout, 3 container widths, 4 shape radii — because they are
theme-invariant. 67 − 14 = 53. **Every colour has both halves**, so no light-text-on-light-background
class of bug exists in this codebase.

**The two `:root` blocks are also deliberate.** Block 1 is the raw layer paired with
`[data-theme="dark"]`; block 2 is the semantic alias layer (`--success-fg: var(--accent-emerald-fg)`)
placed *outside* both theme blocks because `var()` resolves lazily at use time — one declaration
serves both themes (`globals.css:228-230`). Duplicating it into the dark block would create a drift
surface.

Colour discipline is genuinely excellent, and verified rather than claimed:

- **Zero** Tailwind palette classes bypass the semantic layer. An exhaustive grep for
  `(bg|text|border|ring|fill|stroke|from|to|via|divide|accent|caret|placeholder)-(slate|gray|…|rose)-(50…950)`
  across `apps/admin/src` + `libs-web` returns no matches.
- **Exactly 4 raw hex literals in the whole surface**, and both files are structurally forced:
  `app/layout.tsx:56,57` (Next serialises `themeColor` into a `<meta>` at build — `var()` is
  impossible) and `app/global-error.tsx:77,78` (replaces the root layout, never receives
  `globals.css`).

Theme selection is `next-themes` writing `data-theme` on `<html>`:
`providers/theme-provider.tsx:20-27` — `defaultTheme="dark"`, **`enableSystem={false}`**,
`storageKey="uthavu-admin-theme"`.

> **Known inconsistency:** `app/layout.tsx:54-59` sets `viewport.themeColor` keyed off
> `prefers-color-scheme`, but the console ignores the OS preference (`enableSystem={false}`). A user
> on a light OS gets browser chrome `#f1f5f9` above a `#020617` page. Filed in
> [`../_audit/issues.md`](../_audit/issues.md).

### The real theme gap is typography, not colour

**135 arbitrary font-size classes across three values, and none has a token** — `text-[11px]` ×112,
`text-[10px]` ×22, `text-[13px]` ×1. There is no `--text-*` namespace in `@theme` at all, and none of
the three snaps to Tailwind's scale (`text-xs` is 0.75rem; `text-[11px]` is 0.6875rem — 1px
different). The fix is additive and pixel-safe: declare `--text-2xs`/`--text-3xs`/etc. and **omit
line-heights**, since `text-[Npx]` sets font-size only.

Second: **112 sites are forced into `[var(--page-padding-inline)]`-style arbitrary syntax** because
the layout and container tokens are declared on `:root` but never mapped into `@theme inline`.
Mapping them into Tailwind v4's `--spacing-*` / `--container-*` namespaces turns all 112 into
first-class utilities with zero visual change — the highest-leverage single change available here.

Absent entirely: any z-index namespace (10 sites run an undeclared 10→20→30→40→50 ladder), any
duration token, any easing token.

---

## Layout contract

Pages compose `PageLayout` / `SubMenuPageLayout` / `SelectionPanelLayout`
(`src/components/layout/`). A `page.tsx` never sets its own `max-w-*`, `mx-auto` or page padding —
the layout owns them (`CLAUDE.md:184-185`).

**Scroll ownership:** chrome never scrolls with content. Fixed chrome is offset with padding, not
margin; inner-scroll regions need a bounded height, `svh` (never `vh`), and **every
`overflow-y-auto` in a flex row paired with `min-h-0`** — without it the scroll escapes to the
document and the menu scrolls away with the content. The rule is restated at
`components/layout/app-layout.tsx:12-14`; the full model is in
[`../design/design-system.md`](../design/design-system.md).

The sidebar model is `src/config/nav.ts` (532 lines). Every destination declares an explicit
`permission: NavPermission` (`:108-112`), and the permission strings are imported from
`@uthavu/libs-common` (`:66`) rather than retyped.

---

## Forms

React Hook Form + `zodResolver`, `zod ^4.4.3`. Eight forms, all computing `defaultValues` via
`useMemo`.

The `validationErrors` plumbing is a strength: `src/lib/api-error.ts:77-98` parses the NestJS+Zod
envelope, and **8 of 10 forms** map it back onto fields with `setError` behind a per-feature
field-name type guard, so an unknown server path falls to a root banner rather than vanishing.

**The exception is `features/support-tickets/ticket-controls.tsx`** — three selects plus a free-text
message, no `useForm`, no `zodResolver`, no `setError`. Failures go to `toast.error(...)` at `:111`,
so a server validation error is flattened rather than attached to the control that caused it. The
same file computes an over-length flag for the 2000-char message cap but uses it only for
`aria-invalid` and a counter colour — **submit is never blocked** (`:316`, `:360`), documented as
deliberate at `:458-460`.

---

## Images

`features/moderation/uploaded-photo.tsx` is the model: `next/image` with three distinct states and
an `onError` keyed by `src` (`:129`, `:69-72`), routing every URL through `resolveUploadUrl`
(`src/lib/upload-url.ts:65-80`) so Next's render-time `remotePatterns` throw is unreachable.

**`components/data/cells.tsx:226` passes `avatarUrl` to `next/image` raw, without that resolver** —
the one place the console's own defence is skipped. Its `onError` at `:266` cannot catch a
render-time throw, which would take the whole segment to `error.tsx`.

`next.config.ts:26-35` derives `images.remotePatterns` from `NEXT_PUBLIC_API_URL` with
`pathname: "/uploads/**"`, and sets **`dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production"`**
(`:64`) with a 27-line justification (`:36-63`): Next 16's SSRF guard rejects private IPs, which
breaks every dev photo.

**There is no file input anywhere in `apps/admin` or `libs-web`** — zero matches for `type="file"`,
`FormData` or `Dropzone`. Sponsor logo and creative are plain `type="url"` text fields with an
in-UI disclaimer (`features/sponsors/sponsor-form.tsx:361-368`) and a documented rationale
(`features/sponsors/creative.tsx:11-32`): `POST /uploads` is the avatar endpoint (jpeg/png/webp,
5 MB) and cannot take a video creative. This is a deliberate scope boundary, not an omission.

---

## Feature folders

17 folders, 170 files, ~27,000 lines under `src/features/`. Largest: `admin-accounts` (3,371),
`sponsors` (3,005), `support-tickets` (2,760), `broadcasts` (2,712), `dashboard` (2,469).

**`features/moderation/` has become the shared kernel, and that is a structural problem.** 11 of 17
features import it, and almost none of what they import is moderation: `Dialog`,
`ConfirmActionDialog`, `useDetailQuery`, `MODERATION_TABLE`, `invalidateAll`, `adminMutate`,
`userDetailHref` / `reportDetailHref`. Every feature is transitively coupled to a sibling feature
folder; renaming or deleting it breaks the app.

This happened because **there is no `src/shared/`**. Related cross-feature reaches:
`broadcasts → announcements/{dates,tamil-coverage}`, `monetization → analytics/use-analytics` (for a
*formatting* helper), `impact-stories → audit-logs/use-audit-logs` (for a date util),
`users/users-table.tsx → reports/report-status-badge`.

Roughly 600 lines of near-identical code sit across 18 files: 8 `*-access-denied.tsx` (six of them
22–23 lines), 10 `permission.ts` (six identical in shape), **4 copies of a `Textarea` primitive**
(the third copy's own header reads `⚠ THIS IS THE THIRD COPY. PROMOTE IT.`), and IST date conversion
duplicated in `announcements/dates.ts` and `sponsors/dates.ts`.

---

## Types are hand-transcribed, and already drifting

`features/*/types.ts` is 1,399 lines whose headers say "transcribed from `apps/api/src/…`", and
`libs-mobile/api/*.ts` restates the same shapes again. Nothing is derived or shared. Two confirmed
drifts:

- `features/admin-accounts/types.ts:76` declares `isSelf?: boolean` ("the deployed endpoint does not
  send it yet") while `apps/api/src/admin/admin-accounts.service.ts:64,962` types it **required** and
  always sends it. The console carries a whole compensating identity path — the `selfUserId` seam at
  `features/admin-accounts/permission.ts:38-45`, threaded through `admins-table.tsx:139` and
  `admin-detail.tsx:69` — for a field that is never missing.
- `features/sponsors/sponsor-errors.ts:6-19` documents that its codes were **guessed and three were
  wrong** (`CREATIVE_URL_REQUIRED` vs the real `SPONSOR_CREATIVE_URL_REQUIRED`; `INVALID_PLACEMENT`
  invented outright).

`libs-common`'s zero-runtime-deps rule permits type-only exports, so nothing structural blocks moving
response types there. See [`backend.md`](./backend.md#error-model) for the matching error-code half.

---

## Testing posture

**Zero.** No `.spec`, no `.test`, no Vitest, no Jest, and **no Playwright config anywhere in the
repo** — 326 files and 37,000 lines with no regression net, including `lib/list-params.ts` (395 lines
of URL-state parsing) and `components/data/data-table.tsx` (460).

`apps/admin/package.json` has `dev`, `build`, `start`, `type-check` and `lint`, and **no `test`
script** — which is also why the root `pnpm test` (`pnpm -r run test`) exercises only `apps/api`.

Against the App Profile's `Testing: full` bar (80%/100% coverage **plus** Playwright E2E on the
critical journeys), the Playwright half does not exist. Standing up a test runner here is the
prerequisite for every structural cleanup listed above.

---

## Related docs

- System map: [`system.md`](./system.md) · API: [`backend.md`](./backend.md)
- Entity → console-section matrix: [`admin-console-integration.md`](./admin-console-integration.md)
- Tokens, layout and the scroll model: [`../design/design-system.md`](../design/design-system.md)
- The other client: [`mobile.md`](./mobile.md)

---

_Last verified against commit `96f6386`._
