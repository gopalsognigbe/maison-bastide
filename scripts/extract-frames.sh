#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-desktop}"

if [[ "$MODE" == "mobile" ]]; then
  VIDEO="${2:-$ROOT/public/hero-mobile.mp4}"
  OUT="$ROOT/public/frames-mobile"
  SCALE="720:-2"
  FPS="15"
  QUALITY="4"
elif [[ "$MODE" == "desktop" ]]; then
  VIDEO="${2:-$ROOT/public/hero.mp4}"
  OUT="$ROOT/public/frames"
  SCALE="1280:-1"
  FPS=""
  QUALITY="3"
else
  echo "Usage: $0 [desktop|mobile] [video-path]" >&2
  exit 1
fi

if [[ ! -f "$VIDEO" ]]; then
  echo "Video not found: $VIDEO" >&2
  exit 1
fi

mkdir -p "$OUT"
find "$OUT" -name 'frame-*.jpg' -delete

if [[ -n "$FPS" ]]; then
  ffmpeg -y -i "$VIDEO" -vf "fps=${FPS},scale=${SCALE}" -q:v "$QUALITY" -an "$OUT/frame-%04d.jpg"
else
  ffmpeg -y -i "$VIDEO" -vf "scale=${SCALE}" -q:v "$QUALITY" -an "$OUT/frame-%04d.jpg"
fi

COUNT=$(find "$OUT" -name 'frame-*.jpg' | wc -l | tr -d ' ')
MID=$(printf '%04d' $(( (COUNT + 1) / 2 )))

if [[ "$MODE" == "mobile" ]]; then
  printf '{"count":%s,"ext":"jpg","pad":4,"prefix":"frame-","fps":15}\n' "$COUNT" > "$OUT/manifest.json"
  cp "$OUT/frame-${MID}.jpg" "$ROOT/public/poster-mobile.jpg"
else
  printf '{"count":%s,"ext":"jpg","pad":4,"prefix":"frame-"}\n' "$COUNT" > "$OUT/manifest.json"
  cp "$OUT/frame-${MID}.jpg" "$ROOT/public/poster.jpg"
fi

echo "Extracted $COUNT frames ($MODE) → $OUT"
echo "Update frame counts in src/App.jsx if needed."
