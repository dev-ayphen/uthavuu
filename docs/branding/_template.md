# Brand: `{{APP_NAME}}`

> **Template.** Copy to `branding/brand.md`. This is where the project's **feel**
> lives — the thing UI implementation derives from. Write the words before the hex
> codes: if the feel isn't written down, every screen negotiates it again.
>
> Downstream: [`design/design-system.md`](../design/design-system.md) turns this into
> semantic tokens, and the frontend/mobile agents read both before writing any UI.

## In one line

> The brand in a single sentence a new dev could repeat back.

_{{e.g. "A calm, precise tool for people who do this work all day — not a consumer toy."}}_

## Feel

> Three to five adjectives, then one paragraph. What should someone feel in the first
> five seconds? Be specific enough to settle an argument — "modern" settles nothing.

**Adjectives:** {{…}} / {{…}} / {{…}}

> {{One paragraph. What it should evoke, and why that serves the user in
> `CORE_DOCUMENT.md`.}}

## What it must never feel like

> The most useful section here. Name the near-misses you'd actually be tempted by —
> this is what a reviewer points at.

- {{e.g. Playful or cute. Users are working, often under time pressure.}}
- {{e.g. Enterprise-grey. Boring is not the same as serious.}}

## Voice

> How the product talks: microcopy, errors, empty states, buttons.

| | Do | Don't |
|---|---|---|
| **Tone** | {{…}} | {{…}} |
| **Errors** | {{"That card was declined. Try another?"}} | {{"Error 402: payment rejected."}} |
| **Buttons** | {{Verb-first: "Send invite"}} | {{"Submit" / "OK"}} |

- **Capitalisation:** {{sentence case everywhere}}
- **Person:** {{"you" for the user; "we" only when we act}}
- **Untranslatable:** {{brand name stays in {{language}}}}

## Brand palette

> The **source colors** — brand identity, not UI roles. `design-system.md` maps these
> onto semantic tokens (`--bg`, `--primary`, …); components never reference this table.
>
> **Every row must name where it may be used, and where it may not.** A color with no
> stated use will end up everywhere.

| Token | Value | Where it may be used |
|---|---|---|
| `{{--brand-primary}}` | `{{#000000}}` | {{primary actions, active nav, links}} |
| `{{--brand-primary-dark}}` | `{{#000000}}` | {{hover/pressed of primary only}} |
| `{{--brand-accent}}` | `{{#000000}}` | {{highlights, badges — never a full surface}} |
| `{{--brand-ink}}` | `{{#000000}}` | {{primary text}} |
| `{{--brand-surface}}` | `{{#000000}}` | {{cards, sheets}} |
| `{{--brand-success}}` | `{{#000000}}` | {{success state only — never decoration}} |
| `{{--brand-danger}}` | `{{#000000}}` | {{destructive actions and errors only}} |

**Off-brand:** {{name the colors that must not appear, e.g. "no blues/greens except
`--brand-success`"}}.

## Type roles

> A family per role, and what each is for. Roles, not sizes — the scale lives in
> `design-system.md`.

| Role | Family | Weights | Use |
|---|---|---|---|
| {{Display}} | `{{…}}` | {{…}} | {{headlines only}} |
| {{UI / body}} | `{{…}}` | {{…}} | {{everything else}} |
| {{Mono}} | `{{…}}` | {{…}} | {{ids, code, data}} |

## Imagery & motif

> Photography, illustration, iconography, any recurring motif. State whether motifs are
> **structural** (they hold layout together) or **decorative** (accents) — it changes
> how they're implemented.

- **Illustration:** {{style, palette constraint, where it appears}}
- **Photography:** {{…}} — or **N/A**
- **Icons:** {{set + weight, e.g. one library, one weight, no mixing}}
- **Motif:** {{…}} — {{structural / decorative}} — or **N/A**

## Logo & assets

> Where the masters live and how they're consumed. Point at the source of truth; don't
> restate it here.

- **Masters:** `{{libs/brand-assets/masters/}}`
- **Generated into apps by:** `{{pnpm brand:generate}}`
- **Config:** `{{libs/brand-assets/brand.json}}` — the configurable knob: change it here,
  regenerate, every surface follows.
- **Clear space / min size:** {{…}}
- **Don'ts:** {{no recoloring, no stretching, no effects}}

## Configurable token block

> The handoff to [`design/design-system.md`](../design/design-system.md). Keep this in
> sync with `{{brand.json}}` — this block is the contract between brand and code.

```jsonc
{
  "brand": {
    "primary":   "{{#000000}}",
    "accent":    "{{#000000}}",
    "ink":       "{{#000000}}",
    "surface":   "{{#000000}}",
    "success":   "{{#000000}}",
    "danger":    "{{#000000}}"
  },
  "font": {
    "display": "{{…}}",
    "sans":    "{{…}}",
    "mono":    "{{…}}"
  },
  "radius": "{{…}}"
}
```

## Related docs

- Kickoff: [`../../CORE_DOCUMENT.md`](../../CORE_DOCUMENT.md)
- Design system (consumes this): [`../design/design-system.md`](../design/design-system.md)
- Per-surface specs: [`../design/_template.md`](../design/_template.md)
