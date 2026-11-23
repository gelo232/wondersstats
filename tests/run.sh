#!/usr/bin/env bash
# Suites de non-régression.
#   npm i -D playwright && npx playwright install chromium
#   ./tests/run.sh               toutes les suites
#   ./tests/run.sh six-deux      seulement celles qu'on nomme
#   ./tests/run.sh wonderstats   celles de l'application principale (tout sauf chrono et six-deux)
# On ne lance que les suites des applications modifiées (voir CLAUDE.md).
set -euo pipefail
cd "$(dirname "$0")/.."
TOUTES="smoke migration selection rencontres feuille score consultation export annuler evolution lecture objectifs objectifs-ecran replis recap bilan saison-complete e2e modals campaigns roles sync invitation season gate github owner parcours config sauvegarde ventilation onglets groupes suivi terrain numeros saisie chrono six-deux hors-ligne"
SUITES=""
if [ $# -eq 0 ]; then
  SUITES="$TOUTES"
else
  for nom in "$@"; do
    if [ "$nom" = "wonderstats" ]; then
      for s in $TOUTES; do case "$s" in chrono|six-deux) ;; *) SUITES="$SUITES $s" ;; esac; done
    elif [ -f "tests/${nom}.js" ]; then
      SUITES="$SUITES $nom"
    else
      echo "Suite inconnue : ${nom}" >&2; exit 2
    fi
  done
fi

PORT="${PORT:-8899}"
export BASE_URL="http://127.0.0.1:${PORT}"

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1

FAIL=0
for suite in $SUITES; do
  echo ""
  echo "════ ${suite} ════"
  LOG_FILE="" node "tests/${suite}.js" || FAIL=1
done
exit $FAIL
