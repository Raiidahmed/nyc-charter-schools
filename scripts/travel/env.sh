# Shared environment for the travel scripts. Keeps Java, r5py's cache (the
# R5 jar and built networks, about 1.6 GB), its config and temp files inside
# .travel/ instead of the home folder.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T="$ROOT/.travel"
export JAVA_HOME="$T/jdk"
export PATH="$JAVA_HOME/bin:$PATH"
export XDG_CACHE_HOME="$T/cache"
export XDG_CONFIG_HOME="$T/config"
export TMPDIR="$T/tmp"
mkdir -p "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$TMPDIR"
