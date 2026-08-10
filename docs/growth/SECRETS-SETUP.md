# Growth secrets setup (SSM + GA4 Viewer)

Never commit credential files or paste secrets into git, chat logs, or experiment JSON.

## SSM parameter names

| Env var (Cursor Automation / shell) | SSM path | Type |
|-------------------------------------|----------|------|
| `GA4_PROPERTY_ID` | `/youtubebooster/growth/ga4-property-id` | String |
| `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | `/youtubebooster/growth/google-analytics-credentials-json` | SecureString |
| `STRIPE_RESTRICTED_READ_KEY` | `/youtubebooster/growth/stripe-restricted-read-key` | SecureString |

Measurement ID on the site remains `G-P02EPD7EDB` (not a secret). **Property ID** is the numeric GA4 property (Admin → Property settings).

## One-time put (from your machine)

```powershell
# Set env vars in THIS shell only (do not echo them):
$env:GA4_PROPERTY_ID = "123456789"   # numeric property id
$env:GOOGLE_ANALYTICS_CREDENTIALS_JSON = Get-Content -Raw path\to\ga4-sa.json
$env:STRIPE_RESTRICTED_READ_KEY = "rk_live_..."  # restricted read-only key

cd C:\Apps\YouTubeBooster
.\scripts\growth\put-ssm-secrets.ps1
node .\scripts\growth\verify-ssm-secrets.mjs
```

## Stripe restricted key (read-only)

1. Stripe Dashboard → Developers → API keys → Restricted keys → Create.
2. Allow **read** only for: Checkout Sessions, Payment Intents, Charges, Customers, Prices, Products, Balance transactions (as needed for reporting).
3. Deny all write / webhook / payout permissions.
4. Use `rk_live_…` for production reporting (never store full `sk_live` in growth SSM).

## Google service account + GA4 Viewer

1. Google Cloud Console → create (or reuse) a service account for analytics read.
2. Create a JSON key; keep it only in SSM / Automation secrets.
3. GA4 Admin → **Property access management** for the YouTubeBooster property (`G-P02EPD7EDB`):
   - Add the service account email (`…@….iam.gserviceaccount.com`)
   - Role: **Viewer**
4. Confirm Data API is enabled for the GCP project.

## Cursor Automation secrets

Mirror the same three names as Automation secrets so weekday agents can run without AWS credentials, **or** grant the Automation role `ssm:GetParameter` on `/youtubebooster/growth/*` and use `load-ssm-secrets-into-env.mjs`.

## Verify (safe)

```bash
node scripts/growth/verify-ssm-secrets.mjs
```

Prints only `present` / `missing` / `type` — never values.
