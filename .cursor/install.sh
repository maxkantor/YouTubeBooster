#!/usr/bin/env bash
# Cloud Agent install: idempotent bootstrap for the YouTubeBooster dev environment.
# Prepares the .NET 8 backend API, the Vite/React frontend, and the legacy Python Flask app.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- System toolchains (only install when missing; snapshot builds already have them) ---
NEED_APT=()
command -v dotnet >/dev/null 2>&1 || NEED_APT+=("dotnet-sdk-8.0")
dpkg -s python3.12-venv >/dev/null 2>&1 || NEED_APT+=("python3.12-venv")
if [ "${#NEED_APT[@]}" -gt 0 ]; then
  echo "==> Installing system packages: ${NEED_APT[*]}"
  sudo apt-get update -y
  sudo apt-get install -y "${NEED_APT[@]}"
fi

# --- Frontend (Vite + React + TypeScript) ---
echo "==> Frontend: npm ci"
( cd frontend && npm ci )

# --- Backend (.NET 8 minimal API, Lambda-hosted; runs locally with in-memory storage) ---
echo "==> Backend: dotnet restore + build (warms NuGet cache)"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
dotnet build backend/src/YouTubeBoosterAi.Api/YouTubeBoosterAi.Api.csproj -c Release

# --- Legacy Python Flask dashboard (secondary) ---
echo "==> Python: virtualenv + requirements"
python3 -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "==> Install complete."
