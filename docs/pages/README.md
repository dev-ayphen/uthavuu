# Per-Page Docs

> **Template.** This folder holds one doc per screen. It's the artifact the team
> keeps current: **whenever a page is completed or changed, update (or create) its
> page doc.** Copy [`_template.md`](./_template.md) for each new screen.

## Why per-page docs

A page doc is the single source of truth for one screen: its route, what the user
does there, which API endpoints it calls, its state, validations, and edge cases.
It lets anyone pick up a screen without reverse-engineering it.

## The discipline

- **One file per screen**, named after the route (e.g. `orders-list.md`, `checkout.md`).
- **Update on completion.** A screen isn't "done" until its page doc reflects reality.
- **Fact-only, terse.** Cite code as `<file:line>`. Write **N/A** for sections that
  don't apply — don't delete section headings.

## Index

> Keep this table current. One row per screen.

| Screen | Route | Doc | Status |
|---|---|---|---|
| {{Login}} | `{{/login}}` | [{{login.md}}](./_template.md) | {{done / in progress}} |
| {{Orders list}} | `{{/orders}}` | [{{orders-list.md}}](./_template.md) | {{…}} |

## Related docs

- Frontend architecture: [`../architecture/frontend.md`](../architecture/frontend.md)
- API reference: [`../api/README.md`](../api/README.md)
- Design specs: [`../design/_template.md`](../design/_template.md)
