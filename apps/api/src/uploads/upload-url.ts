import type { Request } from 'express';

// Builds the public URL for a just-stored upload.
//
// HISTORY. This used to be `${process.env.BETTER_AUTH_URL}/uploads/${filename}`,
// which is http://localhost:3001 in dev. The upload itself succeeded (HTTP 201)
// but the URL handed back pointed at whatever device *opened* it — on a phone,
// the phone itself — so every uploaded photo was unreachable and rendered
// broken. Verified live on 2026-08-26 against the LAN address the Expo client
// actually uses. The fix was to derive the origin from the request instead.
//
// SECURITY. Deriving it from `Host` *verbatim* was itself a defect. `Host` is
// chosen by the caller, not by us, so an authenticated upload carrying
// `Host: evil.com` wrote `http://evil.com/uploads/<uuid>.png` into
// `report_photos.url` — a string every mobile client then renders directly.
// A poisoned row makes citizen devices fetch from a host we do not control,
// leaking their request headers and letting that host serve arbitrary image
// bytes inside the app. (The admin console is immune by accident of design: it
// keeps only the path and re-homes it onto its own configured API origin —
// apps/admin/src/lib/upload-url.ts. Mobile has no such resolver.)
//
// The request may still *choose* the origin, but only from the origins this
// deployment has already declared for itself. See resolveBaseUrl.
export function buildUploadUrl(req: Request, filename: string): string {
  return `${resolveBaseUrl(req)}/uploads/${filename}`;
}

// The origin of the stored URL, in priority order:
//
//   1. UPLOADS_PUBLIC_URL — an explicit answer, so nothing is inferred at all.
//      Setting it makes every stored row uniform and short-circuits this entire
//      class of problem; it is also what a CDN, or the real storage provider
//      ADR 0008 anticipates, will need anyway.
//   2. The request's own Host — but only when it matches an origin this API
//      declares (see trustedHosts). This is what keeps a phone working: it
//      reaches the API on the LAN address its build was compiled against and
//      gets that same address back, instead of a `localhost` URL that, on a
//      phone, means the phone.
//   3. BETTER_AUTH_URL — the API's own declared base URL.
//
// FALL BACK, DO NOT REJECT — a deliberate choice, not an accident of ordering.
// An unrecognised Host is more often a reverse proxy nobody wrote down, or a
// developer who has not put the LAN address in this API's env, than an attack.
// Rejecting would fail the request *after* multer has already written the file
// to disk, and it would do so on the product where that photo is the evidence
// attached to an emergency request — one misconfigured proxy would then take
// uploads down for everyone behind it. The security requirement is only that an
// untrusted value is never PERSISTED, and ignoring it satisfies that in full.
// The price of falling back is a URL that may be unreachable from the uploader's
// network: a broken image, which the console already repairs on read and which a
// backfill can correct later. A broken image is recoverable; a discarded photo
// is not. The mismatch is logged so a genuine proxy misconfiguration is
// discoverable rather than silent.
function resolveBaseUrl(req: Request): string {
  const configured = process.env.UPLOADS_PUBLIC_URL;
  if (configured) return stripTrailingSlash(configured);

  // Also the answer when there is no Host header at all, which is only reachable
  // from a synthetic request — fall back rather than emit a relative URL the
  // mobile client cannot resolve. With nothing configured either this is '',
  // making the result the relative `/uploads/<file>`: wrong for mobile, but not
  // attacker-controlled, which is the property that matters here.
  const fallback = stripTrailingSlash(process.env.BETTER_AUTH_URL ?? '');

  const host = req.get('host');
  if (!host) return fallback;

  if (!trustedHosts().has(host.toLowerCase())) {
    warnUntrustedHost(host);
    return fallback;
  }

  return `${resolveProtocol(req)}://${host}`;
}

// Where uploads legitimately live, as this deployment declares it: a host and
// the base path under which `/uploads/<file>` hangs.
export interface DeclaredUploadOrigin {
  /** `host:port`, lowercased. The port is part of the identity. */
  host: string;
  /** '' for a bare origin; '/media' for `https://cdn.example/media`. */
  basePath: string;
}

// The origins this deployment has declared for ITSELF — the single answer to
// "is this one of ours?", read by two callers that used to disagree:
//
//   * resolveBaseUrl above, deciding whether a request's Host may be persisted;
//   * isStoredUpload (./stored-upload.ts), deciding whether a URL the client
//     *hands us* may be persisted. That one used to live in MissionsService as
//     a hard-coded `${BETTER_AUTH_URL}/uploads/` prefix, which refused every
//     LAN upload and would have refused everything the moment UPLOADS_PUBLIC_URL
//     was set. Both bugs are just the second copy having drifted from this one.
//
// UPLOADS_PUBLIC_URL is listed first because, once set, it is where every new
// row's URL points. It makes no difference to resolveBaseUrl — that returns on
// it before ever reaching here — but it is the whole answer for validation.
//
// BETTER_AUTH_URL is the API's own base URL. EXPO_PUBLIC_API_URL is the origin
// the mobile build was compiled against, which is by construction the Host on
// every genuine mobile upload (libs-mobile/api/users.ts POSTs /uploads through
// that base) — it is what keeps on-device testing over the LAN working, and it
// is the same variable src/auth/auth.ts already lists in `trustedOrigins`.
//
// ADMIN_URL is deliberately absent even though it is a trusted origin elsewhere.
// It is the *console's* origin, and the console does not serve /uploads: a
// browser there calls the API directly on NEXT_PUBLIC_API_URL (which is the
// whole reason CORS exists in main.ts), so ADMIN_URL never legitimately appears
// as the Host of a request to this API. Accepting it could only ever store a URL
// that 404s.
//
// Read fresh per call rather than memoised at import: process.env is populated
// by dotenv during bootstrap and rewritten by tests, and both callers are rare
// enough (an upload, a report save) that three URL parses are free next to the
// disk and database work around them.
//
// Matching is exact on host:port, lowercased — the port is part of the identity,
// so `localhost:9999` is not `localhost:3001`. An origin configured with a
// redundant default port (`https://host:443`) will not match a bare
// `Host: host`; that strictness is cheap on the build side precisely because the
// fallback still yields a working URL rather than an error.
export function declaredUploadOrigins(): DeclaredUploadOrigin[] {
  const origins: DeclaredUploadOrigin[] = [];
  const seen = new Set<string>();

  for (const configured of [
    process.env.UPLOADS_PUBLIC_URL,
    process.env.BETTER_AUTH_URL,
    process.env.EXPO_PUBLIC_API_URL,
  ]) {
    const origin = parseDeclaredOrigin(configured);
    if (!origin) continue;
    const key = `${origin.host}${origin.basePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    origins.push(origin);
  }

  return origins;
}

// A malformed configured origin contributes nothing — it must never widen the
// set into a wildcard.
function parseDeclaredOrigin(
  configured: string | undefined,
): DeclaredUploadOrigin | undefined {
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    return {
      host: url.host.toLowerCase(),
      basePath: stripTrailingSlash(url.pathname),
    };
  } catch {
    return undefined;
  }
}

function trustedHosts(): Set<string> {
  return new Set(declaredUploadOrigins().map((origin) => origin.host));
}

// One line per distinct rejected Host, so a misconfigured proxy shows up on the
// first upload through it. Bounded: an authenticated attacker can vary the
// header endlessly, and neither the log nor this set may grow with it.
const MAX_WARNED_HOSTS = 20;
const warnedHosts = new Set<string>();

function warnUntrustedHost(host: string): void {
  if (warnedHosts.has(host) || warnedHosts.size >= MAX_WARNED_HOSTS) return;
  warnedHosts.add(host);
  console.warn(
    `[uploads] Ignoring untrusted Host "${host}" when building the stored URL. ` +
      `Set UPLOADS_PUBLIC_URL to the origin these files are served from, or add ` +
      `this host via BETTER_AUTH_URL / EXPO_PUBLIC_API_URL if it is really ours.`,
  );
}

// A TLS-terminating proxy (Vercel, nginx) leaves req.protocol as 'http' inside,
// so the forwarded header is the only way to know the URL the client used. It
// can be a comma-separated chain — the client-facing value is the first.
//
// It is a request header, so it is caller-controlled exactly like Host: anything
// other than http/https is ignored rather than concatenated into the stored
// string, which is what keeps `javascript:`-style schemes out of a column the
// clients render.
function resolveProtocol(req: Request): string {
  const forwarded = req.get('x-forwarded-proto');
  const candidate = forwarded?.split(',')[0].trim().toLowerCase();
  if (candidate === 'http' || candidate === 'https') return candidate;
  return req.protocol;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
