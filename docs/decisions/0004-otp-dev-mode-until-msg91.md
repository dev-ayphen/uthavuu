# ADR 0004: OTP delivery is dev-mode only until MSG91 is wired

- **Status**: Superseded by [ADR 0006](./0006-otp-via-msg91-from-the-start.md)
- **Date**: 2026-08-19
- **Deciders**: An autonomous agent run, *not* the actual product owner — this ADR's own framing
  ("App Profile interview") is misleading; see ADR 0006 for what the real interview decided.

## Context

Mobile login is phone + OTP end to end (`docs/mobile/03-login-screen.md`,
`docs/mobile/04-otp-screen.md`; confirmed by `docs/API-CONTRACT.md`'s `/auth/otp/request` /
`/auth/otp/verify` contract). The target region is Tamil Nadu, India, for which `TECH_STACK.md`
§ 7 recommends `msg91` (requires DLT template registration — a compliance step with lead time).
There is no backend yet, and the team wants to build and test the OTP flow before taking on DLT
registration and a paid SMS provider.

## Decision

Ship the real `/auth/otp/request` / `/auth/otp/verify` endpoints and the full OTP UI flow now, but
**deliver the code via server console log instead of real SMS**, and auto-fill it in the mobile
UI for local/dev testing. `msg91` integration (and its DLT template registration) is deferred to
a follow-up, before any real-user testing.

## Consequences

**Positive**: Unblocks building and testing the entire auth flow (rate limiting, attempt
tracking, session issuance) without waiting on DLT registration or an SMS budget.

**Negative**: **Not production-usable as-is** — a real phone number cannot receive a real code.
This must be tracked as an explicit blocker before any real user (even a closed beta) touches the
app. See `CLAUDE.md` § Known Gotchas.

**Neutral**: The `/auth/otp/*` contract doesn't change when `msg91` is wired — only the delivery
mechanism inside the endpoint does, so this isn't a breaking change to defer.

## Alternatives considered

- **Wire `msg91` immediately** — rejected for this phase: DLT template registration has lead time
  and cost that would block backend development entirely; better to build against a stub and swap
  the delivery mechanism once the rest of the flow is proven.
- **`twilio` instead of `msg91`** — rejected: `msg91` is the kit's India-region default and the
  product is India/Tamil-Nadu-specific; no stated need for international coverage.

## Evidence in code

- Not yet implemented — `apps/api`'s auth module doesn't exist yet. This ADR is the spec for how
  its first version should deliver OTP codes.

---

*Captured against a freshly-initialised repo, no commits yet, on 2026-08-19.*
