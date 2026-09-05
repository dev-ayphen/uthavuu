// Publishes the report a flow is about to look for — into `output`, not into
// the API. The report itself was created before Maestro started.
//
// Requires SEED_REPORT_ID and SEED_REPORT_TITLE as env vars. Writes
// output.reportId and output.reportTitle, which is the contract the flows
// depend on and the reason this file still exists.
//
// WHY IT NO LONGER CREATES ANYTHING. `POST /reports` takes `photoUploadIds` —
// ids of verification records the API wrote after inspecting the image — and a
// photo that has not been cleared holds its whole report at `pending_review`,
// invisible to discovery. Producing a LIVE report therefore needs three things
// this script cannot do:
//
//   1. a multipart upload carrying real PNG bytes. Maestro's JS HTTP client
//      sends a string body, and a string round-trips through UTF-8 — byte 0x89,
//      the first byte of every PNG, arrives as 0xC2 0x89 and the file is corrupt.
//   2. an image over 80x80 px, the inspector's floor. The old 1x1 fixture is
//      refused outright as `too-small`.
//   3. an ADMIN session to approve the held photo, since without AWS credentials
//      every photo comes back `review`.
//
// All three moved to scripts/seed-fixture.mjs, run for you by
// scripts/run-e2e.mjs. See that file for the full reasoning.
//
// This file previously hardcoded `uploads/placeholder.jpg`, which nothing ever
// created. Every seeded flow then got 400 INVALID_UPLOAD_URL, left
// output.reportTitle undefined, and failed several steps later with
// `No visible element found: ".*undefined.*"`. The shape of that failure is why
// the assertions below are as loud as they are.

// Fail HERE, with the reason, rather than letting an undefined title surface as
// a mystifying selector failure inside a flow.
//
// An unset `-e` variable does NOT arrive as JS undefined. Maestro substitutes
// the STRING "undefined" — which is a non-empty string, so a plain falsy check
// sails past it and the failure resurfaces much later, somewhere unrelated.
// Verified empirically, not assumed.
//
// So assert the shape instead of trying to enumerate sentinels: the only value
// that can work here is the uuid of a report this API created.
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

var idMissing =
  typeof SEED_REPORT_ID === 'undefined' || !UUID.test(String(SEED_REPORT_ID));

// The title is only ever typed into the search box and matched against a row
// label, so any non-empty string is structurally valid — which makes "undefined"
// the one value that has to be named explicitly.
//
// Multi-word titles are fine here and need no unwrapping. A value carrying
// spaces survives `-e` and `${...}` substitution verbatim on the way in —
// measured on Maestro 2.9.0, spaces/tabs/quotes/`=`/non-ASCII all intact and
// whitespace untrimmed (README § "Multi-word seeded titles"). So this reads the
// title as given; there is nothing to strip, split or re-join.
var titleMissing =
  typeof SEED_REPORT_TITLE === 'undefined' ||
  !SEED_REPORT_TITLE ||
  String(SEED_REPORT_TITLE) === 'undefined';

if (idMissing || titleMissing) {
  throw new Error(
    'SEED_REPORT_ID / SEED_REPORT_TITLE are not set. Run the suite via ' +
      '`pnpm --filter mobile test:e2e` (or node .maestro/scripts/run-e2e.mjs), ' +
      'which seeds a published report first. Running `maestro test` directly ' +
      'skips that step, and a report cannot be seeded from here — it needs a ' +
      'real photo upload and an admin approval. See scripts/seed-fixture.mjs.',
  );
}

output.reportId = String(SEED_REPORT_ID);
output.reportTitle = String(SEED_REPORT_TITLE);
