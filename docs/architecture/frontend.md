# Frontend Architecture

> **Template.** Fill each section, delete the prompts. Cite code as `<file:line>`.

## Overview

> One paragraph: framework, rendering model, state management, styling.

## Routing

> How routes are structured (file-based / config), route groups, and any layout
> hierarchy. Note any locale/i18n prefixing.

- Route groups: {{e.g. (auth), (main), (onboarding)}}
- {{convention}} — `<file:line>`

## App state & guards

> The top-level state machine that decides what a user sees (guest / onboarding /
> active / blocked). One line per state.

- **{{GUEST}}** → {{…}}
- **{{ACTIVE}}** → {{…}}

## Data fetching & client state

> How the frontend talks to the API (query lib, generated hooks), and where global
> client state lives.

- Server state: {{e.g. React Query}} — `<file:line>`
- Client/global state: {{e.g. Redux / context}} — `<file:line>`

## Page archetypes

> Which page shapes this app uses, and the layout primitive + scroll mode each one gets.
> Record the set here so a new screen is a choice from a list, not an invention.

| Archetype | Layout primitive | Scroll mode | Example route |
|---|---|---|---|
| {{list}} | {{PageLayout}} | {{Mode A}} | `{{/orders}}` — `<file:line>` |
| {{detail}} | {{PageLayout}} | {{Mode A}} | `{{/orders/[id]}}` |
| {{create-edit}} | {{dialog over the list}} | {{Mode A}} | `{{…}}` |
| {{settings}} | {{SubMenuPageLayout}} | {{Mode B}} | `{{/settings}}` |

- **Required route files per segment:** {{`page.tsx` + `loading.tsx` + `error.tsx`}}
- **State branch order:** {{loading → error → empty → content}}
- {{Any archetype this app deliberately doesn't have, and why.}}

## Error handling

> The boundary layers that exist and where each error type surfaces. This is the section
> people look for at 2am, so name the files.

- **Segment boundaries:** {{which routes have `error.tsx`}} — `<file:line>`
- **Root boundary:** {{`app/error.tsx`}} — `<file:line>`
- **Root-layout boundary:** {{`app/global-error.tsx`}} — `<file:line>`
- **React boundary in the provider tree:** {{yes/no}} — `<file:line>`
- **Normalized API error:** {{the shape and where it's built}} — `<file:line>`
- **Error reporting:** {{tracker, and whether `digest` is surfaced to the user}}

| Error | Surface here |
|---|---|
| Field validation | {{inline on the field}} |
| Failed load | {{error state with retry}} |
| Failed action | {{toast}} |
| Render crash | {{segment boundary}} |
| Missing record | {{not-found}} |
| Permission denied | {{its own copy — not a 404}} |

## Forms

> The conventions this app's forms follow. Note deviations from the kit defaults.

- **Library:** {{React Hook Form + Zod via `zodResolver`}}
- **Schema location:** {{`components/<feature>/<feature>-form.schema.ts`}} — `<file:line>`
- **Mappers:** {{form↔API mapper files}} — `<file:line>`
- **Server validation errors:** {{mapped onto fields via `setError`}} — `<file:line>`
- **Unsaved-changes guard:** {{where it applies}}
- **Multi-step forms:** {{which ones, and how steps validate}} — `<file:line>`

## Styling & design system

> Component library, styling approach, theming (light/dark). Link to design specs.

- Component library: `{{@your/ui-components}}`
- Theming: {{…}} — tokens, layout, and the scroll model are defined in
  [`../design/design-system.md`](../design/design-system.md); per-surface deltas in
  [`../design/_template.md`](../design/_template.md)

## Real-time / push (if any)

> How the client receives live updates (websocket/SSE/push). One line; cite code.

## Related docs

- System: [`system.md`](./system.md)
- Pages: [`../pages/README.md`](../pages/README.md)
- Design system (tokens, layout, scroll model): [`../design/design-system.md`](../design/design-system.md)
- Per-surface design specs: [`../design/_template.md`](../design/_template.md)
