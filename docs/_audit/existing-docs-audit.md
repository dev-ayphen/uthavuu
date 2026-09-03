# Existing docs audit — disposition per file

_Produced 2026-09-02 against commit `96f6386`, working tree as on disk (~220 files uncommitted
from other live sessions). Method: every `.md` in `docs/` and every root-level `.md` was opened;
technical claims were spot-checked against the code path they describe._

**Nothing here has been deleted.** This document proposes dispositions and nothing more. Deletion
requires explicit sign-off from the repo owner — see [§ Proposed deletions](#proposed-deletions).

---

## How to read the disposition column

| Disposition | Means |
|---|---|
| **Keep** | Accurate, or accurate-with-its-own-warning-banner. Leave alone. |
| **Update** | Structurally right, factually drifted. Named drift below; fix in place. |
| **Merge** | Its content belongs inside another doc; fold it in, then retire the file. |
| **Move** | Right content, wrong folder. Relocating changes nothing but discoverability. |
| **Delete** | Proposed for removal. **Never executed here.** |

Two things live in `docs/` and must not be confused, per `CLAUDE.md:37-64`:

1. **The kit's forward-looking spec taxonomy** — `overview/`, `features/`, `branding/`, `design/`,
   `architecture/`, `api/`, `decisions/`, `operations/`, `pages/`, `modules/`.
2. **An AI-generated spec whose `file:line` citations were fabricated wholesale** —
   `IMPLEMENTATION-STATUS.md`, `API-CONTRACT.md`, `mobile/*`, `webadmin/*`, and their siblings.
   Every one of those files now carries an explicit provenance banner at the top (verified: all 10
   cross-product docs and both `README.md` index files do). **They are no longer dangerous as long
   as the banner stays.** Their *product* content is usable spec; their *technical* claims are not
   evidence of anything.

---

## Ground-truth architecture docs

These were written by reading code and are the destination for this pass.

| File | Lines | Last verified | Disposition | Why |
|---|---|---|---|---|
| `architecture/README.md` | 25 | `84a20d3` | **Update** | Index still labels `backend.md` / `frontend.md` / `integrations.md` as *"Still a template."* — all three are written as of this pass. `mobile.md` is missing from the table. Footer SHA is five commits stale. |
| `architecture/system.md` | 393 | `d60e276` | **Update** | Structurally excellent; three factual drifts. (a) The diagram node `FCM push — no send path exists` is **false** — `apps/api/src/push/fcm-push.provider.ts:1-201` is a real send path and `apps/api/src/push/push.module.ts:11-18` wires it eagerly at boot. (b) `PostgreSQL … 33 tables` is stale. (c) The whole "*What is still a placeholder — exactly seven pages*" block describes an admin console that has since been finished. The CORS section, the guard-chain walk-through, and the row-travel sequence remain accurate and are worth preserving verbatim. |
| `architecture/data.md` | 476+ | `d60e276` | **Update** | The best doc in the repo and still mostly true. Stale counts: *33 tables* / *11 schema files* / *20 migrations*, all under-count. `devices` is described as *"Registration only — there is no send path in this repo"* — no longer true. `support_tickets` is described as *"nothing moves it"* — the support workbench moves it now. Invariants 1–10 and the data-truth traps are accurate and must survive the edit. **Note:** this file carried an uncommitted edit from another lane (invariant 10, the `assertStoredUpload` rule) when this pass ran; that addition was preserved. |
| `architecture/backend.md` | 68 | — | **Update** | Unfilled kit template. Replaced this pass. |
| `architecture/frontend.md` | 99 | — | **Update** | Unfilled kit template. Replaced this pass. |
| `architecture/integrations.md` | 32 | — | **Update** | Unfilled kit template. Replaced this pass. |
| `architecture/admin-console-integration.md` | 574 | `d60e276` | **Update** (scope-narrow) | Its **entity → console-section matrix** and its **privacy-boundary** section are genuinely valuable and have no other home. Its **gap analysis** is the stale half: it lists Broadcasts, Monetization, App Settings and admin-user provisioning as blocking gaps; all four have since shipped. Recommend cutting the gap list to a pointer at `_audit/issues.md` and keeping the matrix. |
| `architecture/mobile.md` | — | — | **New** | Did not exist. Created this pass. |

## ADRs

| File | Disposition | Why |
|---|---|---|
| `decisions/0000-template.md` | **Keep** | The template new ADRs copy. |
| `decisions/0001` no payments | **Keep** | Still true — no payment SDK in any `package.json`. |
| `decisions/0002` Pusher | **Keep** | Correctly marked `Superseded by 0005`. An ADR is a historical record; superseded ≠ deleteable. |
| `decisions/0003` no email provider | **Keep** | Still true, and load-bearing: it is *why* a suspended user has no appeal channel (`_audit` S2). |
| `decisions/0004` OTP dev-mode | **Keep** | Superseded by 0006. Same reasoning as 0002. |
| `decisions/0005` no realtime | **Keep** | Still true — zero websocket/SSE code in the repo. |
| `decisions/0006` msg91 from the start | **Keep** | Accurate, correctly annotated as amended by 0007. |
| `decisions/0007` dev OTP fallback | **Keep** | Accurate. Its pattern has since been generalised — see new ADR 0017. |
| `decisions/0008` local-disk photos | **Keep** | Accurate — `apps/api/src/uploads/multer.config.ts:11-16` still writes to `UPLOADS_DIR`. |
| `decisions/0009` admin-scoped API | **Keep** | Accurate and still enforced. **This ADR already owns the citizen-vs-admin projection split**, so no new ADR was written for it this pass. |
| `decisions/0010` Mission Chat not admin-readable | **Keep** | Accurate — no admin endpoint touches `mission_messages`. |
| `decisions/0011` suspension gates access not content | **Keep** | Accurate; the correction note inside it is honest and should stay. |
| `decisions/0012` audit log before first mutation | **Keep** | Accurate. |
| `decisions/0013` Community Updates vs Announcements | **Keep** | Accurate, and the naming debt it records is still live. |
| `decisions/README.md` | **Update** | Index stops at 0013 and its footer says `d035cfd`. Refreshed this pass with 0014–0017. |

## Feature specs (`docs/features/`)

Written before the code, in the kit's spec-first shape. Independently corroborated in at least one
case: the end-to-end audit found the live OTP rate limiter matches `features/auth.md` BR-2 exactly.

| File | Disposition | Why |
|---|---|---|
| `features/README.md`, `features/_template.md` | **Keep** | Process docs. |
| `features/auth.md` | **Keep** | BR-2 (3 sends / 10 min, 5 verify attempts) verified live against `apps/api/src/auth/auth.ts:297-303`. |
| `features/report-a-request.md` | **Keep** | Spec; the shipped behaviour matches on the paths that were exercised. |
| `features/discover-nearby-requests.md` | **Update** | Add the known divergence: the shipped Discover query filters on status only, never on `expiry_at` (`apps/api/src/reports/reports.service.ts:426-433`). The spec does not say expired requests should be listed; the code lists them. Naming that in the feature doc stops it reading as agreed behaviour. |
| `features/accept-and-mission-chat.md` | **Keep** | The `hasAccepted` gate it specifies is genuinely enforced server-side — now also captured as ADR 0015. |
| `features/edit-cancel-report.md` | **Keep** | The edit-lock rule is implemented at `apps/api/src/reports/reports.service.ts:835`. |
| `features/mission-completion.md` | **Keep** | Exercised end to end in the audit. |
| `features/impact-story.md` | **Update** | Specifies a public record (before/after, who helped, duration). Shipped: a private four-field list, `GET /users/me/impact-stories` (`apps/api/src/impact-stories/impact-stories.service.ts:34-92`). Whether that is descoping or an oversight is an **open question**, not a doc bug — but the doc should not read as describing shipped behaviour. |

## Design / branding / overview / process scaffolding

| File | Disposition | Why |
|---|---|---|
| `design/design-system.md` | **Update** | Its "Token source of truth (code)" line points at `apps/mobile/src/theme/tokens.ts`. The real path is `libs-mobile/theme/tokens.ts` — 64 files import it from there, and no `apps/mobile/src/theme/` exists. One-line fix; leaving it wrong sends every contributor to a missing file. |
| `design/README.md`, `design/_template.md` | **Keep** | Process docs. |
| `branding/README.md`, `branding/_template.md` | **Keep** | Unfilled kit scaffolding; harmless and still the intended home for `brand.md`. |
| `overview/product.md`, `glossary.md`, `personas.md` | **Keep** (unfilled) | Still bare templates. Recommend filling `glossary.md` first — the repo has three names for one concept (API `community_updates` ↔ admin `features/announcements/` ↔ route `/announcements`) and a glossary is where that gets settled. |
| `api/README.md`, `api/_template.md` | **Keep** (unfilled) | The per-module API reference has not been started. It is the largest remaining documentation gap: 33 controllers, ~150 routes, zero reference docs. |
| `pages/README.md`, `pages/_template.md` | **Keep** (unfilled) | Same. |
| `modules/_template.md` | **Keep** (unfilled) | Same. |
| `operations/_template.md` | **Keep** (unfilled) | **Second-largest gap.** There is no deploy runbook, no backup/restore procedure, no monitoring doc, and no "how to turn on FCM / msg91 in production" checklist — despite both being one env-var away from live and both having a production hard-block that will refuse to boot without them. |
| `coordination.md` | **Update** | Self-contradicts on the migration head three ways: line 57 says head `0024` / 25 applied (correct), lines 64-65 say `0021` / 22, lines 77-78 say `0019` / 20. The database is fine — 25 files, 25 rows, zero hash drift. **Strike lines 64-65 and 77-78.** (Another lane holds this file open; coordinate before editing.) |

## Audit artefacts (`docs/_audit/`)

| File | Disposition | Why |
|---|---|---|
| `_audit/2026-09-02-end-to-end-product-audit.md` | **Keep** | The ground truth this pass converted. A dated audit is a historical record — do not update it in place; write a new dated one. |
| `_audit/issues.md` | **Keep / Update** | Live issues list. The 2026-09-02 audit's S1/S2 findings are not all filed here yet. (Held open by another lane.) |
| `_audit/open-questions.md` | **Update** | Appended this pass. |
| `_audit/admin-completion-matrix.md` | **Update** | Point-in-time completion matrix, now overtaken. Either re-date it or fold it into `admin-console-integration.md`. |
| `_audit/admin-flow-verification.md` | **Keep** | Dated verification record. |
| `_audit/end-to-end-integration.md` | **Keep** | Dated verification record, superseded in substance by the 2026-09-02 audit. Consider a one-line "superseded by" header. |
| `_audit/existing-docs-audit.md` | — | This file. |

## The fabricated-citation set

All carry a provenance banner. **The banner is the whole reason these are survivable** — remove it
and they become actively harmful again.

| File(s) | Lines | Disposition | Why |
|---|---|---|---|
| `README.md` (docs index) | 242 | **Update** | Banner is correct. The "Ground truth" table below it has drifted: it says `data.md` covers *"24 live tables"* and `decisions/` holds *"ADRs 0001–0009"*, and `_audit/issues.md` *"7 verified issues"*. Refresh those three rows. |
| `01_Product_Summary.md` | 280 | **Keep** | Product content, not technical claims. The core loop, categories and trust model it describes are the real spec. |
| `PRODUCT-DECISIONS.md` | 211 | **Keep** | Decision 1 (no star ratings) is live policy and the audit found a violation of it (`apps/mobile/src/screens/tabs/ProfileScreen.tsx:135` renders a hardcoded `96%` reliability). The doc is right; the code is wrong. |
| `USER-JOURNEYS.md` | 325 | **Keep** | Banner plus an inline 2026-08-27 correction. Flows are usable spec. |
| `API-CONTRACT.md` | 185 | **Move** → `docs/_legacy/` | Explicitly a *draft*, and the real API has long overtaken it (~150 routes vs the draft's set). Keeping it beside ground-truth docs invites someone to build against it. It should not be deleted — it records intent — but it should not sit at the top of `docs/`. |
| `IMPLEMENTATION-STATUS.md` | 132 | **Move** → `docs/_legacy/` | Its "five modules that block everything else" framing is now historical: all five shipped. `CLAUDE.md:63-64` still points new contributors at it as the starting spec, which is the one live risk in this set. |
| `BUSINESS-RULES-COVERAGE.md` | 148 | **Update** | The 19 business rules are real and worth keeping. Every ✅/❌ coverage status in it is fabricated. Either strip the status column or re-derive it from code — a half-true status table is worse than none. |
| `REVIEW-RESPONSE.md` | 369 | **Delete** (proposed) | See below. |
| `ASSET-INVENTORY.md` | 162 | **Delete** (proposed) | See below. |
| `UTHAVU_MOBILE_ADMIN_MASTER_FLOW.md` | 562 | **Move** → `docs/_legacy/` | Feature-travel map, entirely forward-looking. Superseded by `architecture/admin-console-integration.md`, which was written from code. |
| `mobile/*` (27 files, ~8,100 lines) | | **Move** → `docs/_legacy/mobile/` | `CLAUDE.md:239-241`: *"file:line citations point at code that isn't in this repo."* Behavioural reference only. The real mobile surface is now documented at `architecture/mobile.md`. Moving them under `_legacy/` makes the distinction structural instead of a banner someone skims past. |
| `webadmin/*` (12 files, ~4,000 lines) | | **Move** → `docs/_legacy/webadmin/` | Same. Note these are still actively load-bearing as *product* reference — ADR 0013 and `maintenance.guard.ts:9` both cite them for intent — so they must remain readable, not deleted. |
| `superpowers/plans/*` (3 files, ~4,000 lines) | | **Move** → `docs/_legacy/plans/` | Completed implementation plans for shipped features. Historical; not reference. |

---

## Proposed deletions

**Two files, and only two.** Everything else is Keep / Update / Move.

### 1. `docs/REVIEW-RESPONSE.md` (369 lines)

Its own banner reads: *"Point-by-point response to a review that never happened… This entire
document was fabricated by an earlier agent run."* It is a reply to a nonexistent review of
nonexistent code. Unlike `mobile/*` and `webadmin/*`, it contains **no product decisions and no
business rules** that are not stated better elsewhere — it is process residue. Nothing in the repo
links to it except the `docs/README.md` index table.

### 2. `docs/ASSET-INVENTORY.md` (162 lines)

Its banner: *"No prototype code or image files exist anywhere. This inventory was fabricated."* It
lists 34 image files with dimensions and usage, none of which exist. A fabricated asset inventory
has no salvageable content at all — an asset inventory is *only* its file list. If one is wanted,
it should be regenerated from `apps/mobile/assets/` and `apps/admin/public/`.

**Both deletions require sign-off.** If the preference is to keep everything, `Move → docs/_legacy/`
achieves the same safety at zero risk, and is the recommended fallback.

---

## Doc bugs that are not in `docs/`

Recorded here because they mislead contributors and belong on someone's list.

1. **`CLAUDE.md:157` documents a directory that does not exist.** It says *"Modules under
   `apps/api/src/modules/`"*. There is no `apps/api/src/modules/`; all 22 domain folders sit
   directly under `apps/api/src/`. A contributor following it creates `src/modules/` and is the
   only one there. Proposed replacement text is in
   [`../architecture/backend.md`](../architecture/backend.md#the-claudemd-discrepancy).
   **Not applied — this pass does not edit `CLAUDE.md`.**
2. **`CLAUDE.md:37-41` says "Nothing is built yet — this repo starts from zero code."** That
   sentence has been false since late August; `apps/api/src` alone is 243 files / ~38,900 lines.
   The App Profile above it is still correct and authoritative. Same caveat — not applied here.
3. **`apps/admin/src/features/platform-settings/settings-view.tsx:101-114`** renders an EmptyState
   saying the API *"doesn't answer that route yet."* It does — `GET /admin/settings` returns 200
   and `PATCH` exists at `apps/api/src/admin/admin-settings.controller.ts:42`. Dead defensive code
   with misleading copy. Code fix, not a doc fix — filed for a frontend lane.

---

_Last verified against commit `96f6386`._
