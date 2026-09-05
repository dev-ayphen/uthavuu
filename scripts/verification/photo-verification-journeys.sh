set -uo pipefail
# Resolve the repo from this script's own location so the probe runs from any
# checkout and any working directory, not just the one it was written in.
export REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
API=http://localhost:3001
P=0; F=0
ok(){ printf '  \033[32m✓\033[0m %s\n' "$*"; P=$((P+1)); }
bad(){ printf '  \033[31m✗\033[0m %s\n' "$*"; F=$((F+1)); }
ck(){ if [ "$1" = "$2" ]; then ok "$3 ($1)"; else bad "$3 — expected $2, got $1"; fi; }
psql(){ docker exec uthavu-postgres psql -U uthavu -d uthavu_dev -tAc "$1" 2>/dev/null; }

R=$(( $(date +%s) % 90000 + 10000 ))
JAR=$(mktemp); curl -s -c "$JAR" -X POST "$API/api/auth/sign-in/email" -H 'content-type: application/json' -d '{"email":"admin@uthavu.org","password":"Admin@123"}' >/dev/null
PIC=$(mktemp /tmp/j-XXXX.png)
node -e 'const {Jimp}=require(""+process.env.REPO_ROOT+"/apps/api/node_modules/jimp");(async()=>{const i=new Jimp({width:500,height:400,color:0x9c4221ff});require("fs").writeFileSync(process.argv[1],Buffer.from(await i.getBuffer("image/png")))})()' "$PIC"

citizen(){ local ph="$1"
  curl -s -X POST "$API/api/auth/phone-number/send-otp" -H 'content-type: application/json' -d "{\"phoneNumber\":\"$ph\"}" >/dev/null
  local c; c=$(curl -s "$API/dev/otp?phone=$(printf %s "$ph"|sed 's/+/%2B/')" | sed -n 's/.*"code":"\([0-9]*\)".*/\1/p')
  curl -s -X POST "$API/api/auth/phone-number/verify" -H 'content-type: application/json' -d "{\"phoneNumber\":\"$ph\",\"code\":\"$c\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'; }
up(){ curl -s -X POST "$API/uploads/report-photo" -H "Authorization: Bearer $1" -F "file=@$PIC;type=image/png" -F "categoryKey=medicalHelp" | sed -n 's/.*"uploadId":"\([^"]*\)".*/\1/p'; }
mk(){ curl -s -X POST "$API/reports" -H "Authorization: Bearer $1" -H 'content-type: application/json' \
  -d "{\"categoryKey\":\"medicalHelp\",\"title\":\"$3\",\"description\":\"Journey probe description long enough to validate.\",\"lat\":13.08,\"lng\":80.27,\"anonymous\":false,\"phoneVisible\":false,\"neededVolunteers\":1,\"photoUploadIds\":[\"$2\"]}" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1; }
st(){ psql "select s.key from reports r join report_statuses s on s.id=r.status_id where r.id='$1';"; }

printf '\n\033[1mJOURNEY B — Review → Admin Reject\033[0m\n'
PH="+919${R}0021"; TOK=$(citizen "$PH"); U1=$(up "$TOK"); RID=$(mk "$TOK" "$U1" "Journey B reject")
ck "$(st "$RID")" "pending_review" "report held"
AB=$(psql "select count(*) from admin_audit_logs;")
RJ=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$API/admin/report-photos/$U1/reject" -H 'content-type: application/json' -d '{"reason":"Journey B: image does not meet guidelines."}')
if [ "$RJ" = "200" ] || [ "$RJ" = "201" ]; then ok "reject accepted ($RJ)"; else bad "reject — got $RJ"; fi
ck "$(st "$RID")" "rejected" "report is rejected, not public"
ck "$(psql "select count(*) from report_photos where report_id='$RID';")" "0" "still ZERO report_photos"
FN=$(psql "select stored_filename from photo_uploads where id='$U1';")
ck "$(curl -s -o /dev/null -w '%{http_code}' "$API/uploads/$FN")" "404" "photo never became public"
AA=$(psql "select count(*) from admin_audit_logs;")
if [ "$AA" -gt "$AB" ]; then ok "audit row written ($AB -> $AA)"; else bad "no audit row"; fi
psql "select '    action='||a.key||'  reason='||coalesce(l.reason,'NULL') from admin_audit_logs l join admin_audit_actions a on a.id=l.action_id where l.target_id='$U1';"
ALERTS=$(psql "select count(*) from alerts a join \"user\" u on u.id=a.user_id where u.name='$PH';")
if [ "$ALERTS" -ge 1 ]; then ok "reporter notified ($ALERTS alert)"; else bad "reporter NOT notified"; fi
psql "select '    type='||a.type||'  title='||a.title from alerts a join \"user\" u on u.id=a.user_id where u.name='$PH';"
STRANGER=$(citizen "+919${R}0029")
ck "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STRANGER" "$API/reports/$RID")" "404" "rejected report invisible to other citizens"

printf '\n\033[1mJOURNEY C — Review → Request New Photo → replacement\033[0m\n'
PH2="+919${R}0022"; TOK2=$(citizen "$PH2"); U2=$(up "$TOK2"); RID2=$(mk "$TOK2" "$U2" "Journey C request-new")
ck "$(st "$RID2")" "pending_review" "report held"
RN=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$API/admin/report-photos/$U2/request-new" -H 'content-type: application/json' -d '{"reason":"Please send a clearer photo of the scene."}')
if [ "$RN" = "200" ] || [ "$RN" = "201" ]; then ok "request-new accepted ($RN)"; else bad "request-new — got $RN"; fi
ck "$(st "$RID2")" "pending_review" "report STAYS pending (not rejected)"
psql "select '    old upload status='||s.key||'  reviewed='||coalesce(u.reviewed_at::text,'NULL') from photo_uploads u join photo_verification_statuses s on s.id=u.status_id where u.id='$U2';"
A2=$(psql "select count(*) from alerts a join \"user\" u on u.id=a.user_id where u.name='$PH2';")
if [ "$A2" -ge 1 ]; then ok "reporter notified ($A2 alert)"; else bad "reporter NOT notified"; fi
psql "select '    type='||a.type||'  title='||a.title from alerts a join \"user\" u on u.id=a.user_id where u.name='$PH2';"

U3=$(up "$TOK2")
REPL=$(curl -s -X PUT "$API/reports/$RID2/photos" -H "Authorization: Bearer $TOK2" -H 'content-type: application/json' -d "{\"photoUploadIds\":[\"$U3\"]}" -o /dev/null -w '%{http_code}')
ck "$REPL" "200" "reporter can submit a replacement"
ck "$(psql "select coalesce(report_id::text,'DETACHED') from photo_uploads where id='$U2';")" "DETACHED" "superseded upload detached so it stops blocking release"
ck "$(psql "select count(*) from photo_uploads where id='$U3' and report_id='$RID2';")" "1" "replacement linked to the report"
# No AWS -> replacement is also held, so the report legitimately stays pending.
ck "$(st "$RID2")" "pending_review" "still held (replacement also unverifiable without AWS)"
AP=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$API/admin/report-photos/$U3/approve" -H 'content-type: application/json' -d '{"reason":"Journey C: replacement is acceptable."}')
if [ "$AP" = "200" ] || [ "$AP" = "201" ]; then ok "admin approves the replacement ($AP)"; else bad "approve — got $AP"; fi
ck "$(st "$RID2")" "open" "report publishes after the replacement is approved"
ck "$(psql "select count(*) from report_photos where report_id='$RID2';")" "1" "exactly one report_photos row — the replacement"
ck "$(psql "select count(*) from report_photos p join photo_uploads u on u.id=p.upload_id where p.report_id='$RID2' and u.id='$U3';")" "1" "the published photo IS the replacement, not the refused one"

rm -f "$PIC" "$JAR"
printf '\n  passed: %d   failed: %d\n' "$P" "$F"
