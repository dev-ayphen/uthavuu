# Design

How the brand renders as an interface. Two kinds of file live here — keep them distinct or
they drift into contradicting each other.

| File | Scope | Contains |
|---|---|---|
| [`design-system.md`](./design-system.md) | **One per project** | Semantic tokens, type scale, spacing/radius/elevation, **layout** (tokens, scroll model, breakpoints, container widths, spacing rhythm), the component inventory, signature details, dark mode, motion. |
| [`_template.md`](./_template.md) | **One per surface** | Only what's specific to that surface: which layout primitive it uses, its notable components, its breakpoint deltas. Everything else it inherits. |

**The rule:** shared values live in `design-system.md` and are referenced, never copied. If a
per-surface doc restates a token or a breakpoint, delete it — the duplicate will go stale and
nobody will know which one is true.

## Where this sits in the chain

```
branding/brand.md      what it feels like        (identity — stable)
      ↓
design/design-system.md   what components use    (roles, layout, inventory)
      ↓
design/<surface>.md       how one surface renders (deltas only)
      ↓
frontend-agent / mobile-agent               read these before writing any UI
```

`design-system.md` is **the file the UI agents read before writing a single component.** If it's
wrong or stale, they will faithfully build the wrong thing. Keep it true.

## Adding to it

- **Missing a token?** Add it here first, then use it. Never invent a one-off in a component.
- **Missing a component?** Add the row in the same PR that adds the component.
- **Missing a layout primitive?** Same — and state what it *owns*, so pages stop reinventing frames.

## Related docs

- Brand (the source of the feel): [`../branding/README.md`](../branding/README.md)
- Frontend architecture: [`../architecture/frontend.md`](../architecture/frontend.md)
- Per-screen docs: [`../pages/README.md`](../pages/README.md)
