#!/usr/bin/env bash
# Computes commute times to every school (about an hour). Run setup first.
set -euo pipefail
# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"
if [ ! -x "$T/venv/bin/python" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "The routing toolchain isn't installed. Run: npm run travel:setup"
  exit 1
fi
if [ ! -f "$ROOT/public/data/schools.json" ]; then
  echo "No school data yet. Run: npm run data"
  exit 1
fi
"$T/venv/bin/python" -I "$ROOT/scripts/travel/compute.py" "$@"
