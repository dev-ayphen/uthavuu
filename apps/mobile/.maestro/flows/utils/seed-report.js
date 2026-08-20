// Creates a report via HTTP as an already-seeded reporter (see
// seed-user.js). Requires REPORTER_TOKEN and REPORT_TITLE as env vars.
// Writes output.reportId and output.reportTitle.

var API = 'http://localhost:3001';
var res = http.post(API + '/reports', {
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + REPORTER_TOKEN },
  body: JSON.stringify({
    categoryKey: 'medicalHelp',
    title: REPORT_TITLE,
    description: 'Seeded by a Maestro E2E flow.',
    lat: 13.08,
    lng: 80.27,
    anonymous: false,
    phoneVisible: false,
    photoUrls: ['http://localhost:3001/uploads/placeholder.jpg']
  })
});
var report = json(res.body);
output.reportId = report.id;
output.reportTitle = report.title;
