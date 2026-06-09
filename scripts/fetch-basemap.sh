#!/usr/bin/env bash
#
# Fetches the self-hosted MapLibre basemap (public/basemap.pmtiles).
#
# The basemap is a z0–z8 global extract of the Protomaps daily planet build. It is ~522MB, so
# it is gitignored and fetched on demand instead of committed. `pmtiles extract` pulls only the
# low-zoom tiles over HTTP range requests — it does NOT download the full ~120GB planet.
#
# Usage:  bun run fetch:basemap
# Re-fetch: delete public/basemap.pmtiles first, then run again.
# Override the pinned build: PROTOMAPS_BUILD_DATE=YYYYMMDD bun run fetch:basemap

set -euo pipefail

# Pinned to the build that the committed map was developed against (OSM replication 2026-06-08).
# Bump this to a newer daily build to refresh basemap data.
BUILD_DATE="${PROTOMAPS_BUILD_DATE:-20260608}"
MAXZOOM=8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/public/basemap.pmtiles"
SOURCE="https://build.protomaps.com/${BUILD_DATE}.pmtiles"

if [ -f "$DEST" ]; then
  echo "Basemap already present: $DEST ($(du -h "$DEST" | cut -f1)). Delete it to re-fetch."
  exit 0
fi

if ! command -v pmtiles >/dev/null 2>&1; then
  echo "error: the 'pmtiles' CLI (go-pmtiles) is required but not installed." >&2
  echo "Install it, then re-run 'bun run fetch:basemap':" >&2
  echo "  macOS:  brew install pmtiles" >&2
  echo "  other:  https://github.com/protomaps/go-pmtiles/releases" >&2
  exit 1
fi

echo "Extracting z0-${MAXZOOM} basemap from ${SOURCE}"
echo "(HTTP range requests — only low-zoom tiles are downloaded, not the full planet)"
pmtiles extract "$SOURCE" "$DEST" --maxzoom="$MAXZOOM"
echo "Done: $DEST ($(du -h "$DEST" | cut -f1))"
