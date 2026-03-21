#!/usr/bin/env bash
# Full local release pipeline: frontend build, backend compile, Lambda zip.
# Amplify deploy: push to the connected branch (e.g. main). Lambda: upload backend/youtubebooster-api.zip in AWS console or Terraform.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "==> Frontend: install + production build"
cd "$ROOT/frontend"
npm ci
npm run build
echo "==> Backend: Release build (sanity check)"
dotnet build "$ROOT/backend/src/YouTubeBoosterAi.Api/YouTubeBoosterAi.Api.csproj" -c Release
echo "==> Backend: Lambda zip"
chmod +x "$ROOT/backend/publish-lambda.sh"
"$ROOT/backend/publish-lambda.sh"
echo "==> Done. Next: git push (Amplify) and upload zip to Lambda if the API changed."
