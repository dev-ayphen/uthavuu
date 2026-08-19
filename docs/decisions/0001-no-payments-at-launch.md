# ADR 0001: No payments integration at launch

- **Status**: Accepted
- **Date**: 2026-08-19
- **Deciders**: Product docs (`docs/01_Product_Summary.md` § 10-11), confirmed during App Profile interview

## Context

Uthavu connects people needing help with nearby volunteers. The product docs are explicit and
repeated: users never pay, and money never moves between users — no wallet, no donations between
people, no transaction fees. This is stated as a deliberate non-goal, not an oversight
(`docs/01_Product_Summary.md` § 11 "What Uthavu is deliberately not").

## Decision

No payment gateway (Stripe/Razorpay) is integrated at launch, or planned for the user-facing
product at all. Monetisation runs through two channels that never touch user flows: **Sponsors**
(Uthavu sells and places these directly) and **Google AdMob** (Google supplies ads, Uthavu
controls placement/frequency only).

## Consequences

**Positive**: No PCI/payment compliance surface, no payout logic, no financial reconciliation in
the core schema. Volunteers can't be mistaken for paid gig workers — keeps trust model simple (no
"who got paid more" dynamics).

**Negative**: If sponsor billing is ever needed, it's out of scope for the user-facing schema and
would need its own separate, minimal integration (e.g. a simple invoicing flow, not embedded in
`apps/api`'s core domain).

**Neutral**: `TECH_STACK.md` § 8 lists Stripe/Razorpay as the kit's default payment options — this
ADR is the explicit override to *not* use them.

## Alternatives considered

- **Stripe/Razorpay for a future donations feature** — rejected outright; the product docs treat
  "no donations between people" as core to the trust model (a reporter isn't soliciting money),
  not a phase-2 feature.

## Evidence in code

- Not yet implemented — `apps/api` has no payments module, no payment provider dependency. This
  ADR is the reason there won't be one.

---

*Captured against a freshly-initialised repo, no commits yet, on 2026-08-19.*
