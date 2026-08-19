# Module: `{{feature}}`

> **Template.** Copy this file per feature (`modules/<feature>.md`). A deep-dive for
> a cross-cutting feature — read top-down. Fill each section, delete the prompts.
> Cite code as `<file:line>`.

## What it does

> One paragraph: the feature in plain language and why it exists.

## User-facing surface

> Where users touch this feature — screens, buttons, flows. Link to page docs.

- {{screen / action}} — [`../pages/{{page}}.md`](../pages/_template.md)

## How it works (top-down)

> Trace the feature from trigger to effect. Numbered, high-level, then detail the
> non-obvious parts. Cite code at each step.

1. {{Trigger …}} — `<file:line>`
2. {{Processing …}} — `<file:line>`
3. {{Effect / persistence …}} — `<file:line>`

## Endpoints

> The API routes this feature uses. Link to the API module doc.

| Method | Path | Purpose |
|---|---|---|
| {{POST}} | `{{/…}}` | {{…}} |

See [`../api/{{feature}}.md`](../api/_template.md).

## Data model

> Tables/columns this feature owns or reads. Cite schema.

- `{{table}}` — {{…}} — `<file:line>`

## Key files

> The handful of files someone touching this feature must know.

- `<file>` — {{role}}
- `<file>` — {{role}}

## Known limitations

> What this feature does NOT do, edge cases not handled, deferred work.

- {{…}}

## Related docs

- API: [`../api/{{feature}}.md`](../api/_template.md)
- ADRs: [`../decisions/`](../decisions/)
