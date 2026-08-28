# Architecture Decision Records (ADRs)

ADRs capture *why* — the context and trade-offs behind a technical decision.
They're written for the developer who, two years from now, asks "why did we do it
this way?"

> **Template.** Keep this index up to date as you add ADRs. Copy
> [`0000-template.md`](./0000-template.md) for each new decision.

## Index

| ADR | Title | Status |
|---|---|---|
| [0000](./0000-template.md) | Template (do not accept) | — |
| [0001](./0001-no-payments-at-launch.md) | No payments integration at launch | Accepted |
| [0002](./0002-realtime-via-pusher.md) | Realtime transport — Pusher (managed) | Superseded by 0005 |
| [0003](./0003-no-email-provider-at-launch.md) | No email provider at launch | Accepted |
| [0004](./0004-otp-dev-mode-until-msg91.md) | OTP delivery is dev-mode only until MSG91 is wired | Superseded by 0006 |
| [0005](./0005-no-realtime-transport-yet.md) | No realtime transport — request/response + push for now | Accepted |
| [0006](./0006-otp-via-msg91-from-the-start.md) | OTP delivery via MSG91 from the start | Accepted, temporarily amended by 0007 |
| [0007](./0007-temporary-dev-otp-fallback.md) | Temporary dev-console OTP fallback until real msg91 credentials exist | Accepted |
| [0008](./0008-local-disk-photo-storage.md) | Local-disk storage for profile photos until real cloud storage exists | Accepted (temporary) |
| [0009](./0009-admin-scoped-api-surface.md) | Admin reads/writes go through dedicated `/admin/*` controllers | Accepted |
| [0010](./0010-mission-chat-is-not-readable-by-admins.md) | Mission Chat is not readable by admins in V1 | Accepted |
| [0011](./0011-user-suspension-blocks-login-not-content.md) | User suspension blocks access, never content | Accepted |
| [0012](./0012-admin-audit-log-before-the-first-mutating-endpoint.md) | The admin audit log ships before the first mutating admin endpoint | Accepted |

## Conventions

- ADRs are **immutable** once accepted. To change a decision, write a new ADR that
  supersedes the old one (set the old one's `Status: Superseded by ADR-NNNN`).
- File naming: `NNNN-<kebab-case-title>.md` where `NNNN` is the next zero-padded
  sequence number.
- Every ADR includes: Status, Context, Decision, Consequences, Alternatives
  Considered, and Evidence in code.
- ADRs captured retroactively (after the fact) should say so — they lack the
  original deciders' commentary, and that's fine; better than no record.

## Template

See [`0000-template.md`](./0000-template.md).

---

_Last verified 2026-08-28 against commit `d035cfd`._
