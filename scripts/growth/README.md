# Growth scripts

Optional dependency for GA4 Data API:

```bash
cd scripts/growth
npm init -y
npm i google-auth-library
```

Secrets (env / Cursor Automation / GitHub):

- `GA4_PROPERTY_ID`
- `GOOGLE_ANALYTICS_CREDENTIALS_JSON`
- `STRIPE_RESTRICTED_READ_KEY` (restricted read-only; never full `sk_live`)

Snapshots write to `docs/growth/snapshots/` (gitignored except README).
