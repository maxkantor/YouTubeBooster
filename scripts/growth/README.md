# Growth scripts

## Collect funnel snapshot

```bash
node scripts/growth/collect-funnel-snapshot.mjs
node scripts/growth/check-production-health.mjs
node scripts/growth/verify-ssm-secrets.mjs
```

Optional GA4 client:

```bash
cd scripts/growth
npm init -y
npm i google-auth-library
```

## Secrets

See **`docs/growth/SECRETS-SETUP.md`**.

Env / Automation / SSM:

- `GA4_PROPERTY_ID` → `/youtubebooster/growth/ga4-property-id`
- `GOOGLE_ANALYTICS_CREDENTIALS_JSON` → `/youtubebooster/growth/google-analytics-credentials-json`
- `STRIPE_RESTRICTED_READ_KEY` → `/youtubebooster/growth/stripe-restricted-read-key` (`rk_…` only)

Snapshots write under `docs/growth/snapshots/` (JSON gitignored by root `*.json`).
