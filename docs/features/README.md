# Feature Docs

> **Template.** This folder holds one doc per feature, written **before** it's built.
> Copy [`_template.md`](./_template.md) for each new feature.

## The rule

**A feature doc exists before its first line of code.** It is the input to the plan:
its user stories (`US-N`) become GitHub Issues, and its milestone decides when they
ship. No feature doc → no issues → nothing to build.

## Feature doc vs module doc

Two different jobs. Both exist; neither replaces the other.

| | [`features/`](./) | [`../modules/`](../modules/_template.md) |
|---|---|---|
| **Written** | Before code | After code |
| **Answers** | What are we building, and why? | How does the built thing work? |
| **Contains** | Problem, user stories + AC, business rules, out of scope | Code trace, endpoints, key files, limitations |
| **Audience** | Whoever plans and approves the work | Whoever maintains it next year |

Same for pages: a feature doc lists which screens are involved; the
[page doc](../pages/README.md) documents each screen **once it's built**.

## The discipline

- **One file per feature**, named for the feature (`checkout.md`, `user-invites.md`).
- **Write it in a brainstorm**, not alone — the questions are the point.
- **Resolve open questions before planning.** An open question at build time is a rewrite.
- **Requirements changed? Update this doc first**, then re-plan, then code. Never
  code-first — see [`WORKFLOW.md`](../../WORKFLOW.md).

## Index

> Keep this table current. One row per feature.

| Feature | Doc | Milestone | Status |
|---|---|---|---|
| Auth | [auth.md](./auth.md) | v0.1 | agreed |
| Report a Request | [report-a-request.md](./report-a-request.md) | v0.1 | agreed |
| Discover Nearby Requests | [discover-nearby-requests.md](./discover-nearby-requests.md) | v0.1 | agreed |
| Accept / Volunteer | — | v0.1 | not started |
| Mission Coordination | — | v0.1 | not started |
| Complete Mission + Impact Story | — | v0.1 | not started |
| Alerts | — | v0.1 | not started |
| Profile & Privacy Settings | — | v0.1 | not started |

## Related docs

- Kickoff: [`../../CORE_DOCUMENT.md`](../../CORE_DOCUMENT.md)
- Plan: [`../../PROJECT_PLAN.md`](../../PROJECT_PLAN.md)
- Module deep-dives: [`../modules/_template.md`](../modules/_template.md)
- Page docs: [`../pages/README.md`](../pages/README.md)
