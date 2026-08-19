# API Reference

> **Template.** Fill each section, delete the prompts. Document one module per file
> using [`_template.md`](./_template.md). Cite code as `<file:line>`.

## URL surfaces

> List the distinct URL prefixes the API exposes and who handles each.

- `{{/api/auth/*}}` — {{auth handler}}
- `{{/api/v1/*}}` — {{application controllers}} — all business logic

This folder documents the `{{/api/v1/*}}` surface, one file per module.

## Conventions

### Auth

> How callers authenticate (session cookie, bearer token, API key). One line each.

- **{{Cookie session}}** ({{web}}): {{…}}
- **{{Bearer token}}** ({{mobile / service}}): {{…}}

### Response envelope

> The success wrapper every route returns.

```json
{
  "statusCode": 200,
  "data": { },
  "message": "Success"
}
```

### Error envelope

> The error shape every failure returns.

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Human-readable description",
  "validationErrors": [{ "path": ["fieldName"], "message": "..." }],
  "requestId": "req_abc123",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### Common error codes

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `UNAUTHORIZED` | 401 | Missing / invalid session |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Resource missing |
| `RATE_LIMITED` | 429 | Rate limit / quota hit |
| `INTERNAL_ERROR` | 500 | Unhandled |

### Rate limits

> The buckets and their limits. One line each.

- {{bucket}}: {{N requests / window}}

### Pagination

> Standard query params + response shape for list endpoints.

Query: `page` (1-indexed), `limit` (default {{20}}, max {{100}}), `sort` (optional).

```json
{ "items": [], "total": 0, "page": 1, "limit": 20, "totalPages": 0 }
```

### Idempotency (if used)

> Which routes are idempotent and how (header + cache window).

### Decorators / middleware reference

> The route-level annotations available and what each does.

- `{{@Public()}}` — {{…}}
- `{{@Permissions("module:action")}}` — {{…}}

## Module index

> Link out to each per-module doc.

- [{{users}}](./_template.md) — {{one line}}
- [{{orders}}](./_template.md) — {{one line}}

---

*Last verified {{YYYY-MM}} against `{{BRANCH_OR_SHA}}`.*
