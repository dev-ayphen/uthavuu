# Feature: `auth`

- **Status:** agreed
- **Milestone:** v0.1
- **Owner:** TBD

## Problem

Citizens need a fast, low-friction way to prove who they are before reporting or accepting a
help request — accountability (Verified Reporter status, resolution history) depends on a real
identity behind every account. A password is friction people abandon; email isn't universal.
Phone number + OTP is the natural identity anchor for an India-first product: near-universal,
no password to manage, and proves ownership of a real, reachable number.

## Users & roles

There is no separate "volunteer account" — every authenticated user can report, volunteer, or
add public information depending on what they do, not who they are.

| Role | What they can do here |
|---|---|
| Visitor (unauthenticated) | Enter a phone number, request and verify an OTP |
| Citizen (authenticated) | Everything in the app — report, volunteer, comment, log out |

Admin login (email + password, session-based) is **out of scope** — see below.

## User stories

### US-1 — Request an OTP

As a **visitor**, I can **enter my phone number and request an OTP** so that **I can prove I
own it and log in or sign up**.

- **AC1:** Given a valid 10-digit Indian mobile number, when I submit it, then an OTP is sent
  via msg91 and I land on the OTP screen.
- **AC2:** Given an invalid/malformed number, when I submit it, then I see an inline validation
  error and no OTP is sent (no msg91 call, no cost).
- **AC3:** Given I've already requested 3 OTPs for this number in the last 10 minutes, when I
  request a 4th, then I'm rejected with `429` and a clear cooldown message (BR-2).

### US-2 — Verify the OTP

As a **visitor with a pending OTP**, I can **enter the 6-digit code** so that **I'm
authenticated**.

- **AC1:** Given the correct code within its validity window, when I submit it, then I receive a
  session and am routed by account status: existing account → Discover; unrecognized phone →
  Profile Setup (US-3).
- **AC2:** Given an incorrect code, when I submit it, then I see an error with the remaining
  attempts count; after 5 wrong attempts the code is invalidated and I must request a new one
  (BR-2).
- **AC3:** Given the code has expired, when I submit any code, then I see a `410` "code expired,
  request a new one" state, not a generic wrong-code error.

### US-3 — Finish signup (new account only)

As a **new user who just verified an OTP**, I can **grant location access, enter my name, and
optionally fill in the rest of my profile** so that **the app can show me nearby help requests
immediately, and other users see who I am if I choose to share it**.

- **AC1:** Given I deny the location permission, when I try to continue, then I'm blocked with an
  explanation of why it's required and re-prompted — there is no way to finish signup without
  granting it (BR-3).
- **AC2:** Given I grant location and enter my full name, when I submit, then my account is
  created with GPS-derived city/district (BR-4) and I land on Discover.
- **AC3:** Given I leave Full Name blank, when I try to submit, then I see a required-field
  error and cannot continue (BR-5).
- **AC4:** Given I optionally add a photo, email, language, profession, and/or organization, when
  I submit, then all provided fields save; any left blank stay empty (not defaulted to fake
  values) and are editable later (BR-5a).
- **AC5:** Given I pick a profession from the list, when I view the "Show profession on public
  profile" toggle, then it defaults **on**, and I can turn it off before submitting.
- **AC6:** Given I select "Other" as my profession, when I do, then a free-text field appears to
  specify it; given I select any other profession, then that field stays hidden.

### US-3a — Add a profile photo

As a **new user filling in Profile Setup**, I can **capture or pick a photo** so that **other
users can recognize me** (subject to my own privacy choice to post anonymously elsewhere in the
app).

- **AC1:** Given I tap the avatar, when I choose "Take Photo" or "Choose from Library," then the
  OS camera or photo picker opens.
- **AC2:** Given I select/capture an image, when it uploads, then the avatar updates to show it
  and the returned URL is included when I submit the form.
- **AC3:** Given the upload fails (network error), when it fails, then I see an inline error and
  can retry — submitting the rest of the form still works without a photo.

### US-4 — Return with no friction (existing account)

As a **returning user**, I can **verify my OTP and land straight on Discover** so that
**re-entering the app costs nothing extra**.

- **AC1:** Given my phone number matches an existing account, when my OTP verifies, then I skip
  Profile Setup entirely and land on Discover with a live session.

### US-5 — Log out

As a **logged-in user**, I can **log out** so that **I can end my session on a shared or
borrowed device**.

- **AC1:** Given I'm logged in, when I tap Log out, then my session is invalidated server-side
  (not just cleared client-side) and I return to the phone-entry screen.

## Business rules

- **BR-1:** Phone number is the sole account identity. One flow handles both login and signup —
  there is no separate "Sign Up" choice to pick wrong (confirmed with product owner: unified
  entry, not split).
- **BR-2:** OTP requests are rate-limited to **3 per phone number per rolling 10-minute window**;
  each issued code allows **5 verify attempts** before it's invalidated and a new code must be
  requested. Real SMS costs money per send (msg91) — this isn't optional (ADR 0006).
- **BR-3:** Location permission is **mandatory to complete signup** — the product is
  fundamentally radius-based ("help is local, or it isn't help"); an account that can't be
  located can't be shown anything nearby, so there's no degraded/skippable path.
- **BR-4:** City/district is derived automatically via GPS reverse-geocoding at signup, **never
  manually typed**. It's a human-readable label and a fallback filter only — the actual
  nearby-request matching always uses live GPS coordinates + the user's chosen radius, never
  city/district matching.
- **BR-5:** Full Name is the only *required* profile field at signup. **Revised 2026-08-19** —
  Profile Setup also collects the rest of the profile in the same screen, all optional: photo,
  contact email, language, profession (from a fixed 18-entry list, "Other" reveals a free-text
  field), organization, and a "show profession on public profile" toggle (default on). Nothing
  here blocks submission except Full Name — every other field can be skipped and filled in later
  from Profile Settings (feature `profile-settings`, not yet built). This supersedes the original
  "name-only, everything else deferred" version of this rule.
- **BR-5a:** The profile's contact email (`contactEmail`) is a display field only, fully separate
  from Better Auth's internal `email` column (which stays a synthetic
  `{phone}@phone.uthavu.local` placeholder — see `signUpOnVerification` in `auth.ts`). Never wire
  a user-provided email into Better Auth's own `email`/`emailVerified` fields: those carry
  uniqueness and verification semantics this product doesn't use (no email-based login, no
  password reset by email), and colliding two real users on that column would be a correctness
  bug, not a feature.
- **BR-6:** Sessions are long-lived — **60 days, sliding** (refreshed on authenticated activity)
  — not a forced weekly re-OTP. Re-authenticating every few days is friction a consumer safety
  app can't afford; Better Auth's session table tracks this server-side so logout/revocation is
  real, not just a client-side token delete (US-5 AC1).

## Data touched

| Table | New / changed | Notes |
|---|---|---|
| `user` (Better Auth, extended) | new columns | `phone` (unique, not null), `phone_verified_at`, `full_name`, `city`, `district`, `last_lat`, `last_lng` — plus nullable `contact_email`, `language`, `profession`, `organization`, `avatar_url`, and `show_profession` (boolean, default true). All six are set at signup time by Profile Setup (BR-5); `profile-settings` (not yet built) is where a user edits them afterward, not where they're first collected. |
| `session` (Better Auth) | as-is | Better Auth owns this; 60-day sliding expiry configured here, not a custom table |
| OTP rate-limit state | new — Redis, not Postgres | Keyed by phone: request count in current 10-min window, active code, verify-attempt count. Ephemeral by nature — doesn't belong in the durable schema |

**Invariants this introduces:** a `user.phone` is unique and immutable after verification (no
phone-number change flow in v0.1); `city`/`district` are always derived, never a form input —
enforce this by not exposing them as editable fields anywhere in the client, not just as a
convention. Record both in `architecture/data.md` once the schema is designed, with which layer
enforces each (DB unique constraint vs. application logic).

## Screens

| Screen | Route | Page doc (after build) |
|---|---|---|
| Phone entry (unified login/signup) | `/login` | `pages/login.md` |
| OTP verification | `/login/otp` | `pages/otp.md` |
| Location permission | `/onboarding/location` | `pages/onboarding-location.md` |
| Profile setup (name) | `/onboarding/profile` | `pages/onboarding-profile.md` |

Exact route paths are illustrative — finalize against the actual Expo Router/React Navigation
structure chosen when `apps/mobile` is scaffolded.

## Out of scope

- **Admin login** (email + password, session-based, role from session not URL) — a separate
  feature doc, written when admin work starts (mobile ships first).
- **Social login / email login** — phone + OTP is the only identity method in v0.1.
- **Phone number change** — no flow to update a verified phone number after signup.
- **Multi-device session management** — no UI to view/revoke sessions on other devices.
- **Editing profile fields beyond initial setup** — covered by the `profile-settings` feature,
  not this one.

## Open questions

None — resolved during the brainstorming interview with the product owner (2026-08-19).

## Related docs

- Product: [`../01_Product_Summary.md`](../01_Product_Summary.md)
- API draft: [`../API-CONTRACT.md`](../API-CONTRACT.md) § Authentication (draft — not verified
  against real code, see `docs/README.md`)
- Data: [`../architecture/data.md`](../architecture/data.md)
- ADRs: [`../decisions/0006-otp-via-msg91-from-the-start.md`](../decisions/0006-otp-via-msg91-from-the-start.md)
