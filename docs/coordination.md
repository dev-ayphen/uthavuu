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
| {{s1}} | {{api}} | {{#123 · feat/123-invite-flow}} | {{../app / main clone}} | {{2026-01-01}} |
| {{s2}} | {{web}} | {{#124 · feat/124-invite-ui}} | {{../app-s2 worktree}} | {{2026-01-01}} |

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
| {{migration series}} | {{s1}} | {{#123 migration pushed}} |
| {{pnpm-lock.yaml}} | {{—}} | {{—}} |
| {{App Profile / shared lib}} | {{—}} | {{—}} |

## Handoffs — clear when consumed

> Each item names the **target session** and one fact. The target deletes it once acted on.

- [ ] {{@s2: I rebased my migration onto yours — `git pull` before you `db:generate`.}}
- [ ] {{@s1: touched `libs-common/api-handler` for the shared error type — expect a merge, keep both.}}

---

**Related:** [`COORDINATION.md`](../COORDINATION.md) (the rules) · [`../WORKFLOW.md`](../WORKFLOW.md)
(the single-worker loop) · [`../PROJECT_PLAN.md`](../PROJECT_PLAN.md) (milestones & lanes of work).
