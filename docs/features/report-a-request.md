# Feature: `report-a-request`

- **Status:** agreed
- **Milestone:** v0.1
- **Owner:** TBD

## Problem

People spot situations that need help — an injured animal, surplus food about to go to waste, a
stranded motorist, an urgent blood requirement, an elderly neighbour needing an errand — but have
no fast, trustworthy channel to alert nearby people who could act. Social media isn't
location/urgency-aware; calling around is slow. Reporting has to be fast (under a minute) and
carry enough trust signal (a real photo) that people act on it, without adding friction that
stops a genuine emergency from being posted.

## Users & roles

| Role | What they can do here |
|---|---|
| Citizen (authenticated) | Create, edit (limited), and close their own reports |
| Admin/Ops | Create Disaster Relief reports (the one category citizens can't self-report) |

## User stories

### US-1 — Pick a category

As a **citizen**, I can **select a help category** so that **my report carries the right urgency
profile and expiry**.

- **AC1:** Given I open the report flow, when I view categories, then I see 8 selectable options
  — Animal Rescue, Medical Help, Food Donation, Roadside Help, Elderly Support, Blood Donation,
  Community Help, Lost & Found. Disaster Relief is **not** in this list (BR-3).
- **AC2:** Given I select a category, when I proceed, then that category's default expiry (BR-2)
  is pre-filled — I can shorten it but not extend past the category max.

### US-2 — Attach a photo

As a **citizen**, I can **attach a live-captured photo** so that **my report is trustworthy**.

- **AC1:** Given I'm on the photo step, when I try to submit without a photo, then I'm blocked
  with a "photo required" error.
- **AC2:** Given I try to attach an existing gallery image, when I do, then it's rejected — only
  in-app camera capture is accepted (BR-1).
- **AC3:** Given I've attached the max of 4 photos, when I try to add a 5th, then the option is
  disabled.

### US-3 — Set location

As a **citizen**, I can **confirm my location and optionally add a landmark** so that **nearby
volunteers can find the situation**.

- **AC1:** Given I reach the location step, when it loads, then my current GPS position is
  pre-filled and I can adjust the pin.
- **AC2:** Given I add a landmark description, when I submit, then it's stored as a
  human-readable helper alongside lat/lng — never a replacement for the coordinates in matching
  (BR-4).

### US-4 — Set privacy options

As a **citizen**, I can **choose to post anonymously and control phone visibility** so that **I
control what's exposed about me**.

- **AC1:** Given I toggle "Post anonymously," when I submit, then my name, photo, and profession
  are hidden from the public report card.
- **AC2:** Given I leave phone visibility off (the default), when a volunteer accepts, then my
  phone number stays hidden unless I've explicitly opted to reveal it to accepted volunteers.

### US-5 — Publish

As a **citizen**, I can **publish my report** so that **it's visible to nearby users
immediately**.

- **AC1:** Given I submit a complete report **whose photos all passed verification**, when the API
  accepts it, then it's immediately visible to nearby users within their radius — no moderation
  delay (BR-5 as amended).
- **AC1a:** Given a photo was held for review, when I submit, then the report is created but is
  **not public** (`pending_review`) and only I can see it — see
  [ADR 0014](../decisions/0014-photo-verification-publication-gate.md).
- **AC1b:** Given a photo was rejected, when I try to attach it, then **no report is created** and
  I'm asked to capture another. *(Added 2026-09-04 by ADR 0014.)*
- **AC2:** Given I submit with a missing required field, when I try to publish, then I see
  field-level validation errors and nothing is created.

### US-6 — Edit or close a published report

As a **reporter**, I can **make limited edits to my open report, or close it early** so that **I
can correct/add detail or stand it down once it's no longer needed**.

- **AC1:** Given my report is still open, when I edit the description or landmark, or add more
  photos, then the changes save and are visible immediately.
- **AC2:** Given I try to change the category or location after publishing, when I attempt it,
  then it's rejected (BR-6) — I'd need to close this report and create a new one instead.
- **AC3:** Given I no longer need help, when I manually close my report, then it stops appearing
  in other users' Discover results.

## Business rules

- **BR-1:** A report requires at least one live-camera-captured photo (max 4) — gallery-picked
  images are rejected. This is the report's primary trust signal; a report claiming a real
  situation needs real, freshly-captured proof.
- **BR-2:** Each category has a default expiry after which an unaccepted report auto-closes:
  **Blood Donation 4h · Medical Help 6h · Roadside Help 6h · Animal Rescue 12h · Food Donation
  12h · Elderly Support 24h · Lost & Found 72h · Community Help 72h.** The reporter may shorten
  the expiry but never extend past the category default.
- **BR-3:** Disaster Relief is **not** citizen-selectable — created/broadcast by admins only, per
  the product's "managed centrally" model, since it needs a coordinated, verified response rather
  than crowd-sourced reports.
- **BR-4:** Live GPS coordinates are the authoritative location for nearby-matching. A landmark
  text field is a human-readable helper only — same principle as Auth's BR-4 for city/district.
- **BR-5:** Reports publish immediately on submission — no pre-publish moderation gate. An
  emergency-help product can't hold real help behind a review queue. Moderation is reactive:
  flagging can hide/remove a live report after the fact (a separate `moderation` feature).

  > **⚠️ AMENDED — partially superseded by
  > [ADR 0014](../decisions/0014-photo-verification-publication-gate.md) (2026-09-04).**
  > Server-side photo verification now runs **before** publication, so the literal claim above —
  > "no pre-publish moderation gate" — is no longer true. What survives is BR-5's *intent*: a
  > **PASS publishes immediately with no human step and no queue**, exactly as this rule requires.
  > The gate is asymmetric — only a photo the automated check could not clear (`REVIEW`) creates a
  > non-public `pending_review` report for a moderator, and a `REJECT` creates no report at all.
  > Reactive moderation is unchanged and still applies to live reports. Read BR-5 together with
  > ADR 0014; do not read either alone.
- **BR-6:** Once published, a reporter may edit description and landmark, and add (never remove)
  photos, and may manually close the report early. Category and location are immutable after
  publish, protecting volunteers who already responded to the request's original terms.

## Data touched

| Table | New / changed | Notes |
|---|---|---|
| `reports` | new | `category`, `title`, `description`, `urgency`, `expiry_at`, `anonymous`, `phone_visible`, `share_ngo`, `lat`, `lng`, `landmark`, `status`, `reporter_id` (FK → `user`), `created_at`, `closed_at` |
| `report_photos` | new | `report_id` (FK), `url`, `captured_live` flag, `created_at` — one row per photo, up to 4. **Since ADR 0014:** also `upload_id` (FK → `photo_uploads`, nullable — null means the row predates verification) |
| `photo_uploads`, `photo_verification_statuses` | new (ADR 0014) | The quarantine + verdict record a photo needs *before* a report exists. See [`photo-verification.md`](./photo-verification.md) |

**Invariants this introduces:** a report has ≥1 photo at creation (BR-1) — enforced at the DTO
layer (`photoUploadIds` is `.min(1).max(4)`, `apps/api/src/reports/dto/create-report.dto.ts:41-44`)
and again at the attach gate (`report-photo-attachment.ts:52-57`). `expiry_at` is computed
server-side from category + reporter's chosen (or default) duration, never trusted from a raw
client-supplied timestamp.

**RESOLVED — the "live-captured" enforcement gap.** The original question here was *"decide during
Stage 5 whether this needs EXIF/metadata checking or stays trust-based for v0.1."* The answer is
**neither: it became server-side content verification instead.** See
[ADR 0014](../decisions/0014-photo-verification-publication-gate.md) and
[`photo-verification.md`](./photo-verification.md).

What the server now establishes about a report photo, by inspecting the bytes rather than trusting
a flag: that it really is a JPEG or PNG (magic bytes, not the client's `Content-Type`), that it
decodes intact, that its dimensions are usable, its SHA-256 and perceptual fingerprint, whether it
duplicates a recent upload, and a moderation verdict from Amazon Rekognition plus Uthavu's own
decision engine. The client submits **upload ids, never URLs and never verdicts**, and the verdict
is re-read from the database on every attach.

**But the gap this paragraph originally named is not closed, and must not be read as closed.**
`report_photos.captured_live` **remains an unverified client assertion** — written unconditionally
as `PHOTO_CAPTURE_UNVERIFIED` and read by nothing
(`apps/api/src/reports/report-photos.ts:13-25`). Verification answers *"is this image safe and
roughly relevant"*. It says nothing about whether a camera or a gallery produced it, and no EXIF or
metadata check was built. **Do not read `captured_live` as provenance.** BR-1's "live-captured"
requirement is still enforced by the mobile capture UI alone.

## Screens

| Screen | Route | Page doc (after build) |
|---|---|---|
| Category selection | `/report` | `pages/report-category.md` |
| Report flow (photo → details → location → privacy → review) | `/report/:category` | `pages/report-flow.md` |
| Category list (browse open reports by category) | `/category/:category` | `pages/category-list.md` |

Exact route paths are illustrative — finalize against the actual navigation structure chosen when
`apps/mobile` is scaffolded.

## Out of scope

- **Disaster Relief report creation** — admin-only, a different feature (admin milestone).
- **Moderation/flagging UI** on a report — a separate `moderation` feature.
- **Editing category or location** after publish (BR-6).
- **Draft / save-for-later** before publishing — v0.1 is create-and-publish in one flow, no draft
  state.

## Open questions

None outstanding for this feature. The "live-captured enforcement gap" recorded under **Data
touched** was resolved on 2026-09-04 by [ADR 0014](../decisions/0014-photo-verification-publication-gate.md)
— with the honest caveat, recorded there and above, that `captured_live` itself is still
unverified. Everything else was resolved during the brainstorming interview with the product owner
(2026-08-19).

## Related docs

- Product: [`../01_Product_Summary.md`](../01_Product_Summary.md) § 4 (categories), § 8 (privacy)
- API draft: [`../API-CONTRACT.md`](../API-CONTRACT.md) § Reports (draft — not verified against
  real code, see `docs/README.md`)
- Data: [`../architecture/data.md`](../architecture/data.md)
- Related feature: [`auth.md`](./auth.md) (BR-4 city/district precedent for GPS-as-authority)
- Related feature: [`photo-verification.md`](./photo-verification.md) — the pre-publication gate
- Decision: [`../decisions/0014-photo-verification-publication-gate.md`](../decisions/0014-photo-verification-publication-gate.md)
  — amends BR-5 and resolves the enforcement gap above

---

_BR-5 amendment and the Data-touched resolution last verified 2026-09-04 against commit `15136b5`
(photo-verification code still uncommitted in the working tree). The rest of this doc predates that
pass and was not re-verified._
