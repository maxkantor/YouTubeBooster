#!/usr/bin/env bash
# Build Lambda deployment zip — output is ONLY under backend/artifacts/
set -euo pipefail
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
PUBLISH_OUT="$BACKEND_DIR/artifacts/publish"
ZIP_OUT="$BACKEND_DIR/artifacts/youtubebooster-api.zip"

rm -rf "$PUBLISH_OUT"
dotnet publish "$REPO_ROOT/backend/src/YouTubeBoosterAi.Api/YouTubeBoosterAi.Api.csproj" \
  -c Release -r linux-x64 --self-contained false -o "$PUBLISH_OUT"

rm -f "$ZIP_OUT"
(cd "$PUBLISH_OUT" && zip -q -r "$ZIP_OUT" .)

echo "Lambda zip: $ZIP_OUT"
ls -la "$ZIP_OUT"
