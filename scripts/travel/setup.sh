#!/usr/bin/env bash
# Installs the commute-time toolchain inside the project (never system-wide):
# a Python environment with r5py, Java 21 (checksum verified), the city's
# OpenStreetMap extract, seven MTA timetables and the Staten Island Ferry
# timetable. Everything lands in .travel/, which is not committed.
set -euo pipefail

# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"
mkdir -p "$T/input/gtfs"

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

log() { printf '\n== %s\n' "$*"; }

# --- Java 21 -----------------------------------------------------------------
case "$(uname -s)" in
  Darwin) OS=mac ;;
  Linux) OS=linux ;;
  *) echo "Unsupported OS: $(uname -s)"; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH=aarch64 ;;
  x86_64 | amd64) ARCH=x64 ;;
  *) echo "Unsupported CPU: $(uname -m)"; exit 1 ;;
esac

if [ ! -x "$T/jdk/bin/java" ]; then
  log "Java 21 (Temurin, $OS/$ARCH)"
  META="$(curl -fsSL "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=$ARCH&image_type=jdk&os=$OS&vendor=eclipse")"
  LINK="$(printf '%s' "$META" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["binary"]["package"]["link"])')"
  SUM="$(printf '%s' "$META" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["binary"]["package"]["checksum"])')"
  curl -fsSL "$LINK" -o "$T/tmp/jdk.tar.gz"
  GOT="$(shasum -a 256 "$T/tmp/jdk.tar.gz" | cut -d' ' -f1)"
  if [ "$GOT" != "$SUM" ]; then
    echo "Java checksum mismatch: expected $SUM, got $GOT"
    rm -f "$T/tmp/jdk.tar.gz"
    exit 1
  fi
  echo "Checksum verified: $SUM"
  rm -rf "$T/tmp/jdk" && mkdir -p "$T/tmp/jdk"
  tar -xzf "$T/tmp/jdk.tar.gz" -C "$T/tmp/jdk" --strip-components=1
  rm -rf "$T/jdk"
  if [ -d "$T/tmp/jdk/Contents/Home" ]; then
    mv "$T/tmp/jdk/Contents/Home" "$T/jdk"
  else
    mv "$T/tmp/jdk" "$T/jdk"
  fi
  rm -rf "$T/tmp/jdk" "$T/tmp/jdk.tar.gz"
fi
"$T/jdk/bin/java" -version 2>&1 | head -1

# --- Python environment ------------------------------------------------------
if [ ! -x "$T/venv/bin/python" ]; then
  log "Python environment"
  python3 -m venv "$T/venv"
fi
"$T/venv/bin/python" -m pip install --quiet --upgrade pip
"$T/venv/bin/python" -m pip install --quiet "r5py>=1.1,<2" "shapely>=2" "numpy" "pandas"
"$T/venv/bin/python" -c "import r5py; print('r5py', r5py.__version__)"

# --- Street network ----------------------------------------------------------
fetch() { # url dest [extra curl args]
  local url="$1" dest="$2"; shift 2
  if [ -s "$dest" ]; then
    local remote local_size
    remote="$(curl -fsSIL "$@" "$url" | tr -d '\r' | awk 'tolower($1)=="content-length:"{v=$2} END{print v}')"
    local_size="$(wc -c < "$dest" | tr -d ' ')"
    if [ -n "$remote" ] && [ "$remote" = "$local_size" ]; then
      echo "up to date: $(basename "$dest")"
      return
    fi
  fi
  curl -fsSL "$@" "$url" -o "$dest.part"
  mv "$dest.part" "$dest"
  echo "downloaded: $(basename "$dest") ($(wc -c < "$dest" | tr -d ' ') bytes)"
}

log "OpenStreetMap extract (BBBike, New York)"
fetch "https://download.bbbike.org/osm/bbbike/NewYork/NewYork.osm.pbf" "$T/input/nyc.osm.pbf"

# --- Timetables --------------------------------------------------------------
log "MTA timetables"
for feed in gtfs_subway gtfs_bx gtfs_b gtfs_m gtfs_q gtfs_si gtfs_busco; do
  fetch "https://rrgtfsfeeds.s3.amazonaws.com/$feed.zip" "$T/input/gtfs/$feed.zip"
done

# nyc.gov refuses downloads that don't look like a browser, and the file
# needs repacking before R5 will read it (see repack_gtfs.py).
log "Staten Island Ferry timetable"
fetch "https://www.nyc.gov/html/dot/downloads/misc/siferry-gtfs.zip" "$T/tmp/siferry-raw.zip" \
  -A "$UA" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.9"
"$T/venv/bin/python" -I "$ROOT/scripts/travel/repack_gtfs.py" "$T/tmp/siferry-raw.zip" "$T/input/gtfs/siferry.zip"

log "Done. Run: npm run travel"
