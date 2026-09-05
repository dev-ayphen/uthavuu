# ADR 0014: Photo verification gates report publication, asymmetrically

- **Status**: Accepted. **Partially supersedes BR-5** of
  [`docs/features/report-a-request.md`](../features/report-a-request.md) — see
  "What this supersedes" below.
- **Date**: 2026-09-04 (captured alongside the implementation, not retroactively).
  **Brought to ground truth 2026-09-05** — every citation below was re-read against the working
  tree on that date, and a substantial amount had drifted. See "Verification status" at the end.
- **Deciders**: Product owner + the implementing session.
- **Code state**: `HEAD = 15136b5`, and this feature is **0 commits**. Every `path:line` below
  points at **uncommitted working-tree state**. Checking out `15136b5` reproduces none of it.

## Context

A report's photo is the product's primary trust signal. BR-1 says a report needs one, and the
whole discovery loop assumes a volunteer looking at that picture can decide whether to walk
towards a stranger's emergency.

Until this change, **nothing had ever looked at the picture.**

Three separate facts made that worse than it sounds, and each was verified in the code rather
than assumed:

1. **The client declared what the file was.** `avatarUploadOptions.fileFilter`
   (`apps/api/src/uploads/multer.config.ts`) branches on `file.mimetype`, which multer copies
   verbatim out of the multipart part header. A `.mp4` announced as `image/png` was written to
   disk as `<uuid>.png` and served back with an image content type.
2. **Anything written was instantly public and could not be un-published.** `main.ts:50` mounts
   `UPLOADS_DIR` as Express static under `/uploads/`, deliberately outside every Nest guard,
   because an avatar URL has to be fetchable. Deleting the database row does not delete the bytes.
3. **The report create/update path took a URL from the client.** The old
   `photoUrls: z.array(z.string().url())` plus an origin check established that this API had once
   served those bytes. It never established that anything had examined them.

Meanwhile the citizen-facing product had a hard constraint pulling the opposite way. **BR-5:**

> **BR-5:** Reports publish immediately on submission — no pre-publish moderation gate. An
> emergency-help product can't hold real help behind a review queue. Moderation is reactive:
> flagging can hide/remove a live report after the fact (a separate `moderation` feature).

Both positions are correct. An unmoderated image pipeline on a public consumer product with
anonymous posting is a serious liability. A human review queue in front of an ambulance is a
product that nobody uses twice. The decision below is the shape that satisfies both — and it only
works because the common case has no human in it.

There is a second constraint that shapes every threshold in this feature: **Uthavu exists to carry
photographs of injuries.** Animal Rescue, Medical Help, Roadside Help and Blood Donation are four
of the eight citizen categories. A moderation policy tuned for a social feed flags every one of
those images as graphic violence and buries the product in a queue on day one.

## Decision

**Every report photo is verified server-side before the report can publish, and the gate is
asymmetric: PASS costs nothing, REVIEW costs a moderator, REJECT costs a retake.**

| Verdict | What happens to the report | Human involved? |
|---|---|---|
| **PASS** | Publishes immediately. Photos are promoted into public storage and the report is `open`, exactly as before this feature existed. | **No.** |
| **REVIEW** | The report **is created** but is **not public**: status `pending_review`, visible to its own reporter only. The photo stays in private quarantine with no public URL. A moderator decides. | Yes. |
| **REJECT** | **No report is created at all.** The reporter is told, in language that does not accuse them, and may capture another photo. | No. |

Three structural commitments make that trustworthy:

1. **The backend is the only thing that decides.** The client submits `photoUploadIds` — ids of
   `photo_uploads` rows *this API wrote* — never URLs and never verdicts. The verdict is re-read
   from the database on every attach.
2. **A photo nothing examined is not a photo that passed.** Every failure to analyse — no
   credentials, timeout, throttle, malformed response — routes to REVIEW. There is no path through
   the decision engine where "we could not check" yields PASS.
3. **Nothing unverified is ever publicly readable.** Quarantine lives outside the statically-served
   directory, and the API refuses to boot if that is misconfigured.

### What this supersedes

**This partially supersedes BR-5.** Precisely:

- **Changed:** verification now *precedes* publication. BR-5's literal claim that there is "no
  pre-publish moderation gate" is no longer true — there is one, and it can hold a report.
- **Unchanged, deliberately:** a PASS still publishes with **no human step and no queue**. BR-5's
  *intent* — an emergency product cannot hold real help behind a review queue — is preserved for
  the common case. The queue exists only for photos an automated check could not clear.
- **Unchanged:** reactive moderation still exists. A live report can still be hidden after the
  fact; this gate is additive to that, not a replacement for it.

BR-5 in `docs/features/report-a-request.md` carries an amendment pointer to this ADR.

## The invariants, and the code that proves each

Every row is labelled with its real status. Nothing here is described as working that the code does
not demonstrate.

| # | Invariant | Status | Proof |
|---|---|---|---|
| 1 | The client submits ids, never URLs, and never a verdict | **Implemented** | `apps/api/src/reports/dto/create-report.dto.ts:41`; `dto/add-photo.dto.ts:11`; `dto/update-report.dto.ts:35`; `dto/replace-held-photos.dto.ts:10-15` |
| 2 | The verdict is re-read from the database on every attach | **Implemented** | `apps/api/src/reports/report-photo-attachment.ts:87-102` — the `select` is inside `resolveUploads()`, not a value the request carries |
| 3 | A client cannot use another citizen's upload | **Implemented** | `report-photo-attachment.ts:99` (ownership in the `WHERE`, not a post-fetch check); test `apps/api/src/reports/report-photo-gate.spec.ts:228` |
| 4 | A client cannot reuse an already-attached upload | **Implemented** | `report-photo-attachment.ts:100` (`isNull(photoUploads.reportId)`); test `report-photo-gate.spec.ts:250` |
| 5 | A client cannot forge an id, and probing learns nothing | **Implemented** | `report-photo-attachment.ts:104-112` — one `PHOTO_NOT_VERIFIED` message for "does not exist", "not yours" and "already used"; test `report-photo-gate.spec.ts:240` |
| 6 | A null/missing verdict is **never** treated as PASS | **Implemented** | `report-photo-attachment.ts:143-159` — `holdForReview` is true unless every row's `decision` is the literal string `pass`, so `null` lands there too; test `report-photo-gate.spec.ts:269` |
| 7 | Every unavailable reason routes to REVIEW | **Implemented** | `apps/api/src/moderation/verification-decision.ts:146-168`; tests `verification-decision.spec.ts:314-338` (all six reasons) and `:340` |
| 8 | One held photo holds the **entire** report; no partial publication | **Implemented** | `apps/api/src/reports/reports.service.ts:217-224, 250-264`; test `report-photo-gate.spec.ts:191` ("holds the WHOLE report when only one of four photos needs review") |
| 9 | No public URL exists for a held or rejected photo | **Implemented** | `apps/api/src/uploads/quarantine-storage.ts:35-36` (sibling of, never child of, `UPLOADS_DIR`); reads only via the authenticated `GET /uploads/report-photo/:id` at `report-photo.controller.ts:125-158` |
| 10 | The API refuses to boot if quarantine is misconfigured | **Implemented** | `quarantine-storage.ts:47-61` — `assertQuarantineIsPrivate()`, run at module load (`:63`); tests `quarantine-storage.spec.ts:17,25` |
| 11 | Files become public strictly **after** the database says they may | **Implemented** | `reports.service.ts:250-264` — `publishUploads()` is called only inside the `!holdForReview` branch, after the `reports` row exists |
| 12 | A post-publish held photo cannot un-publish a live report | **Implemented** | `report-photo-attachment.ts:174-182` (`assertAllPassed`), called from `reports.service.ts:692` (edit) and `:741` (add-photo); tests `report-photo-gate.spec.ts:530,683,700` |
| 13 | A held report is invisible to other citizens, on reads **and writes** | **Implemented** | `apps/api/src/reports/report-visibility.ts:33-49,75` — the pre-publication predicate was folded into the `notRemoved` every caller already imports, rather than published as a second thing to remember; `requireVisibleReport()` at `:139`; tests `report-photo-gate.spec.ts:469,482,494` |
| 14 | Legitimate injury imagery is not rejected merely because violence labels fired | **Implemented** | The `Blood & Gore` carve-out — see below |
| 15 | The engine judges **safety and rough category suitability**, never whether the incident is real | **By construction** | `verification-decision.ts:19-22`; nothing in the stored `signals` (`verification-decision.ts:63-90`) expresses truthfulness, and no surface renders one |
| 16 | A photo's verdict binds to the category it was **judged against**, on all four attach paths | **Implemented** | `resolveUploads(..., expectedCategoryId)` — `report-photo-attachment.ts:52-75,152-159`; call sites `reports.service.ts:204-208` (create), `:687-691` (update), `:736-740` (addPhoto), `:901-905` (replaceHeldPhotos); tests `report-photo-gate.spec.ts:324,374,396,423,448`. See "The category bypass" below |
| 17 | An upload a **moderator** has already decided about can never be recycled | **Implemented** | `report-photo-attachment.ts:114-132` — refused on `reviewed_at is not null`, in either direction; test `report-photo-gate.spec.ts:631` |
| 18 | A human decision **never** overwrites the machine verdict | **Implemented** | `claim()` at `apps/api/src/admin/admin-report-photos.service.ts:663-697` writes `status_id`, `reviewed_by_id`, `reviewed_at`, `review_reason` and **never** `decision`; test `admin-report-photos.service.spec.ts:341` ("records the human verdict WITHOUT overwriting the machine decision"). See "The audit trail" below |
| 19 | A photo nothing analysed carries **no risk band** | **Implemented** | `verification-decision.ts:149-151` — `riskLevel: null`, not `'medium'`. A band is a measurement and there was none; the reasoning is at `:86-95`, and the queue's `risk` filter matches none of them deliberately (`list-report-photos.dto.ts:79-80`) |
| 20 | `GET /reports/:id` serves a held report to its reporter and to nobody else | **Implemented** | `reports.service.ts:281-296` — `or(notPrePublication, eq(reports.reporterId, requestingUserId))` in the `WHERE`; tests `report-photo-gate.spec.ts:469,482,494` |

### The audit trail: three concepts that must never collapse into one

**Status: Implemented, and permanent.** This is the single rule most likely to be "simplified" away
by a later change, so it is stated here rather than left implicit in three files.

```
AI verdict      = REVIEW      photo_uploads.decision        — NEVER overwritten
Human decision  = APPROVED    reviewed_by_id / reviewed_at / review_reason
Publication     = OPEN        reports.status
```

Three different questions, three different columns, and answering one must never rewrite another.
A moderator approving a held photo does **not** change `decision` from `review` to `pass`. It writes
the human decision *beside* the machine's, so that *"the model was uncertain and a person approved
it"* is still readable years later — which is the only version of this record worth keeping, because
the interesting cases are exactly the ones where the two disagreed.

- The write is `claim()` (`apps/api/src/admin/admin-report-photos.service.ts:663-697`). Its `set`
  clause contains `statusId`, `reviewedById`, `reviewedAt`, `reviewReason`, `updatedAt` — and no
  `decision`. The omission is the feature.
- The columns are separate by design (`apps/api/src/db/schema/photo-verification-schema.ts:98-100`
  for the machine's, `:133-137` for the human's).
- Release therefore reads `photo_verification_statuses.key`, **not** `photo_uploads.decision`
  (`apps/api/src/moderation/photo-moderation.service.ts:100-147`). Reading `decision` would hold a
  report forever on a photo a human cleared minutes ago; reading the status and overwriting
  `decision` would destroy the record. The current shape is the only one that does neither.
- Regression: `admin-report-photos.service.spec.ts:341`.

The cost is that `decision` is a *stale-looking* column on a decided row, and a future reader will
be tempted to "fix" it. It is not stale. It is the answer to a question that was asked once.

### The category bypass, and the boundary that closed it

**Status: Implemented (all four attach paths).** This was a real, exploitable hole, not a
theoretical one, and it is worth stating as an attack because the shape recurs.

Relevance is judged at **capture** time, against whichever category the client named on
`POST /uploads/report-photo` (`report-photo.controller.ts:58-63`), and the category it was judged
against is recorded on the row (`photo_uploads.category_id`,
`photo-verification-schema.ts:83`). `communityHelp` deliberately has **no** expected labels
(`apps/api/src/db/seed.ts:160-165`) — a broken streetlight, a flooded lane and a stack of donated
books are all legitimate — so for that category relevance is skipped entirely and any safe photo
earns a **genuine `pass`**.

The attack:

1. Upload a photo declaring `categoryKey: communityHelp`. Relevance is skipped. Verdict: `pass`.
2. File the report — or, worse, PATCH an already-live one — under `animalRescue`, which *does* have
   expected labels.
3. The photo carries an honest `pass`. `assertAllPassed()` sees a pass and waves it through onto a
   live report, and `publishUploads()` moves the bytes into public storage.

Nothing was forged. The verdict was truthful — it was simply the answer to a **different question**
than the one the report asks.

The boundary is `resolveUploads()`'s `expectedCategoryId`
(`report-photo-attachment.ts:52-75,152-159`): if the upload's recorded `category_id` differs from
the category the report is actually filed under, `holdForReview` is set. On `create()` and
`replaceHeldPhotos()` that means a human decides; on the post-publish paths `assertAllPassed()`
turns it into `PHOTO_NEEDS_REVIEW`, so a live report is never un-published and the reporter is asked
to retake.

**It is optional in the signature and mandatory in practice.** It was once omitted from `update()`
and `addPhoto()` on the reasoning that requiring an explicit `pass` there made it redundant — which
is exactly the reasoning above, and exactly wrong. All four call sites now pass it
(`reports.service.ts:204-208`, `:687-691`, `:736-740`, `:901-905`). **A fifth write path that does
not is reopening this bypass.** Five tests pin it: `report-photo-gate.spec.ts:324,374,396,423,448`.

Two deliberate consequences:

- **Approval does not re-derive relevance.** A photo can be in the queue *precisely because* of a
  category switch, and the response to that hold is a human looking at the actual image — a stronger
  check than the label heuristic. Re-running relevance at approval would let the machine overrule the
  person the hold existed to summon (`admin-report-photos.service.ts:477-486`; test
  `admin-report-photos.service.spec.ts:817`).
- **`photo_uploads.category_id` is never corrected.** It records the question the verdict answered,
  not the report's current category.

### `PUT /reports/:id/photos` — the reporter's answer to "send another"

**Status: Implemented server-side. Not Implemented on mobile** — see the gap note below.

`report_photo.request_new` leaves the report `pending_review` and alerts the reporter. Before this
route existed the reporter **could not act on that alert**: `update()` and `addPhoto()` both go
through `requireOwnedOpenReport()`, which refuses anything that is not `open`. The alert was correct
copy for behaviour that was not wired, which is the worst kind of gap — it looks finished.

The route is a **full replace**, gated on the report being `pending_review`
(`reports.service.ts:872-936`; controller `reports.controller.ts:107-128`;
DTO `dto/replace-held-photos.dto.ts`).

**Superseded uploads are DETACHED, not left in place** (`detachUploadsFrom()`,
`report-photo-attachment.ts:237-242`), and this is a correctness requirement rather than tidiness:
`requestNew` leaves the old upload with status `rejected`, `standingFor()` counts a `rejected`
upload as `refused` (`photo-moderation.service.ts:137`), and `refused > 0` blocks
`publishIfReady()` **permanently** (`:195`). Leave it attached and the reporter satisfies the
moderator's request, passes verification, and still never publishes — a dead end with no error
raised anywhere. Test: `report-photo-gate.spec.ts:590`.

Detaching creates its own hazard, which invariant 17 closes: a detached row is unattached and
therefore re-resolvable, and its **machine** `decision` may still read `review` even though a human
refused it. Without the `reviewed_at is not null` guard a reporter could re-submit the very image a
moderator turned down and have it merely held again rather than refused — laundering a human
decision into a machine one (`report-photo-attachment.ts:114-132`; test
`report-photo-gate.spec.ts:631`).

If every replacement passes, the report publishes directly from this path rather than going back to
a moderator: they asked for a usable photo and got one, and requiring a second look would make
"request new photo" strictly worse for both sides than "reject".

> **⚠️ Known gap, not a decision.** This path sets the report to `open` without applying
> `restoredWindow()` (`reports.service.ts:926-932`), so a report that expired while held publishes
> into an already-expired state when the *reporter* resolves it — the exact outcome PV-17 exists to
> prevent when a *moderator* resolves it. Recorded here rather than resolved, because closing it is
> a code change and this document does not make those. Raised as issue 28 in
> [`docs/_audit/issues.md`](../_audit/issues.md).

### The `Blood & Gore` carve-out, and why it exists

Rekognition returns **the whole ancestor chain**. A `Blood & Gore` detection at 95 also reports its
parent `Graphic Violence` at 95, and that parent's parent `Violence` at 95. So the naive rule —
"hold anything where Graphic Violence is high" — holds **every injury photograph the product exists
to carry.** The carve-out therefore works on *which children actually fired*, not on the parent's
confidence:

- `EMERGENCY_EXPECTED_LABELS = ['Blood & Gore']` — exactly one label
  (`apps/api/src/moderation/moderation-thresholds.ts:72`).
- When the *only* child under `Graphic Violence` that fired is expected gore, a higher bar applies:
  `MODERATION_REVIEW_GRAPHIC_VIOLENCE_GORE_ONLY`, default **92**, against the ordinary
  `MODERATION_REVIEW_GRAPHIC_VIOLENCE`, default **80** (`moderation-thresholds.ts:142-152`).
  An injured animal at 85 publishes; something the model is near-certain is gore at 92+ still gets
  a human.
- `Physical Violence` is deliberately **not** in the list. Blood at an accident scene is expected;
  a fight is something a moderator should genuinely look at
  (`moderation-thresholds.ts:54-72`, `verification-decision.ts:205-232`).
- Setting the two thresholds equal switches the carve-out off entirely, without a code change.

Tested at `verification-decision.spec.ts:78` (injury publishes), `:89` (near-certain gore still
held), `:97` (a fight does not get the carve-out) and `:107` (blood accompanying self-harm does not
get it either).

## What this feature does NOT do

This section matters more than any other in the document. Everything below is a real limit of the
shipped system, not a rough edge.

### AWS Rekognition is the only external provider for v1 — settled

**Status: Implemented (as a settled scope decision).** "AI Verification" in this product means
**Rekognition's moderation labels plus Uthavu's own decision engine**, and nothing else. No OpenAI,
no Gemini, no Claude Vision, no second verification pipeline, no ensemble. The factory understands
exactly one provider key (`apps/api/src/moderation/moderation-provider.factory.ts:31,39-41`); the
only other implementation is the one that reports it analysed nothing.

The `ImageModerationProvider` seam
(`apps/api/src/moderation/image-moderation-provider.interface.ts:118-133`) exists so a *future*
vendor swap is a drop-in — the provider reports observations and never decides — not because a
second vendor is planned.

### Manipulation / AI-generated image detection — NOT IMPLEMENTED

**Status: Not Implemented.** Rekognition has **no such capability**, so neither does this system.

The nearest available signal is `ContentTypes`, which flags **animated** and **illustrated** media.
That is a *"this is not a photograph"* signal — useful for noticing that a supposed emergency photo
is a cartoon — and it **must never be described, labelled, or rendered as synthetic-image
detection.** The field is named `notPhotographic` for exactly this reason
(`verification-decision.ts:83`, set at `:245-251`; `image-moderation-provider.interface.ts:49-58`;
`moderation-thresholds.ts:74-79`). Any UI copy that says "AI-generated image detected" would be a
false claim about a capability that does not exist. The admin console's reason copy says
"not a photograph" for the same reason (`apps/admin/src/features/report-photos/reason-copy.ts`).

### OCR / text-in-image — deferred by choice

**Status: Not Implemented (deliberate).** Rekognition offers `DetectText`, and it is not called
anywhere in this codebase. It adds a per-image cost and a privacy surface — text in a photograph of
an accident scene routinely includes number plates, ID cards and hospital paperwork — for no v1
benefit. Revisit only with a concrete use case.

### Illegal content

**AWS states plainly that the Rekognition image API does not detect illegal content such as CSAM**
(`apps/api/src/moderation/rekognition-moderation.provider.ts:19-23`). Nothing in this system may
imply otherwise, in code comments, admin copy or citizen copy.

### Real AWS validation — BLOCKED

These are two different statuses and they must not be collapsed into one:

| | Status |
|---|---|
| **Provider adapter complete** | **Implemented.** The adapter, factory, thresholds and decision engine are code-complete and unit-tested against recorded Rekognition response shapes — `rekognition-moderation.provider.spec.ts` (13 cases), `moderation-provider.factory.spec.ts` (10), `verification-decision.spec.ts` (31). |
| **Real provider validation** | **BLOCKED.** There is no `AWS_REGION` and there are no credentials in this environment (`apps/api/.env.example:207,213-214` are blank placeholders). **No call has ever reached AWS.** Latency, cost per photo, real label distributions and real threshold tuning are all unmeasured. |

**A unit-tested adapter is NOT a validated integration.** Those two rows must never be reported as
one. The fixtures follow the published `DetectModerationLabels` / `DetectLabels` reference and prove
that *our mapping of a documented response shape* is correct; they prove nothing about how the
vendor actually behaves, what it costs, how long it takes, or what its labels look like on real
Tamil Nadu emergency photography. Because no provider is configured, the shipped behaviour in every
environment today is `UnconfiguredModerationProvider` → `not-configured` → REVIEW for **100% of
photos** (`unconfigured-moderation.provider.ts:30-48`). Nothing in this system has ever produced an
automated `pass` from a real analysis.

**Every threshold default in this ADR is a reasoned starting value, not an observed one.**

### Format and size limits are narrower than avatars — on purpose

**Status: Implemented.** Report photos accept **JPEG and PNG only** (Rekognition reads nothing
else) and **4 MB**, under the provider's 5 MB raw-bytes ceiling so a re-encode cannot cross it.
Dimensions must be 80–10,000 px on both axes
(`apps/api/src/uploads/report-photo-limits.ts:23,36,39,42`).

**Avatars and mission-completion photos are unaffected.** They keep `POST /uploads`, still accept
WebP, have no verdict, and are legitimately public on arrival. That is why report photos got a
sibling route (`apps/api/src/uploads/report-photo.controller.ts:1-13`) rather than a `purpose` flag
on the shared one — one handler branching on which rules apply is how the stricter branch
eventually gets skipped.

### Duplicate detection covers a bounded recent window

**Status: Implemented, with a deliberate coverage limit.** Exact matches use an indexed SHA-256
lookup over the whole table. Near-duplicates use a 64-bit dHash compared by Hamming distance —
which SQL cannot do without a bit-distance function — so the candidate set is **the most recent 500
non-rejected uploads**, compared in application code
(`apps/api/src/moderation/photo-verification.service.ts:185-224`, the bound at `:212`). Rejected
uploads are excluded from both lookups (`:197,210`), so a reporter's second, legitimate attempt is
not sent to a moderator because their first attempt failed.

A reused stock photo is overwhelmingly likely to be recent, and an unbounded scan would grow with
the table forever. **A stock photo first seen 501 uploads ago will not be caught.** That is a known
limit, not an oversight. A duplicate match is also only ever a REVIEW signal — never a REJECT, and
never a sanction (`verification-decision.spec.ts:308`).

### `captured_live` is still an unverified client assertion

**Status: Not Implemented.** BR-1's "live-captured" flag remains exactly what it was: a boolean the
client asserts, written unconditionally as `PHOTO_CAPTURE_UNVERIFIED` and **read by nothing**
(`apps/api/src/reports/report-photos.ts:25`, the caveat at `:1-24`). Verification answers "is this image safe and
roughly relevant". It says nothing about whether a camera or a gallery produced it. **Do not read
`captured_live` as provenance.**

## How it behaves when things go wrong

| Situation | Behaviour | Status |
|---|---|---|
| Provider times out (default 8 s for both calls, which run concurrently) | REVIEW, stored as `failed` | **Implemented** — `moderation-thresholds.ts:165-169`; `rekognition-moderation.provider.ts:68-71`; `photo-verification.service.ts:109-113` |
| Throttled / over quota | REVIEW, classified `throttled` (transient — worth a retry) | **Implemented** — `rekognition-moderation.provider.ts:168-190` |
| Provider refuses the image (too large, unreadable) | REVIEW, classified `rejected-image` (permanent — retry is pointless) | **Implemented** — same |
| Auth failure, network failure, malformed 200 | REVIEW, classified `provider-error` / `invalid-response` | **Implemented** — same |
| No credentials configured | REVIEW for **every** photo, classified `not-configured`, with one warning per process — never per upload | **Implemented** — `unconfigured-moderation.provider.ts:24-48`; tests `moderation-provider.factory.spec.ts:89,108`. **This is the state of every environment today** — see "Real AWS validation" above |
| No credentials **and** `NODE_ENV=production` | **The API refuses to boot.** | **Implemented** — `moderation-provider.factory.ts:43-50`; tests `moderation-provider.factory.spec.ts:44,53,63` |
| A provider throws | Cannot happen by contract; every failure returns `unavailable` and the reason, never an exception | **Implemented** — `image-moderation-provider.interface.ts:10-20`; test `rekognition-moderation.provider.spec.ts:281` |

The production hard-block deserves its own note, because its failure direction is the opposite of
the push module's. An unconfigured *push* silently under-protects — nothing is sent. An
unconfigured *moderation* over-protects — nothing is published. The app keeps accepting reports and
quietly stops publishing them, which an operator experiences as "the app is broken" with nothing
anywhere naming the cause. `ModerationModule` registers the factory as a `useFactory` so Nest runs
it eagerly at `NestFactory.create()`, turning that into a genuine startup failure rather than a
first-upload failure (`apps/api/src/moderation/moderation.module.ts:6-22`).

`failed` is a distinct stored status from `review_required` on purpose, seeded at
`apps/api/src/db/seed.ts:217-221` and written at `photo-verification.service.ts:123-127`. Both put a
photo in front of a human. Only one tells an operator staring at a full queue that Rekognition is
down rather than that the model is strict.

### The corollary that was got wrong twice: every "awaiting a human" query must cover BOTH

**Status: Implemented (fixed 2026-09-05).** Because there is no provider configured, **100% of the
backlog is `failed`, not `review_required`.** Two queries counted only `review_required`, and both
failed in the most dangerous direction available to a work queue — they said *there is nothing to
do*:

- the queue's default (`awaiting`) filter — a moderator opening Photo Verification saw an **empty
  screen** while every held report in the system sat invisible behind a filter they had no reason
  to change;
- the summary/badge counts — `summary` returned `pendingReview: 0` while `list()` returned rows on
  the same data. Observed live against the running container, not reasoned about.

Both now read one shared constant, `AWAITING_DECISION_STATUS_KEYS = ['review_required', 'failed']`
(`apps/api/src/admin/dto/list-report-photos.dto.ts:69-72`), used at
`admin-report-photos.service.ts:145-147` (list) and `:316` (summary). The two keys stay separately
selectable — telling "the model is flagging things" from "Rekognition is down" is a real diagnostic
need — but the **default** has to be the union, or the default is a lie. The sidebar badge derives
from the same number (`apps/admin/src/config/nav-badges.ts:93-100`). Regressions:
`admin-report-photos.service.spec.ts:854` ("counts photos whose verification FAILED, not just those
flagged"), `:870` ("agrees with the queue the badge actually opens"), `:897`, `:975`.

> The stale docblock above `summary()` (`admin-report-photos.service.ts:277-278`) still describes
> `pendingReview` as "status `review_required`". The **code** below it is correct; the comment is
> not. Raised as issue 30 in [`docs/_audit/issues.md`](../_audit/issues.md) — this document does not
> edit application code.

## Thresholds

Every number is env-configurable, documented in `apps/api/.env.example`, and read fresh per call
(`moderation-thresholds.ts:17-27,119-170`). A bad value — NaN, negative, blank — falls back to the
documented default rather than disabling a rule, because a threshold of NaN compares false against
everything.

| Env var | Default | Effect |
|---|---|---|
| `AI_MODERATION_MIN_CONFIDENCE` | 50 | `MinConfidence` sent to Rekognition |
| `MODERATION_REJECT_EXPLICIT` | 80 | REJECT — high bar; no human overrules a REJECT |
| `MODERATION_REJECT_HATE_SYMBOLS` | 80 | REJECT |
| `MODERATION_REJECT_UNUSABLE_QUALITY` | 12 | REJECT only if sharpness **and** brightness are both below it — a dark-but-sharp night photo publishes, because night is when help is needed |
| `MODERATION_REVIEW_NON_EXPLICIT_NUDITY` | 60 | REVIEW |
| `MODERATION_REVIEW_SWIMWEAR` | 75 | REVIEW — higher than partial nudity, because a water rescue is a real case |
| `MODERATION_REVIEW_GRAPHIC_VIOLENCE` | 80 | REVIEW |
| `MODERATION_REVIEW_GRAPHIC_VIOLENCE_GORE_ONLY` | 92 | The carve-out bar |
| `MODERATION_REVIEW_VISUALLY_DISTURBING` | 70 | REVIEW |
| `MODERATION_REVIEW_WEAPONS` | 70 | REVIEW — a signal, never an accusation |
| `MODERATION_REVIEW_DRUGS` | 70 | REVIEW only; **never a REJECT at any confidence** — the taxonomy bottoms out at "Pills"/"Smoking" and cannot tell prescription medication at a crash site from anything illicit (test `verification-decision.spec.ts:196`) |
| `MODERATION_REVIEW_NON_PHOTOGRAPHIC` | 80 | REVIEW — "this is a drawing", **not** AI-generation |
| `MODERATION_SCENE_LABEL_CONFIDENCE` | 55 | Floor for a scene label to count toward category relevance |
| `MODERATION_DUPLICATE_DISTANCE` | 8 | Max Hamming distance (of 64 bits) treated as a near-duplicate |
| `AI_MODERATION_TIMEOUT_MS` | 8000 | Deadline for the concurrent pair of calls |

`Alcohol`, `Rude Gestures` and `Gambling` are deliberately absent from the taxonomy the engine
reasons about (`moderation-thresholds.ts:29-45`). None of them says anything about whether a
photograph belongs on an emergency-help feed, and routing a roadside beer bottle to a moderator
would waste the queue that real cases need.

**Category relevance** is judged against `report_categories.expected_labels`, seeded per category
(`apps/api/src/db/seed.ts:49-180`). Community Help deliberately has **none** — a broken streetlight,
a flooded lane and a stack of donated books are all legitimate — and `NULL` means "skip the check",
which is a real answer rather than a missing one (`seed.ts:160-165`; test
`verification-decision.spec.ts:276`).

## Storage, retention and audit

| Concern | Status | Detail |
|---|---|---|
| Quarantine directory | **Implemented** | `QUARANTINE_DIR`, default `<cwd>/uploads-pending` — a **sibling** of `UPLOADS_DIR`, never a child, because anything under `UPLOADS_DIR` is served by static middleware (`quarantine-storage.ts:27-36`) |
| Boot-time safety assertion | **Implemented** | `quarantine-storage.ts:47-63` — the check at `:47-61`, invoked unconditionally at `:63` |
| Path-traversal defence on stored filenames | **Implemented** | `quarantine-storage.ts:90-103` — the filename is treated as untrusted even though it comes from our own database column; test `quarantine-storage.spec.ts:90` |
| Promotion to public | **Implemented, with a documented non-atomic fallback** | `rename` first — atomic within one filesystem, so no window exists where a still-refusable photo has a public copy (`quarantine-storage.ts:130-166`). **`EXDEV` falls back to copy-then-delete** (`:141-164`) — see below |
| Per-account upload rate limit | **Implemented** | 20 uploads / 15 min, Redis `INCR`/`EXPIRE`, keyed on the session user id and checked **before** any write or paid call (`apps/api/src/uploads/upload-rate-limiter.ts:26-27,52-63`; 5 tests in `upload-rate-limiter.spec.ts`) |
| Deleting quarantined bytes | **Implemented as a function** | `discardQuarantined()`, idempotent, funnelled through one path-checked deleter (`quarantine-storage.ts:175-197`) |
| **Retention policy / sweep** | **Implemented** | `apps/api/src/uploads/quarantine-retention.ts` — the **filesystem** is the work queue, not the database, because a row outlives its file and a database-driven sweep re-selects already-deleted rows until the batch fills with nothing. `QUARANTINE_RETENTION_DAYS` default 30 (`:79-84`), `QUARANTINE_SWEEP_BATCH` default 200 (`:96`). Driven opportunistically from the upload path under a Redis interval lock (`quarantine-sweep.ts:92-118`), invoked from `report-photo.controller.ts:104` **concurrently with** the verdict call and awaited, never left floating. 17 tests in `quarantine-retention.spec.ts`, 5 in `quarantine-sweep.spec.ts`. |
| **A held photo is never deleted while a human still owes it a decision** | **Implemented** | `decideRetention()` returns `keep: 'awaiting_review'` for any status still awaiting a human with `reviewed_at IS NULL`, **at any age** (`quarantine-retention.ts:145-152`). The clock starts at the **decision**, not the capture — `reviewedAt ?? verifiedAt ?? createdAt` (`:169`) — so a photo held three weeks and rejected yesterday is one day into retention, not twenty-two. Tests `quarantine-retention.spec.ts:67,84,204,221,234,253`. |
| **The record always outlives the file** | **Implemented** | Nothing in `quarantine-retention.ts` writes to `photo_uploads` at all (`:15-20`). The verdict, its reasons, the risk band, the moderator and the timestamps survive the bytes by design. Test `quarantine-retention.spec.ts:269` ("leaves the moderation record intact when it deletes the bytes"). |
| Audit target type + actions | **Implemented** | `report_photo` and `report_photo.approve` / `.reject` / `.request_new` are seeded in `apps/api/src/admin/admin-audit-catalogue.ts:37,381-396` (per ADR 0012, catalogue before endpoint) **and are emitted**, inside the same transaction as the decision (`admin-report-photos.service.ts:517-534`, `:584-594`, `:621-636`). The approve row records `reportReleased` — two identical-looking approvals differ entirely in consequence, and only that field tells them apart afterwards. Test `admin-report-photos.service.spec.ts:422`. |
| Verdict logging | **Implemented** | Ids, verdict, risk, provider and reason codes only — never image content or provider detail (`photo-verification.service.ts:161-166`) |
| What is persisted per upload | **Implemented** | A **summarised** signal set, not the provider's raw response: raw Rekognition output runs to hundreds of labels and carries incidental detail about people in the photograph, which would be a privacy liability with no operational use (`photo-verification-schema.ts:103-111`) |
| Reasons stored as codes, never prose | **Implemented** | Two surfaces render their own wording, and mobile renders it in two languages; a stored sentence would be a third copy that drifts from both (`verification-decision.ts:39-59`) |

### Promotion crosses a filesystem boundary in Docker, and `rename` cannot

**Status: Implemented (fixed 2026-09-05).** `rename(2)` cannot cross a device boundary. In the
deployed shape it always has to: `docker-compose.yml` mounts `UPLOADS_DIR` as the named volume
`uthavu_api_uploads` while `QUARANTINE_DIR` sits on the container's own writable layer. So **every
approval in Docker** raised `EXDEV` and returned a **500** — not an edge case, the normal case.

Unit tests never caught it, and could not have: on a developer's machine both paths are on one disk
and `rename` simply works. It took an end-to-end run against the real container to surface it.

The fallback is copy-then-delete (`quarantine-storage.ts:141-164`), and the asymmetry is deliberate
and one-directional:

- Copy-then-delete is **not atomic** — briefly the bytes exist in both places.
- That is acceptable **only in this direction**, because the database has already committed the
  decision that this photo may be public. A destination that appears slightly before the source
  vanishes is *early*, not *wrong*. A leftover source is swept later by retention.
- **The reverse operation must never be implemented this way.** A public copy lingering after a
  demotion is the exact failure this whole feature exists to prevent.
- Any error that is not `EXDEV` still propagates (`:161`). Tests
  `quarantine-storage.spec.ts:109` (crosses the boundary) and `:138` (does not swallow anything
  else).

`PhotoModerationService.promoteOrRecover()` (`photo-moderation.service.ts:301-307`) adds a second
tolerance on top: the rename runs inside the caller's transaction, so a commit that fails afterwards
leaves the bytes public while the database believes nothing happened. Without the `publicPathFor()`
recheck the retry would find nothing in quarantine and that photo would become **permanently
unapprovable** — a held emergency request no moderator can ever release.

## Notification behaviour

| Moment | What the citizen learns | Status |
|---|---|---|
| Upload finishes | The verdict, **synchronously**, in the `POST /uploads/report-photo` response — `{ uploadId, verdict, reason }`. Deliberately thin: no confidence scores, no provider name, no model version, no label names. A citizen who learns that "Explicit at 79 passes" has learned how to tune a photograph until it does. HTTP **200 for every verdict including reject** — the request succeeded; the photo is what did not (`report-photo.controller.ts:107-112`; `photo-verification.service.ts:19-23,51-56`) | **Implemented** |
| Report submitted and held | The create response returns the report with status `pending_review`. The reporter can see their own held report; nobody else can (`reports.service.ts:222-224`; the `GET /reports/:id` arm at `:295`; tests `report-photo-gate.spec.ts:469,482`) | **Implemented** |
| Reporter views their own held photo | `GET /uploads/report-photo/:id` streams it, ownership enforced in the `WHERE` clause, 404 for "not yours" as well as "not found", `Cache-Control: private, no-store` so a copy cannot outlive the decision (`report-photo.controller.ts:125-158`) | **Implemented** |
| A moderator later approves or rejects | An alert is raised to the reporter — `report_photo_approved`, `report_photo_rejected` or `report_photo_replacement_requested` — in English and Tamil (`apps/api/src/alerts/alert-templates.ts:42-44,99-118,146-160`), routed through the single `AlertsService.create()` chokepoint that also fans out to FCM. Only the *approved* alert carries a `reportId`, because it is the only one whose report a citizen can open (`admin-report-photos.service.ts:793-794,802-821`), and the approval alert is sent **only if the report was actually released** (`:537-545`; test `admin-report-photos.service.spec.ts:399`). | **Implemented** |

### Approval restores a window that moderation outlasted

**Decided 2026-09-05, after the first end-to-end run.** A report whose `expiry_at` passes while it
sits in the moderation queue keeps reading as `pending_review` — the derived-status rule only maps a
*stored* `open` to `expired`, which is correct while it is queued, and which is exactly why the
problem surfaces only at the moment of release.

On approval, if the window has already closed, it is restarted from the approval instant for the
reporter's original duration. The moderation delay belongs to the platform, not to the person who
reported an emergency, and publishing a report that is dead on arrival would make the approval
meaningless while telling nobody.

Approval *inside* the window changes nothing — extending it would contradict BR-2, which permits a
reporter to shorten the category default and never to extend it.

Rejected alternatives: publishing into an already-expired state (honest, but the reporter waited on
us and gets nothing), and refusing the approval outright (same outcome for the reporter, plus a
moderator with no way to act).

**Status: Implemented, for the moderator path only.** `restoredWindow()`
(`photo-moderation.service.ts:386-399`), applied inside the release `update`
(`:209`) — so it fires exactly where `publishIfReady()` moves a report to `open`, and nowhere else.

Precisely what it does:

- **Only when the window had actually closed.** `if (expiryAt.getTime() > now) return {}` (`:391`).
  An approval inside the window returns an empty patch — the reporter's chosen deadline is not
  touched. Extending it would hand out time nobody asked for and quietly contradict **BR-2**, which
  lets a reporter *shorten* the category default and never extend it.
- **The reporter's original duration, not the category's.** `expiry_at − created_at` (`:393`), which
  is why `publishIfReady()` reads both columns (`:183-184`). Somebody who deliberately chose a
  two-hour window for a fast-moving situation gets two hours from approval, not the category's
  twelve.
- **Clamped.** A non-positive stored window should be impossible, but it falls back to one hour
  rather than emitting a timestamp in the past and re-creating the exact bug (`:397`).

Covered in both directions and at the boundary by `admin-report-photos.service.spec.ts:210`
(restored when expired), `:243` (untouched when not), and three worked clock cases at `:289`, `:300`
and `:312`.

> **⚠️ This does NOT cover the citizen path.** `replaceHeldPhotos()` sets the report to `open`
> directly (`reports.service.ts:926-932`) without calling `publishIfReady()` and without applying
> `restoredWindow()`. A report that expired while held therefore publishes into an already-expired
> state when the **reporter** resolves it by sending a replacement photo — the exact outcome this
> rule exists to prevent when a **moderator** resolves it. Recorded as a gap, not resolved: closing
> it is a code change. Issue 28 in [`docs/_audit/issues.md`](../_audit/issues.md).

## Consequences

**Positive**

- The trust signal is now real. A photo on a published report has been format-verified, decoded,
  fingerprinted and content-checked, and a client cannot assert any part of that.
- The speed promise survives. A clean photo publishes with no human in the loop.
- The failure mode is safe by construction. Every way this can break holds a photo; none of them
  publishes one.
- The gore carve-out means the product still does its actual job. Injury photography publishes.
- **Four** write paths into `report_photos` now share one gate instead of four separate checks, and
  all four bind the verdict to the category the report is actually filed under. The single-gate
  shape is what made the category bypass fixable in one function rather than four.
- The reporter can now act on "please send another photo" (`PUT /reports/:id/photos`). Before it,
  the alert was correct copy for behaviour that did not exist.
- The machine verdict, the human decision and the publication state are three separate facts in
  three separate places, and none of them overwrites another. Years from now the record still says
  *"the model was uncertain and a person approved it"*, which is the only sentence worth keeping.
- Held reports vanish from citizen surfaces on **writes** as well as reads, because the predicate
  was widened rather than added alongside — every existing caller was fixed by one line changing.

**Negative**

- **A report can now fail to publish for a reason its reporter did not cause**, in an emergency.
  A Rekognition outage means every report is held. That is the deliberate trade, and it is the
  worst thing about this feature.
- **Every held report costs a moderator.** The queue's consumer now exists
  (`GET /admin/report-photos` + approve / reject / request-new), but it is human throughput, and
  nothing in this decision bounds how much of it a bad threshold can consume.
- **A moderator's approval does not necessarily publish anything.** A report is released only when
  *every* outstanding photo on it is resolved and none was refused, under a row lock the caller must
  hold — without which two moderators approving the last two photos concurrently would each read
  the other's as still pending and the report would be released by **neither**
  (`apps/api/src/moderation/photo-moderation.service.ts:166-171,173-214`). Correct, and a real source of
  "I approved it and nothing happened".
- Two paid API calls per photo, on a path a citizen can trigger 20 times per 15 minutes. The rate
  limiter bounds it; the real cost is unmeasured because no call has reached AWS.
- Every threshold is a guess until production data exists. The likely first discovery is that the
  queue fills with something nobody predicted.
- REJECT has no appeal path. A false REJECT tells a citizen with a real emergency to take another
  photograph, with no human able to overrule it. This is why the REJECT bars are set high and why
  drugs and duplicates can never cause one.
- The retention sweep runs **inside a citizen's upload request**, because this API has no scheduler.
  Its worst case is somebody's latency during an emergency; the batch cap and the interval lock
  bound it, and it is overlapped with the provider round-trip so it usually costs nothing
  (`report-photo.controller.ts:99-105`), but the shape is a compromise, not a design.
- **Nothing in this feature has ever run against a real provider.** With no credentials the shipped
  behaviour is REVIEW for 100% of photos, which means the *only* code path exercised end-to-end is
  the one with a human in it — the expensive one. The fast path the whole asymmetry exists to
  protect has never actually been observed working.
- **`PUT /reports/:id/photos` has no client.** The endpoint, its gate, its detach semantics and its
  tests all exist; nothing in `apps/mobile` or `libs-mobile` calls it. A reporter receives
  `report_photo_replacement_requested` and, in the app as built today, still cannot act on it.
  Issue 29 in [`docs/_audit/issues.md`](../_audit/issues.md).
- **Two ways out of `pending_review` do not agree about the expiry window.** The moderator path
  restores it; the citizen replacement path does not. Issue 28.

**Neutral**

- `report_photos.upload_id` is nullable, and the null case is meaningful: ~251 pre-existing rows
  have no verification record, and backfilling one would assert a check that never happened.
- Verification lives in its own table rather than as columns on `report_photos`, because
  `report_photos.report_id` is `NOT NULL` and verification must happen *before* a report exists —
  otherwise the gate is not a gate (`photo-verification-schema.ts:1-20`).
- `pending_review` and `rejected` are first-class effective statuses, not special cases bolted on
  at the edges (`apps/api/src/reports/report-effective-status.ts:66-87`).

## Alternatives considered

- **Keep BR-5 literally: publish everything, moderate reactively.** Rejected. Reactive moderation
  on a public consumer product with anonymous posting means the worst possible image is visible to
  every nearby citizen for however long it takes someone to flag it. The asymmetric gate keeps
  BR-5's *intent* while closing that window.
- **Hold every report for human review.** Rejected outright — it is the product failure BR-5 was
  written to prevent, and at any real volume the queue becomes a rubber stamp, which is worse than
  no review because it looks like review.
- **Approve when moderation is unavailable ("fail open").** Rejected. This is the single specific
  bypass the whole feature exists to prevent, and it has its own regression test
  (`verification-decision.spec.ts:340`). A photo nothing examined is not a safe photo; it is an
  unexamined one.
- **Publish the photos that passed and hold the rest.** Rejected. A report is one artefact — title,
  location and pictures together — and publishing three of four photos puts a partially-moderated
  emergency in front of volunteers while a moderator is still deciding about the fourth
  (`reports.service.ts:217-224`).
- **A dev-mode stand-in that fabricates a plausible analysis** (the shape ADR 0007 used for OTP).
  Rejected: there is nothing useful to print and a fabricated verdict is worse than useless. The
  stand-in reports honestly that it analysed nothing.
- **Let the client send the verdict alongside the photo.** Rejected — it is not a gate if the thing
  being gated writes the answer.
- **Add a `purpose` flag to the existing `POST /uploads`.** Rejected: one handler branching on
  which rules apply is how the stricter branch eventually gets skipped. Report photos got a sibling
  route.
- **Judge graphic violence on the parent label's confidence.** Rejected — it holds every injury
  photograph the product exists to carry. This is the carve-out's entire reason for existing.
- **A second provider for cross-checking, or an AI-generated-image detector.** Rejected for v1.
  Rekognition offers no synthetic-image detection at all, so a "detector" would have to be a
  different vendor, a second bill, a second failure mode and a second set of thresholds to tune —
  before the first one has ever been run against real traffic.
- **Store the provider's raw response.** Rejected: hundreds of labels plus incidental detail about
  people in the photograph, for no operational benefit over the banded summary.

## Evidence in code

*Line numbers are against the **uncommitted working tree** at `HEAD = 15136b5`. The feature is
**0 commits** — checking out that commit reproduces none of this. Every citation below was re-read
on 2026-09-05.*

**The gate**

- `apps/api/src/reports/report-photo-attachment.ts:1-14` — why the currency changed from URLs to ids.
- `report-photo-attachment.ts:52-75` — `resolveUploads()`'s signature, and the `expectedCategoryId` warning that names the bypass it closes.
- `report-photo-attachment.ts:87-102` — ownership and `report_id IS NULL` in the `WHERE`, so a row that is not attachable is never fetched.
- `report-photo-attachment.ts:104-112` — one indistinguishable `PHOTO_NOT_VERIFIED`.
- `report-photo-attachment.ts:114-132` — the already-adjudicated guard, and why detaching made it necessary.
- `report-photo-attachment.ts:134-141` — `PHOTO_REJECTED`, no report created.
- `report-photo-attachment.ts:143-159` — `holdForReview`: not-`pass` **or** category switch.
- `report-photo-attachment.ts:174-182` — `assertAllPassed()`, the post-publish gate.
- `report-photo-attachment.ts:192-218` — `publishUploads()`, called only after the row exists.
- `report-photo-attachment.ts:220-242` — `detachUploadsFrom()`, and why `requestNew` forces it.
- `apps/api/src/reports/reports.service.ts:200-224` — the create-path gate and the `pending_review` branch.
- `reports.service.ts:246-264` — link always, publish only on pass.
- `reports.service.ts:281-296` — `findOne()`: a held report is readable by its reporter and by nobody else.
- `reports.service.ts:673-706` — the full-replace edit path, judged against the report's category.
- `reports.service.ts:711-753` — `addPhoto()`, same.
- `reports.service.ts:850-936` — `replaceHeldPhotos()`, the reporter's answer to "send another".
- `apps/api/src/reports/reports.controller.ts:107-128` — `PUT /reports/:id/photos`.
- `apps/api/src/reports/report-visibility.ts:33-49,75` — pre-publication statuses folded into `notRemoved`.
- `apps/api/src/reports/dto/create-report.dto.ts:41` — `photoUploadIds`, and why it is not `photoUrls`.
- `apps/api/src/reports/dto/replace-held-photos.dto.ts:10-19` — full set, never a delta.

**The pipeline**

- `apps/api/src/moderation/photo-verification.service.ts:1-23` — the eight-step order, which *is* the security model.
- `photo-verification.service.ts:84-91` — not an image: no row, no file.
- `photo-verification.service.ts:122-129` — `failed` vs `review_required`, and why they are different rows.
- `photo-verification.service.ts:161-173` — what is logged, and what the citizen is told.
- `photo-verification.service.ts:185-224` — duplicates: exact over the whole table, near over the recent 500.
- `apps/api/src/uploads/image-inspection.ts:86-124` — size → magic bytes → decode → dimensions.
- `apps/api/src/uploads/decode-image.ts:42-58` — format-directed decode; the decoder's own error is discarded because it is generated from attacker-controllable bytes.
- `apps/api/src/uploads/perceptual-hash.ts:1-33` — dHash, and why a match is a signal rather than a verdict.
- `apps/api/src/uploads/quarantine-storage.ts:27-36` — sibling, never child.
- `quarantine-storage.ts:39-66` — the boot assertion.
- `quarantine-storage.ts:90-103` — one path-escape check, shared by every caller.
- `quarantine-storage.ts:130-166` — promotion, and the `EXDEV` fallback the container forced.
- `apps/api/src/uploads/upload-rate-limiter.ts:26-27,52-63` — the spend bound.
- `apps/api/src/uploads/report-photo-limits.ts:23,36,39,42` — every limit, traced to Rekognition's published quotas.
- `apps/api/src/uploads/report-photo.controller.ts:58-112` — upload, rate limit, concurrent sweep, 200-for-every-verdict.
- `report-photo.controller.ts:125-158` — the reporter's own-photo read, ownership in the `WHERE`, `private, no-store`.

**The decision**

- `apps/api/src/moderation/image-moderation-provider.interface.ts:10-20` — a provider never decides and never throws.
- `apps/api/src/moderation/verification-decision.ts:19-22` — what this function does **not** claim.
- `verification-decision.ts:39-59` — reasons are codes, never prose.
- `verification-decision.ts:146-168` — unavailable → REVIEW, and `riskLevel: null`.
- `verification-decision.ts:177-314` — the whole policy, pure and testable without an AWS account.
- `verification-decision.ts:205-232` — the gore carve-out, judged on which children fired.
- `apps/api/src/moderation/moderation-thresholds.ts:29-45` — the taxonomy, and the three L1 categories deliberately left out.
- `moderation-thresholds.ts:54-79` — `EMERGENCY_EXPECTED_LABELS`, and the non-photographic content types.
- `moderation-thresholds.ts:119-171` — every configurable number, read fresh per call.
- `apps/api/src/moderation/rekognition-moderation.provider.ts:19-23` — what Rekognition cannot do, including illegal content.
- `rekognition-moderation.provider.ts:64-156` — the two calls, one deadline, concurrent.
- `rekognition-moderation.provider.ts:168-190` — failure classification: transient vs permanent.
- `apps/api/src/moderation/unconfigured-moderation.provider.ts:1-48` — it does not approve anything, and warns once per process.
- `apps/api/src/moderation/moderation-provider.factory.ts:33-52` — one provider key, and the production hard-block.
- `apps/api/src/moderation/moderation.module.ts:6-22` — eager instantiation, so the block fires at boot.

**The human half**

- `apps/api/src/admin/admin-report-photos.controller.ts:48-155` — `GET /admin/report-photos`, `GET summary`, `GET :id`, `GET :id/file`, `POST :id/approve`, `POST :id/reject`, `POST :id/request-new`. The `/file` route is a security boundary, not a convenience (`:39-46`).
- `apps/api/src/admin/dto/list-report-photos.dto.ts:69-72` — `AWAITING_DECISION_STATUS_KEYS`, the one constant both the queue and the badge read.
- `apps/api/src/admin/admin-report-photos.service.ts:136-152` — the resting filter, covering `review_required` **and** `failed`.
- `admin-report-photos.service.ts:292-334` — the summary: three aggregates, one scan, both statuses.
- `admin-report-photos.service.ts:477-548` — approve, in one transaction: row lock → claim → `publishIfReady` → audit; alert only if the report was actually released; relevance deliberately not re-derived.
- `admin-report-photos.service.ts:550-598` — reject; **the file is deliberately not deleted**, because a rejection is the decision most likely to be appealed and the bytes are the evidence.
- `admin-report-photos.service.ts:600-645` — request-new; the report's status is not written **at all**, and that absence is the point.
- `admin-report-photos.service.ts:663-697` — `claim()`: the human decision beside the machine verdict, never over it, with the stale-decision race closed in the `WHERE`.
- `apps/api/src/moderation/photo-moderation.service.ts:1-42` — why publication happens at release, not at approval.
- `photo-moderation.service.ts:100-147` — `standingFor()`: computed from the status, never from `decision`.
- `photo-moderation.service.ts:149-214` — `publishIfReady()`, its four conditions, and the caller-held row lock.
- `photo-moderation.service.ts:285-307` — `promoteOrRecover()`, so a failed commit cannot make a photo permanently unapprovable.
- `photo-moderation.service.ts:358-399` — `restoredWindow()`, PV-17.
- `apps/api/src/uploads/quarantine-retention.ts:1-40` — why the filesystem drives the sweep.
- `quarantine-retention.ts:138-183` — `decideRetention()`: held photos are never swept, and the clock starts at the decision.
- `apps/api/src/uploads/quarantine-sweep.ts:24-40,92-125` — the Redis interval lock, and why it never throws.
- `apps/api/src/alerts/alert-templates.ts:42-44,99-118,146-160` — the three verdict alerts, English and Tamil.
- `apps/admin/src/features/report-photos/` — the console: queue table, detail, review actions, reason copy, summary cards.
- `apps/admin/src/config/nav-badges.ts:82-100` — the sidebar badge, from the same number the queue lists.

**The data**

- `apps/api/src/db/schema/photo-verification-schema.ts:1-20` — why a separate table.
- `photo-verification-schema.ts:83` — `category_id`: the question the verdict answered.
- `photo-verification-schema.ts:98-111` — the machine's columns: `decision`, `risk_level`, `reasons`, the summarised `signals`.
- `photo-verification-schema.ts:126-137` — `report_id`, and the human's columns.
- `apps/api/drizzle/0025_faithful_wind_dancer.sql` — `photo_uploads`, `photo_verification_statuses`, `report_photos.upload_id`, `report_categories.expected_labels`. **Migration head**, `apps/api/drizzle/meta/_journal.json` idx 25.
- `apps/api/src/db/seed.ts:207-221` — the two new report statuses and the five verification statuses.
- `apps/api/src/db/seed.ts:49-180` — per-category `expectedLabels`, including Community Help's deliberate absence at `:160-165`.
- `apps/api/.env.example:127-258` — every quarantine, retention and moderation variable, with its default.

## Verification status

*Everything in this section is a recorded result from the run of 2026-09-05. Nothing here is
projected, rounded up, or inferred from a partial run.*

### What was run, and what it returned

| Check | Result |
|---|---|
| `apps/api` — unit + integration | **921 tests, 57 suites**, all passing |
| `apps/api` — typecheck | clean |
| `apps/api` — lint | clean |
| `apps/admin` — tests | **94 tests, 3 files**, all passing |
| `apps/admin` — typecheck | clean |
| `apps/admin` — lint | clean |
| `apps/mobile` — typecheck | clean |
| `apps/mobile` — tests | **No test runner exists in this package.** `package.json` has `dev`, `start`, `android`, `ios`, `web`, `test:e2e`, `test:e2e:flow` — and no `test`. There is no unit or component suite to run |
| Live HTTP end-to-end, against the running container | **31/31** |
| Journey B (moderator rejects) and Journey C (request-new → citizen replacement → publish) | **20/20** |
| Security regression | **107 assertions, 0 failures** — this is the run that found the category bypass documented above, which was then fixed |

**The three live runs are not reproducible from this repository.** The HTTP E2E, journey and
security-regression scripts were written and executed against the running container and are **not
committed** — nothing under `scripts/`, `apps/api/test/` or `apps/mobile/.maestro/` corresponds to
them. The numbers are a record of what happened on 2026-09-05, not a suite anybody can re-run today.
Treat them accordingly.

### What is NOT proven

| Capability | Status | Why |
|---|---|---|
| Real AWS Rekognition validation | **BLOCKED** | No `AWS_REGION`, no credentials, no call has ever reached AWS. **A unit-tested adapter is not a validated integration.** |
| Manipulation / AI-generated image detection | **Not Implemented** | Rekognition has no such capability. `ContentTypes` is a *"this is not a photograph"* signal and must never be described as synthetic-image detection |
| OCR / text-in-image | **Not Implemented (deferred by choice)** | `DetectText` exists, is not called, and adds cost plus a real privacy surface for no v1 benefit |
| A second AI provider | **Not Implemented (settled scope decision)** | Rekognition is the only external provider for v1. No OpenAI, no Gemini, no Claude Vision, no ensemble |
| Mobile runtime | **PARTIALLY PROVEN — capture step blocked by simulator** | The client typechecks, and it now runs: an iOS simulator (`iPhone 16 Pro`, iOS 18.5) with Maestro 2.9.0 is available. Flow 01 (OTP login) **passes**. Fixture seeding and `-e` multi-word substitution are **measured, not assumed** — a 40-character multi-word title containing Tamil and punctuation survives intact and was DB-verified as `open`. **The capture step is expected to be blocked**: a simulator has no camera, so the one path this feature is actually about cannot execute there. Verification is **in progress and incomplete** |
| Admin console browser runtime | **NOT PROVEN** | The console's units pass and it typechecks. **No page has been driven in a browser against live data** |
| Maestro E2E flows | **Partially run — not yet green end to end** | Flow 01 passes. Flows 02–04 have **not completed end to end**: 02 needs a camera capture the simulator cannot provide, and 03/04 depend on seeded reports whose seeding now works but whose full run has not been observed. Treat the suite as **unrun end to end** until all four are green |
| `captured_live` provenance | **Not Implemented** | Still an unread client assertion |
| Production readiness | **NOT YET** | Provider validation blocked; admin browser runtime unproven; mobile runtime only partially proven with the capture step unexercised; Maestro not green end to end; two open gaps (issues 28 and 29) |

### The dev database still holds verification fixtures

`uthavu_dev` currently contains rows created by the runs above — reports and uploads prefixed
`E2E-PV`, `SEC-REG` and `SEC-FU`, plus the Maestro fixture reports (`Maestro accept test`,
`Maestro complete test`, seeded by `apps/mobile/.maestro/scripts/seed-fixture.mjs`).

**A decision is needed before sign-off, and this document does not make it:**

- keep them as **permanent fixtures**, in which case they need a documented naming convention and
  the admin queue needs to be readable with them present; or
- **clean them before sign-off**, in which case the E2E scripts need to be committed first, or the
  ability to recreate them is lost with them.

Doing neither leaves a moderation queue whose contents nobody can tell apart from real citizen
reports, which is the worst of the three.

### Tests, by suite

*The moderation-specific suites, all runnable with no external service:*

- `apps/api/src/moderation/verification-decision.spec.ts` — 31 cases over the policy, including the carve-out (`:78,89,97,107`), quality on both axes (`:158,166`), drugs never rejecting (`:196`), a broad category skipping relevance (`:276`), duplicates never rejecting (`:308`) and all six unavailable reasons (`:314-338`, and `:340` for the fail-open regression).
- `apps/api/src/moderation/rekognition-moderation.provider.spec.ts` — 13 cases over response mapping and failure classification, against recorded shapes. `:281` — never throws, never leaks the provider error.
- `apps/api/src/moderation/moderation-provider.factory.spec.ts` — 10 cases including the production block (`:44,53,63`) and warn-once (`:108`).
- `apps/api/src/uploads/image-inspection.spec.ts` — 13 · `perceptual-hash.spec.ts` — 9 · `quarantine-storage.spec.ts` — 11 (including `:109` and `:138`, the `EXDEV` pair).

*The suites that need PostgreSQL or Redis, and now run in CI:*

- `apps/api/src/reports/report-photo-gate.spec.ts` — **29 cases** walking the gate in through every door, including five on category binding (`:324,374,396,423,448`) and six on `PUT /reports/:id/photos` (`:545-681`).
- `apps/api/src/admin/admin-report-photos.service.spec.ts` — **50 cases**, including the PV-17 clock table (`:289,300,312`), the audit-trail invariant (`:341`), the concurrency race (`:738`), and the queue/summary agreement (`:854,870,897`).
- `apps/api/src/uploads/quarantine-retention.spec.ts` — 17 · `quarantine-sweep.spec.ts` — 5 · `upload-rate-limiter.spec.ts` — 5.
- `apps/admin/src/features/report-photos/report-photos.test.ts` — part of the console's 94.

---

*Captured 2026-09-04 and brought to ground truth 2026-09-05, both against the working tree at
`HEAD = 15136b5` with the implementation still uncommitted — **0 commits**, so no `path:line` here
is reproducible from the commit's contents. The 2026-09-05 pass re-read every citation; a
substantial number had drifted and were corrected, and five capabilities that had landed since the
first draft (category binding on all four attach paths, `PUT /reports/:id/photos`, the `EXDEV`
promotion fallback, the `review_required` + `failed` queue filter, and `risk_level = NULL`) were
added. Two gaps were found and recorded rather than resolved — issues 28 and 29 in
[`docs/_audit/issues.md`](../_audit/issues.md).*

*Corrected later on 2026-09-05, after two facts changed under this document: the API suite is
**921** tests, not 915; and an iOS simulator (`iPhone 16 Pro`, iOS 18.5) with Maestro 2.9.0 **is**
available, so mobile runtime moved from "not proven" to **partially proven**. The capture step
stays unexercised — a simulator has no camera, and capture is the one thing this feature is about,
so a green flow 01 must not be read as a proven pipeline.*

*Recorded now rather than later because the asymmetry — and the specific things this system cannot
do — are exactly what a later reader will otherwise assume wrongly.*
