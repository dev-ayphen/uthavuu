# `@uthavu/admin` — Admin Console

Internal moderation and operations console for the Uthavu community help network.
**Desktop-first, english-only chrome, cookie/session auth.** Not a citizen surface —
mobile (`apps/mobile`) is the only interactive citizen-facing app.

```bash
pnpm --filter @uthavu/admin dev          # http://localhost:3002
pnpm --filter @uthavu/admin build
pnpm --filter @uthavu/admin type-check
pnpm --filter @uthavu/admin lint
```

Port **3002** — 3000 is the stale prototype, 3001 is the API in Docker.
Copy `.env.example` to `.env.local`.

---

## Stack

Next.js 16.3 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS v4
(CSS-first, **no `tailwind.config.js`**) · next-themes · TanStack Query · React Hook Form +
Zod v4 · Lucide · Sonner.

> **Next 16 gotchas that bite.** `error.tsx` receives **`retry`**, not `reset` (renamed in
> 16.3.0). `params`/`searchParams` are Promises. `next lint` no longer exists — use the
> ESLint CLI. Turbopack is the default; no `--turbopack` flag.

---

## The layout contract

```
AppLayout                fixed header + fixed sidebar, content offset with PADDING
 └ PageLayout            sticky page header, container width, page padding   [Mode A]
    ├ SubMenuPageLayout  + fixed left sub-nav, content scrolls alone         [Mode B]
    └ SelectionPanelLayout  master-detail, panel and content scroll apart    [Mode B]
```

**A `page.tsx` never sets `max-w-*`, `mx-auto`, or page padding.** It passes
`contentWidth` (`narrow` | `default` | `wide`) and renders content. If a page reaches for
`max-w-2xl mx-auto`, the contract has been bypassed.

### Scroll ownership

Chrome never scrolls with content.

- **Mode A (document scroll)** — header and sidebar are `position: fixed`, so they are out
  of flow and *cannot* scroll. Content reserves their space with **padding, never margin**.
  The page header sticks below the app header via `--page-header-sticky-offset`.
- **Mode B (inner scroll)** — bound the root at `--app-content-height`
  (`calc(100svh - header)`; **`svh`, never `vh`**), then declare a scroller per pane. Every
  `overflow-y-auto` in a flex row is paired with **`min-h-0`** — without it the flex child
  refuses to shrink below its content, the overflow escapes to the document, and the
  sub-menu scrolls away with the content.

Chrome dimensions are tokens precisely because both the padding and the scroll math derive
from them. Never hardcode a header height or sidebar width.

### Page archetypes

| Archetype | Layout | Scroll |
|---|---|---|
| List / Detail / Dashboard | `PageLayout` | Mode A |
| Settings | `SubMenuPageLayout` | Mode B |
| Master-detail | `SelectionPanelLayout` | Mode B |

Every data segment ships `page.tsx` + `loading.tsx` + `error.tsx`.
**Branch order is load-bearing: loading → error → empty → content.** Checking `empty`
before `isError` renders "nothing here yet" when the request actually failed.

---

## Theming

`data-theme` on `<html>`, written by next-themes from a blocking script before first paint
(no flash), persisted in `localStorage` under `uthavu-admin-theme`.

**The rule: every colour is declared in BOTH theme blocks.** A colour that exists only in
one block renders as `unset` in the other. Components consume *roles*
(`--surface`, `--fg-muted`, `--primary`), never `--brand-*` and never a raw hex — that is
what makes dark mode and a future rebrand a token remap instead of a codebase sweep.

Status tokens (`--success-*`, `--danger-*`, …) are declared **once**, outside the theme
blocks, as aliases onto the accent families. `var()` resolves lazily at use time, so they
pick up the correct per-theme value without being duplicated.

### Token catalogue

> **TODO:** merge this into `docs/design/design-system.md` (which currently documents only
> `apps/mobile`). Left here because this task was scope-locked to `apps/admin/`.

| Group | Tokens |
|---|---|
| Brand | `--brand-green` `#16a34a` (shared with mobile `COLORS.primaryGreen`), `--brand-green-bright` |
| Surfaces | `--canvas` `--surface` `--surface-2` `--surface-3` `--surface-inset` `--overlay` |
| Foreground | `--fg` `--fg-muted` `--fg-subtle` `--fg-faint` `--fg-on-tint` |
| Lines | `--border` `--border-strong` `--border-hairline` |
| Primary | `--primary` `--primary-hover` `--primary-active` `--primary-fg` `--primary-soft` `--primary-soft-fg` `--primary-soft-border` |
| Focus | `--ring` `--ring-offset` |
| Accents (×8: emerald, blue, amber, rose, violet, cyan, pink, slate) | `--accent-<hue>-fg` `--accent-<hue>-soft` `--accent-<hue>-soft-border` |
| Status (aliases) | `--success-*` `--warning-*` `--danger-*` `--info-*` `--neutral-*` |
| Elevation | `--elevation-card` `--elevation-raised` `--elevation-popover` `--elevation-chrome` |
| Shape | `--shape-control` `--shape-card` `--shape-panel` `--shape-pill` |
| Layout | `--layout-header-height` `--layout-sidebar-width` `--layout-sidebar-width-collapsed` `--app-content-height` `--page-header-sticky-offset` `--page-padding-inline` `--page-padding-block` |
| Containers | `--container-narrow` `--container-default` `--container-wide` |

Raw tokens use `--shape-*` / `--elevation-*` and are mapped into Tailwind's `--radius-*` /
`--shadow-*` namespaces inside `@theme inline`. Mapping a namespace onto itself
(`--radius-card: var(--radius-card)`) is self-referential and silently breaks — hence the
separate raw names.

Neutral text steps are contrast-audited against `--surface`; `--fg-faint` carries 10px
micro-labels, so it is the one that must clear 4.5:1 (see the annotations in `globals.css`).

### Typography

Inter (Latin UI) + **Noto Sans Tamil** + Noto Serif Tamil (login headline only).
Inter carries no Tamil glyphs, so listing Noto Sans Tamil second in `--font-sans` makes the
browser fall through per-codepoint — an english-only chrome renders Tamil user content
correctly with no per-string font switching. Use `.tabular` on any metric so digits don't
jitter as they tick.

---

## Error architecture — four layers

| Layer | File | Catches |
|---|---|---|
| 1 (preferred) | `(console)/error.tsx`, `<section>/error.tsx` | Renders **inside the shell** — nav survives, operator can navigate away |
| 2 | `app/error.tsx` | Routes with no closer boundary |
| 3 | `app/global-error.tsx` | Root layout failure. Renders its own `<html>`/`<body>`, **receives no `globals.css` and no `data-theme`** — every style is inline |
| 4 | `ErrorBoundary` in the provider tree | A **synchronous client render throw** above the router, which escapes every `error.tsx` and would otherwise white out the app |

Layer 4 is not redundant with layer 1. Each error surfaces at its own altitude: **field
errors inline, failed loads as `ErrorState` with a retry, failed actions as a toast.**
Always surface `error.digest` — it is the only handle support has to find the server log.

---

## Security notes

Two prototype patterns are deliberately **not** reproduced:

1. **`?role=super` in the URL.** Roles come from the session, resolved server-side, and
   fail closed. See `src/lib/session.ts` and `src/lib/roles.ts`.
2. **The plaintext credentials panel.** No password is hardcoded anywhere. The dev
   affordance is double-gated on `NODE_ENV !== "production"` (statically false in a prod
   build, so the markup is eliminated, not merely hidden) *and* an explicit opt-in env var.

The API enforces authorization. The console only mirrors it for UX.

---

## Seams left for follow-up agents

| Seam | File | Replace with |
|---|---|---|
| Admin session / role | `src/lib/session.ts` | `GET /admin/me` with the forwarded cookie; add the `redirect("/login")` guard in `(console)/layout.tsx` |
| Sign-in | `src/app/(auth)/login/page.tsx` → `onSubmit` | POST to the API with `credentials: "include"`; map `validationErrors` onto fields via `setError` |
| Sign-out | `src/components/layout/app-header.tsx` | POST to the API — dropping the cookie client-side is not a logout |
| Sidebar badges | `src/config/nav-badges.ts` | The counts query |
| Dashboard data | `src/features/dashboard/use-dashboard-summary.ts` | `useQuery(...)` — the page already branches on every state |
| Login hero stats | `HERO_STATS` in the login page | A real stats endpoint, or delete the row |

Everything marked **SEAM** returns placeholder data and says so in the UI
("Sample data" / "Session pending" badges). None of it is presented as real.
