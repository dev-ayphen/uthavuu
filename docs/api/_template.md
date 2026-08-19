# API: `{{module}}`

> **Template.** Copy this file per module (`api/<module>.md`). Fill the endpoint
> table and DTO section, delete the prompts. Cite code as `<file:line>`.

## Purpose

> One or two sentences: what this module's endpoints do.

- **Controller:** `<file:line>`
- **Service:** `<file:line>`
- **Base path:** `{{/api/v1/module}}`

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `{{/module}}` | {{session / public / role}} | {{list …}} |
| GET | `{{/module/:id}}` | {{…}} | {{fetch one …}} |
| POST | `{{/module}}` | {{…}} | {{create …}} |
| PATCH | `{{/module/:id}}` | {{…}} | {{update …}} |
| DELETE | `{{/module/:id}}` | {{…}} | {{delete …}} |

> **Auth column:** note the guard/permission each route requires (e.g. `session`,
> `public`, `role:admin`, `perm:module:action`).

## DTOs / schemas

> One block per request/response schema. Point at the validation source of truth.

### `{{CreateThingDto}}` (request)

| Field | Type | Required | Rules |
|---|---|---|---|
| `{{name}}` | string | ✓ | {{2–60 chars}} |
| `{{status}}` | enum | ✗ | {{one of …}} |

Source of truth: `<file:line>`

### `{{Thing}}` (response)

| Field | Type | Notes |
|---|---|---|
| `{{id}}` | string | {{…}} |

## Errors

> Module-specific error codes beyond the common set (see [`README.md`](./README.md)).

| Code | HTTP | When |
|---|---|---|
| `{{THING_CONFLICT}}` | 409 | {{…}} |

## Related docs

- API conventions: [`README.md`](./README.md)
- Module deep-dive: [`../modules/{{module}}.md`](../modules/_template.md)
