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
| claude-code (this session) | mobile+api | board backlog, one-by-one — #2 and #9 both closed, between items | main clone | 2026-08-20 |
| uthavuu-db (per `ListAgents`) | none reported | was helping coordinate the #9 handoff below; hasn't stated current task | main clone | 2026-08-20 |
| uthavuu-44 (per `ListAgents`) | unknown | just started, idle, hasn't stated a task yet | main clone | 2026-08-21 |

**Resolved (2026-08-21):** #9 (backend alert-content i18n) — the session that owned it (uthavuu-e9) ended without committing. claude-code reviewed the orphaned code in full, adopted the sound parts, finished the missing mobile-side wiring, and closed the issue (see issue #9's closing comment for the full account). No longer relevant to coordinate around.

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
| migration series | — | Resolved 2026-08-21 — 0007 (alerts.params/user.locale) and 0008 (report_likes) are both committed and applied. |
| pnpm-lock.yaml | — | — |
| App Profile / shared lib | — | — |

## Handoffs — clear when consumed

> Each item names the **target session** and one fact. The target deletes it once acted on.

- [ ] {{@s2: I rebased my migration onto yours — `git pull` before you `db:generate`.}}
- [ ] {{@s1: touched `libs-common/api-handler` for the shared error type — expect a merge, keep both.}}

---

**Related:** [`COORDINATION.md`](../COORDINATION.md) (the rules) · [`../WORKFLOW.md`](../WORKFLOW.md)
(the single-worker loop) · [`../PROJECT_PLAN.md`](../PROJECT_PLAN.md) (milestones & lanes of work).
