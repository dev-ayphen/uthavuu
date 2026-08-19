# ADR 0008: Local-disk storage for profile photos until real cloud storage exists

- **Status**: Accepted — temporary, expected to be superseded once a storage provider is chosen
- **Date**: 2026-08-19
- **Deciders**: Product owner

## Context

Profile Setup (`docs/features/auth.md` US-3a) lets a user upload an avatar photo. There's no cloud
storage account yet (S3, Supabase Storage, Cloudinary, or similar) — same situation as msg91 in
[ADR 0007](./0007-temporary-dev-otp-fallback.md): a real external dependency the product owner
doesn't have credentials for yet, but the rest of the feature needs to be testable now.

## Decision

`POST /uploads` (`apps/api/src/uploads/`) saves the file to local disk via multer's `diskStorage`,
under `UPLOADS_DIR` (defaults to `apps/api/uploads/`, gitignored), and serves it back as a plain
static file at `/uploads/<filename>`. The returned `avatarUrl` is stored on `user.avatarUrl`
exactly like a real CDN URL would be — the client and the rest of the schema don't know or care
that it's currently local disk.

Until a photo is uploaded, the client shows a placeholder avatar (initial letter or a generic
person icon via `components/Avatar.tsx`) — never a broken image.

## Consequences

**Positive**: Photo upload is fully testable end-to-end today. The swap to real cloud storage
later only touches `apps/api/src/uploads/` (storage adapter + returned URL shape) — no schema or
client change needed, since `avatarUrl` was always "just a URL."

**Negative**: Files living on local disk don't survive a container rebuild unless the directory is
a mounted volume, and don't survive across multiple API instances (no shared filesystem) — not a
problem at today's single-instance dev/local scale, but a real blocker before this could serve
production traffic from more than one instance.

**Neutral**: A 5MB file-size cap and jpeg/png/webp mimetype allowlist are enforced at the multer
layer (`apps/api/src/uploads/multer.config.ts`) — a real cloud provider would enforce something
similar, so this isn't extra work that gets thrown away when the provider changes.

## Alternatives considered

- **Wait until a cloud storage account exists to build photo upload at all** — rejected, same
  reasoning as ADR 0007: blocks a whole feature (US-3a) on an unrelated procurement step.
- **Store the image as base64 in Postgres** — rejected: bloats the `user` row and query results
  for a field that's read far more often than written; a URL is also what every downstream cloud
  option (S3, Supabase Storage) would return anyway, so this keeps the eventual migration a no-op
  for callers.

## Evidence in code

- `apps/api/src/uploads/multer.config.ts` — disk storage config, mimetype/size limits.
- `apps/api/src/uploads/uploads.controller.ts` — the authenticated `POST /uploads` route.
- `apps/api/src/main.ts` — static file serving for the resulting URLs.
- `apps/mobile/src/components/Avatar.tsx` — the placeholder fallback shown until a photo exists.

---

*Captured against the Uthavu repo, 2026-08-19.*
