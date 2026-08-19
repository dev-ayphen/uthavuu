# ADR 0006: OTP delivery via MSG91 from the start — no dev-mode stub

- **Status**: Accepted — supersedes [0004](./0004-otp-dev-mode-until-msg91.md); temporarily
  amended by [ADR 0007](./0007-temporary-dev-otp-fallback.md) until real msg91 credentials exist
- **Date**: 2026-08-19
- **Deciders**: Product owner, in a live App Profile interview (INITIALISE.md axis:
  Integrations — SMS/OTP)

## Context

ADR 0004 deferred real SMS delivery behind a console-logged, auto-filled dev-mode stub, before
the product owner had actually been asked. When the real interview ran, the product owner chose
`msg91` outright, not a deferred/dev-mode version of it — this is a public safety-adjacent
product (emergency/help reports), and a login flow that silently can't reach a real phone is a
worse failure mode to ship around than the DLT registration lead time is worth.

## Decision

Wire `msg91` for real SMS delivery as part of the first auth build, not as a follow-up. Register
the required DLT template up front so it isn't a surprise blocker later. Rate-limit
`/auth/otp/request` and `/auth/otp/verify` from day one per `docs/API-CONTRACT.md` § Security
requirements — real SMS costs money per send, so the rate limit isn't optional the way it might
be behind a free dev stub.

## Consequences

**Positive**: The auth flow is production-usable as soon as it's built — no separate
"now wire real SMS" follow-up to track or forget (ADR 0004's own stated risk). One less
known-broken state to explain to testers or early users.

**Negative**: DLT template registration (a compliance step with its own lead time) sits on the
critical path for the first auth build, instead of being deferrable. Real SMS costs money during
development/testing, which the rate limit above exists to bound.

**Neutral**: The `/auth/otp/*` contract itself is unchanged from what ADR 0004 already specified
— only the delivery mechanism inside the endpoint, and the timing of when it's wired.

## Alternatives considered

- **Dev-mode stub first, `msg91` later** — the original ADR 0004 choice. Rejected now: the
  product owner explicitly wants real delivery from the start, and a stub this close to a
  public-safety use case risks becoming the thing that ships by accident.
- **`twilio` instead of `msg91`** — still rejected, same reasoning as ADR 0004: `msg91` is the
  kit's India-region default and the product is India/Tamil-Nadu-specific.

## Evidence in code

- Not yet implemented — `apps/api`'s auth module doesn't exist yet. This ADR is the spec for how
  its first version must deliver OTP codes.

---

*Captured against a freshly-initialised repo, no commits yet, on 2026-08-19.*
