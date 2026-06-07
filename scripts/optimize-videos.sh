#!/usr/bin/env bash
# Re-encode demo CCTV clips for web: smaller download + faster decode in the browser.
# Requires: ffmpeg
#
# Usage: npm run optimize:videos
# Backups land in public/videos/_originals/ (gitignored).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIDEOS="$ROOT/public/videos"
ORIGINALS="$VIDEOS/_originals"

mkdir -p "$ORIGINALS"

shopt -s nullglob
files=("$VIDEOS"/demo-*.mp4)

if [ ${#files[@]} -eq 0 ]; then
  echo "No demo-*.mp4 files in $VIDEOS"
  exit 1
fi

for src in "${files[@]}"; do
  name="$(basename "$src")"
  backup="$ORIGINALS/$name"

  if [ ! -f "$backup" ]; then
    cp "$src" "$backup"
    echo "Backed up $name"
  fi

  tmp="$(mktemp "${TMPDIR:-/tmp}/tn-video-XXXXXX.mp4")"
  echo "Optimizing $name ..."

  ffmpeg -y -i "$backup" \
    -an \
    -vf "scale='min(854,iw)':-2" \
    -c:v libx264 -preset medium -crf 28 \
    -movflags +faststart \
    -pix_fmt yuv420p \
    "$tmp" \
    -loglevel error

  mv "$tmp" "$src"
  echo "  -> $(du -h "$src" | cut -f1)"
done

echo "Done. Optimized files in $VIDEOS (originals in _originals/)"
