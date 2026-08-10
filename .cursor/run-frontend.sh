#!/usr/bin/env bash
# Runs the Vite/React dev server and proxies /api to the local backend.
#
# This repo tracks frontend/node_modules in git, and a pod booting from an
# environment build re-checks-out those tracked files after install has already
# run, which strips the execute bit from node_modules/.bin/* launchers. Restore
# it here so `npm run dev` works on every boot (install is not re-run on boot).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/frontend"

chmod -R +x node_modules/.bin 2>/dev/null || true

export VITE_DEV_API_ORIGIN="${VITE_DEV_API_ORIGIN:-http://127.0.0.1:5099}"
exec npm run dev
