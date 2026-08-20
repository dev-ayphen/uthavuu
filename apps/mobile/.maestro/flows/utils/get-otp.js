// Polls the dev-only OTP retrieval endpoint (apps/api/src/dev/dev-otp.controller.ts)
// until the code Better Auth just generated shows up. Needed because this
// script runtime has no filesystem/shell access to read `docker compose
// logs api` directly (see ADR 0007). Only works against a dev API — that
// endpoint doesn't exist when real msg91 credentials are configured or in
// production.
//
// Requires PHONE as an env var (E.164, e.g. +919876543210).

var url = 'http://localhost:3001/dev/otp?phone=' + encodeURIComponent(PHONE);

// The OTP is written to Redis by the send-otp request the UI fired moments
// ago, so a miss here means "not yet", not "never". Each http.get is a
// local round trip of a few milliseconds, so a bare retry loop would burn
// all its attempts inside a single tick and report a false failure — hence
// the explicit pause between attempts. This runtime has no setTimeout or
// sleep, so a spin on Date.now() is the only way to wait.
function pause(ms) {
  var until = Date.now() + ms;
  while (Date.now() < until) {
    /* spin — no sleep primitive in Maestro's script runtime */
  }
}

var code = null;
var ATTEMPTS = 20;
var INTERVAL_MS = 500;
for (var i = 0; i < ATTEMPTS && !code; i++) {
  if (i > 0) pause(INTERVAL_MS);
  var res = http.get(url);
  if (res.status === 200) {
    code = json(res.body).code;
  }
}
if (!code) {
  throw new Error(
    'OTP never became available at ' + url + ' after ' + ATTEMPTS + ' attempts. ' +
    'Is the API up (docker compose ps) and the ADR 0007 dev OTP fallback active ' +
    '(no MSG91_AUTH_KEY set)?'
  );
}
output.otpCode = code;
