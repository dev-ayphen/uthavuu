# Mobile E2E — Maestro

End-to-end coverage for the four critical mobile journeys named in
[`CLAUDE.md`](../../../CLAUDE.md)'s App Profile (`Testing: full`):

| Flow | Journey |
|---|---|
| `flows/01-otp-login.yaml` | OTP login — first-time signup through Profile Setup to Home |
| `flows/02-report-a-request.yaml` | Report a request — category → photo → details → location → privacy → publish |
| `flows/03-accept-and-volunteer.yaml` | Accept a nearby request and confirm inside the 15-minute window |
| `flows/04-complete-mission.yaml` | Complete a mission — proof photo + note, report closes |

`flows/utils/` holds sub-flows and scripts composed via `runFlow:` / `runScript:`. They are
**not** runnable on their own (each needs env vars its caller supplies), which is why
`config.yaml`'s glob matches `flows/*.yaml` only.

## Prerequisites

1. **Maestro** — `curl -fsSL https://get.maestro.mobile.dev | bash` (suite developed against 2.8.0).
2. **The API, Postgres and Redis** — `docker compose up -d` from the repo root. The flows talk to
   `http://localhost:3001` directly to seed data and to read OTP codes.
3. **The dev OTP fallback must be active.** `utils/get-otp.js` reads `GET /dev/otp?phone=…`, which
   only exists when no `MSG91_AUTH_KEY`/`MSG91_TEMPLATE_ID` is configured and `NODE_ENV` is not
   `production` (see [ADR 0007](../../../docs/decisions/0007-temporary-dev-otp-fallback.md)). With
   real msg91 credentials set, that endpoint is not registered and every flow fails at login —
   that is by design, not a broken test.
4. **The Expo dev server** — `pnpm --filter mobile dev`. Note the `exp://` URL it prints.
5. **A booted iOS simulator with Expo Go installed** — `appId` is `host.exp.Exponent` for all flows.

## Running

```bash
# Whole suite
EXPO_DEV_URL=exp://127.0.0.1:8081 pnpm --filter mobile test:e2e

# One flow (everything after `--` goes to Maestro)
EXPO_DEV_URL=exp://127.0.0.1:8081 pnpm --filter mobile test:e2e:flow -- flows/01-otp-login.yaml
```

Both go through `scripts/run-e2e.mjs`, which **seeds two published reports first** and passes
their ids and titles to the flows:

| Variable | Used by |
|---|---|
| `SEED_REPORT_ID` / `SEED_REPORT_TITLE` | `flows/03-accept-and-volunteer.yaml` |
| `SEED_REPORT_2_ID` / `SEED_REPORT_2_TITLE` | `flows/04-complete-mission.yaml` |

Each flow maps the pair it owns onto `SEED_REPORT_ID` / `SEED_REPORT_TITLE` in its own
`runScript:` env block, so `utils/seed-report.js` reads one fixed pair of names whichever flow
called it, and writes `output.reportId` / `output.reportTitle` exactly as before.

### Multi-word seeded titles

Seeded titles contain spaces — `Maestro accept test 1788551171800`, and a real one would read
like `Injured cow near Velachery`. **That is safe, and the labels must not be hyphenated to
"protect" them.** `run-e2e.mjs` spawns Maestro without a shell, so each `-e NAME=value` arrives
as a single argv entry with nothing in between to word-split it, and Maestro's `${...}`
substitution passes the value on verbatim from there.

Measured on **Maestro 2.9.0**, not assumed, by running a probe flow that echoed back what it
received — through the same `-e` → `${SEED_REPORT_TITLE}` → `runScript: env:` →
`utils/seed-report.js` path the real flows use:

| In the value | Result |
|---|---|
| spaces, tabs | intact (`Injured cow near Velachery` → 26 chars, unchanged) |
| leading / trailing whitespace | preserved, **not** trimmed |
| `=` | only the first `=` splits name from value; the rest is value |
| `'`, `"`, `,` | intact |
| non-ASCII (`உதவு`) | intact |
| `${...}` | **re-interpolated** — an unresolvable name becomes the literal string `undefined` |

Only the last row mangles anything, and no label uses it; `run-e2e.mjs` rejects a title
containing `${` up front so a future label fails there, naming the cause, rather than inside a
selector. The seeded titles were confirmed complete in the database as well, not merely in the
flow — `select title, length(title) from reports …` returns the whole 40-character string, not a
truncated first word.

**Two reports, not one**, because a report defaults to `neededVolunteers: 1`: the first
volunteer to accept fills it and `MissionsService.accept()` refuses everyone after that with
"Volunteer limit reached". 03 accepts through the UI and 04 accepts over HTTP, so they cannot
share one.

That step is not optional, and it is why report creation left the Maestro side entirely —
`scripts/seed-fixture.mjs` has the full reasoning, but in short, a **live** report now needs
three things a Maestro script cannot do:

1. **A real multipart photo upload.** `POST /reports` takes `photoUploadIds` — ids of
   `photo_uploads` rows the API wrote after inspecting the image — so no id can be hardcoded.
   Maestro's JS HTTP client sends a string body, and a string round-trips through UTF-8: byte
   `0x89`, the first byte of every PNG, arrives as `0xC2 0x89` and the file is corrupt.
2. **An image of at least 80×80 px**, the inspector's floor (Rekognition's published minimum).
   The 1×1 fixture that used to be uploaded is now refused outright as `too-small`.
3. **An admin approval.** With no AWS credentials the moderation provider is unavailable, every
   photo comes back `review`, and the report is created `pending_review` — invisible to
   discovery. `seed-fixture.mjs` signs in as the seeded super_admin and approves the held photo
   so the report reaches `open`. With real credentials and a passing photo the report publishes
   on creation and that call answers `409`, which the script treats as success.

Calling `maestro test` directly skips the seeding step. The flows detect that and fail
immediately with the reason, rather than several steps later on a selector that was never the
problem:

```
Error: SEED_REPORT_ID / SEED_REPORT_TITLE are not set. Run the suite via `pnpm --filter mobile test:e2e` …
```

`EXPO_DEV_URL` is required and has no default: the port changes per machine and per
`expo start`, and silently testing a *different* project's bundle is worse than failing loudly.

## How the flows are structured

**01 and 02 drive the UI end to end.** They test what they name and nothing is stubbed.

**03 and 04 seed their setup over HTTP** (`utils/seed-user.js`, `utils/seed-report.js`,
`utils/accept-and-confirm.js`) and drive only the step they own. Re-testing signup and report
creation inside every flow would triple the runtime to re-cover what 01 and 02 already assert,
and each redundant UI step is one more place for an unrelated selector change to fail a flow that
isn't about that screen. This is Maestro's own documented "seed test data via HTTP" pattern.

Their **report** is seeded one step earlier still — by `scripts/run-e2e.mjs`, before Maestro
starts (see above). `utils/seed-report.js` no longer creates anything; it validates the injected
ids and publishes them into `output`, which is the contract the flows actually depend on. The
report's reporter is created by the seeding script too, so 03 and 04 provision only the
**volunteer** they drive.

Each flow provisions its **own** volunteer with a timestamp-derived phone number, and each
seeded report gets its own reporter, so flows share no state and the suite is safe to re-run
without resetting the database.

### The phone-number contract

`utils/seed-user.js` writes three outputs per role, and they are not interchangeable:

| Output | Form | Used for |
|---|---|---|
| `output.<role>Phone` | `+919876543210` | HTTP calls — the API takes E.164 |
| `output.<role>Digits` | `9876543210` | `utils/login.yaml`'s `PHONE_DIGITS` |
| `output.<role>Token` | bearer token | `Authorization` on seeded HTTP calls |

`LoginScreen`'s phone field is bare digits with `maxLength={10}`; the screen prepends `+91` itself
at the API boundary (`libs-mobile/api/auth.ts`'s `toE164()`). Typing an E.164 string into it
truncates to `+91987654` and the OTP request goes to a number that was never seeded. Pass
`PHONE_DIGITS`, never `PHONE`.

The generated digits deliberately start with `8` (reporter) or `9` (volunteer): `LoginScreen`'s
`PHONE_REGEX` enforces real Indian mobile validation (first digit 6-9), which a raw
`Date.now()`-derived string fails more often than not.

## Current verification status

> ⚠️ **The flows below have NOT been re-run since the photo-verification migration
> (2026-09-05).** The seeding path was rewritten from top to bottom and verified on its own —
> `node .maestro/scripts/seed-fixture.mjs` produces a report whose stored status is `open`,
> confirmed directly in Postgres — but no simulator was available, so the four flows themselves
> are **unrun** against the new contract. Treat the statuses below as last-known-good on the
> previous seeding path, not as current.

Last run 2026-09-03 against a real iPhone 16 Pro simulator (iOS 18.5), Expo Go 57.0.9,
Metro on 8090, API in Docker. **All four flows pass**, confirmed over two consecutive
full-suite runs.

| Flow | Status |
|---|---|
| `01-otp-login.yaml` | **Passing** (45s) — live-verified end to end. |
| `02-report-a-request.yaml` | **Passing** (1m11s) — rewritten 2026-09-03. Drives the real two-step flow, asserts the photo-required rule, and stops at the camera boundary. See the header comment in the file for why it stops there. |
| `03-accept-and-volunteer.yaml` | **Passing** (29s) — live-verified end to end through "You're helping with this mission". |
| `04-complete-mission.yaml` | **Passing** (47s) — rewritten 2026-09-03, same treatment as 02. Verifies that an ACTIVE volunteer is offered "Complete Mission", that the sheet renders photo/note/submit, and that submitting a note WITHOUT a proof photo does not complete the mission. Stops at the camera boundary. |

### What changed on 2026-09-05 — the photo-verification migration

`POST /reports` stopped taking photo URLs and started taking `photoUploadIds`, and report photos
moved to their own inspected, moderated upload route. Three separate things broke in this suite;
none of them were app bugs:

1. **`utils/seed-report.js` posted `photoUrls`** — a field that no longer exists, so every seeded
   flow would have 400'd on report creation.
2. **`scripts/seed-fixture.mjs` uploaded a 1×1 PNG to `POST /uploads`.** Report photos now go to
   `POST /uploads/report-photo` (multipart `file` plus a required `categoryKey`, answering
   `{ uploadId, verdict, reason }`), and the inspector enforces a minimum dimension of 80×80 px —
   so the 1×1 fixture was refused outright as `too-small`. That file's own header had predicted
   exactly this ("breaks the moment anyone validates magic bytes").
3. **The seeded report would not have been public.** With no AWS credentials the moderation
   provider is unavailable, every photo comes back `review`, and the report is created
   `pending_review` — invisible to discovery, so 03 and 04 would have found nothing.

All three are fixed by moving the whole job into Node, where it can do all of it:
`scripts/seed-fixture.mjs` now generates a real 96×96 PNG, uploads it to
`POST /uploads/report-photo`, creates the report, then signs in as the seeded super_admin and
approves the held photo so the report reaches `open`. `utils/seed-report.js` keeps its
`output.reportId` / `output.reportTitle` contract but reads them from the injected env instead of
creating anything. The fixture PNG is generated rather than checked in, so its bytes differ every
run — an identical image would trip the duplicate signal once a provider is actually configured.

### What changed on 2026-09-03

Three defects **in this suite**, none in the app:

1. **`utils/seed-report.js` attached a photo that did not exist — FIXED.** It posted
   `uploads/placeholder.jpg`, a file nothing ever created. The API correctly rejects any photo
   URL that is not a real upload (`assertPhotosAreOurUploads`), so every seeded flow got
   `400 INVALID_UPLOAD_URL`, `output.reportTitle` came back `undefined`, and the flow failed
   several steps later with `No visible element found: ".*undefined.*"`.

   `scripts/seed-fixture.mjs` was added to upload a real 1×1 PNG through `POST /uploads`
   before the suite runs and pass the resulting URL in as `SEED_PHOTO_URL`. Nothing was placed
   by hand, so it survived a fresh volume and a different machine. Verified by deleting the
   hand-placed file and re-running the suite green. *(Superseded — see below.)*

2. **Report rows could not be found among accumulated test data.** Nothing cleans up seeded
   reports; there were 29 open `medicalHelp` reports at the seeded coordinates. They all sit
   at 0 km and the feed's nearest-first sort has no tiebreaker, so a new report's position is
   effectively arbitrary and `scrollUntilVisible` could not reach it. 03 and 04 now filter
   with the search box first, which is deterministic regardless of how much data has piled up.

3. **A selector matched the search field instead of the row.** After typing the title into
   search, `.*<title>.*` matched both the input and the card. Maestro tapped the input; the
   flow then failed several steps later on an unrelated assertion. Both flows now anchor on
   `".*<title>, .*km away.*"`, which only the row's combined label can match.

### The simulator needs a location, and it does not keep one

Seeds use Chennai (13.08, 80.27). Two separate things go wrong without it:

- A simulator sitting in its **default San Francisco** sees every seeded report as ~13,000 km
  away and correctly filters it out of the feed — 03 and 04 then cannot find their report.
- A simulator with **no location fix at all** fails onboarding outright: `PermissionsScreen`
  alerts "Could not get your location — Please try again." and never reaches Profile Setup, so
  01 and 02 fail at `Full name`, several steps from the real cause.

Set it before every suite run:

```bash
# <device> is the UDID from `xcrun simctl list devices booted`
xcrun simctl location <device> set 13.0827,80.2707
```

**This is not a Maestro problem, and it will bite you running the app by hand.**
A freshly-booted simulator has no simulated position at all — not a wrong one, *none* — so
`Location.getCurrentPositionAsync()` rejects rather than returning San Francisco. Two places in
the app call it, and both are dead ends without a fix:

| Where | What you see | Code |
|---|---|---|
| `PermissionsScreen` "Continue" | native alert **"Could not get your location — Please try again."**, onboarding never reaches Profile Setup | `PermissionsScreen.tsx`'s `onContinue()` catch |
| Report flow, step 2 | "Could not detect your location…" and **Publish stays disabled forever** (`canPublish` requires `draft.lat !== null`) | `ReportFlowScreen.tsx`'s `fetchLocation()` catch |

**The symptom shows up two screens after the cause.** Location is fetched on *Permissions*, but
the permission row itself ticks green and "Continue" looks like it worked — the failure only
becomes visible when you are stuck, and in the E2E suite it surfaces as flows 01/02 failing on
`Full name`, a screen the location code never touches. Anyone debugging from the failure upward
looks at Profile Setup, which is the wrong file. Set the location first and the whole class of
symptom disappears.

**`simctl location set` does not reliably persist.** It was observed silently lapsing between
two full-suite runs minutes apart on the same booted device, turning a green suite red with a
failure that pointed at the wrong screen. Re-set it each run rather than assuming it held; if
01/02 fail at `Full name`, this is the first thing to check.

### Expo Go must match the SDK

`app.json` is SDK 57, so Expo Go 57.x is required — an older Expo Go refuses the project with
"Project is incompatible with this version of Expo Go" and every flow fails at launch. The
version manifest at `https://api.expo.dev/v2/versions/latest` maps each SDK to its
`iosClientUrl`; the tarball's root **is** the `.app` bundle, so extract it into a directory
named `Expo-Go-<version>.app` before `xcrun simctl install`, or the install fails with
"Failed to extract IPA".

## Known fragile steps

- **Selector matching is full-match, not substring.** A plain string in `tapOn`/`assertVisible`
  must match an element's entire real accessibility label, not just a piece of it — several real
  failures this session came from assuming otherwise: `"Skip"` didn't match the real label `"Skip
  onboarding"`; a bare report title didn't match a report row's real combined label
  (`"<title>, <distance> km away, <time> left remaining"`); `"You're helping with this mission"`
  didn't match the real, emoji-prefixed label (`"🟢 You're helping with this mission."`). When the
  exact full label isn't known or is time/data-dependent, wildcard both sides —
  `".*<text>.*"` — rather than guessing the literal string. Use a real screen-hierarchy dump
  (`~/.maestro/tests/<timestamp>/<flow>/screen-hierarchy/*.json`) to find the true label instead of
  guessing from the screenshot.
- **Camera capture (02 and 04).** Photo capture is camera-only by design — a live photo is a
  business rule of both report creation and mission completion, so there is no library-picker path
  to fall back on. The iOS Simulator has no real camera hardware: the native camera UI opens and
  the shutter ("Take Picture", not the `PhotoCapture` class name it might look like from the view
  hierarchy) can be tapped, but no photo is actually captured and the flow cannot progress past
  that point into a review screen. This is a structural Simulator limitation, not a selector bug or
  an app bug — those taps are marked `optional: true` so a shutter-label change degrades to a
  clearer downstream assertion failure rather than an opaque tap timeout, but the underlying gap
  needs a real device to close. Recommendation: run 02 and 04's camera steps on a physical device
  (`maestro test --device <udid>`), or treat their photo steps as manually-verified-only until
  Simulator's synthetic-camera-feed support (if any) is investigated.
- **Permission rows (`utils/complete-onboarding.yaml`).** `clearKeychain: true` resets the app's
  own session but **not** OS-level permission grants — those live in TCC, a separate store. A
  simulator that has already granted location/notifications once shows both rows checked and
  disabled, which Maestro cannot tap, so both taps are `optional`. To exercise them for real:
  `xcrun simctl privacy <device> reset all host.exp.Exponent`.
- **Location (02).** The location step reads the simulator's current location. Set one via
  *Features → Location* in the Simulator, or the flow's `Next` lands on an empty location.
- **`evalScript` is single-expression only.** It cannot hold a loop or multiple statements — use
  `runScript:` with an external `.js` file for anything beyond one expression (see
  `utils/get-otp.js`, `utils/seed-user.js`).
- **No `http.patch`.** Maestro's JS HTTP client has `get`/`post`/`put`/`delete` but not `patch` —
  use `http.request(url, { method: 'PATCH', ... })` (see `utils/seed-user.js`'s profile update).
- **`http.post`/`http.request` need an explicit body, even an empty one.** Omitting `body` on a
  POST/PATCH throws `method POST must have a request body` at script-eval time, not at the HTTP
  layer — pass `body: JSON.stringify({})` for endpoints that take no payload (see
  `utils/accept-and-confirm.js`'s accept/confirm calls).
- **An `accessibilityLabel` can read nothing like the rendered text.** `CompleteMissionSheet`'s
  photo button visibly reads "Take a photo" but its real accessible label is `"Take completion
  photo"` — confirmed via a screen-hierarchy dump after `tapOn: "Take a photo"` failed against a
  visibly-present element. Don't assume a selector from a screenshot; check the hierarchy JSON.
- **Test data accumulates — nothing cleans up seeded reports.** Every flow run leaves its seeded
  report in the database, so the category list keeps growing across repeated runs and a newly
  seeded report isn't always in the initial viewport. `03` and `04` use `scrollUntilVisible` before
  tapping the report row rather than assuming it's on-screen. There is no fixture cleanup step in
  this suite yet — a future improvement, not currently a blocker since the scroll makes the flows
  robust to it either way.
