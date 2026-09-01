#!/usr/bin/env bash
# Suite de non-régression WonderStats.
#   npm i -D playwright && npx playwright install chromium
#   ./tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8899}"
export BASE_URL="http://127.0.0.1:${PORT}"

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1

FAIL=0
for suite in smoke e2e modals campaigns roles sync season gate github owner; do
  echo ""
  echo "════ ${suite} ════"
  LOG_FILE="" node "tests/${suite}.js" || FAIL=1
done
exit $FAIL
