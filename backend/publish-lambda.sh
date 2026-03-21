#!/usr/bin/env bash
# Publish .NET Lambda package to backend/artifacts/youtubebooster-api.zip (see LAMBDA-DEPLOY.md).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$HERE/.lambda-publish/out"
ARTIFACTS="$HERE/artifacts"
ZIP="$ARTIFACTS/youtubebooster-api.zip"
rm -rf "$HERE/.lambda-publish"
mkdir -p "$ARTIFACTS" "$OUT_DIR"
dotnet publish "$HERE/src/YouTubeBoosterAi.Api/YouTubeBoosterAi.Api.csproj" \
  -c Release \
  -r linux-x64 \
  --self-contained false \
  -o "$OUT_DIR"
( cd "$OUT_DIR" && zip -q -r "$ZIP" . )
echo "Wrote $ZIP ($(du -h "$ZIP" | awk '{print $1}'))"
