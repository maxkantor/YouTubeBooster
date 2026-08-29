#!/usr/bin/env bash
# Set live Stripe/API one-time price in SSM (source of truth for checkout amount).
set -euo pipefail
PRICE="${1:-9.99}"
PREFIX="${SSM_PREFIX:-/youtubebooster}"
PARAM="${PREFIX}/pricing/one-time-price"
echo "==> Setting ${PARAM} = ${PRICE}"
aws ssm put-parameter --name "${PARAM}" --value "${PRICE}" --type String --overwrite
echo "==> Done. Lambda reads this on next cold start (or immediately if settings are cached per invoke)."
