# ADR 0007: Temporary dev-console OTP fallback until real msg91 credentials exist

- **Status**: Accepted — temporarily amends [ADR 0006](./0006-otp-via-msg91-from-the-start.md)
- **Date**: 2026-08-19
- **Deciders**: Product owner

## Context

ADR 0006 committed to real msg91 delivery from the start, no dev-mode stub — correct as the
long-term decision. But msg91 credentials don't exist yet (no account, no DLT template), and the
product owner wants to test the rest of the auth flow (OTP verify → Permissions → Profile Setup →
Main Tabs) right now, without waiting on that account setup.

## Decision

Add a `DevConsoleOtpProvider` that logs the OTP code to the API server console instead of sending
a real SMS. `apps/api/src/auth/auth.ts` picks it automatically **only when
`MSG91_AUTH_KEY`/`MSG91_TEMPLATE_ID` are both absent from the environment** — the moment real
credentials are added to `.env`, `Msg91OtpProvider` takes over with no code change needed. A
startup check throws if the app would boot with the console fallback active while
`NODE_ENV=production`, so this can never silently reach a real user.

This does **not** revert ADR 0006's actual position — real msg91 is still the target before any
real-user testing. This is scaffolding to unblock local development in the meantime, not a
change of mind.

## Consequences

**Positive**: The full auth flow is testable end-to-end today, without msg91 account setup being
a blocker to everything downstream of it.

**Negative**: Another thing to remember to actually finish — msg91 credentials still need to be
obtained and set. Until then, `MSG91_AUTH_KEY`/`MSG91_TEMPLATE_ID` being unset is silently
"working as intended" instead of an error, which could mask a real misconfiguration in a shared
dev/staging environment (mitigated by the hard production block, but not by a staging block).

**Neutral**: Rate limiting (BR-2, ADR unrelated) still applies unchanged — the fallback only
replaces how the code is delivered, not the request-rate rules around it.

## Alternatives considered

- **Wait until msg91 is set up to test anything past Login** — rejected: blocks all downstream
  screen work (Permissions, Profile Setup, Main Tabs, Dashboard) on an unrelated compliance
  step with its own lead time.
- **Return the OTP code directly in the API response body** — rejected: closer to a real
  attacker's view of the endpoint than a server-side console log is; console log requires access
  to the server process, which matches "developer testing locally" better.

## Evidence in code

- `apps/api/src/auth/otp/dev-console-otp.provider.ts` — the fallback provider.
- `apps/api/src/auth/auth.ts` — the credential check that selects between it and
  `Msg91OtpProvider`, and the production hard-block.

---

*Captured against a freshly-initialised repo, no commits yet, on 2026-08-19.*
