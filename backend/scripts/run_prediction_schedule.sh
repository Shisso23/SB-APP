#!/usr/bin/env bash
# Bounded refresh -> predict -> settle sweep across the allowed leagues.
#
# This script is NOT installed into any cron/launchd schedule by itself and
# ingestion stays disabled until the environment explicitly turns it on. It
# only wraps repeated, separate `run_prediction_job` invocations (themselves
# bounded, rate-limited and idempotent per five-minute slot) so an operator
# can schedule one line instead of one per league/mode.
#
# Required environment (same variables `run_prediction_job` already reads):
#   PREDICTXI_INGESTION_ENABLED=True
#   PREDICTXI_LEAGUES=39,140,78        # comma-separated allowed league ids
# Optional:
#   PREDICTXI_SEASON=2026              # defaults to the current UTC year
#
# To enable on a schedule yourself (NOT done automatically), add a crontab
# entry such as:
#   */5 * * * * cd /path/to/SB-APP/backend && ./scripts/run_prediction_schedule.sh >> /var/log/predictxi-jobs.log 2>&1
#
# Each mode is a separate, independently-failing step: a failed `predict` for
# one league does not stop `settle` or the next league's `refresh`.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_BIN="${PYTHON_BIN:-$BACKEND_DIR/.venv/bin/python}"
MANAGE_PY="$BACKEND_DIR/manage.py"
SEASON="${PREDICTXI_SEASON:-$(date -u +%Y)}"

if [[ -z "${PREDICTXI_LEAGUES:-}" ]]; then
  echo "PREDICTXI_LEAGUES is not set; nothing to schedule." >&2
  exit 1
fi

failures=0
IFS=',' read -ra LEAGUE_IDS <<< "$PREDICTXI_LEAGUES"
for league in "${LEAGUE_IDS[@]}"; do
  league="$(echo "$league" | xargs)"
  [[ -z "$league" ]] && continue
  # Bootstrap is safe to run every cycle: seasons already stored are skipped (see
  # `run_prediction_job.py`'s `ingest()`), so this only fetches genuinely missing
  # history - covering newly-added leagues and any past seasons never backfilled.
  for mode in bootstrap refresh predict settle; do
    echo "[run_prediction_schedule] league=$league season=$SEASON mode=$mode"
    if ! "$PYTHON_BIN" "$MANAGE_PY" run_prediction_job --mode "$mode" --league "$league" --season "$SEASON"; then
      echo "[run_prediction_schedule] league=$league mode=$mode FAILED" >&2
      failures=$((failures + 1))
    fi
  done
done

exit $(( failures > 0 ? 1 : 0 ))
