#!/usr/bin/env bash
# Security regression pass over the Uthavu photo verification system.
# Real HTTP against the running container + real SQL against the running DB.
# Read-only with respect to the repo. Creates fixture rows only.
set -uo pipefail
API="${API:-http://localhost:3001}"
# Derived from this script's own location so the probe is not tied to one
# developer's checkout path.
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
PASS=0; FAIL=0; SKIP=0
declare -a RESULTS

note(){ printf '\n\033[1m── %s\033[0m\n' "$*"; }
ok(){   printf '  \033[32mPASS\033[0m %s\n' "$2"; PASS=$((PASS+1)); RESULTS+=("$1|PASS|$2"); }
bad(){  printf '  \033[31mFAIL\033[0m %s\n' "$2"; FAIL=$((FAIL+1)); RESULTS+=("$1|FAIL|$2"); }
skip(){ printf '  \033[33mN/A \033[0m %s\n' "$2"; SKIP=$((SKIP+1)); RESULTS+=("$1|N/A|$2"); }
eq(){ if [ "$2" = "$3" ]; then ok "$1" "$4 [got $2]"; else bad "$1" "$4 [expected $3, got $2]"; fi; }

q(){ docker exec uthavu-postgres psql -U uthavu -d uthavu_dev -tAc "$1" 2>&1; }

# ─────────────────────────────────────────────────────────── sessions
note "Sessions"
ADMIN_JAR=$(mktemp); OPS_JAR=$(mktemp)
curl -s -c "$ADMIN_JAR" -X POST "$API/api/auth/sign-in/email" -H 'content-type: application/json' \
  -d '{"email":"admin@uthavu.org","password":"Admin@123"}' >/dev/null
A=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$API/admin/me"); echo "  admin/me -> $A"
curl -s -c "$OPS_JAR" -X POST "$API/api/auth/sign-in/email" -H 'content-type: application/json' \
  -d '{"email":"ops@uthavu.org","password":"Ops@123"}' >/dev/null
O=$(curl -s -b "$OPS_JAR" -o /dev/null -w '%{http_code}' "$API/admin/me"); echo "  ops/me   -> $O"

citizen_token(){
  local phone="$1"
  curl -s -X POST "$API/api/auth/phone-number/send-otp" -H 'content-type: application/json' \
    -d "{\"phoneNumber\":\"$phone\"}" >/dev/null
  local code; code=$(curl -s "$API/dev/otp?phone=$(printf %s "$phone" | sed 's/+/%2B/')" | jq -r '.data.code // .code // empty')
  curl -s -X POST "$API/api/auth/phone-number/verify" -H 'content-type: application/json' \
    -d "{\"phoneNumber\":\"$phone\",\"code\":\"$code\"}" | jq -r '.token // empty'
}
RUN=$(( $(date +%s) % 90000 + 10000 ))
REPORTER=$(citizen_token "+918${RUN}0001")
STRANGER=$(citizen_token "+918${RUN}0002")
echo "  reporter token: ${REPORTER:0:12}...  stranger token: ${STRANGER:0:12}..."
[ -n "$REPORTER" ] && [ -n "$STRANGER" ] || { echo "FATAL: no citizen sessions"; exit 1; }
REPORTER_UID=$(curl -s -H "Authorization: Bearer $REPORTER" "$API/users/me" | jq -r '.data.id // .id')
STRANGER_UID=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/users/me" | jq -r '.data.id // .id')
echo "  reporter uid=$REPORTER_UID stranger uid=$STRANGER_UID"

# ─────────────────────────────────────────────────────────── fixtures
PHOTO_DIR=$(mktemp -d)
mkpng(){ # $1 out, $2 seed colour so sha256/phash differ per file
  node -e '
const {Jimp}=require(process.argv[3]+"/apps/api/node_modules/jimp");
// Colours must be UNSIGNED 32-bit. `x|0xff` yields a signed int and Jimp throws
// ERR_OUT_OF_RANGE on the negative half, so every value is re-cast with >>>0.
const u=(n)=>(n>>>0);
(async()=>{const c=parseInt(process.argv[2],10);
const i=new Jimp({width:400,height:300,color:u(u(c*2654435761)|0xff)});
for(let x=0;x<400;x+=7){for(let y=0;y<300;y+=11){i.setPixelColor(u(u(x*c+y)|0xff),x,y);}}
require("fs").writeFileSync(process.argv[1],Buffer.from(await i.getBuffer("image/png")));})()
' "$1" "$2" "$REPO"; }

UPCOUNT=0
upload(){ # $1 token $2 categoryKey [$3 extra -F args...]; echoes uploadId
  UPCOUNT=$((UPCOUNT+1)); local f="$PHOTO_DIR/p$UPCOUNT.png"; mkpng "$f" "$((RUN+UPCOUNT))"
  shift 0
  local tok="$1" cat="$2"; shift 2
  curl -s -X POST "$API/uploads/report-photo" -H "Authorization: Bearer $tok" \
    -F "file=@$f;type=image/png" -F "categoryKey=$cat" "$@"
}
force_pass(){ q "update photo_uploads set decision='pass', risk_level='low', verified_at=now(), status_id=(select id from photo_verification_statuses where key='passed') where id='$1';" >/dev/null; }
rstatus(){ q "select s.key from reports r join report_statuses s on s.id=r.status_id where r.id='$1';"; }
vstatus(){ q "select s.key from photo_uploads u join photo_verification_statuses s on s.id=u.status_id where u.id='$1';"; }
mkreport(){ # $1 token $2 categoryKey $3 title $4 uploadIdsJSON  -> full JSON
  curl -s -X POST "$API/reports" -H "Authorization: Bearer $1" -H 'content-type: application/json' \
    -d "{\"categoryKey\":\"$2\",\"title\":\"$3\",\"description\":\"SEC-REG probe description long enough to satisfy validation rules.\",\"lat\":13.0810,\"lng\":80.2710,\"neededVolunteers\":1,\"photoUploadIds\":$4}"
}

note "Fixture: held report (verdict review, provider unconfigured)"
U_HELD=$(upload "$REPORTER" medicalHelp | jq -r '.uploadId')
[ -n "$U_HELD" ] && [ "$U_HELD" != "null" ] || { echo "FATAL: fixture upload failed — aborting rather than cascading false negatives"; exit 1; }
echo "  U_HELD=$U_HELD verdict=$(vstatus "$U_HELD")"
# Decoys: three PUBLISHED medicalHelp reports at the same coordinates, so the
# nearby listing has real content to walk. An "it is absent" assertion against an
# empty list proves nothing.
DECOYS=""
for i in 1 2 3; do
  UD=$(upload "$STRANGER" medicalHelp | jq -r '.uploadId'); force_pass "$UD"
  RD=$(mkreport "$STRANGER" medicalHelp "SEC-REG decoy $i" "[\"$UD\"]" | jq -r '.id // .data.id')
  DECOYS="$DECOYS $RD($(rstatus "$RD"))"
done
echo "  decoy open reports:$DECOYS"

SUMMARY_BEFORE=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports/summary?lat=13.0810&lng=80.2710&radiusKm=10" | jq -c '.')
STATS_BEFORE=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports/community-stats?lat=13.0810&lng=80.2710&radiusKm=10" | jq -c '.')
R_HELD=$(mkreport "$REPORTER" medicalHelp "SEC-REG held" "[\"$U_HELD\"]" | jq -r '.id // .data.id')
echo "  R_HELD=$R_HELD status=$(rstatus "$R_HELD")"

##############################################################################
note "1. Another citizen cannot read a pending_review report"
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/reports/$R_HELD")
BODY=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports/$R_HELD")
eq 1 "$C" "404" "GET /reports/:id as another citizen; body=$(echo "$BODY" | jq -c '.code // .message' 2>/dev/null)"
CA=$(curl -s -o /dev/null -w '%{http_code}' "$API/reports/$R_HELD")
if [ "$CA" = "401" ] || [ "$CA" = "403" ]; then ok 1 "unauthenticated GET /reports/:id refused [$CA]"; else bad 1 "unauthenticated GET /reports/:id [$CA]"; fi

##############################################################################
note "2. Not discoverable by ANY other route"
hunt(){ # $1 label, $2 url, $3 token-or-empty
  local body
  if [ -n "$3" ]; then body=$(curl -s -H "Authorization: Bearer $3" "$2"); else body=$(curl -s "$2"); fi
  if echo "$body" | grep -q "$R_HELD"; then bad 2 "$1 LEAKS the held report id"; else ok 2 "$1 does not contain the held id"; fi
}
hunt "nearby listing (medicalHelp r=10)"  "$API/reports?categoryKey=medicalHelp&lat=13.0810&lng=80.2710&radiusKm=10" "$STRANGER"
hunt "nearby listing (r=1, tightest)"     "$API/reports?categoryKey=medicalHelp&lat=13.0810&lng=80.2710&radiusKm=1"  "$STRANGER"
for CK in animalRescue communityHelp bloodDonation elderlySupport foodDonation lostAndFound roadsideHelp; do
  hunt "category listing $CK"             "$API/reports?categoryKey=$CK&lat=13.0810&lng=80.2710&radiusKm=10" "$STRANGER"
done
hunt "nearby + q= search param"           "$API/reports?categoryKey=medicalHelp&lat=13.0810&lng=80.2710&radiusKm=10&q=SEC-REG" "$STRANGER"
hunt "nearby + search="                   "$API/reports?categoryKey=medicalHelp&lat=13.0810&lng=80.2710&radiusKm=10&search=SEC-REG" "$STRANGER"
hunt "nearby + includeAll/status override" "$API/reports?categoryKey=medicalHelp&lat=13.0810&lng=80.2710&radiusKm=10&status=pending_review&includeAll=true&includeDeleted=true" "$STRANGER"
hunt "stranger my-reports"                "$API/users/me/reports" "$STRANGER"
hunt "stranger saved-reports"             "$API/users/me/saved-reports" "$STRANGER"
hunt "stranger impact-stories"            "$API/users/me/impact-stories" "$STRANGER"
hunt "stranger alerts"                    "$API/users/me/alerts" "$STRANGER"
# pagination walk
NEAR_N=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports?categoryKey=medicalHelp&lat=13.0810&lng=80.2710&radiusKm=10" | jq 'length')
echo "  nearby medicalHelp returns $NEAR_N items in ONE response (no pagination params in ListReportsSchema)"
LEAKPAGE=0
for P in "page=1&limit=1" "page=2&limit=1" "page=3&limit=1" "offset=1&limit=1" "offset=2" "cursor=1" "skip=1&take=1"; do
  B=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports?categoryKey=medicalHelp&lat=13.0810&lng=80.2710&radiusKm=10&$P")
  N=$(echo "$B" | jq 'length' 2>/dev/null)
  echo "$B" | grep -q "$R_HELD" && LEAKPAGE=1
  echo "    ?$P -> $N items$( [ "$N" = "$NEAR_N" ] && echo ' (params ignored, same full set)' )"
done
eq 2 "$LEAKPAGE" "0" "no pagination/offset variant surfaces the held report"
# summary + community stats counts unchanged
SUMMARY_AFTER=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports/summary?lat=13.0810&lng=80.2710&radiusKm=10" | jq -c '.')
STATS_AFTER=$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports/community-stats?lat=13.0810&lng=80.2710&radiusKm=10" | jq -c '.')
eq 2 "$SUMMARY_AFTER" "$SUMMARY_BEFORE" "GET /reports/summary counts unchanged by the held report"
eq 2 "$STATS_AFTER" "$STATS_BEFORE" "GET /reports/community-stats unchanged by the held report"

##############################################################################
note "3. Quarantine images are private"
FNAME=$(q "select stored_filename from photo_uploads where id='$U_HELD';")
echo "  stored_filename=$FNAME"
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/uploads/$FNAME");                                    eq 3 "$C" "404" "anon GET /uploads/<stored_filename>"
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/uploads/$FNAME"); eq 3 "$C" "404" "non-owner GET /uploads/<stored_filename>"
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $REPORTER" "$API/uploads/$FNAME"); eq 3 "$C" "404" "even the OWNER cannot reach it via static /uploads/"
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/uploads/report-photo/$U_HELD")
if [ "$C" = "401" ] || [ "$C" = "403" ]; then ok 3 "anon GET /uploads/report-photo/:id refused [$C]"; else bad 3 "anon GET /uploads/report-photo/:id [$C]"; fi
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/uploads/report-photo/$U_HELD"); eq 3 "$C" "404" "non-owner GET /uploads/report-photo/:id"
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $REPORTER" "$API/uploads/report-photo/$U_HELD"); eq 3 "$C" "200" "owner CAN stream their own pending photo"
# path traversal at the static mount
C=$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$API/uploads/../uploads-pending/$FNAME");     eq 3 "$C" "404" "traversal /uploads/../uploads-pending/<file>"
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/uploads/%2e%2e%2fuploads-pending%2f$FNAME");          eq 3 "$C" "404" "encoded traversal at the static mount"

##############################################################################
note "4. Only an admin with reports:manage can preview a quarantined image"
C=$(curl -s -o /dev/null -w '%{http_code}' "$API/admin/report-photos/$U_HELD/file")
if [ "$C" = "401" ] || [ "$C" = "403" ]; then ok 4 "unauthenticated admin preview refused [$C]"; else bad 4 "unauthenticated admin preview [$C]"; fi
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/admin/report-photos/$U_HELD/file")
if [ "$C" = "401" ] || [ "$C" = "403" ]; then ok 4 "citizen bearer refused the admin preview [$C]"; else bad 4 "citizen bearer admin preview [$C]"; fi
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $REPORTER" "$API/admin/report-photos/$U_HELD/file")
if [ "$C" = "401" ] || [ "$C" = "403" ]; then ok 4 "even the photo's OWNER is refused the admin preview [$C]"; else bad 4 "owner admin preview [$C]"; fi
C=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$API/admin/report-photos/$U_HELD/file"); eq 4 "$C" "200" "super_admin preview"
OPSPERM=$(q "select count(*) from admin_role_permissions rp join admin_roles r on r.id=rp.role_id join admin_permissions p on p.id=rp.permission_id where r.key='ops_admin' and p.key='reports:manage';")
echo "  ops_admin holds reports:manage? rows=$OPSPERM"
C=$(curl -s -b "$OPS_JAR" -o /dev/null -w '%{http_code}' "$API/admin/report-photos/$U_HELD/file")
if [ "$OPSPERM" = "1" ]; then eq 4 "$C" "200" "ops_admin HOLDS reports:manage, so preview is allowed (seed grant, not a gap)"; else eq 4 "$C" "403" "ops_admin lacks reports:manage -> refused"; fi
# prove the permission itself is what gates it: revoke, probe, restore
if [ "$OPSPERM" = "1" ]; then
  echo "  temporarily revoking reports:manage from ops_admin to test the gate..."
  q "delete from admin_role_permissions rp using admin_roles r, admin_permissions p where rp.role_id=r.id and rp.permission_id=p.id and r.key='ops_admin' and p.key='reports:manage';" >/dev/null
  sleep 1
  C=$(curl -s -b "$OPS_JAR" -o /dev/null -w '%{http_code}' "$API/admin/report-photos/$U_HELD/file")
  C2=$(curl -s -b "$OPS_JAR" -o /dev/null -w '%{http_code}' -X POST "$API/admin/report-photos/$U_HELD/approve" -H 'content-type: application/json' -d '{"reason":"gate probe"}')
  q "insert into admin_role_permissions (id, role_id, permission_id) select gen_random_uuid(), r.id, p.id from admin_roles r, admin_permissions p where r.key='ops_admin' and p.key='reports:manage' on conflict do nothing;" >/dev/null
  RESTORED=$(q "select count(*) from admin_role_permissions rp join admin_roles r on r.id=rp.role_id join admin_permissions p on p.id=rp.permission_id where r.key='ops_admin' and p.key='reports:manage';")
  eq 4 "$C" "403" "an admin WITHOUT reports:manage is refused the preview"
  eq 4 "$C2" "403" "an admin WITHOUT reports:manage is refused approve"
  eq 4 "$RESTORED" "1" "ops_admin grant restored after the gate probe"
fi

##############################################################################
note "5. Reporter can see their OWN pending report"
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $REPORTER" "$API/reports/$R_HELD"); eq 5 "$C" "200" "GET /reports/:id as the reporter"
MINE=$(curl -s -H "Authorization: Bearer $REPORTER" "$API/users/me/reports")
echo "$MINE" | grep -q "$R_HELD" && ok 5 "held report appears in the reporter's own /users/me/reports" || bad 5 "reporter's own list omits it"
OWNPHOTOS=$(curl -s -H "Authorization: Bearer $REPORTER" "$API/reports/$R_HELD" | jq -c '.photos')
eq 5 "$OWNPHOTOS" "[]" "reporter's own held report exposes NO public photo url"

##############################################################################
note "6. Reporter cannot alter another citizen's report"
U_STR=$(upload "$STRANGER" medicalHelp | jq -r '.uploadId')
R_STR=$(mkreport "$STRANGER" medicalHelp "SEC-REG stranger held" "[\"$U_STR\"]" | jq -r '.id // .data.id')
echo "  R_STR=$R_STR status=$(rstatus "$R_STR")"
U_X=$(upload "$REPORTER" medicalHelp | jq -r '.uploadId')
BF=$(mktemp)
C=$(curl -s -o "$BF" -w '%{http_code}' -X PUT "$API/reports/$R_STR/photos" -H "Authorization: Bearer $REPORTER" \
  -H 'content-type: application/json' -d "{\"photoUploadIds\":[\"$U_X\"]}"); B=$(cat "$BF")
if [ "$C" = "403" ] || [ "$C" = "404" ]; then ok 6 "PUT /reports/:id/photos on another citizen's report refused [$C $(echo "$B"|jq -c '.message//.code' 2>/dev/null)]"; else bad 6 "PUT on another citizen's report [$C $B]"; fi
STILL=$(q "select count(*) from photo_uploads where id='$U_X' and report_id='$R_STR';"); eq 6 "$STILL" "0" "attacker's upload was NOT linked to the victim report"
SURV=$(q "select count(*) from photo_uploads where id='$U_STR' and report_id='$R_STR';"); eq 6 "$SURV" "1" "victim's own upload still attached (not detached by the failed call)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/reports/$R_STR" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' -d '{"title":"hijacked"}')
if [ "$C" = "403" ] || [ "$C" = "404" ]; then ok 6 "PATCH /reports/:id on another citizen's report refused [$C]"; else bad 6 "PATCH on another citizen's report [$C]"; fi
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/reports/$R_STR/photos" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' -d "{\"uploadId\":\"$U_X\"}")
if [ "$C" = "403" ] || [ "$C" = "404" ]; then ok 6 "POST /reports/:id/photos on another citizen's report refused [$C]"; else bad 6 "POST photos on another citizen's report [$C]"; fi

##############################################################################
note "7. A pass earned under one category cannot be silently published under another"
# baseline: forced pass, filed under the SAME category it was judged for -> must publish
U_BASE=$(upload "$REPORTER" animalRescue | jq -r '.uploadId'); force_pass "$U_BASE"
R_BASE=$(mkreport "$REPORTER" animalRescue "SEC-REG same-category baseline" "[\"$U_BASE\"]" | jq -r '.id // .data.id')
S_BASE=$(rstatus "$R_BASE"); eq 7 "$S_BASE" "open" "control: forced pass + matching category publishes (proves the fixture is a real pass)"
# the actual check: judged under communityHelp (zero expected labels), filed under animalRescue
U_CAT=$(upload "$REPORTER" communityHelp | jq -r '.uploadId'); force_pass "$U_CAT"
echo "  U_CAT judged category = $(q "select c.key from photo_uploads u join report_categories c on c.id=u.category_id where u.id='$U_CAT';"), decision=$(q "select decision from photo_uploads where id='$U_CAT';")"
R_CAT=$(mkreport "$REPORTER" animalRescue "SEC-REG cross-category" "[\"$U_CAT\"]" | jq -r '.id // .data.id')
S_CAT=$(rstatus "$R_CAT"); eq 7 "$S_CAT" "pending_review" "POST /reports holds a cross-category pass for review"
P_CAT=$(q "select count(*) from report_photos where report_id='$R_CAT';"); eq 7 "$P_CAT" "0" "cross-category pass produced ZERO public report_photos rows"
C=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/reports/$R_CAT"); eq 7 "$C" "404" "cross-category report is invisible to another citizen"
# and via the replace-held path
U_CAT2=$(upload "$REPORTER" communityHelp | jq -r '.uploadId'); force_pass "$U_CAT2"
RESP=$(curl -s -X PUT "$API/reports/$R_CAT/photos" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' -d "{\"photoUploadIds\":[\"$U_CAT2\"]}")
S_CAT2=$(rstatus "$R_CAT"); eq 7 "$S_CAT2" "pending_review" "PUT /reports/:id/photos also holds a cross-category pass"

##############################################################################
note "8. Post-publish attach paths: does the category hold fire there too?"
# R_BASE is an OPEN animalRescue report. Try to bolt on a communityHelp-judged pass.
U_ADD=$(upload "$REPORTER" communityHelp | jq -r '.uploadId'); force_pass "$U_ADD"
BF=$(mktemp)
C=$(curl -s -o "$BF" -w '%{http_code}' -X POST "$API/reports/$R_BASE/photos" -H "Authorization: Bearer $REPORTER" \
  -H 'content-type: application/json' -d "{\"uploadId\":\"$U_ADD\"}"); B=$(cat "$BF")
ADDED=$(q "select count(*) from report_photos where report_id='$R_BASE' and upload_id='$U_ADD';")
echo "  POST /reports/$R_BASE/photos -> HTTP $C ; report_photos row for U_ADD = $ADDED"
if [ "$ADDED" = "0" ]; then ok 8 "POST /reports/:id/photos refused the cross-category pass [$C $(echo "$B"|jq -r '.code//empty' 2>/dev/null)]"
else bad 8 "REGRESSION: POST /reports/:id/photos PUBLISHED a communityHelp-judged photo onto an animalRescue report [HTTP $C, report_photos row created]"; fi
U_PATCH=$(upload "$REPORTER" communityHelp | jq -r '.uploadId'); force_pass "$U_PATCH"
BF=$(mktemp)
C=$(curl -s -o "$BF" -w '%{http_code}' -X PATCH "$API/reports/$R_BASE" -H "Authorization: Bearer $REPORTER" \
  -H 'content-type: application/json' -d "{\"photoUploadIds\":[\"$U_PATCH\"]}"); B=$(cat "$BF")
PATCHED=$(q "select count(*) from report_photos where report_id='$R_BASE' and upload_id='$U_PATCH';")
echo "  PATCH /reports/$R_BASE -> HTTP $C ; report_photos row for U_PATCH = $PATCHED"
if [ "$PATCHED" = "0" ]; then ok 8 "PATCH /reports/:id refused the cross-category pass [$C]"
else bad 8 "REGRESSION: PATCH /reports/:id PUBLISHED a communityHelp-judged photo onto an animalRescue report [HTTP $C, report_photos row created]"; fi

# REGRESSION GUARD: the legitimate same-category post-publish add must STILL work,
# or the category fix has simply broken adding photos to your own live report.
U_OK=$(upload "$REPORTER" animalRescue | jq -r '.uploadId'); force_pass "$U_OK"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/reports/$R_BASE/photos" -H "Authorization: Bearer $REPORTER" \
  -H 'content-type: application/json' -d "{\"uploadId\":\"$U_OK\"}")
OKROW=$(q "select count(*) from report_photos where report_id='$R_BASE' and upload_id='$U_OK';")
eq 8 "$OKROW" "1" "regression guard: a SAME-category pass still attaches to the live report (HTTP $C)"
U_OK2=$(upload "$REPORTER" animalRescue | jq -r '.uploadId'); force_pass "$U_OK2"
C=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/reports/$R_BASE" -H "Authorization: Bearer $REPORTER" \
  -H 'content-type: application/json' -d "{\"photoUploadIds\":[\"$U_OK2\"]}")
OKROW2=$(q "select count(*) from report_photos where report_id='$R_BASE' and upload_id='$U_OK2';")
eq 8 "$OKROW2" "1" "regression guard: a SAME-category pass still replaces via PATCH (HTTP $C)"

##############################################################################
note "9. Approve staleness guard (wrong reportId)"
WRONG=$(q "select id from reports where id <> '$R_HELD' order by created_at desc limit 1;")
AUD0=$(q "select count(*) from admin_audit_logs;")
BF=$(mktemp)
C=$(curl -s -o "$BF" -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_HELD/approve" \
  -H 'content-type: application/json' -d "{\"reason\":\"SEC-REG mismatch\",\"reportId\":\"$WRONG\"}"); B=$(cat "$BF")
eq 9 "$C" "409" "approve with a mismatched reportId; code=$(echo "$B"|jq -r '.code//empty' 2>/dev/null)"
echo "$B" | grep -q PHOTO_REPORT_MISMATCH && ok 9 "error code is PHOTO_REPORT_MISMATCH" || bad 9 "unexpected code: $B"
VS=$(vstatus "$U_HELD"); eq 9 "$VS" "failed" "mismatched approve did NOT change the photo's verification status"
RS=$(rstatus "$R_HELD"); eq 9 "$RS" "pending_review" "mismatched approve did NOT publish the report"
AUD1=$(q "select count(*) from admin_audit_logs;")
eq 12 "$AUD1" "$AUD0" "check 12a: a refused (409) approve wrote NO audit row"

##############################################################################
note "10 + 11. Idempotency of the three decisions, and audit rows"
audit_last(){ q "select a.key||'|'||t.key||'|'||coalesce(l.target_id,'?')||'|'||l.actor_email||'|'||l.actor_role_key||'|'||coalesce(l.reason,'?')||'|'||coalesce(l.after::text,'?') from admin_audit_logs l join admin_audit_actions a on a.id=l.action_id join admin_audit_target_types t on t.id=l.target_type_id order by l.created_at desc, l.id desc limit 1;"; }
# --- approve x2 on R_HELD
AUD0=$(q "select count(*) from admin_audit_logs;")
C1=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_HELD/approve" -H 'content-type: application/json' -d '{"reason":"SEC-REG approve"}')
AUD1=$(q "select count(*) from admin_audit_logs;"); LAST=$(audit_last)
if [ "$C1" = "200" ] || [ "$C1" = "201" ]; then ok 10 "first approve accepted [$C1]"; else bad 10 "first approve [$C1]"; fi
eq 11 "$((AUD1-AUD0))" "1" "approve wrote exactly one audit row"
echo "  audit row: $LAST"
echo "$LAST" | grep -q "report_photo.approve|" && ok 11 "audit action is report_photo.approve" || bad 11 "wrong audit action: $LAST"
echo "$LAST" | grep -q "|$U_HELD|" && ok 11 "audit target_id is the upload id" || bad 11 "wrong target_id: $LAST"
echo "$LAST" | grep -q "|admin@uthavu.org" && ok 11 "audit actor is the acting admin" || bad 11 "wrong actor: $LAST"
echo "  audit target_type=$(echo "$LAST" | cut -d'|' -f2)"
AUD1=$(q "select count(*) from admin_audit_logs;")
C2=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_HELD/approve" -H 'content-type: application/json' -d '{"reason":"SEC-REG approve 2"}')
eq 10 "$C2" "409" "second approve refused"
AUD2=$(q "select count(*) from admin_audit_logs;"); eq 12 "$AUD2" "$AUD1" "check 12b: the refused second approve wrote NO audit row"
eq 10 "$(rstatus "$R_HELD")" "open" "report published exactly once by the approve"
eq 10 "$(q "select count(*) from report_photos where report_id='$R_HELD';")" "1" "exactly one report_photos row after two approves"
# --- reject x2
U_REJ=$(upload "$REPORTER" medicalHelp | jq -r '.uploadId')
R_REJ=$(mkreport "$REPORTER" medicalHelp "SEC-REG reject target" "[\"$U_REJ\"]" | jq -r '.id // .data.id')
AUD0=$(q "select count(*) from admin_audit_logs;")
C1=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_REJ/reject" -H 'content-type: application/json' -d '{"reason":"SEC-REG reject reason"}')
AUD1=$(q "select count(*) from admin_audit_logs;"); LASTR=$(audit_last)
if [ "$C1" = "200" ] || [ "$C1" = "201" ]; then ok 10 "first reject accepted [$C1]"; else bad 10 "first reject [$C1]"; fi
eq 11 "$((AUD1-AUD0))" "1" "reject wrote exactly one audit row"
echo "  audit row: $LASTR"
echo "$LASTR" | grep -q "report_photo.reject|" && ok 11 "audit action is report_photo.reject" || bad 11 "wrong action: $LASTR"
echo "$LASTR" | grep -q "|$U_REJ|" && ok 11 "reject audit target_id is the upload id" || bad 11 "wrong target_id: $LASTR"
C2=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_REJ/reject" -H 'content-type: application/json' -d '{"reason":"SEC-REG reject again"}')
eq 10 "$C2" "409" "second reject refused"
AUD2=$(q "select count(*) from admin_audit_logs;"); eq 12 "$AUD2" "$AUD1" "check 12c: the refused second reject wrote NO audit row"
# --- request-new x2
U_RN=$(upload "$REPORTER" medicalHelp | jq -r '.uploadId')
R_RN=$(mkreport "$REPORTER" medicalHelp "SEC-REG request-new target" "[\"$U_RN\"]" | jq -r '.id // .data.id')
AUD0=$(q "select count(*) from admin_audit_logs;")
C1=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_RN/request-new" -H 'content-type: application/json' -d '{"reason":"SEC-REG please retake"}')
AUD1=$(q "select count(*) from admin_audit_logs;"); LASTN=$(audit_last)
if [ "$C1" = "200" ] || [ "$C1" = "201" ]; then ok 10 "first request-new accepted [$C1]"; else bad 10 "first request-new [$C1]"; fi
eq 11 "$((AUD1-AUD0))" "1" "request-new wrote exactly one audit row"
echo "  audit row: $LASTN"
echo "$LASTN" | grep -q "|$U_RN|" && ok 11 "request-new audit target_id is the upload id" || bad 11 "wrong target_id: $LASTN"
C2=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_RN/request-new" -H 'content-type: application/json' -d '{"reason":"SEC-REG retake again"}')
eq 10 "$C2" "409" "second request-new refused"
AUD2=$(q "select count(*) from admin_audit_logs;"); eq 12 "$AUD2" "$AUD1" "check 12d: the refused second request-new wrote NO audit row"
# cross-decision: reject after approve, request-new after reject
C=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_HELD/reject" -H 'content-type: application/json' -d '{"reason":"SEC-REG reject an approved one"}')
eq 10 "$C" "409" "reject after approve refused"
C=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_REJ/request-new" -H 'content-type: application/json' -d '{"reason":"SEC-REG request-new after reject"}')
eq 10 "$C" "409" "request-new after reject refused"

##############################################################################
note "12. Audit is written in the SAME transaction as the mutation"
# An in-transaction failure: claim() succeeds, then publishIfReady() throws because
# the quarantined file is gone. If the audit and the mutation were not one unit,
# the photo would end up reviewed with no audit row.
U_TX=$(upload "$REPORTER" medicalHelp | jq -r '.uploadId')
R_TX=$(mkreport "$REPORTER" medicalHelp "SEC-REG txn atomicity" "[\"$U_TX\"]" | jq -r '.id // .data.id')
FTX=$(q "select stored_filename from photo_uploads where id='$U_TX';")
docker exec uthavu-api sh -c "rm -f /repo/apps/api/uploads-pending/$FTX /repo/apps/api/uploads/$FTX"
AUD0=$(q "select count(*) from admin_audit_logs;")
C=$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$API/admin/report-photos/$U_TX/approve" -H 'content-type: application/json' -d '{"reason":"SEC-REG rollback probe"}')
AUD1=$(q "select count(*) from admin_audit_logs;")
RV=$(q "select coalesce(reviewed_at::text,'NULL') from photo_uploads where id='$U_TX';")
VS=$(vstatus "$U_TX"); RS=$(rstatus "$R_TX")
echo "  approve-with-missing-file -> HTTP $C ; reviewed_at=$RV ; verification=$VS ; report=$RS ; audit delta=$((AUD1-AUD0))"
eq 12 "$((AUD1-AUD0))" "0" "in-transaction failure wrote NO audit row"
eq 12 "$RV" "NULL" "in-transaction failure ROLLED BACK the claim (reviewed_at still null)"
eq 12 "$VS" "failed" "verification status rolled back too"
eq 12 "$RS" "pending_review" "report was not published by the rolled-back approve"
ORPH=$(q "select count(*) from admin_audit_logs l join admin_audit_actions a on a.id=l.action_id join photo_uploads u on u.id::text=l.target_id where a.key like 'report_photo.%' and u.reviewed_at is null;")
eq 12 "$ORPH" "0" "no audit row anywhere names a photo_upload that was never reviewed"

##############################################################################
note "13. No AI/provider internals on citizen surfaces"
LEAKWORDS='rekognition|"provider"|confidence|"signals"|sha256|phash|moderationModelVersion|labelModelVersion|unavailableReason|threshold|riskLevel|"decision"|reviewReason|reviewedBy|storedFilename|expectedLabels|category-mismatch|categoryId'
scan(){ # $1 label $2 json
  local hits; hits=$(echo "$2" | grep -oEi "$LEAKWORDS" | sort -u | tr '\n' ' ')
  if [ -z "$hits" ]; then ok 13 "$1: clean"; else bad 13 "$1 exposes: $hits"; fi
}
scan "GET /reports/:id (published, as stranger)" "$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports/$R_HELD")"
scan "GET /reports/:id (held, as its reporter)"  "$(curl -s -H "Authorization: Bearer $REPORTER" "$API/reports/$R_CAT")"
scan "GET /reports nearby listing"               "$(curl -s -H "Authorization: Bearer $STRANGER" "$API/reports?categoryKey=medicalHelp&lat=13.0810&lng=80.2710&radiusKm=10")"
scan "GET /users/me/reports"                     "$(curl -s -H "Authorization: Bearer $REPORTER" "$API/users/me/reports")"
scan "GET /users/me/saved-reports"               "$(curl -s -H "Authorization: Bearer $REPORTER" "$API/users/me/saved-reports")"
scan "GET /users/me/impact-stories"              "$(curl -s -H "Authorization: Bearer $REPORTER" "$API/users/me/impact-stories")"
scan "GET /users/me/alerts"                      "$(curl -s -H "Authorization: Bearer $REPORTER" "$API/users/me/alerts")"
# raw label names from the category config must not appear either
LABELS=$(q "select string_agg(l, '|') from (select jsonb_array_elements_text(expected_labels) l from report_categories where key='medicalHelp') t;")
echo "  medicalHelp expected labels: $LABELS"
RB=$(curl -s -H "Authorization: Bearer $REPORTER" "$API/reports/$R_HELD")
if [ -n "$LABELS" ] && echo "$RB" | grep -qEi "$LABELS"; then bad 13 "report detail echoes raw expected label names"; else ok 13 "no raw provider label names in the report detail"; fi
# the uploader's own upload response (informational: it is the uploader's own verdict)
echo "  POST /uploads/report-photo response shape: $(upload "$REPORTER" medicalHelp | jq -c 'keys')"
# the admin surface SHOULD have the internals; assert they are actually there so
# the citizen-side cleanliness above is not just an empty projection everywhere.
ADMINJSON=$(curl -s -b "$ADMIN_JAR" "$API/admin/report-photos/$U_REJ")
if echo "$ADMINJSON" | grep -qi 'provider'; then ok 13 "control: the ADMIN detail does carry provider internals (so the citizen scan is meaningful)"; else bad 13 "control failed: admin detail has no internals either — the scan proves nothing"; fi

##############################################################################
note "14. No client-provided field can force a PASS"
# (a) in the multipart upload body
U_F=$(upload "$REPORTER" medicalHelp -F 'decision=pass' -F 'verdict=pass' -F 'verificationStatus=passed' -F 'riskLevel=low' -F 'status=passed' | jq -r '.uploadId')
DEC=$(q "select coalesce(decision,'NULL') from photo_uploads where id='$U_F';"); VS=$(vstatus "$U_F"); RL=$(q "select coalesce(risk_level,'NULL') from photo_uploads where id='$U_F';")
echo "  forged upload body -> decision=$DEC verification=$VS risk_level=$RL"
eq 14 "$DEC" "review" "forged decision/verdict in the upload body did not become a pass"
eq 14 "$VS" "failed" "forged verificationStatus in the upload body was ignored"
# (b) in POST /reports
RESP=$(curl -s -X POST "$API/reports" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' \
  -d "{\"categoryKey\":\"medicalHelp\",\"title\":\"SEC-REG forced pass\",\"description\":\"SEC-REG probe description long enough to satisfy validation rules.\",\"lat\":13.0810,\"lng\":80.2710,\"neededVolunteers\":1,\"photoUploadIds\":[\"$U_F\"],\"decision\":\"pass\",\"verdict\":\"pass\",\"verificationStatus\":\"passed\",\"riskLevel\":\"low\",\"status\":\"open\",\"statusId\":\"whatever\",\"holdForReview\":false}")
R_F=$(echo "$RESP" | jq -r '.id // .data.id')
S_F=$(rstatus "$R_F")
echo "  POST /reports with forged verdict fields -> report $R_F status=$S_F responseStatus=$(echo "$RESP"|jq -r '.status')"
eq 14 "$S_F" "pending_review" "forged decision/status/verdict on POST /reports did not publish it"
eq 14 "$(q "select count(*) from report_photos where report_id='$R_F';")" "0" "forged fields produced no public photo"
eq 14 "$(q "select coalesce(decision,'NULL') from photo_uploads where id='$U_F';")" "review" "the stored verdict is still the backend's own"
# (c) PATCH trying to force status
C=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/reports/$R_F" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' -d '{"status":"open","statusId":"x","verificationStatus":"passed"}')
eq 14 "$(rstatus "$R_F")" "pending_review" "PATCH with forged status fields did not publish the held report (HTTP $C)"

##############################################################################
note "15. No client-provided photo URL on ANY report write path"
EVIL="http://evil.example.com/attacker.png"
# (a) POST /reports with photoUrls only
RESP=$(curl -s -w '\n%{http_code}' -X POST "$API/reports" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' \
  -d "{\"categoryKey\":\"medicalHelp\",\"title\":\"SEC-REG urls only\",\"description\":\"SEC-REG probe description long enough to satisfy validation rules.\",\"lat\":13.0810,\"lng\":80.2710,\"neededVolunteers\":1,\"photoUrls\":[\"$EVIL\"]}")
C=$(echo "$RESP"|tail -1); eq 15 "$C" "400" "POST /reports with photoUrls and no photoUploadIds is rejected"
# (b) POST /reports with both
U_U=$(upload "$REPORTER" medicalHelp | jq -r '.uploadId')
RESP=$(curl -s -X POST "$API/reports" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' \
  -d "{\"categoryKey\":\"medicalHelp\",\"title\":\"SEC-REG urls plus ids\",\"description\":\"SEC-REG probe description long enough to satisfy validation rules.\",\"lat\":13.0810,\"lng\":80.2710,\"neededVolunteers\":1,\"photoUploadIds\":[\"$U_U\"],\"photoUrls\":[\"$EVIL\"],\"photos\":[\"$EVIL\"]}")
R_U=$(echo "$RESP" | jq -r '.id // .data.id')
eq 15 "$(q "select count(*) from report_photos where report_id='$R_U' and url like '%evil.example.com%';")" "0" "POST /reports ignored photoUrls/photos alongside valid ids"
echo "  response .photos = $(echo "$RESP" | jq -c '.photos')"
# (c) PATCH /reports/:id
curl -s -o /dev/null -X PATCH "$API/reports/$R_BASE" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' \
  -d "{\"photoUrls\":[\"$EVIL\"],\"photos\":[\"$EVIL\"],\"title\":\"SEC-REG patched\"}"
eq 15 "$(q "select count(*) from report_photos where report_id='$R_BASE' and url like '%evil.example.com%';")" "0" "PATCH /reports/:id ignored photoUrls"
# (d) POST /reports/:id/photos
RESP=$(curl -s -w '\n%{http_code}' -X POST "$API/reports/$R_BASE/photos" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' -d "{\"url\":\"$EVIL\",\"photoUrls\":[\"$EVIL\"]}")
C=$(echo "$RESP"|tail -1); eq 15 "$C" "400" "POST /reports/:id/photos with only a URL is rejected"
# (e) PUT /reports/:id/photos
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$API/reports/$R_CAT/photos" -H "Authorization: Bearer $REPORTER" -H 'content-type: application/json' -d "{\"photoUrls\":[\"$EVIL\"]}")
C=$(echo "$RESP"|tail -1); eq 15 "$C" "400" "PUT /reports/:id/photos with only URLs is rejected"
GLOBAL=$(q "select count(*) from report_photos where url like '%evil.example.com%';")
eq 15 "$GLOBAL" "0" "no report_photos row anywhere carries the attacker URL"

##############################################################################
note "Result"
printf '  passed: %d   failed: %d   n/a: %d\n' "$PASS" "$FAIL" "$SKIP"
printf '\n--- MACHINE READABLE ---\n'
for r in "${RESULTS[@]}"; do echo "$r"; done
rm -rf "$PHOTO_DIR" "$ADMIN_JAR" "$OPS_JAR"
