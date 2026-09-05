# Verification probes — photo verification

These are **live probes**, not unit tests. They drive the running API over real
HTTP with real sessions, and assert against real rows in `uthavu_dev`.

They exist because the unit suite cannot see the class of bug that actually
shipped here. Every one of the following passed `pnpm test` and still broke in a
deployed environment:

- `rename()` across a filesystem boundary — `UPLOADS_DIR` is a mounted volume in
  Docker and `QUARANTINE_DIR` is on the container layer, so **every** admin
  approval returned 500 while the suite stayed green.
- A moderation queue whose default filter hid its entire backlog, because with
  no provider configured every photo is recorded `failed` rather than
  `review_required`.
- A summary endpoint returning `0` above a queue of twelve, silencing the
  sidebar badge.

None of those are findable without running the thing.

## Running them

The API must be up (`docker compose up -d api`) and rebuilt from current source —
these test the **running image**, not the working tree, and a stale container is
the most common reason a probe reports a failure that is not real.

```bash
bash scripts/verification/photo-verification-e2e.sh        # the gate, end to end
bash scripts/verification/photo-verification-journeys.sh   # reject + request-new
bash scripts/verification/photo-verification-security.sh   # security regression
```

## What they assume

- Seeded admin `admin@uthavu.org` / `Admin@123` (dev default — see
  `admin-seed-policy.ts`; production refuses these).
- The dev OTP route, which only exists while the msg91 fallback is active
  (ADR 0007). Phone numbers must be `+91` plus **exactly 10 digits**, and the
  OTP limiter allows 3 sends per number per 10 minutes — each script derives a
  unique number per run for that reason.
- **No AWS credentials.** Every photo therefore returns `review` and is recorded
  `failed`. The probes assert that explicitly: an unconfigured provider must
  never yield `pass`. If AWS is ever configured, that assertion is the one to
  revisit — it is asserting today's *correct* behaviour, not a permanent truth.

## They leave data behind

Rows are prefixed `E2E-PV`, `Journey B|C` and `SEC-REG`. Nothing cleans them up.
Decide deliberately whether they are permanent fixtures or should be removed
before a release — a moderation queue whose contents nobody can tell apart from
real citizen reports is its own kind of bug.
