# Branding

> **Template.** This folder holds the project's identity and feel. Copy
> [`_template.md`](./_template.md) to `brand.md` and fill it during kickoff, before
> any UI exists.

## Branding vs design vs page docs

Three folders, three jobs. The chain runs one way — **brand → design system → surface**
— and each layer only reads the one above it.

| Folder | Answers | Changes |
|---|---|---|
| [`branding/`](./) | Who are we, what should this feel like? | Rarely — it's identity |
| [`../design/design-system.md`](../design/design-system.md) | What are the tokens and components? | When the system grows |
| [`../design/_template.md`](../design/_template.md) | How does *this surface* look? | Per surface |
| [`../pages/README.md`](../pages/README.md) | What does *this screen* do? | Per screen, after build |

Practical test: a hex code belongs in `branding/brand.md` **only if it's brand identity**.
A component that needs a color reaches for a semantic token in the design system, never
for `--brand-*` and never for a raw hex.

## Why this exists

Without it, "the feel" lives in one person's head and every screen re-litigates it. The
brand doc is what makes UI review objective — a reviewer can point at
*"must never feel like…"* instead of arguing taste.

It's also the **configurable knob**: the token block at the bottom of `brand.md` maps to
`{{brand.json}}`, so changing the brand is a config change plus a regenerate, not a
codebase-wide find-and-replace.

## The discipline

- **Written at kickoff**, right after [`../../CORE_DOCUMENT.md`](../../CORE_DOCUMENT.md).
- **Feel before tokens.** Adjectives and the never-list first; hex codes after.
- **Every color names its allowed use.** A color with no stated use spreads.
- **Agents read this.** `frontend-agent` and `mobile-agent` are instructed to read
  `brand.md` + `design-system.md` before writing UI. Keep it accurate or they'll be wrong.

## Related docs

- Design system: [`../design/design-system.md`](../design/design-system.md)
- Frontend architecture: [`../architecture/frontend.md`](../architecture/frontend.md)
