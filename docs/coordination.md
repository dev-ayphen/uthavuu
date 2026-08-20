# Coordination — live session mailbox

> **Template.** This is the durable coordination channel for parallel sessions — the "committed
> mailbox" from [`COORDINATION.md § 7`](../COORDINATION.md). It is a **living file**: sessions
> write to it as they start, claim, and hand off. Commit changes to it like any other.
>
> **The reader clears a note when it's been consumed.** A handoff left after it's acted on looks
> current forever and misleads the next reader — so if you did what a note asked, delete it in the
> same commit. Keep this file short; a stale mailbox is worse than an empty one.

Not running parallel sessions? This file stays empty — that's fine. It exists so the channel is
there the moment a second session starts. The full rules are in [`COORDINATION.md`](../COORDINATION.md).

---

## Active sessions

> One row per session currently working the repo. Remove your row when you stop.

| Session | Lane (`area:`) | Issue / branch | Working copy | Started |
|---|---|---|---|---|
| claude-code (this session) | mobile+api | #2 Impact Story — executing docs/superpowers/plans/2026-08-20-impact-story.md | main clone | 2026-08-20 |
| uthavuu-e9 (per uthavuu-db, relayed — not directly visible to this session's `ListAgents`) | api | #9, backend alert-content i18n (alert-templates.ts, update-locale.dto.ts, auth-schema.ts, alerts-schema.ts, users.controller.ts/service.ts, libs-mobile/api/alerts.ts, en/ta tabs.json all dirty) | main clone (same working copy — no worktree split) | 2026-08-20 |
| uthavuu-db (per `ListAgents`, socket 82857) | none — CLI install fix + a docs question, explicitly zero file edits this session and staying off apps/api/, drizzle/, .maestro/, the dev DB, and the simulator | n/a | main clone | 2026-08-20 |

**Correction (2026-08-20):** an earlier version of this row misattributed the #9/migration work to `uthavuu-db` — confirmed wrong by `uthavuu-db` itself. The real owner is `uthavuu-e9`, which this session cannot reach directly (not listed by its own `ListAgents`) — only via `uthavuu-db` relaying.

## Offset registry

> So two sessions never pick the **same** offset. Claim a column before you configure your `.env`.

| Session | Database | Redis DB / port | App ports |
|---|---|---|---|
| {{s1}} | {{app_dev}} | {{0}} | {{3000 / 4000}} |
| {{s2}} | {{app_dev_s2}} | {{1}} | {{3100 / 4100}} |

## Locked resources

> The append-only artifacts only one session may write at a time (`COORDINATION.md § 2`). Claim
> before you touch; release the moment you've pushed.

| Resource | Held by | Until |
|---|---|---|
| migration series | uthavuu-e9 (peer, see correction above) | uncommitted `apps/api/drizzle/0007_blushing_katie_power.sql` (adds `alerts.params` jsonb + `user.locale` text, per uthavuu-db's read of the file) — claude-code session has a `report_likes` table ready (schema written, not yet migrated) and will not run `db:generate`/`db:migrate` until 0007 is committed or e9 confirms it's safe |
| pnpm-lock.yaml | — | — |
| App Profile / shared lib | — | — |

## Handoffs — clear when consumed

> Each item names the **target session** and one fact. The target deletes it once acted on.

- [ ] {{@s2: I rebased my migration onto yours — `git pull` before you `db:generate`.}}
- [ ] {{@s1: touched `libs-common/api-handler` for the shared error type — expect a merge, keep both.}}

---

**Related:** [`COORDINATION.md`](../COORDINATION.md) (the rules) · [`../WORKFLOW.md`](../WORKFLOW.md)
(the single-worker loop) · [`../PROJECT_PLAN.md`](../PROJECT_PLAN.md) (milestones & lanes of work).
