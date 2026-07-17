#!/usr/bin/env bash
set -euo pipefail

API="${API_BASE:-http://localhost:4000}"
EMAIL="smoke$(date +%s)@example.com"
PASS='password123'

echo "Health:"
curl -sf "$API/api/v1/health" | tee /dev/stderr | grep -q '"success":true'

REG=$(curl -sf -X POST "$API/api/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke User\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(node -e "const j=JSON.parse(process.argv[1]); if(!j.success){console.error(j);process.exit(1)}; process.stdout.write(j.data.accessToken)" "$REG")
EVENT_ID=$(node -e "console.log(require('crypto').randomUUID())")

BODY=$(node -e "
const id=process.argv[1];
console.log(JSON.stringify({
  events:[{
    eventId:id,
    timestamp:new Date().toISOString(),
    type:'ApplicationRecorded',
    payload:{platform:'naukri',title:'Frontend Engineer',company:'Atlas Labs',location:'Bengaluru',status:'applied',url:'https://www.naukri.com/job-listings-1'},
    retryCount:0,
    syncStatus:'pending'
  }]
}))
" "$EVENT_ID")

curl -sf -X POST "$API/api/v1/events/sync" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY" >/dev/null
curl -sf -X POST "$API/api/v1/events/sync" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY" >/dev/null
APPS=$(curl -sf "$API/api/v1/applications" -H "Authorization: Bearer $TOKEN")
TOTAL=$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.data.total))" "$APPS")

if [[ "$TOTAL" != "1" ]]; then
  echo "Expected 1 application after idempotent sync, got $TOTAL"
  exit 1
fi

echo "Smoke OK — registered, synced twice, applications.total=1"
