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

Every flow needs `EXPO_DEV_URL`, the `exp://` URL Expo Go should open. There is no default: the
port changes per machine and per `expo start` invocation, and silently testing a *different*
project's bundle is worse than failing loudly.

```bash
# One flow
maestro test apps/mobile/.maestro/flows/01-otp-login.yaml -e EXPO_DEV_URL=exp://127.0.0.1:8081

# The whole suite, in config.yaml's order
maestro test apps/mobile/.maestro -e EXPO_DEV_URL=exp://127.0.0.1:8081
```

Or via the package scripts, which pass `EXPO_DEV_URL` through from your environment:

```bash
EXPO_DEV_URL=exp://127.0.0.1:8081 pnpm --filter mobile test:e2e
```

## How the flows are structured

**01 and 02 drive the UI end to end.** They test what they name and nothing is stubbed.

**03 and 04 seed their setup over HTTP** (`utils/seed-user.js`, `utils/seed-report.js`,
`utils/accept-and-confirm.js`) and drive only the step they own. Re-testing signup and report
creation inside every flow would triple the runtime to re-cover what 01 and 02 already assert,
and each redundant UI step is one more place for an unrelated selector change to fail a flow that
isn't about that screen. This is Maestro's own documented "seed test data via HTTP" pattern.

Each flow provisions its **own** users with a timestamp-derived phone number, so flows share no
state and the suite is safe to re-run without resetting the database.

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

| Flow | Status |
|---|---|
| `01-otp-login.yaml` | **Passing, live-verified end to end.** |
| `02-report-a-request.yaml` | Passes login → onboarding → category select → camera launch. Blocked at the actual shutter capture by a real iOS Simulator limitation — see below. Not fully green. |
| `03-accept-and-volunteer.yaml` | **Passing, live-verified end to end** — HTTP seeding (reporter, report, volunteer), UI login, category tap, report-row tap, "I'll Help", "Start Helping", and the active-helping assertion all confirmed on a real simulator run. |
| `04-complete-mission.yaml` | **Live-verified up to the same wall as 02.** HTTP seeding (reporter, report, an already-accepted-and-confirmed volunteer), UI login, category tap, scroll-to-find + tap the report row, "Complete Mission", and the photo-capture launch all confirmed on a real simulator run. Blocked at the actual shutter capture by the same iOS Simulator limitation as 02 — see below. Not fully green, for the same structural reason, not a bug in this flow. |

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
