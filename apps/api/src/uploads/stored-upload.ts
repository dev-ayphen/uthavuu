import { BadRequestException } from '@nestjs/common';
import { existsSync } from 'fs';
import { resolve, sep } from 'path';
import { UPLOADS_DIR } from './multer.config';
import { declaredUploadOrigins } from './upload-url';

// Is this URL one that POST /uploads actually produced?
//
// WHY THIS EXISTS. Three columns hold a photo URL — `report_photos.url`,
// `mission_completions.photo_url`, `user.avatar_url` — and all three are handed
// to the API by the client as a plain string. `z.string().url()` on the way in
// is a SYNTAX check: `http://evil.com/tracker.png` passes it. The mobile app
// renders these strings directly (unlike the console, which keeps only the path
// and re-homes it onto its own API origin — apps/admin/src/lib/upload-url.ts),
// so one such row makes every citizen who opens that report fetch from a host we
// do not control: their IP and request headers leak per viewer, and that host
// chooses the bytes that appear inside an emergency feed. The DTO comment used
// to say "URLs already come from POST /uploads" — true of our own client, and an
// assumption rather than a check, which is the entire bug (docs/_audit/issues.md
// issue 27).
//
// WHERE IT CAME FROM. The predicate is `MissionsService.isGenuineUpload()`,
// lifted here verbatim in shape — declared origin, then path discipline, then
// the file is really on disk — and fixed in one respect: it hard-coded
// `${BETTER_AUTH_URL}/uploads/` as the only acceptable prefix. That already
// refused a completion photo uploaded from a phone over the LAN, and it would
// have refused EVERY mission completion the moment anyone set UPLOADS_PUBLIC_URL
// (which .env.example recommends). Reusing declaredUploadOrigins() — the same
// set upload-url.ts uses to decide which Host it may persist — is what makes the
// generator and the validator agree by construction instead of by luck.
export function isStoredUpload(url: string): boolean {
  return classify(url) === 'ok';
}

// The message is a parameter because MissionsService already has one the mobile
// client and its spec both pin ("The completion photo must be one uploaded
// through this app"); a shared check should not force a shared wording.
//
// Neither the message nor the exception body ever contains `url`. The rejected
// value is attacker-chosen text, and echoing it would put it straight into the
// response the attacker reads and into whatever aggregates our logs.
export function assertStoredUpload(url: string, message?: string): void {
  const outcome = classify(url);
  if (outcome === 'ok') return;

  warnRejection(outcome);
  throw new BadRequestException({
    code: 'INVALID_UPLOAD_URL',
    message:
      message ??
      'Photos must be uploaded through this app before they can be attached.',
  });
}

export function assertStoredUploads(urls: string[], message?: string): void {
  for (const url of urls) assertStoredUpload(url, message);
}

const UPLOADS_PATH_SEGMENT = '/uploads/';

type Outcome =
  | 'ok'
  | 'unparseable'
  | 'bad-scheme'
  | 'decorated'
  | 'undeclared-origin'
  | 'outside-uploads'
  | 'bad-filename'
  | 'no-such-file';

function classify(url: string): Outcome {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'unparseable';
  }

  // A stored URL is fetched by mobile clients, so the scheme matters as much as
  // the host: `javascript:`/`data:` parse fine and are not things we serve.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'bad-scheme';
  }

  // buildUploadUrl never emits either, so anything carrying one was not built by
  // us. Refusing keeps the column uniform and leaves no free-text tail on a
  // string other surfaces concatenate into markup.
  if (parsed.search || parsed.hash) return 'decorated';

  // Note the protocol is deliberately NOT compared against the declared origin's
  // own: a TLS-terminating proxy legitimately turns an http origin into https on
  // the way out (upload-url.ts honours x-forwarded-proto for exactly that), so
  // pinning it here would reject URLs this API itself generated.
  //
  // Every origin on the host is tried, not just the first: two declared
  // variables can name the same host under different base paths (point
  // UPLOADS_PUBLIC_URL at `http://api/media` while BETTER_AUTH_URL stays
  // `http://api`), and the rows written before that change are still ours.
  const host = parsed.host.toLowerCase();
  const prefixes = declaredUploadOrigins()
    .filter((origin) => origin.host === host)
    .map((origin) => `${origin.basePath}${UPLOADS_PATH_SEGMENT}`);
  if (prefixes.length === 0) return 'undeclared-origin';

  // `new URL` already collapses `..` segments, so a literal
  // `/uploads/../etc/passwd` arrives here as `/etc/passwd` and matches nothing.
  const prefix = prefixes.find((candidate) =>
    parsed.pathname.startsWith(candidate),
  );
  if (!prefix) return 'outside-uploads';

  // Percent-encoding is NOT collapsed by `new URL`, so `%2e%2e%2f` survives the
  // parse intact. Decode before judging the name, and use the decoded form for
  // the disk check, because that is what the static file middleware resolves.
  const filename = decodeSegment(parsed.pathname.slice(prefix.length));
  if (
    !filename ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    filename.includes('\0')
  ) {
    return 'bad-filename';
  }

  // Belt and braces over the string checks above: whatever the name decodes to,
  // it has to land inside UPLOADS_DIR itself. An absolute path or a platform
  // separator the checks missed cannot escape this one.
  const root = resolve(UPLOADS_DIR);
  const target = resolve(root, filename);
  if (!target.startsWith(root + sep)) return 'bad-filename';

  // The last and least skippable step: a syntactically perfect URL for a file
  // nobody ever uploaded is still a fabrication. This is what stops a client
  // inventing `<declared-origin>/uploads/anything.jpg` out of thin air.
  return existsSync(target) ? 'ok' : 'no-such-file';
}

function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

// A misconfiguration and an attack look identical from one rejection, and the
// misconfiguration is the one that goes unnoticed: point UPLOADS_PUBLIC_URL at a
// CDN without re-pointing the clients and EVERY save starts failing. So log the
// REASON — never the URL, which is attacker-chosen text — once per distinct
// reason per process. Bounded by construction: there are eight outcomes.
const warnedOutcomes = new Set<Outcome>();

function warnRejection(outcome: Outcome): void {
  if (warnedOutcomes.has(outcome)) return;
  warnedOutcomes.add(outcome);
  console.warn(
    `[uploads] Refused a client-supplied photo URL (${outcome}). If this is not ` +
      `an attack, the URL's origin is missing from UPLOADS_PUBLIC_URL / ` +
      `BETTER_AUTH_URL / EXPO_PUBLIC_API_URL, or the file is no longer on disk.`,
  );
}
