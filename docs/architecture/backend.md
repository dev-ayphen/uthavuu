# Backend Architecture

> **Template.** Fill each section, delete the prompts. Cite code as `<file:line>`.

## Overview

> One paragraph: framework, module count, high-level shape.

## Module map

> List the backend modules and one line on what each owns.

| Module | Responsibility |
|---|---|
| `{{users}}` | {{…}} |
| `{{orders}}` | {{…}} |

## Module structure convention

> Show the standard folder layout a module follows so new modules match.

```
module-name/
  module-name.controller.ts
  module-name.service.ts
  module-name.module.ts
  dto/       # request/response schemas + validation
  utils/     # optional module-specific helpers
```

## Tenancy

> Fill from the App Profile (`CLAUDE.md`). Single-tenant → "queries use `db` directly; no org
> boundary." Multi-tenant → describe the wall.

- **Model:** {{single-tenant | multi-tenant}}
- **Boundary (multi-tenant):** the **API tier is the tenant wall** — an authenticated API sits
  between every client and Postgres, so tenant isolation is enforced at the application layer via
  the `forOrg(orgId)` scoping helper, not Postgres RLS. RLS is optional hardening (cheap to add
  later because access is centralised). `CurrentUserPayload` carries the active `orgId` + org role.
  Details in [`data.md`](./data.md#tenancy).

## Guards, interceptors, pipes

> The global and opt-in cross-cutting pieces. One line each; cite code.

- **{{AuthGuard}}** ({{global/opt-in}}) — {{what it does}} — `<file:line>`
- **{{ValidationPipe}}** — {{…}} — `<file:line>`

## Background jobs / queues

> Any async work: queues, workers, schedules. Table if you have cron.

| Job | Schedule | Description |
|---|---|---|
| {{job}} | {{cron}} | {{…}} |

## Custom exceptions / error model

> Domain exceptions and the shape they serialize to. Point at the API error envelope.

- `{{SomeException}}` — `{ code, … }`, HTTP {{nnn}} — `<file:line>`

## Related docs

- System: [`system.md`](./system.md)
- Data: [`data.md`](./data.md)
- API: [`../api/README.md`](../api/README.md)
