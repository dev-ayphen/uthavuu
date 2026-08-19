# Product decisions

> ⚠️ **Not actually verified — see `docs/README.md` for the full correction.** No prototype code
> exists anywhere. Every code-impact claim below was fabricated by an earlier agent run, not
> checked against real code. The decisions themselves (no star ratings, public comments + private
> chat) are real product decisions — only the "code already does X" claims are false.

Decisions that change the specification. What must be built (nothing is built yet).

**~~Verified against code~~:** 2026-08-18

| # | Decision | Date | Spec status | Code status |
|---|---|---|---|---|
| 1 | [No star ratings](#decision-1--no-star-ratings) | 2026-08-18 | ✅ Rule 10 updated | 🟢 **Mobile already complies.** 1 live admin tile + 1 line of copy + 2 dead references left |
| 2 | [Community Comments (public) + Mission Chat (private)](#decision-2--community-comments-public--mission-chat-private) | 2026-08-18 *(revised)* | ⚠️ Rules need updating | 🔵 **Comments not built · chat input is a placeholder** |

---

## Decision 1 — No star ratings

**Decided:** ratings are removed from the product. No public star-rating system.

**Rationale:** a reporter in an emergency is not a service to be scored. A low score would
suppress genuine requests for help, and the score would be shaped by outcomes largely
outside the reporter's control. Trust is conveyed by verification and completion history.

### Reporter trust block — final form

```
👤 Ravi Kumar
💼 Software Engineer
✓ Verified Reporter
✓ 18 Successful Reports
```

**Not:** `⭐ 4.9`

### Rule 10 — updated

> Reporter trust indicators include **Verified Reporter status, successful reports count,
> and resolution reliability**. **No public star-rating system.**

✅ Applied to `apps/mobile/FUNCTIONAL_FLOW.md`.

### Ratings still in the code — 1 live, 3 dead

**Re-verified 2026-08-18 against the source and the running screen.**

| # | Location | Code | Status |
|---|---|---|---|
| 1 | **`admin/dashboard/page.tsx:2539`** | Impact Stories tile — `sub: '4.9★ avg rating'`, `icon: '⭐'` | 🔴 **Live and rendering.** The only place a user-visible star rating still appears in either product |
| 2 | **`EditProfileScreen.js:318`** | Privacy note reads *"Show **ratings**, reliability % & report counts"* | 🔴 **Live copy.** Promises a ratings system to every user who opens the privacy toggle |
| 3 | **`RequestDetailsScreen.js:411`** | `const rating = request?.rating \|\| '4.9';` | 🟡 **Dead variable** — assigned once, never read, no JSX consumes it |
| 4 | **`CategoryListScreen.js:797`** | `reporterStripRating` style | 🟡 **Dead style** — never applied |

> **Correction.** This table previously listed #3 as *"Live and rendering — every reporter
> card shows ⭐ 4.9"*. That was wrong: the declaration was mistaken for a render. The mobile
> reporter card has never shown a star — it renders **Verified · 96% Reliability · 38
> Reports · 34 Resolved**. See
> [14 §1A.2](./mobile/14-request-details-screen.md#1a2-rule-10---satisfied-no-star-rating-is-rendered).
>
> **The mobile app already complies with Decision 1.** What remains is one admin tile, one
> line of privacy copy, and two pieces of dead code.

### Removal checklist

- [ ] Replace the analytics sub-label — `admin/dashboard/page.tsx:2539` ← **the only user-visible one**
- [ ] Delete the dead `const rating` — `RequestDetailsScreen.js:411`
- [ ] Reword the privacy note to *"Show reliability % & report counts"* — `EditProfileScreen.js:318`
- [ ] Delete the dead `reporterStripRating` style — `CategoryListScreen.js:797`
- [ ] Confirm `showCommunityStats` still gates the remaining metrics correctly

### What replaces it

`RequestDetailsScreen.js:405–417` already computes everything the final block needs:

| Value | Line | Keep? |
|---|---|---|
| `isVerified` | `:417` | ✅ → "✓ Verified Reporter" |
| `resolvedCount` | `:414` | ✅ → "✓ 18 Successful Reports" |
| `reliability` | `:412` | ✅ Keep — Rule 10 retains resolution reliability |
| `profession` | `:410` | ✅ Keep |
| `reportCount` | `:413` | ✅ Keep |
| **`rating`** | **`:411`** | ❌ **Remove** — dead variable, never rendered |

**The mobile block already matches the decided design.** The one line to delete is dead
code, not a visible rating. The user-visible work left is the admin analytics tile.

---

## Decision 2 — Community Comments (public) + Mission Chat (private)

> ⚠️ **Revised 2026-08-18.** An earlier version of this decision restricted active requests
> to participants only. **That is superseded.** A bystander may hold information the
> reporter and volunteers need — *"the dog moved near the temple"*, *"Blue Cross has already
> been contacted"* — and withholding it helps nobody. The superseded version is kept at the
> end of this section for history.

**Decided:** two surfaces on an active request, with different audiences.

| Surface | Who can post | Visibility | Purpose |
|---|---|---|---|
| **💬 Community Comments / Updates** | **Anyone** | **Public** | Useful information from bystanders and passers-by |
| **💬 Mission Chat** | Reporter + **accepted** volunteers | **Private** | Coordination only |

Plus, after completion:

| Surface | Who | Purpose |
|---|---|---|
| **Impact Story** — ❤️ Like · 💬 Comments · 📤 Share | Everyone | Public response to a finished mission |

### Why both, not one

| | Community Comments | Mission Chat |
|---|---|---|
| Audience | Public | Participants only |
| Typical content | *"The bike is now on the left side of the road."* | *"I'm 5 min away, bring the rope."* |
| Moderation | ✅ Report/flag + admin review | Not moderated — private |
| Visible to a passer-by | ✅ Yes | ❌ No |

Coordination noise stays out of the public thread; useful public information still reaches
the people acting on it.

### Requirements

**Community Comments (public, active request)**
- Anyone can post
- Everyone can read
- ✅ Report/flag available on each comment
- ✅ Admin moderation — hide / delete
- Ordered oldest → newest, so the thread reads as a running account

**Mission Chat (private, active request)**
- Reporter + accepted volunteers only
- Not public, not moderated
- Gated on acceptance — the same gate that already controls the phone reveal

### Code status

| Requirement | Status | Evidence |
|---|---|---|
| **Public comments on an active request** | 🔵 **TARGET — not built** | No public comment UI in `RequestDetailsScreen.js`. The existing feed is `UPDATE_TYPES` (`:119`), which only participants post to |
| Report/flag a comment | 🔵 TARGET | The 7-reason flag modal exists for *requests*; not wired to comments |
| **Mission Chat, private + gated** | 🟡 **Partially built** | A chat modal exists at `:536`, but its input is a **`<Text>` placeholder, not a `TextInput`** — see `FUNCTIONAL_FLOW.md` defect #8 |
| Admin moderation of comments | 🟡 **Built, mis-scoped** | The Comments tab (`:2210`) and report-detail §8 moderate comments — **which now becomes correct**, since public comments on active requests are wanted |
| Impact Story — Like | 🔵 TARGET | Not built |
| Impact Story — Comments | 🔵 TARGET | Not built |
| Impact Story — Share | 🟢 **Built** | Real deep links — [17 §4](./mobile/17-impact-story-screen.md#4-the-share-implementation) |

### ✅ This revision resolves an earlier conflict

The superseded decision made the admin console **wrong** — it moderates public comments on
active requests, which the old rule prohibited. Under this revision the console is
**correct as built**: the Comments tab and report-detail §8 are exactly the moderation
surface public comments require. No admin rework is needed.

### What to build

**Mobile — active request:**
- [ ] Public **Community Comments** thread — anyone posts, everyone reads
- [ ] Flag action per comment, reusing the existing reason list
- [ ] Replace the Mission Chat `<Text>` placeholder with a real `TextInput` (defect #8)
- [ ] Gate Mission Chat on `hasAccepted` — the gate already exists for the phone reveal

**Mobile — Impact Story:**
- [ ] ❤️ Like · 💬 Comments *(Share ✅ done)*

**Admin:** ✅ nothing to change.

### Terminology

| Use | Not |
|---|---|
| **Community Comments** (public, active request) | "Community Updates", "Volunteer Field Updates" |
| **Mission Chat** (private, participants) | "Mission Discussion", "Temporary Mission Chat" |

Three names exist in code today for the participant feed — `UPDATE_TYPES` ("Updates"), the
admin's *Community Updates* tab, and the report detail's *Volunteer Field Updates*.

---

<details>
<summary><strong>Superseded — original Decision 2 (mission-discussion-only)</strong></summary>

The original decision restricted active requests to reporter + joined volunteers, with
public comment only on the completed Impact Story. Rationale was that an active emergency
post must stay operational and public comment would add noise.

**Superseded 2026-08-18** — a bystander may hold information the mission needs. The revised
decision keeps operational traffic separate via the private Mission Chat instead.

</details>

---

## Where these decisions are recorded

| Document | What it holds |
|---|---|
| `apps/mobile/FUNCTIONAL_FLOW.md` Rule 10 | ✅ Ratings decision, applied |
| This file | Both decisions + code impact |
| [mobile 14](./mobile/14-request-details-screen.md) | Reporter card and update types as built |
| [mobile 17](./mobile/17-impact-story-screen.md) | Impact Story as built — share only |
| [webadmin 04](./webadmin/04-reports-and-moderation.md) | The comment-moderation surfaces affected |

---

## Related

- [Implementation status](./IMPLEMENTATION-STATUS.md)
- [API contract](./API-CONTRACT.md) — the like/comment endpoints Decision 2 requires
