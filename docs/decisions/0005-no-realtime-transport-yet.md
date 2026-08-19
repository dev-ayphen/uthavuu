# ADR 0005: No realtime transport — request/response + push for now

- **Status**: Accepted — supersedes [0002](./0002-realtime-via-pusher.md)
- **Date**: 2026-08-19
- **Deciders**: Product owner, in a live App Profile interview (INITIALISE.md axis: Realtime)

## Context

ADR 0002 picked Pusher for Mission Chat and the admin live-activity feed, before the product
owner had actually been asked. When the real interview ran, `docs/API-CONTRACT.md`'s existing
endpoint set was already REST-only — polled alerts (`GET /users/me/alerts`), no websocket
anywhere in it — and Mission Chat has no built contract yet either. Adding a managed realtime
dependency (billing, an SDK on both clients, channel-auth wiring) before the first backend exists
is exactly the kind of premature infrastructure the kit's Realtime axis warns against ("most apps
start here" → `none`).

## Decision

Start on **request/response only**, plus FCM push for alerts/broadcasts (unchanged from the
Integrations axis). Mission Chat ships as REST — poll or send-on-demand — gated server-side on
`hasAccepted` per request, the same gate that controls the reporter's phone-number reveal. The
admin live-activity feed polls or refreshes on demand rather than pushing.

## Consequences

**Positive**: No realtime infra, SDK, or cost until there's evidence it's needed. One less moving
part in the first backend build. Channel-auth complexity (private channel gating) is deferred
along with it — the `hasAccepted` check happens on every API call instead, which is simpler to
get right first.

**Negative**: Mission Chat and the admin live feed won't feel instant — a sent message or a new
report needs a refresh/poll to appear, not a push. If chat usage shows this is a real problem,
revisit.

**Neutral**: Nothing here forecloses adding realtime later — Pusher or `soketi` remain valid
choices per `TECH_STACK.md` § 9 if a future ADR reopens this.

## Alternatives considered

- **Pusher (managed)** — the original ADR 0002 choice. Rejected now: no evidence yet that polling
  is insufficient, and it's a recurring cost + third-party data path to take on pre-emptively.
- **Socket.io (self-hosted)** — same objection as ADR 0002: no ops capacity for connection
  scaling / sticky sessions / a Redis adapter before the first backend exists.

## Evidence in code

- Not yet implemented — `apps/api` doesn't exist yet. This ADR is the constraint for its first
  version: no realtime module, no `PUSHER_*` env vars (removed from `CLAUDE.md` § Environment
  Variables).

---

*Captured against a freshly-initialised repo, no commits yet, on 2026-08-19.*
