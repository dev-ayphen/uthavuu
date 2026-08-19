# ADR 0003: No email provider at launch

- **Status**: Accepted
- **Date**: 2026-08-19
- **Deciders**: App Profile interview (INITIALISE.md axis: Integrations — Email)

## Context

`docs/01_Product_Summary.md` § 8 (Privacy) states email is "collected once, never shown
publicly" and `docs/API-CONTRACT.md` confirms email is never used for login — authentication is
phone + OTP throughout. No transactional email flow (welcome, digest, password reset, admin
invite) appears anywhere in the product documentation. `TECH_STACK.md` § 7 offers ZeptoMail vs.
Resend as the default choices when an email provider is needed.

## Decision

No email provider (`resend`, `zeptomail`, or otherwise) is wired at launch. Email stays a private
profile field with no functional integration.

## Consequences

**Positive**: One fewer provider account, API key, and deliverability concern (SPF/DKIM/domain
setup) to manage before the first real backend ships.

**Negative**: If admin-account invites, password-reset-by-email, or a digest feature are added
later, this needs to be revisited — Better Auth's `verification` table exists regardless (it's
part of the auth schema), but nothing sends through it today.

**Neutral**: Admin login uses session-based auth (not magic links), so email isn't a hard
prerequisite for the admin surface either.

## Alternatives considered

- **Resend now, "just in case"** — rejected: no current feature needs it; adding a provider
  without a driving use case is exactly the "to be safe" pattern `INITIALISE.md` warns against
  for i18n, and the same logic applies to unused integrations.

## Evidence in code

- Not yet implemented — no email dependency in `apps/api`'s intended `package.json`. This ADR is
  the reason there isn't one.

---

*Captured against a freshly-initialised repo, no commits yet, on 2026-08-19.*
