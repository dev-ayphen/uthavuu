import type { Request } from 'express';

// Builds the public URL for a just-stored upload.
//
// This used to be `${process.env.BETTER_AUTH_URL}/uploads/${filename}`, which is
// http://localhost:3001 in dev. The upload itself succeeded (HTTP 201) but the
// URL handed back pointed at whatever device *opened* it — on a phone, the phone
// itself — so every uploaded photo was unreachable and rendered broken. Verified
// live on 2026-08-26 against the LAN address the Expo client actually uses.
//
// Deriving from the request means the URL is always reachable by the caller that
// just uploaded: localhost for curl on the host, 192.168.1.5 for the phone on the
// LAN, the real domain in production — with no per-environment config to drift.
// `UPLOADS_PUBLIC_URL` overrides it for the case the request host is not the
// public one (a CDN in front, or the storage provider ADR 0008 anticipates).
export function buildUploadUrl(req: Request, filename: string): string {
  return `${resolveBaseUrl(req)}/uploads/${filename}`;
}

function resolveBaseUrl(req: Request): string {
  const configured = process.env.UPLOADS_PUBLIC_URL;
  if (configured) return stripTrailingSlash(configured);

  const host = req.get('host');
  // No Host header is only reachable via a synthetic request; fall back rather
  // than emit a relative URL the client cannot resolve.
  if (!host) return stripTrailingSlash(process.env.BETTER_AUTH_URL ?? '');

  return `${resolveProtocol(req)}://${host}`;
}

// A TLS-terminating proxy (Vercel, nginx) leaves req.protocol as 'http' inside,
// so the forwarded header is the only way to know the URL the client used. It
// can be a comma-separated chain — the client-facing value is the first.
function resolveProtocol(req: Request): string {
  const forwarded = req.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.protocol;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
