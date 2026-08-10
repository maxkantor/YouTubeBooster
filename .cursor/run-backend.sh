#!/usr/bin/env bash
# Runs the .NET 8 backend API locally for development.
#
# The API is normally Lambda-hosted and reads Cognito config + secrets from AWS SSM /
# DynamoDB. For local dev we force in-memory storage and supply placeholder Cognito
# config so the app boots without real AWS resources. AWS_REGION is required only so the
# AWS SDK clients (constructed eagerly at startup) can initialize; no live AWS calls are
# needed for the public endpoints. Provide real values via secrets to exercise live paths.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/backend/src/YouTubeBoosterAi.Api"

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
export ASPNETCORE_ENVIRONMENT="${ASPNETCORE_ENVIRONMENT:-Development}"
export ASPNETCORE_URLS="${ASPNETCORE_URLS:-http://127.0.0.1:5099}"
export Storage__Provider="${Storage__Provider:-InMemory}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local-dev}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local-dev}"
export COGNITO_REGION="${COGNITO_REGION:-$AWS_REGION}"
export COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID:-us-east-1_localdev}"
export COGNITO_APP_CLIENT_ID="${COGNITO_APP_CLIENT_ID:-localdevclient}"

exec dotnet run -c Release
