#!/usr/bin/env bash
# scripts/smoke_test.sh
# End-to-end smoke test suite for Unfog Hackathon MVP
# Verifies:
#   1. Backend /healthz and /readyz
#   2. Codebase API (/api/v1/codebase/graph and /api/v1/codebase/file)
#   3. Gemini AI API (/api/v1/ai/explain and /api/v1/ai/chat)
#   4. Learning Arena API (/api/v1/learning/challenges and evaluate)
#   5. Frontend production build (npm run build)

set -eo pipefail

BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://localhost:8000}"
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../frontend" && pwd)"
PASS_COUNT=0
FAIL_COUNT=0

# Styling
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_step() {
  echo -e "\n${BOLD}${CYAN}==>${NC} ${BOLD}$1${NC}"
}

log_pass() {
  echo -e "  ${GREEN}✔ PASS:${NC} $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

log_fail() {
  echo -e "  ${RED}✖ FAIL:${NC} $1"
  echo -e "    ${YELLOW}Details:${NC} $2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_http() {
  local name="$1"
  local method="$2"
  local url="$3"
  local data="$4"
  local expected_sub="$5"

  local response
  local http_code

  if [ -n "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$data" || echo -e "\n000")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" || echo -e "\n000")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    if [ -n "$expected_sub" ]; then
      if echo "$body" | grep -q "$expected_sub"; then
        log_pass "$name (HTTP $http_code matched '$expected_sub')"
      else
        log_fail "$name" "HTTP $http_code but missing pattern '$expected_sub'. Response: $(echo "$body" | head -c 200)"
      fi
    else
      log_pass "$name (HTTP $http_code)"
    fi
  else
    log_fail "$name" "HTTP $http_code. Response: $(echo "$body" | head -c 200)"
  fi
}

echo -e "${BOLD}${CYAN}=====================================================${NC}"
echo -e "${BOLD}${CYAN}             UNFOG MVP SMOKE TEST SUITE             ${NC}"
echo -e "${BOLD}${CYAN}=====================================================${NC}"
echo -e "Backend Target:  ${BACKEND_BASE_URL}"
echo -e "Frontend Path:   ${FRONTEND_DIR}"

# -----------------------------------------------------------------------------
# 1. Healthcheck verification
# -----------------------------------------------------------------------------
log_step "1. Verifying Backend Health & Readiness"
check_http "Liveness endpoint (/healthz)" "GET" "${BACKEND_BASE_URL}/healthz" "" "ok"
check_http "Readiness endpoint (/readyz)" "GET" "${BACKEND_BASE_URL}/readyz" "" "ready"

# -----------------------------------------------------------------------------
# 2. Codebase & Source Graph API
# -----------------------------------------------------------------------------
log_step "2. Verifying Codebase & Source Graph API"
check_http "Source Graph (/api/v1/codebase/graph)" "GET" \
  "${BACKEND_BASE_URL}/api/v1/codebase/graph" "" "sample_service"

check_http "File Source Inspection (/api/v1/codebase/file)" "GET" \
  "${BACKEND_BASE_URL}/api/v1/codebase/file?path=service/auth.py" "" "verify_token"

# -----------------------------------------------------------------------------
# 3. Gemini AI Explanation & Chat API
# -----------------------------------------------------------------------------
log_step "3. Verifying Gemini AI Explanation & Chat API"
explain_payload='{"path":"service/auth.py","symbol_name":"verify_token","prompt":"How does token verification work?"}'
check_http "AI Explanation (/api/v1/ai/explain)" "POST" \
  "${BACKEND_BASE_URL}/api/v1/ai/explain" "$explain_payload" "explanation"

chat_payload='{"message":"Where are errors handled in this service?","history":[]}'
check_http "AI Contextual Chat (/api/v1/ai/chat)" "POST" \
  "${BACKEND_BASE_URL}/api/v1/ai/chat" "$chat_payload" "reply"

# -----------------------------------------------------------------------------
# 4. Learning Arena API
# -----------------------------------------------------------------------------
log_step "4. Verifying Learning Arena API"
check_http "Fetch Challenges (/api/v1/learning/challenges)" "GET" \
  "${BACKEND_BASE_URL}/api/v1/learning/challenges" "" "challenge-locate-auth"

eval_payload='{"answer":"verify_token","selected_path":"service/auth.py"}'
check_http "Evaluate Challenge (/api/v1/learning/challenges/challenge-locate-auth/evaluate)" "POST" \
  "${BACKEND_BASE_URL}/api/v1/learning/challenges/challenge-locate-auth/evaluate" "$eval_payload" "correct"

# -----------------------------------------------------------------------------
# 5. Frontend Production Build Check
# -----------------------------------------------------------------------------
log_step "5. Verifying Frontend Production Build"
if [ -d "$FRONTEND_DIR" ]; then
  if (cd "$FRONTEND_DIR" && npm run build > /dev/null 2>&1); then
    log_pass "Frontend build succeeded (Next.js production compile)"
  else
    log_fail "Frontend build failed" "Check 'npm run build' inside ${FRONTEND_DIR}"
  fi
else
  log_fail "Frontend directory missing" "${FRONTEND_DIR} does not exist"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo -e "\n${BOLD}${CYAN}=====================================================${NC}"
echo -e "${BOLD}Smoke Test Summary:${NC} ${GREEN}${PASS_COUNT} Passed${NC}, ${RED}${FAIL_COUNT} Failed${NC}"
echo -e "${BOLD}${CYAN}=====================================================${NC}"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo -e "\n${RED}Smoke tests encountered failures.${NC} Ensure backend is running at ${BACKEND_BASE_URL} and frontend dependencies are installed.\n"
  exit 1
else
  echo -e "\n${GREEN}All smoke tests passed! System is fully functional for demo.${NC}\n"
  exit 0
fi
