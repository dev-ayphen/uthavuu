# Runbook: {{Task name}}

> **Template.** Copy this file per operational task (`operations/<task>.md`). A
> runbook is followed under pressure — keep steps literal and copy-pasteable.
> Delete the prompts.

## Purpose

> One sentence: what this runbook accomplishes and when you'd run it.

## When to use

> The trigger(s): scheduled maintenance, incident symptom, deploy step, alert.

## Prerequisites

> Access, credentials, tools, and env the operator needs before starting.

- [ ] {{access / role}}
- [ ] {{tool / CLI installed}}
- [ ] {{env vars / config}}

## Steps

> Numbered, literal, copy-pasteable. Note expected output after key steps.

1. {{Step}}
   ```bash
   {{command}}
   ```
   > Expected: {{…}}
2. {{Step}}

## Verification

> How to confirm it worked. Concrete checks, not "looks fine".

- {{check}} — expect {{…}}

## Rollback

> How to undo if a step fails or the outcome is wrong. Literal commands.

1. {{Step}}

## On-call notes

> Gotchas, common failure modes, who/what to escalate to, related dashboards/logs.

- {{…}}

## Related docs

- Integrations: [`../architecture/integrations.md`](../architecture/integrations.md)
- System: [`../architecture/system.md`](../architecture/system.md)
