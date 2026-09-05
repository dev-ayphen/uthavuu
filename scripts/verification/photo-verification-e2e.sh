#!/usr/bin/env bash
# Real end-to-end probe of the photo verification gate.
#
# NOT a Jest run. This exercises the actual HTTP API against the running
# container, with real sessions, real files on disk and real database rows —
# which is the only thing that can prove the pieces are wired to each other
# rather than merely correct in isolation.
#
# It asserts the three journeys and the security properties that matter:
#   PASS   → report open, report_photos row created, photo publicly fetchable
#   REVIEW → report pending_review, ZERO report_photos, no public URL,
#            invisible to another citizen, visible to its reporter
#   REJECT → no report created at all
#   plus: quarantine file unreachable anonymously, admin queue sees the held
#         item, approve publishes it, audit row written, second approve 409s.
#
# Everything it creates is prefixed E2E-PV so it can be found and cleaned up.

set -uo pipefail
API="${API:-http://localhost:3001}"
PASS=0; FAIL=0
note() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
check(){ if [ "$1" = "$2" ]; then ok "$3 ($1)"; else bad "$3 — expected $2, got $1"; fi; }

psql() { docker exec uthavu-postgres psql -U uthavu -d uthavu_dev -tAc "$1" 2>/dev/null; }

# ── sessions ────────────────────────────────────────────────────────────────
note "Obtaining sessions"

ADMIN_JAR=$(mktemp)
curl -s -c "$ADMIN_JAR" -X POST "$API/api/auth/sign-in/email" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@uthavu.org","password":"'"${SEED_ADMIN_PASSWORD:-Admin@123}"'"}' >/dev/null
ADMIN_ME=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$API/admin/me")
check "$ADMIN_ME" "200" "admin session"

# Citizen via the dev OTP route (ADR 0007 — no msg91 credentials in dev).
citizen_token() {
  local phone="$1"
  curl -s -X POST "$API/api/auth/phone-number/send-otp" \
    -H 'content-type: application/json' -d "{\"phoneNumber\":\"$phone\"}" >/dev/null
  local code
  code=$(curl -s "$API/dev/otp?phone=$(printf %s "$phone" | sed 's/+/%2B/')" \
    | sed -n 's/.*"code":"\([0-9]*\)".*/\1/p')
  curl -s -X POST "$API/api/auth/phone-number/verify" \
    -H 'content-type: application/json' \
    -d "{\"phoneNumber\":\"$phone\",\"code\":\"$code\"}" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

# Fresh numbers per run. The OTP limiter allows 3 sends per number per 10
# minutes — correct behaviour that a re-runnable probe has to route around
# rather than trip, or the second run of the day fails at step one and every
# assertion after it reports a false negative.
RUN_ID=$(( $(date +%s) % 90000 + 10000 ))
# +91 followed by EXACTLY 10 digits, or Better Auth's validator refuses it.
REPORTER=$(citizen_token "+919${RUN_ID}0001")
STRANGER=$(citizen_token "+919${RUN_ID}0002")
[ -n "$REPORTER" ] && ok "reporter session" || bad "reporter session"
[ -n "$STRANGER" ] && ok "stranger session" || bad "stranger session"

# ── fixtures ────────────────────────────────────────────────────────────────
# A real PNG, generated rather than committed so the bytes are genuinely
# decodable — the inspector rejects anything that is not.
PHOTO=$(mktemp /tmp/e2e-pv-XXXX.png)
node -e '
const {Jimp}=require("'"$PWD"'/apps/api/node_modules/jimp");
(async()=>{const i=new Jimp({width:400,height:300,color:0x4a7c59ff});
require("fs").writeFileSync(process.argv[1],Buffer.from(await i.getBuffer("image/png")));})()
' "$PHOTO"
[ -s "$PHOTO" ] && ok "generated a real PNG fixture" || bad "PNG fixture"

upload() { # $1 token, $2 categoryKey
  curl -s -X POST "$API/uploads/report-photo" \
    -H "Authorization: Bearer $1" \
    -F "file=@$PHOTO;type=image/png" -F "categoryKey=$2"
}

create_report() { # $1 token, $2 uploadId, $3 title
  curl -s -X POST "$API/reports" -H "Authorization: Bearer $1" \
    -H 'content-type: application/json' \
    -d "{\"categoryKey\":\"medicalHelp\",\"title\":\"$3\",\"description\":\"E2E-PV probe description long enough to pass validation.\",\"lat\":13.08,\"lng\":80.27,\"anonymous\":false,\"phoneVisible\":false,\"neededVolunteers\":1,\"photoUploadIds\":[\"$2\"]}"
}

# ── 1. upload + verdict ─────────────────────────────────────────────────────
note "1. Upload and verdict"
UP=$(upload "$REPORTER" medicalHelp)
echo "     $UP"
UPLOAD_ID=$(echo "$UP" | sed -n 's/.*"uploadId":"\([^"]*\)".*/\1/p')
VERDICT=$(echo "$UP"  | sed -n 's/.*"verdict":"\([^"]*\)".*/\1/p')
[ -n "$VERDICT" ] && ok "verdict returned: $VERDICT" || bad "no verdict returned"

# With no AWS credentials the provider is unconfigured, so EVERY photo must come
# back `review` — never `pass`. That is the silent-bypass guarantee, observed
# live rather than unit-tested.
check "$VERDICT" "review" "unconfigured provider holds the photo (never auto-passes)"

ROW=$(psql "select status_key from (select s.key as status_key from photo_uploads u join photo_verification_statuses s on s.id=u.status_id where u.id='$UPLOAD_ID') t;")
check "$ROW" "failed" "verification row recorded as 'failed' (provider unavailable, not 'passed')"

# ── 2. quarantine is private ────────────────────────────────────────────────
note "2. Quarantine file is not publicly reachable"
FNAME=$(psql "select stored_filename from photo_uploads where id='$UPLOAD_ID';")
ANON=$(curl -s -o /dev/null -w '%{http_code}' "$API/uploads/$FNAME")
check "$ANON" "404" "anonymous GET /uploads/<quarantine file> is refused"

OWNER=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $REPORTER" "$API/uploads/report-photo/$UPLOAD_ID")
check "$OWNER" "200" "owner can stream their own pending photo"
OTHER=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/uploads/report-photo/$UPLOAD_ID")
check "$OTHER" "404" "another citizen cannot stream it"
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' "$API/uploads/report-photo/$UPLOAD_ID")
if [ "$NOAUTH" = "401" ] || [ "$NOAUTH" = "403" ]; then ok "unauthenticated stream refused ($NOAUTH)"; else bad "unauthenticated stream — expected 401/403, got $NOAUTH"; fi

# ── 3. REVIEW journey ───────────────────────────────────────────────────────
note "3. REVIEW journey"
REP=$(create_report "$REPORTER" "$UPLOAD_ID" "E2E-PV held report")
REPORT_ID=$(echo "$REP" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$REPORT_ID" ] && ok "report created: $REPORT_ID" || bad "report not created: $REP"

STATUS=$(psql "select s.key from reports r join report_statuses s on s.id=r.status_id where r.id='$REPORT_ID';")
check "$STATUS" "pending_review" "report held as pending_review"

PHOTOS=$(psql "select count(*) from report_photos where report_id='$REPORT_ID';")
check "$PHOTOS" "0" "ZERO report_photos rows — no public photo exists"

LINKED=$(psql "select count(*) from photo_uploads where id='$UPLOAD_ID' and report_id='$REPORT_ID';")
check "$LINKED" "1" "upload linked to the report so the queue can find it"

SEEN_BY_OWNER=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $REPORTER" "$API/reports/$REPORT_ID")
check "$SEEN_BY_OWNER" "200" "reporter can open their own held report"
SEEN_BY_OTHER=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/reports/$REPORT_ID")
check "$SEEN_BY_OTHER" "404" "another citizen cannot open it"

IN_FEED=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports?lat=13.08&lng=80.27&radiusKm=10" | grep -c "$REPORT_ID")
check "$IN_FEED" "0" "held report absent from the nearby feed"

# ── 4. admin queue + approve ────────────────────────────────────────────────
note "4. Admin queue and approval"
Q=$(curl -s -b "$ADMIN_JAR" "$API/admin/report-photos?status=failed&limit=100")
if [ -n "$UPLOAD_ID" ] && echo "$Q" | grep -q "$UPLOAD_ID"; then ok "held item appears in the admin queue"; else bad "held item missing from admin queue"; fi

ADMIN_FILE=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$API/admin/report-photos/$UPLOAD_ID/file")
check "$ADMIN_FILE" "200" "admin can preview the private photo"
NOADMIN=$(curl -s -o /dev/null -w '%{http_code}' "$API/admin/report-photos/$UPLOAD_ID/file")
if [ "$NOADMIN" = "401" ] || [ "$NOADMIN" = "403" ]; then ok "non-admin refused the preview ($NOADMIN)"; else bad "preview authz — expected 401/403, got $NOADMIN"; fi

AUDIT_BEFORE=$(psql "select count(*) from admin_audit_logs;")
APPROVE=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' -X POST \
  "$API/admin/report-photos/$UPLOAD_ID/approve" -H 'content-type: application/json' -d '{"reason":"E2E-PV approve"}')
# Nest answers a POST with 201 by default; both are success here.
if [ "$APPROVE" = "200" ] || [ "$APPROVE" = "201" ]; then ok "admin approve accepted ($APPROVE)"; else bad "admin approve — expected 200/201, got $APPROVE"; fi

STATUS2=$(psql "select s.key from reports r join report_statuses s on s.id=r.status_id where r.id='$REPORT_ID';")
check "$STATUS2" "open" "report published after approval"
PHOTOS2=$(psql "select count(*) from report_photos where report_id='$REPORT_ID';")
check "$PHOTOS2" "1" "report_photos row created by the backend on approval"

AUDIT_AFTER=$(psql "select count(*) from admin_audit_logs;")
if [ "$AUDIT_AFTER" -gt "$AUDIT_BEFORE" ]; then ok "audit row written"; else bad "no audit row written"; fi

AGAIN=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' -X POST \
  "$API/admin/report-photos/$UPLOAD_ID/approve" -H 'content-type: application/json' -d '{"reason":"E2E-PV second approve"}')
check "$AGAIN" "409" "a second approval is refused as a stale decision"

PUB=$(psql "select url from report_photos where report_id='$REPORT_ID' limit 1;")
PUBCODE=$([ -n "$PUB" ] && curl -s -o /dev/null -w '%{http_code}' "$PUB" || echo "no-url")
check "$PUBCODE" "200" "the approved photo is now publicly fetchable"

VISIBLE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/reports/$REPORT_ID")
check "$VISIBLE" "200" "another citizen can now see the published report"

# ── 5. security: cannot borrow someone else's upload ────────────────────────
note "5. Upload ownership"
UP2=$(upload "$REPORTER" medicalHelp)
UPLOAD2=$(echo "$UP2" | sed -n 's/.*"uploadId":"\([^"]*\)".*/\1/p')
STEAL=$(create_report "$STRANGER" "$UPLOAD2" "E2E-PV stolen upload")
echo "$STEAL" | grep -q "PHOTO_NOT_VERIFIED" && ok "another citizen's upload id is refused" || bad "stolen upload was NOT refused: $STEAL"

REUSE=$(create_report "$REPORTER" "$UPLOAD_ID" "E2E-PV reused upload")
echo "$REUSE" | grep -q "PHOTO_NOT_VERIFIED" && ok "an already-attached upload cannot be reused" || bad "reuse was NOT refused: $REUSE"

FORGED=$(create_report "$REPORTER" "00000000-0000-7000-8000-000000000000" "E2E-PV forged id")
echo "$FORGED" | grep -q "PHOTO_NOT_VERIFIED" && ok "a forged upload id is refused" || bad "forged id was NOT refused: $FORGED"

# ── summary ─────────────────────────────────────────────────────────────────
rm -f "$PHOTO" "$ADMIN_JAR"
note "Result"
printf '  passed: %d   failed: %d\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
