// Creates the LIVE report the E2E flows expect to already exist, end to end:
// upload a photo, file the report, and clear the photo through admin review so
// the report actually reaches `open`.
//
// WHY THIS EXISTS, AND WHY IT IS NOT A MAESTRO SCRIPT
//
// `POST /reports` takes `photoUploadIds` — ids of `photo_uploads` rows this API
// wrote after inspecting and moderating the image. The verdict on each row is
// re-read from the database when the report is created (report-photo-attachment.ts),
// so nothing about a seeded photo can be asserted from the client side. A seeded
// report needs a genuinely uploaded, genuinely inspected photo; there is no id
// that can be hardcoded and none that survives a fresh database.
//
// `utils/seed-report.js` used to build the report itself. It cannot any more,
// for two reasons that have nothing to do with each other:
//
//   1. Uploading needs a multipart body carrying real PNG bytes. Maestro's JS
//      HTTP client sends a string body, and a string round-trips through UTF-8 —
//      byte 0x89, the first byte of every PNG, comes out as 0xC2 0x89 and the
//      file is corrupt on arrival. The inspector decodes the bytes now
//      (image-inspection.ts), so a corrupt file is refused rather than stored.
//   2. Publishing needs an ADMIN session (see approveHeldPhoto below), which
//      means a cookie jar and admin credentials — neither of which belongs in a
//      script that runs next to a device.
//
// So the whole job moved here, and the flows are handed the finished result.
//
// ⚠️ THE FIXTURE PNG IS GENERATED, NOT CHECKED IN. The previous version uploaded
// a 1×1 transparent PNG and its own comment predicted the breakage: report
// photos are now dimension-checked against Rekognition's published minimum of
// 80 px on both axes (report-photo-limits.ts), so a 1×1 fixture is refused
// outright as `too-small` before anything else happens. Generating the image
// keeps it a real, decodable PNG comfortably over that floor, keeps the bytes
// different on every run — an identical image trips the duplicate signal once a
// provider is actually configured — and keeps a binary blob out of git.

import { deflateSync } from 'node:zlib';

const API = process.env.API_URL ?? 'http://localhost:3001';

/**
 * The admin the approve step signs in as.
 *
 * Defaults match `pnpm db:seed`'s development super_admin
 * (docs/webadmin/01-admin-login.md). Overridable because a machine that has
 * rotated `SEED_ADMIN_PASSWORD` still needs to run the suite.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@uthavu.org';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

/**
 * Sent as the `Origin` header on the admin sign-in and approve calls.
 *
 * NOT OPTIONAL, and not CORS. Better Auth applies its own cross-site request
 * defence to `/api/auth/*` (auth.ts `trustedOrigins`), and Node's `fetch`
 * announces itself as a CORS-mode browser request — so without an Origin the
 * sign-in comes back `403 MISSING_OR_NULL_ORIGIN`, which reads like bad
 * credentials and is not. `curl` never sees this because it sends no
 * `Sec-Fetch-*` headers at all. The value has to be one the API trusts, which is
 * the admin console's own origin (`ADMIN_URL`).
 */
const ADMIN_ORIGIN = process.env.ADMIN_URL ?? 'http://localhost:3002';

/** Flows 03/04 tap "Medical Help", so the seeded report has to be filed there. */
const CATEGORY_KEY = 'medicalHelp';

async function jsonOrThrow(res, what) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} -> ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what} -> unparseable response: ${text.slice(0, 200)}`);
  }
}

// ── The fixture image ───────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

// Written out rather than using `zlib.crc32`, which only exists from Node
// 20.12 — this script runs on whatever Node the developer has, not the pinned
// one in the API's container.
function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * A real, decodable PNG: 8-bit RGB, no interlacing, one gradient per channel.
 *
 * 96 px square, against a floor of 80 — close enough that a regression in the
 * dimension check would still be caught, far enough that rounding never sits on
 * the boundary. `tint` shifts every pixel, so two calls in the same run produce
 * different bytes, a different sha256 and a different perceptual hash.
 */
function fixturePng(tint) {
  const size = 96;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // [10] compression, [11] filter, [12] interlace — all 0, the only values the
  // spec defines for a baseline image.

  // Scanlines, each prefixed with filter type 0 (None) so no unfiltering pass
  // is needed to read them back.
  const raw = Buffer.alloc(size * (1 + size * 3));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      raw[offset++] = (x * 2 + tint) & 0xff;
      raw[offset++] = (y * 2 + tint) & 0xff;
      raw[offset++] = (x + y + tint) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── The seeded citizen ──────────────────────────────────────────────────────

/**
 * Guarantees a distinct phone number per call within one process.
 *
 * `Date.now()` alone is not enough now that a run mints more than one account:
 * two calls landing in the same millisecond would share a number, and the OTP
 * limiter allows only 3 sends per number per 10 minutes — which surfaces as a
 * seeding failure that looks nothing like a collision.
 */
let phoneNonce = 0;

/**
 * The account that files the seeded report. Fully onboarded, because it is the
 * reporter a volunteer sees on the request they open.
 *
 * Uses the same dev OTP fallback the flows themselves depend on (ADR 0007) — if
 * that endpoint is gone because real msg91 credentials are configured, this
 * fails here with a clear message rather than inside a flow.
 */
async function mintReporter() {
  // Ten digits, first one 9: the API and the app both validate Indian mobile
  // numbers (first digit 6-9), same rule utils/seed-user.js works around.
  const phone = `+919${String(Date.now() + phoneNonce++).slice(-9)}`;

  const send = await fetch(`${API}/api/auth/phone-number/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone }),
  });
  await jsonOrThrow(send, `send-otp for ${phone}`);

  const dev = await fetch(`${API}/dev/otp?phone=${encodeURIComponent(phone)}`);
  const { code } = await jsonOrThrow(
    dev,
    'GET /dev/otp (is the dev OTP fallback active? see ADR 0007)',
  );

  const verify = await fetch(`${API}/api/auth/phone-number/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone, code }),
  });
  const { token } = await jsonOrThrow(verify, 'phone-number/verify');
  if (!token) throw new Error('verify succeeded but returned no token');

  // Same fields, same coordinates as utils/seed-user.js. Chennai matters: the
  // report inherits these coordinates and the simulator is set to them, so the
  // seeded row lands 0 km from the volunteer and inside the discovery radius.
  const profile = await fetch(`${API}/users/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fullName: 'Maestro seed reporter',
      lat: 13.08,
      lng: 80.27,
      city: 'Chennai',
      district: 'Chennai',
    }),
  });
  await jsonOrThrow(profile, 'PATCH /users/me');

  return token;
}

// ── The three steps that produce a live report ──────────────────────────────

/**
 * Uploads one photo and returns the verification record's id.
 *
 * `categoryKey` is required by the route and is a real input to the verdict —
 * relevance is judged against that category's expected labels — so it has to be
 * the category the report is then filed under. Filing under a different one
 * holds the report for review even on a passing photo (resolveUploads).
 *
 * The route answers 200 for every verdict including `reject`: the request
 * succeeded, the photo is what did not. So the verdict is checked here rather
 * than left to `res.ok`.
 */
async function uploadReportPhoto(token, tint) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([fixturePng(tint)], { type: 'image/png' }),
    'e2e-fixture.png',
  );
  form.append('categoryKey', CATEGORY_KEY);

  const res = await fetch(`${API}/uploads/report-photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const { uploadId, verdict, reason } = await jsonOrThrow(
    res,
    'POST /uploads/report-photo',
  );

  if (!uploadId) {
    // No id means the bytes never became a verification record at all — the
    // inspector refused them. `reason` is the machine code that says why
    // (`too-small`, `corrupt`, `unsupported-format`), and it is the only useful
    // thing to print.
    throw new Error(
      `the fixture photo was refused before verification (reason: ${reason ?? 'unknown'})`,
    );
  }
  if (verdict === 'reject') {
    // `POST /reports` would refuse this id with PHOTO_REJECTED a moment later.
    // Saying so here names the actual problem — the fixture image, or a
    // moderation policy that now refuses it — instead of a report that would
    // not create.
    throw new Error(
      `the fixture photo was rejected by verification (reason: ${reason ?? 'unknown'})`,
    );
  }
  return uploadId;
}

async function createReport(token, title) {
  const uploadId = await uploadReportPhoto(token, Date.now() & 0xff);

  const res = await fetch(`${API}/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      categoryKey: CATEGORY_KEY,
      title,
      // At least 20 characters — CreateReportSchema enforces a real minimum, not
      // just non-empty.
      description: 'Seeded by a Maestro E2E flow so a volunteer has a request to accept.',
      lat: 13.08,
      lng: 80.27,
      anonymous: false,
      phoneVisible: false,
      photoUploadIds: [uploadId],
    }),
  });
  const report = await jsonOrThrow(res, 'POST /reports');
  if (!report?.id) {
    throw new Error('POST /reports succeeded but returned no id');
  }

  return { report, uploadId };
}

/** Signs in as an admin and returns the cookie header for the session. */
async function adminCookie() {
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  await jsonOrThrow(res, `admin sign-in as ${ADMIN_EMAIL}`);

  const cookie = res.headers
    .getSetCookie()
    .map((entry) => entry.split(';')[0])
    .join('; ');
  if (!cookie) {
    throw new Error('admin sign-in returned 200 but set no session cookie');
  }
  return cookie;
}

/**
 * Clears the held photo so the report publishes.
 *
 * ⚠️ APPROVED UNCONDITIONALLY, AND THAT IS THE CORRECT BEHAVIOUR. This
 * environment has no AWS credentials, so the moderation provider is
 * unavailable, so every photo comes back `review` — "we could not check" never
 * yields `pass` (verification-decision.ts), by design — and the report is
 * created `pending_review`, invisible to discovery. Flows 03 and 04 need a LIVE
 * report, so something has to make the human decision a human would make. With
 * real credentials and a passing photo the report publishes on creation and
 * there is nothing left to approve: this call then answers 409, which is a
 * SUCCESS here, not a failure. Both codes mean the same thing to the suite —
 * the photo is no longer holding the report.
 *
 * `reportId` is sent because the console always sends it: it is an
 * optimistic-concurrency guard asserting the photo is still attached to the
 * report we think it is.
 */
async function approveHeldPhoto(cookie, uploadId, reportId) {
  const res = await fetch(`${API}/admin/report-photos/${uploadId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ADMIN_ORIGIN,
      cookie,
    },
    body: JSON.stringify({ reportId }),
  });

  if (res.status === 409) {
    // PHOTO_ALREADY_REVIEWED / REPORT_NOT_PENDING_REVIEW — nothing was holding
    // the report. Drain the body so the connection is reusable, and move on.
    await res.text();
    return;
  }
  await jsonOrThrow(res, `POST /admin/report-photos/${uploadId}/approve`);
}

/**
 * Seeds one report and guarantees it is publicly discoverable.
 *
 * `label` prefixes the title; the timestamp suffix is what makes it unique, and
 * flows 03/04 type the whole thing into the search box to find exactly one row
 * among the seeded reports every previous run left behind.
 */
export async function seedOpenReport(label = 'Maestro seed') {
  const token = await mintReporter();
  const title = `${label} ${Date.now()}`;

  const { report, uploadId } = await createReport(token, title);

  const cookie = await adminCookie();
  await approveHeldPhoto(cookie, uploadId, report.id);

  return { reportId: report.id, reportTitle: report.title };
}

// CLI: print the pair as JSON so a shell can capture it, and so running this
// file by hand is a complete check of the seeding path.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedOpenReport(process.argv[2] ?? 'Maestro seed')
    .then((seeded) => {
      process.stdout.write(JSON.stringify(seeded) + '\n');
    })
    .catch((err) => {
      process.stderr.write(`\n[seed-fixture] ${err.message}\n\n`);
      process.exit(1);
    });
}
