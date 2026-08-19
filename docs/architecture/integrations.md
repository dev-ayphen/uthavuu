# External Integrations

> **Template.** One row per external service. Mark status honestly — an integration
> that's coded but not wired up is not "live". Cite config/adapter as `<file:line>`.

## Status table

| Service | Purpose | Status | Env vars | Adapter / code |
|---|---|---|---|---|
| {{Email provider}} | Transactional email | {{live / mock / planned}} | `{{API_KEY}}` | `<file:line>` |
| {{Storage}} | File storage | {{live / mock / planned}} | `{{BUCKET}}` | `<file:line>` |
| {{Payments}} | Billing | {{planned}} | `{{KEY}}` | `<file:line>` |
| {{Push / realtime}} | Live updates | {{…}} | `{{…}}` | `<file:line>` |

**Status legend:** `live` = active in production · `mock` = adapter present, using a
stub/no-op · `planned` = interface defined, not implemented.

## Per-integration notes

> One short block per non-trivial integration: how it's called, failure mode
> (fail-open vs fail-closed), and any activation steps to switch it on in prod.

### {{Service}}

- **How it's used:** > …
- **Failure mode:** > …
- **Activation steps:** > 1) … 2) … 3) …

## Related docs

- System: [`system.md`](./system.md)
- Operations: [`../operations/_template.md`](../operations/_template.md)
