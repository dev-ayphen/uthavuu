// Signs up and fully onboards a user entirely via HTTP — same sequence
// this project's own curl-based backend verification uses (send-otp,
// poll the dev OTP endpoint, verify, PATCH /users/me). Bypasses the UI
// for setup so 03/04 stay focused on what they're actually testing
// (accept/complete), not re-testing onboarding (already covered by 01/02)
// — matches Maestro's own documented "seed test data via HTTP" pattern.
//
// Requires ROLE as an env var ('reporter' or 'volunteer'). Writes
// output.<role>Phone (E.164, for HTTP), output.<role>Digits (bare 10
// digits, the only form utils/login.yaml accepts) and output.<role>Token.

var API = 'http://localhost:3001';
// The 10 digits after +91 must start with 6-9 (real Indian mobile number
// validation, LoginScreen.tsx's PHONE_REGEX) since this same number gets
// typed into that screen's field later (flows 03/04's UI login step) —
// a raw Date.now()-based digit string fails that check more often than not.
var roleDigit = ROLE === 'reporter' ? '8' : '9';
var digits = roleDigit + String(Date.now()).slice(-9);
var phone = '+91' + digits;

http.post(API + '/api/auth/phone-number/send-otp', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber: phone })
});

// See get-otp.js for why this pauses between attempts rather than
// spinning through them in a single tick.
function pause(ms) {
  var until = Date.now() + ms;
  while (Date.now() < until) {
    /* spin — no sleep primitive in Maestro's script runtime */
  }
}

var code = null;
for (var i = 0; i < 20 && !code; i++) {
  if (i > 0) pause(500);
  var res = http.get(API + '/dev/otp?phone=' + encodeURIComponent(phone));
  if (res.status === 200) {
    code = json(res.body).code;
  }
}
if (!code) {
  throw new Error('OTP never appeared for seeded user ' + phone);
}

var verifyRes = http.post(API + '/api/auth/phone-number/verify', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber: phone, code: code })
});
var token = json(verifyRes.body).token;

http.request(API + '/users/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
  body: JSON.stringify({
    fullName: 'Maestro ' + ROLE,
    lat: 13.08,
    lng: 80.27,
    city: 'Chennai',
    district: 'Chennai'
  })
});

output[ROLE + 'Phone'] = phone;
output[ROLE + 'Digits'] = digits;
output[ROLE + 'Token'] = token;
