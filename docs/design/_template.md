# Design Spec: `{{Surface / Page}}`

> **Template.** Copy this file per design surface (`design/<surface>.md`). Captures
> the visual intent so implementation matches. Fill each section, delete the prompts.

## Visual direction

> The mood / feel in a few words + one paragraph. What should it evoke? Reference
> screens or inspiration if any.

## Design tokens

> The values the surface uses. Point at the source-of-truth token file if one exists.

### Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `{{--color-bg}}` | {{#fff}} | {{#0a0a0a}} | {{page background}} |
| `{{--color-primary}}` | {{…}} | {{…}} | {{…}} |

### Typography

| Token | Value | Use |
|---|---|---|
| `{{--font-sans}}` | {{…}} | {{body / UI}} |
| `{{heading scale}}` | {{…}} | {{…}} |

### Spacing / radius / elevation

> The scale(s) used. One line each.

- Spacing: {{…}}
- Radius: {{…}}
- Shadow / elevation: {{…}}

## Key components

> One block per notable component: its states and behavior.

### {{Component}}

- **States:** default / hover / active / disabled / loading / error.
- **Behavior:** > …
- **Notes:** > …

## Layout & responsive

> Project-wide breakpoints, container widths, and the scroll model live in
> [`./design-system.md`](./design-system.md). Record only this surface's **deltas** here —
> don't restate the shared values, or the two will drift.

- **Layout primitive:** {{`PageLayout` / `SubMenuPageLayout` / `SelectionPanelLayout`}}
- **Container width:** {{narrow / centered / full}}
- **Scroll mode:** {{Mode A — document scroll / Mode B — content pane scrolls alone}}

| Breakpoint | Layout change on this surface |
|---|---|
| {{base (mobile)}} | {{single column; sub-nav becomes a horizontal pill scroller}} |
| {{md}} | {{…}} |
| {{lg}} | {{sub-nav becomes a fixed left rail; content scrolls alone}} |
| {{xl}} | {{…}} |

## Dark mode

> How the surface behaves across themes; anything that needs per-theme treatment.

## Motion (if any)

> Transitions/animations, durations, easing. Keep it purposeful.

## Related docs

- Frontend: [`../architecture/frontend.md`](../architecture/frontend.md)
- Page docs: [`../pages/README.md`](../pages/README.md)
