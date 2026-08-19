# Business rules — coverage & implementation status

> ⚠️ **Not actually verified — see `docs/README.md` for the full correction.** No prototype code
> exists anywhere (including `apps/mobile/FUNCTIONAL_FLOW.md`, cited below, which is also not in
> this repo). Every coverage/status claim was fabricated by an earlier agent run.

All **19 business rules**, mapped to the document that covers each — not actually checked against
any code.

**~~Verified against code~~:** 2026-08-18

> **Why this document exists.** Rule 15 (chat auto-locking) was specified, partly built, and
> **documented nowhere** until it was raised directly. A sweep found **13 of 19 rules had no
> reference in any doc**. This closes that gap and prevents the next one.

🟢 Implemented · 🟡 Partially implemented · 🔵 Target — not built · ❌ Contradicted by code

---

## Coverage table

| Rule | Subject | Status | Verified behaviour | Doc |
|---|---|---|---|---|
| **1** | Live-camera completion proof | 🔵 | **No camera anywhere.** Completion requires no photo; gallery isn't disabled because neither exists | [15](./mobile/15-volunteer-journey-screen.md) · [26](./mobile/26-field-validation-reference.md) |
| **2** | Automated verification pipeline | ❌ | A `setTimeout` greps the **caption text** for `'unsafe'`/`'nudity'`. No image is examined. None of the 5 specified checks runs | [14 §3](./mobile/14-request-details-screen.md#3-the-simulated-ai-moderation-scan) |
| **3** | No requester confirmation | 🟢 | `handleSubmitCompletion` jumps `lifecycleStep` **2 → 4**, closing without the reporter. ⚠️ A dead stage-3 confirmation block survives | [15 §1](./mobile/15-volunteer-journey-screen.md#1-the-lifecycle) |
| **4** | Any member may close | 🟡 | UI allows it; no server-side ownership model exists | [15](./mobile/15-volunteer-journey-screen.md) |
| **5** | Duplicate mission prevention | 🟡 | `missionFull` gates the Help button once capacity is reached — but there is no *"already resolved"* message | [14](./mobile/14-request-details-screen.md) |
| **6** | Reporter cancellation (4 reasons) | 🔵 **ABSENT** | **No cancel action exists anywhere in the app.** A reporter cannot withdraw a request | — *(gap, §Missing below)* |
| **7** | Expiry → Extend / Repost / Archive | 🟡 | `expiry.js` computes windows and `ExpiredNotice` offers **Repost / Archive** — both `alert()` stubs. **No "Extend Time"** | [23](./mobile/23-shared-components.md) · [13](./mobile/13-category-list-screen.md) |
| **8** | Auto impact story on closure | 🟡 | Completion does navigate to a story — built from a **hardcoded literal**, not the real mission | [15](./mobile/15-volunteer-journey-screen.md) |
| **9** | Volunteer team credit | 🟡 | `teamMembers` is written, but as a **fixed list** `['Priya','Arun','Lakshmi','Ravi']`, ignoring the real roster | [15](./mobile/15-volunteer-journey-screen.md) |
| **10** | Reporter trust — **no ratings** | 🟢 | ✅ **Mobile shows no rating.** The card renders Verified · Reliability · Reports · Resolved. `rating` (`:411`) is declared and **never read**. ⚠️ Admin analytics still shows `4.9★ avg rating` | [14 §1A](./mobile/14-request-details-screen.md#1a-the-reported-by-trust-card-397484) |
| **11** | Volunteer reputation stats | 🔵 **ABSENT** | Profile shows **hardcoded** "32 helps / 96%". No impact points, no community rank, no category breakdown | [12](./mobile/12-profile-screen.md) |
| **12** | Mission Team card in the story | 🟢 | Rendered, with a fallback to the single helper | [17](./mobile/17-impact-story-screen.md) |
| **13** | My Helps excludes completed | 🟢 | Active queue holds only `HELPING_NOW` / `ACCEPTED`; completed live in a separate segment | [09](./mobile/09-my-helps-screen.md) |
| **14** | Team modal gated by category | 🟡 | A needed-count modal exists, clamped **2–20** — but **no category restriction** | [14](./mobile/14-request-details-screen.md) |
| **15** | Chat auto-locks on completion | ❌ | `!isCompleted` **hides the card entirely** — history unreachable. Should be read-only + archived | [14 §1C](./mobile/14-request-details-screen.md#1c-mission-temporary-chat--lifecycle--privacy) |
| **16** | Public links omit contact details | 🟢 | Impact Story renders **no phone or street address**; share text carries narrative, location name and team only | [17](./mobile/17-impact-story-screen.md) |
| **17** | Automated moderation | ❌ | Same simulated scan as Rule 2. Nothing screens a report **before** acceptance | [14 §3](./mobile/14-request-details-screen.md#3-the-simulated-ai-moderation-scan) |
| **18** | Volunteer reputation engine | 🔵 **ABSENT** | No score, reliability, impact points or rank is computed anywhere | — *(gap)* |
| **19** | Home Community Impact Feed | 🟢 | Dashboard renders a **Community Impact** section — 3 stories + View All | [08 §6](./mobile/08-dashboard-screen.md#6-other-sections) |

**Totals: 🟢 6 · 🟡 7 · 🔵 3 · ❌ 3**

> **Corrected 2026-08-18.** Rule 10 was previously recorded as ❌ *"`rating` still renders
> ⭐ 4.9"*. Verified against the running screen and the source: **it does not render** —
> `const rating` at `RequestDetailsScreen.js:411` is a dead variable, assigned once and never
> read. A declaration was mistaken for a render. Mobile satisfies Rule 10; only the admin
> analytics tile still shows a star.

---

## Rules with no implementation at all

Three rules have **no corresponding code**, and were previously undocumented.

### Rule 6 — Reporter mission cancellation 🔵

> *Before completion the requester may cancel the active request, selecting: Already
> resolved · Duplicate report · Wrong location · Other. All assigned volunteers are
> notified.*

**Nothing exists.** Grep finds no cancel action, no reason list, no notification path. A
reporter who posts by mistake, or whose situation resolves itself, has **no way to withdraw
the request** — it stays live until it expires.

Volunteers can be dispatched to a situation that no longer exists. This is the most
operationally significant missing rule.

| Needs | |
|---|---|
| Mobile | Cancel action on the reporter's own request + 4-reason picker |
| Backend | `PATCH /reports/:id { status: 'CANCELLED', reason }` |
| Notify | All assigned volunteers |
| Admin | Cancelled reports visible in the Reports tab |

### Rule 11 — Volunteer reputation & impact statistics 🔵

> *Profiles showcase: category-wise help statistics · total helps · impact points ·
> community rank · completion reliability.*

The Profile screen shows **"32 Total Helps · 96% Reliability"** — both hardcoded literals
([12 §3](./mobile/12-profile-screen.md#3-data--real-vs-fabricated)). No category breakdown,
no impact points, no rank.

⚠️ The **admin console already models this** — `MOCK_USERS` carries `impactPoints`, and
`MOCK_VOLUNTEERS` carries `reliability`. The data shape exists on one side only.

### Rule 18 — Volunteer reputation engine 🔵

> *Every verified mission automatically updates: Reputation Score · Completion Reliability ·
> Category-wise Help Statistics · Impact Points · Community Rank.*

The engine that would feed Rule 11. Requires verified missions (Rules 1–2) to exist first,
so it is correctly last in dependency order.

---

## Rules the code contradicts

| Rule | Specified | Actual |
|---|---|---|
| **2 · 17** | Automated verification and moderation | A `setTimeout` that greps caption text — and **only when a photo is attached**. Text-only updates are never scanned. Two user-facing messages claim AWS moderation ran |
| **15** | Chat → locked → read-only → archived | Chat **disappears** on completion; history unreachable. ⚠️ The Community Updates feed **20 lines away in the same file** implements exactly the right pattern |

These are worse than unbuilt rules: the product **states** they are working.

---

## What Rules 1 & 2 block

Rule 1 (live camera) and Rule 2 (verification) sit under most of the others:

```
Rule 1 live camera ──┐
                     ├──▶ Rule 2 verification ──▶ Rule 3 closure ──▶ Rule 8 auto story
                     │                                                      │
                     │                                              Rule 9 · 12 team credit
                     │                                                      │
                     └──────────────────────────────────────▶ Rule 18 reputation engine
                                                                            │
                                                                     Rule 11 profile stats
```

**Six rules cannot be completed until camera capture exists.** That makes it the highest-
leverage item in the mobile app after report submission itself.

---

## Priority

| # | Rule | Why |
|---|---|---|
| 1 | **6** — reporter cancellation | Volunteers dispatched to resolved situations. Safety-relevant and cheap to build |
| 2 | **1** — live camera | Unblocks six other rules |
| 3 | **15** — chat read-only | One condition change; history is currently destroyed. Copy the Community Updates pattern from the same file |
| 4 | **10** — delete dead rating code | Not a policy breach — 3 dead references plus **one live admin tile** (`page.tsx:2539`) |
| 5 | **2 · 17** — verification | Stop claiming it runs, then build it. Note text-only updates skip the scan entirely |
| 6 | **7** — Extend Time | Repost/Archive are stubs; Extend doesn't exist |
| 7 | **18 → 11** — reputation | Depends on 1–2 |

---

## Related

- `apps/mobile/FUNCTIONAL_FLOW.md` — the rules themselves (v6.0)
- [IMPLEMENTATION-STATUS](./IMPLEMENTATION-STATUS.md) · [MASTER FLOW](./UTHAVU_MOBILE_ADMIN_MASTER_FLOW.md) · [PRODUCT-DECISIONS](./PRODUCT-DECISIONS.md)
