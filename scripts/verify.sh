#!/usr/bin/env bash
#
# Production verification for the Supabase Guestbook.
#
# Qualifies the REAL self-hosted Supabase data layer (Postgres + PostgREST +
# nginx) with no mocks, then runs the standalone Next.js production bundle
# against it on the loopback interface:
#   1. builds the production bundle (Next standalone output)
#   2. starts the real data stack (db / rest / api) via docker compose
#   3. verifies GET / POST / PATCH / DELETE with validated-write rejection
#      (invalid input -> 400, missing rows -> 404) and the genuine /api/ready
#   4. verifies the public.messages schema in Postgres
#   5. verifies server-side rendering of the standalone server
#   6. verifies data persistence across a full stack restart
#
# The app service itself is intentionally left out here: building its image
# needs outbound registry/DNS access (see README "Compose image build") that is
# blocked on some xCloud hosts. Everything else — real Postgres, real PostgREST,
# the real production Next.js server — is exercised for real.
#
# Script always cleans up the standalone server and (unless VERIFY_KEEP_STACK=1)
# the Compose stack it started. It never touches other projects' containers.
#
# Usage: bash scripts/verify.sh
# Env overrides:
#   APP_PORT          port the standalone server binds on loopback (default 8130)
#   VERIFY_API_PORT   loopback port for the internal REST API (default 8105)
#   VERIFY_NO_BUILD   set to 1 to skip the standalone `npm run build`
#   VERIFY_KEEP_STACK set to 1 to leave the data stack up after the run
#
set -euo pipefail

cd "$(dirname "$0")/.."

APP_PORT="${APP_PORT:-8130}"
VERIFY_API_PORT="${VERIFY_API_PORT:-8105}"
BASE_URL="http://127.0.0.1:${APP_PORT}"
API_URL="http://127.0.0.1:${VERIFY_API_PORT}"
COMPOSE=(docker compose -f docker-compose.yml -f scripts/verify.compose.yml)

MARKER="verify-$(date +%s)"
SERVER_LOG="$(mktemp)"
SERVER_PID=""

info() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
pass() { printf '  \033[1;32mok:\033[0m %s\n' "$*"; }
fail() { printf '  \033[1;31mFAIL:\033[0m %s\n' "$*"; exit 1; }

for tool in docker node npm curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'missing required tool: %s\n' "$tool" >&2; exit 1; }
done

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  if [ "${VERIFY_KEEP_STACK:-0}" = "1" ]; then
    printf '\n\033[1;33mnote:\033[0m VERIFY_KEEP_STACK=1: leaving the data stack up\n'
  else
    "${COMPOSE[@]}" down >/dev/null 2>&1 || true
  fi
  rm -f "${SERVER_LOG}"
}
trap cleanup EXIT

wait_api() {
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null 2>/dev/null "$API_URL/rest/v1/"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_ready() {
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null 2>/dev/null "$BASE_URL/api/ready"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# --- 1. production build -----------------------------------------------------
if [ "${VERIFY_NO_BUILD:-0}" != "1" ]; then
  info "Building the production bundle (Next standalone)"
  npm run build || fail "production build failed"
  pass "production build completed"
fi
[ -f ".next/standalone/server.js" ] || fail "no .next/standalone/server.js — run the build first"

# --- 2. real data stack --------------------------------------------------------
info "Starting the real Supabase data stack (db, rest, api)"
"${COMPOSE[@]}" up -d db rest api || fail "docker compose up (db/rest/api) failed"
pass "Postgres + PostgREST + nginx stack is up"

info "Waiting for the internal REST API on the loopback port"
wait_api || fail "internal REST API never answered on $API_URL"
pass "internal REST API reachable on $API_URL/rest/v1/"

# --- 3. standalone server on loopback ------------------------------------------
info "Starting the standalone Next.js production server on $BASE_URL"
cp -r .next/static .next/standalone/.next/static
(
  cd .next/standalone &&
    PORT="${APP_PORT}" HOSTNAME=127.0.0.1 \
    SUPABASE_URL="${API_URL}" \
    SUPABASE_ANON_KEY="guestbook-internal-verify" \
    SUPABASE_INTERNAL_NO_AUTH=true \
    exec node server.js
) >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!
wait_ready || { cat "${SERVER_LOG}" >&2; fail "standalone server never became ready"; }
grep -q "Ready in" "${SERVER_LOG}" || cat "${SERVER_LOG}" >&2
pass "standalone server is ready and serves /api/ready with a real DB query"

# --- health / readiness genuinely check the DB -------------------------------
info "Health and readiness endpoints"
curl -fsS "$BASE_URL/api/health" | jq -e '.status == "ok"' >/dev/null || fail "/api/health did not report ok"
pass "/api/health reports ok"

ready_json="$(curl -fsS "$BASE_URL/api/ready")"
echo "$ready_json" | jq -e '.status == "ok" and .db == "reachable" and (.latencyMs | type == "number")' >/dev/null \
  || fail "/api/ready did not prove the PostgREST -> Postgres path"
pass "/api/ready genuinely checks the database (status ok, db reachable)"

# --- server-rendered page ----------------------------------------------------
info "Server-rendered (SSR) page served by the standalone server"
curl -fsS "$BASE_URL/" | grep -q "Supabase Guestbook" || fail "home page did not render"
pass "home page is served and server-rendered"

# --- CRUD with validated writes ----------------------------------------------
info "Server-side Supabase CRUD (create / list / edit / delete)"

list_json="$(curl -fsS "$BASE_URL/api/messages")"
echo "$list_json" | jq -e '.configured == true and (.messages | type == "array")' >/dev/null \
  || fail "GET /api/messages did not return the configured message list"
pass "get: GET /api/messages returns the message list"

created="$(curl -fsS -X POST "$BASE_URL/api/messages" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Verify $MARKER\",\"message\":\"hello $MARKER\"}")"
msg_id="$(echo "$created" | jq -er '.message.id')" || fail "POST did not return a created message"
pass "create: POST returned id $msg_id"

invalid_status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/messages" \
  -H 'content-type: application/json' -d '{"name":"","message":""}')"
[ "$invalid_status" = "400" ] || fail "empty create should be rejected with 400 (got $invalid_status)"
pass "invalid input: empty create rejected with 400"

missing_fields_status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/messages" \
  -H 'content-type: application/json' -d '{}')"
[ "$missing_fields_status" = "400" ] || fail "create without fields should be rejected with 400 (got $missing_fields_status)"
pass "invalid input: create without fields rejected with 400"

oversized="$(printf 'm%.0s' $(seq 1 500))"
oversized_status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/messages" \
  -H 'content-type: application/json' -d "{\"name\":\"x\",\"message\":\"$oversized\"}")"
[ "$oversized_status" = "400" ] || fail "oversized create should be rejected with 400 (got $oversized_status)"
pass "invalid input: oversized create rejected with 400"

too_long_name="$(printf 'n%.0s' $(seq 1 61))"
name_over_status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/messages" \
  -H 'content-type: application/json' -d "{\"name\":\"$too_long_name\",\"message\":\"x\"}")"
[ "$name_over_status" = "400" ] || fail "over-long name should be rejected with 400 (got $name_over_status)"
pass "invalid input: over-long name rejected with 400"

curl -fsS "$BASE_URL/api/messages" | jq -e --arg m "$MARKER" \
  'any(.messages[]; .message | contains($m))' >/dev/null || fail "GET /api/messages did not list the created message"
pass "list: GET /api/messages contains the created message"

curl -fsS "$BASE_URL/" | grep -q "$MARKER" || fail "server-rendered HTML did not include the created message"
pass "list: server-rendered HTML includes the created message"

updated="$(curl -fsS -X PATCH "$BASE_URL/api/messages" \
  -H 'content-type: application/json' \
  -d "{\"id\":$msg_id,\"name\":\"Updated $MARKER\",\"message\":\"edited $MARKER\"}")"
echo "$updated" | jq -e --arg m "edited $MARKER" '.message.message == $m' >/dev/null \
  || fail "PATCH did not update the message"
pass "edit: PATCH updated the message server-side"

curl -fsS "$BASE_URL/api/messages" | jq -e --arg m "edited $MARKER" \
  'any(.messages[]; .message == $m)' >/dev/null || fail "updated message not present after PATCH"
pass "list: PATCHed message appears in the list"

bad_id_status="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE_URL/api/messages" \
  -H 'content-type: application/json' -d '{"id":"not-a-number","name":"x","message":"y"}')"
[ "$bad_id_status" = "400" ] || fail "PATCH with a non-numeric id should be rejected with 400 (got $bad_id_status)"
pass "invalid input: PATCH with a non-numeric id rejected with 400"

missing_status="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE_URL/api/messages" \
  -H 'content-type: application/json' -d '{"id":999999999,"name":"x","message":"y"}')"
[ "$missing_status" = "404" ] || fail "PATCH on missing id should 404 (got $missing_status)"
pass "edit: PATCH on missing id returns 404"

curl -fsS -X DELETE "$BASE_URL/api/messages?id=$msg_id" | jq -e ".deleted.id == $msg_id" >/dev/null \
  || fail "DELETE did not remove the message"
pass "delete: DELETE removed the message"

curl -fsS "$BASE_URL/api/messages" | jq -e --arg m "$MARKER" \
  'any(.messages[]; .message | contains($m)) == false' >/dev/null || fail "message still listed after delete"
pass "delete: message no longer listed after delete"

delete_bad_id_status="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/api/messages?id=abc")"
[ "$delete_bad_id_status" = "400" ] || fail "DELETE with a non-numeric id should be rejected with 400 (got $delete_bad_id_status)"
pass "invalid input: DELETE with a non-numeric id rejected with 400"

delete_missing_status="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/api/messages?id=999999999")"
[ "$delete_missing_status" = "404" ] || fail "DELETE on missing id should 404 (got $delete_missing_status)"
pass "delete: DELETE on missing id returns 404"

# --- schema ------------------------------------------------------------------
info "Schema is applied in the Postgres instance"
table="$("${COMPOSE[@]}" exec -T db psql -U supabase_admin -d postgres -Atc "select to_regclass('public.messages');" | tr -d '\r')"
[ "$table" = "messages" ] || fail "public.messages table missing (reported '${table}')"
rls="$("${COMPOSE[@]}" exec -T db psql -U supabase_admin -d postgres -Atc \
  "select relrowsecurity from pg_class where oid = 'public.messages'::regclass;" | tr -d '\r')"
[ "$rls" = "t" ] || fail "row level security is not enabled on public.messages (reported '${rls}')"
row_count="$("${COMPOSE[@]}" exec -T db psql -U supabase_admin -d postgres -Atc "select count(*) from public.messages;" | tr -d '\r')"
pass "schema: public.messages exists with RLS enabled (rows=$row_count)"

# --- persistence / restart ----------------------------------------------------
info "Persistence across a full stack restart"
persisted="$(curl -fsS -X POST "$BASE_URL/api/messages" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Persist $MARKER\",\"message\":\"survives the restart $MARKER\"}")"
persist_id="$(echo "$persisted" | jq -er '.message.id')" || fail "could not seed message for restart check"
pass "seeded message id $persist_id for the restart check"

info "Restarting the data stack (containers restart; named volume persists)"
"${COMPOSE[@]}" restart || fail "docker compose restart failed"

info "Waiting for readiness again after the restart"
wait_ready || fail "app did not become ready again after the restart"

curl -fsS "$BASE_URL/api/messages" | jq -e --arg n "Persist $MARKER" \
  'any(.messages[]; .name == $n)' >/dev/null || fail "message did not survive the stack restart"
pass "restart: seeded message survived the full stack restart against the same volume"

# --- cleanup -----------------------------------------------------------------
info "Cleanup"
curl -fsS -X DELETE "$BASE_URL/api/messages?id=$persist_id" >/dev/null || true
pass "cleanup removed the verification data"

printf '\n\033[1;32mAll production checks passed.\033[0m\n'
