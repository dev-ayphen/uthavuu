# Architecture

How Uthavu is put together. These docs are written from the code, not from the older `docs/` spec —
see the provenance warning in [`../README.md`](../README.md).

| Doc | Read it when |
|---|---|
| [`system.md`](./system.md) | You want the map: surfaces, deployables, request lifecycle, cross-cutting concerns. |
| [`admin-console-integration.md`](./admin-console-integration.md) | **You are building the admin console.** Entity → section matrix, gap analysis, the privacy boundary, and what admin writes look like from a citizen's phone. |
| [`data.md`](./data.md) | You are touching the schema, or need to know what a table really guarantees. |
| [`backend.md`](./backend.md) | *Still a template.* |
| [`frontend.md`](./frontend.md) | *Still a template.* |
| [`integrations.md`](./integrations.md) | *Still a template.* |

## The 30-second version

One PostgreSQL database. One NestJS API. Two clients — `apps/mobile` (citizens, bearer token,
en + ta) and `apps/admin` (staff, session cookie, english-only chrome). Single-tenant: no `org_id`,
no `forOrg()`. No realtime: alerts are rows, polled over HTTP. The admin console reads the same rows
the mobile app writes, through admin-scoped `/admin/*` endpoints
([ADR 0009](../decisions/0009-admin-scoped-api-surface.md)).

---

_Last verified against commit `84a20d3`._
