# ADR 0002: Realtime transport — Pusher (managed)

- **Status**: Superseded by [ADR 0005](./0005-no-realtime-transport-yet.md)
- **Date**: 2026-08-19
- **Deciders**: An autonomous agent run, *not* the actual product owner — this ADR's own framing
  ("App Profile interview") is misleading; see ADR 0005 for what the real interview decided.

## Context

Two features need live updates, not just request/response: **Mission Chat** (private
coordination between a reporter and accepted volunteers on an active request —
`docs/PRODUCT-DECISIONS.md` Decision 2) and the admin console's **live activity** dashboard feed
(`docs/01_Product_Summary.md` § 9). `apps/api` doesn't exist yet — there is no backend, no infra,
no ops team running anything today (`docs/IMPLEMENTATION-STATUS.md`: "neither product has a
backend").

`TECH_STACK.md` § 9 frames the choice as Socket.io (self-hosted) vs. Pusher (managed), decided per
project on ops vs. cost.

## Decision

Use **Pusher** (managed). Self-hosting Socket.io would mean owning connection scaling, sticky
sessions, and a Redis pub/sub adapter from day one, on top of building the first backend this
product has ever had — unjustified ops burden before there's a single real user.

## Consequences

**Positive**: Zero realtime infra to run or scale. Official SDKs exist for both Next.js (admin)
and React Native/Expo (mobile). Channel auth (private channels) maps directly onto the Mission
Chat gating requirement — `hasAccepted` must gate the channel server-side, the same gate that
controls the reporter's phone-number reveal (see `CLAUDE.md` § Known Gotchas).

**Negative**: Recurring per-connection/per-message cost once volume grows; data passes through a
third party.

**Neutral**: `soketi` (self-hosted, Pusher-protocol-compatible) is a documented escape hatch if
cost becomes the deciding factor later — no protocol migration needed, just a host change.

## Alternatives considered

- **Socket.io (self-hosted)** — rejected for now: requires sticky sessions + a Redis adapter for
  horizontal scaling, and there's no infra/ops capacity to run it yet. Revisit if Pusher's pricing
  becomes the binding constraint.
- **`none` (request/response only, polling)** — rejected: Mission Chat coordination during an
  active emergency-adjacent situation ("I'm 5 minutes away, bring the rope") needs to feel
  instant, not poll-delayed; the admin "live activity" framing implies push, not refresh.

## Evidence in code

- Not yet implemented — `apps/api` has no realtime module yet. `PUSHER_APP_ID` /
  `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` are reserved in `CLAUDE.md` § Environment
  Variables for when it is.

---

*Captured against a freshly-initialised repo, no commits yet, on 2026-08-19.*
