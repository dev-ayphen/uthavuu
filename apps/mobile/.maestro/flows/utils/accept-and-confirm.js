// Has the seeded volunteer accept + confirm a seeded report via HTTP —
// used by 04-complete-mission.yaml so it can jump straight to testing
// completion (already-'active' volunteer) instead of re-testing accept/
// confirm, which 03-accept-and-volunteer.yaml already covers.
// Requires REPORT_ID and VOLUNTEER_TOKEN as env vars.

// Maestro's http client requires an explicit (even empty) body on
// POST/PATCH — confirmed live ("method POST must have a request body").
var API = 'http://localhost:3001';
http.post(API + '/reports/' + REPORT_ID + '/volunteers', {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + VOLUNTEER_TOKEN
  },
  body: JSON.stringify({})
});
http.request(API + '/reports/' + REPORT_ID + '/volunteers/me', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + VOLUNTEER_TOKEN
  },
  body: JSON.stringify({})
});
