# `@uthavu/libs-web`

Web-only shared UI. The design-system primitives every Uthavu **web** surface renders with —
`apps/admin` today, `apps/marketing` when it is scaffolded.

Mobile has its own kit (`libs-mobile`, React Native). Framework-agnostic contract constants live in
`libs-common`. Nothing here is imported by either.

## The entry test

A component belongs here when it knows about **design tokens and nothing else**.

It does **not** belong here if it needs any of:

- the router (`next/navigation`, `next/link`) — a primitive that needs the router is not a primitive
- a session, a role, or a permission check
- an API client, a query hook, or any data shape
- `server-only`, or anything else Node-side

Those are feature components. They live in the app that owns them.

## Layout

```
components/   the primitives + a barrel (index.ts)
lib/cn.ts     clsx + tailwind-merge class merger
```

Import through the barrel; deep paths work too:

```ts
import { Button, Card, Textarea } from "@uthavu/libs-web/components";
import { cn } from "@uthavu/libs-web/lib/cn";
```

`apps/admin/src/components/ui` is currently a re-export shim over this package, so the console's
existing `@/components/ui` imports keep resolving. New code should import the package directly.

## Styling contract

Every component is a pure consumer of **semantic tokens** (`bg-surface`, `text-fg-muted`,
`border-border`, `rounded-card`, `--ring`). No raw hex, no `dark:` overrides — dark mode is a token
remap, and the tokens themselves are defined by the consuming app (`apps/admin/src/app/globals.css`).
A component that reaches for a `dark:` variant is telling you a token is missing; add the token.

## Tailwind: consuming apps must register this package as a source

Tailwind v4 never scans `node_modules`, so it cannot see these files through the workspace symlink.
Every app that uses this package needs the real path in its CSS entry:

```css
@import "tailwindcss";
@source "../../../../libs-web";
```

Miss it and the failure is **silent**: components render, their utilities are simply never emitted.
`apps/admin` has this line; a future `apps/marketing` needs its own.

No build step — consumers compile the TypeScript source. Next.js transpiles pnpm workspace packages
automatically, so no `transpilePackages` entry is required.
