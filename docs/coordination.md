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
| claude-code (this session) | mobile+api — Saved Stories + Invite Friends (backend+mobile, net-new) + a 401-handling fix in libs-mobile/lib/api.ts, running via a background subagent | none filed yet | main clone | 2026-08-24 |
| uthavuu-c4 (per `ListAgents`) | run/debug — done, footprint limited to `libs-mobile/i18n/index.ts` (locale-detect fallback), `package.json`/`apps/mobile/package.json` (`dev` scripts) | — | main clone | 2026-08-24 |
| unidentified 4th party | actively rewriting `apps/mobile/src/screens/tabs/{Alerts,Profile,Dashboard,MyHelps}Screen.tsx`, `libs-mobile/components/ScreenHeader.tsx` — large uncommitted diffs, not visible via `ListAgents`, identity unknown | — | main clone | seen active 2026-08-24 |
| uthavuu-db (per `ListAgents`) | none reported | was helping coordinate the #9 handoff below; hasn't stated current task | main clone | 2026-08-20 |
| uthavuu-44 (per `ListAgents`) | unknown | just started, idle, hasn't stated a task yet | main clone | 2026-08-21 |
| architecture/docs session | **`docs/` only — writes no application code.** Wrote ADRs 0010–0012, reconciled `architecture/system.md`, `architecture/data.md`, `architecture/admin-console-integration.md`, `_audit/issues.md`, `_audit/open-questions.md`, and added the migration ledger below. Committed as `98aae67` | none filed yet | main clone | 2026-08-28 |
| architecture/docs — **adversarial re-audit** | **`docs/` only.** Fact-checked `98aae67` against `d60e276` after the admin API (`177100c`) and console (`0227403`) landed. Corrected ~20 drifted `path:line` citations and several false claims across the three ADRs, the three architecture docs and `_audit/*`; added issues 10–12 | none filed yet | main clone | 2026-08-28 |

**Note from the docs session (2026-08-28):** `docs/_audit/open-questions.md` was being edited by
another lane at the same time as this pass — we did not collide, but `docs/` is evidently not a
single-writer area any more. If you are the backend lane writing into `docs/_audit/`, add a row
above so the next doc pass knows to expect it.

**If you're the unidentified 4th party:** please add your own row above (or a note here) so the rest of us aren't guessing — and consider landing a WIP commit on the Alerts/Profile/Dashboard/MyHelps work so it's not sitting unprotected in the shared tree. claude-code's current background task deliberately avoids those files.

**Resolved (2026-08-25):** `CategoryListScreen.tsx` — claude-code found the uncommitted version was rendering hardcoded fabricated content on every card (fake reporter "Ravi Kumar", fake location/timestamp/priority/expiry badges, a fake "PetCare Chennai" sponsor ad + video modal — no backend sponsor system exists). Rewired the affected pieces to real data (reporterDeleted/anonymous-aware identity, report.landmark, formatRelativeTime, getUrgencyTone/formatTimeRemaining against report.expiryAt) and removed the sponsor content entirely; the rest of the file's in-flight UI work (search bar, filter sheet, category picker) was left untouched. Committed as `b4c0daf` and pushed. No longer needs tracking here.

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
| migration series | **CLAIMED 2026-09-03 — photo verification (`0025`).** Adding `photo_verification_statuses` (lookup), `photo_uploads` (quarantine + verdict), `report_photos.upload_id`, `report_categories.expected_labels`, and two new `report_statuses` seed keys. Release on push. *Previously:* **RELEASED 2026-09-02.** The 0025 claim (sponsor campaigns/creatives/impressions/clicks) is **withdrawn, not deferred**: the contract was frozen the same day as `GET /sponsors` with no tracking, and mobile + admin were both realigned to it. Building those four tables would have contradicted a live decision. | Head **0024** (`broadcasts`), 25 applied. |
| pnpm-lock.yaml | **CLAIMED 2026-09-03** — adding `jimp` (pure-JS image decode) to `apps/api`; `@aws-sdk/client-rekognition` to follow. | Release on push. |
| App Profile / shared lib | — | — |

### Migration ledger

> Added 2026-08-28 by the architecture (docs) session. Every row below was verified against the
> `apps/api/drizzle/` file tree **and** `drizzle.__drizzle_migrations` in the live `uthavu_dev`
> database — not inferred from commit messages. **22 migrations applied (0000–0021), head `0021`.**

| # | Tag | What it did | Applied | Lock claimed? |
|---|---|---|---|---|
| 0016 | `pretty_jimmy_woo` | Drop `report_likes`; Impact Story keeps Save, drops Like | ✅ 2026-08-25 | ✅ `1b59c24` claim, `12090b0` land |
| 0017 | `gigantic_marvel_zombies` | Admin RBAC — `admin_roles`, `admin_permissions`, `admin_role_permissions`, `admin_users` | ✅ 2026-08-25 | ❌ no claim/release commit |
| 0018 | `famous_multiple_man` | Admin audit trail — `admin_audit_actions`, `admin_audit_target_types`, `admin_audit_logs`; plus `report_comments.deleted_at` / `deleted_by` | ✅ 2026-08-27 | ❌ no claim/release commit |
| 0019 | `motionless_invaders` | Account suspension — `user_statuses`, `user_account_status` | ✅ 2026-08-28 | ❌ no claim/release commit |
| 0020 | `wild_landau` | Community Updates — `community_updates`, `community_update_statuses` | ✅ 2026-08-29 | ✅ claimed and released in this file |
| 0021 | `curvy_marten_broadcloak` | Platform settings — `platform_settings` (singleton row, DB CHECK bounds) | ✅ 2026-08-29 | ✅ claimed and released in this file |

**Ledger re-verified 2026-08-28 (second pass): still accurate.** `apps/api/drizzle/` holds 20 `.sql`
files (`0000`–`0019`) and `drizzle.__drizzle_migrations` holds exactly 20 rows, the last two stamped
2026-08-27 and 2026-08-28. **Head is `0019_motionless_invaders`; no lane has added a migration
since.** All three of 0017–0019 are now committed (`177100c`).

**⚠️ The migration-series lock protocol is being bypassed in practice.** `git log` shows a clean
claim/release pair for every migration up to 0016 (`chore: claim migration-series lock …` /
`chore: release migration-series lock …`, e.g. `6f3a186`, `81f3630`, `d1c3b43`, `6ccbf50`,
`b2fbb01`, `4dccdaf`, `1b59c24`). There is **no such pair for 0017, 0018 or 0019.**

> **Update, 2026-08-28:** the "still **uncommitted** in the shared working copy" half of this warning
> is **no longer true** — 0017–0019, their snapshots and `meta/_journal.json` were committed with the
> admin API as `177100c`. The lock-protocol point stands: they were generated without a claim.

This has not caused a collision yet because one lane happens to own all three. It is still the
condition the lock exists to prevent: with several sessions in a single checkout, two concurrent
`db:generate` runs produce the same next index, and the loser's `_journal.json` entry is silently
overwritten on merge. **If you are about to run `db:generate`, claim the lock first.**

> ~~**Seeding is behind the schema.**~~ **Resolved 2026-08-28** — `pnpm db:seed` has since run.
> Re-verified against `uthavu_dev`: `admin_audit_actions` **13**, `admin_audit_target_types` **6**,
> `user_statuses` **2**, and `admin_audit_logs` holds 26 real rows. *(The original note also
> understated the expected counts as 11 and 5.)* The hazard still applies to a fresh database and
> after any new catalogue action — `pnpm db:seed` upserts by `key`, so re-running it is always safe.
> Tracked as [`_audit/issues.md`](./_audit/issues.md) issue 9.

## Handoffs — clear when consumed

> Each item names the **target session** and one fact. The target deletes it once acted on.

- [ ] {{@s2: I rebased my migration onto yours — `git pull` before you `db:generate`.}}
- [ ] {{@s1: touched `libs-common/api-handler` for the shared error type — expect a merge, keep both.}}

---

**Related:** [`COORDINATION.md`](../COORDINATION.md) (the rules) · [`../WORKFLOW.md`](../WORKFLOW.md)
(the single-worker loop) · [`../PROJECT_PLAN.md`](../PROJECT_PLAN.md) (milestones & lanes of work).
