# Feature: `{{feature-name}}`

> **Template.** Copy this file per feature (`features/<feature>.md`). Write it
> **before** the first line of code — it's the input to the plan. Fill each section,
> delete the prompts. Keep it to 1–2 pages; depth belongs in `modules/` after build.

- **Status:** {{draft / agreed / building / shipped}}
- **Milestone:** {{v0.1}}
- **Owner:** {{name}}

## Problem

> Two or three sentences. What's broken or missing today, and for whom? If you can't
> name who hurts and how, the feature isn't ready to spec.

## Users & roles

> Who touches this and what they're allowed to do. One row per role.

| Role | What they can do here |
|---|---|
| {{visitor}} | {{…}} |
| {{user}} | {{…}} |
| {{admin}} | {{…}} |

## User stories

> The core of this doc. **Each `US-N` becomes one GitHub Issue** — so keep them
> independently shippable and small enough to finish in a day or two. Acceptance
> criteria are given/when/then and must be checkable by a human or a test.

### US-1 — {{short title}}

As a **{{role}}**, I can **{{action}}** so that **{{outcome}}**.

- **AC1:** Given {{state}}, when {{action}}, then {{result}}.
- **AC2:** Given {{state}}, when {{action}}, then {{result}}.

### US-2 — {{short title}}

As a **{{role}}**, I can **{{action}}** so that **{{outcome}}**.

- **AC1:** Given {{state}}, when {{action}}, then {{result}}.

## Business rules

> Constraints that hold regardless of screen. Number them — code review cites these.
> State the rule, not the implementation.

- **BR-1:** {{e.g. an order can only be cancelled while status is `pending`.}}
- **BR-2:** {{…}}

## Data touched

> Tables/fields this feature creates or changes. Enough for the schema discussion —
> the real design lands in [`../architecture/data.md`](../architecture/data.md).

| Table | New / changed | Notes |
|---|---|---|
| `{{orders}}` | {{new column `cancelled_at`}} | {{nullable timestamptz}} |

**Invariants this introduces:** {{…}} — record these in `architecture/data.md` along
with the layer that enforces them.

## Screens

> The surfaces involved. Each gets a page doc under [`../pages/`](../pages/README.md)
> **when it's built** — not now.

| Screen | Route | Page doc (after build) |
|---|---|---|
| {{Orders list}} | `{{/orders}}` | `{{pages/orders-list.md}}` |

## Out of scope

> What this feature explicitly does NOT include. The most valuable section here —
> it's what stops scope creep mid-build.

- {{…}}

## Open questions

> Anything unresolved. **Resolve these before the plan** — an open question at build
> time becomes a rewrite. Delete each once answered (record real decisions as ADRs).

- [ ] {{…}}

## Related docs

- Product: [`../overview/product.md`](../overview/product.md)
- Data: [`../architecture/data.md`](../architecture/data.md)
- Design system: [`../design/design-system.md`](../design/design-system.md)
- ADRs: [`../decisions/`](../decisions/)
