# Growth secrets setup (SSM + GA4 Viewer)

Never commit credential files or paste secrets into git, chat logs, or experiment JSON.

## SSM parameter names

| Env var (Cursor Automation / shell) | SSM path | Type |
|-------------------------------------|----------|------|
| `GA4_PROPERTY_ID` | `/youtubebooster/growth/ga4-property-id` | String |
| `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | `/youtubebooster/growth/google-analytics-credentials-json` | SecureString |
| `STRIPE_RESTRICTED_READ_KEY` | `/youtubebooster/growth/stripe-restricted-read-key` | SecureString |
| `STRIPE_YB_PRODUCT_IDS` (optional) | `/youtubebooster/growth/stripe-product-ids` | String (CSV) |
| `STRIPE_YB_PRICE_IDS` (optional) | `/youtubebooster/growth/stripe-price-ids` | String (CSV) |
| `STRIPE_YB_RECONCILIATION_COMPLETE` (optional) | `/youtubebooster/growth/stripe-reconciliation-complete` | String (`true` only after human reconciliation) |

Product/price allowlist docs: **`docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`**. Never count account-wide Stripe as YouTubeBooster revenue.

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

## Cursor Cloud Agent secrets (required for weekday Automation)

Secrets do **not** live on the Automations Settings page. They live here:

1. Open [cursor.com/dashboard/cloud-agents](https://cursor.com/dashboard/cloud-agents)
2. Open the **Environment** for `maxkantor/YouTubeBooster` (must be **Ready**, not stuck in setup)
3. **Secrets** → ensure these names exist (scope = this environment or All repositories):

| Name | Required |
|------|----------|
| `AWS_ACCESS_KEY_ID` | Yes (SES + SSM) |
| `AWS_SECRET_ACCESS_KEY` | Yes |
| `AWS_REGION` | Yes → `us-east-1` |
| `GA4_PROPERTY_ID` | Yes (or load via SSM with AWS) |
| `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | Yes (or via SSM) |
| `STRIPE_RESTRICTED_READ_KEY` | Yes (`rk_…` only) |
| `ADMIN_EMAIL` | Optional (else SSM `/youtubebooster/admin/email`) |
| `SES_FROM_EMAIL` | Optional (else SSM `/youtubebooster/ses/from-email`) |

4. On the Automation (**YouTubeBooster daily paid growth**):
   - Repo must be **YouTubeBooster** / `main`
   - Do **not** enable “skip environment” / skip-install if that would skip secret injection
   - Instructions must call `compose-and-send-growth-email.mjs`

5. **Test:** Automations → **Run now**, then in the run log execute / confirm:
   ```bash
   node scripts/growth/print-env-secret-presence.mjs
   ```
   Every required name should show `true`. Then Admin email should arrive.

### If Run History says secrets missing

The 2026-08-11 cloud run failed because **no AWS keys were in the pod env**. Re-add secrets on the Cloud Agents Environment (step 2–3), save, then **Run now**. Pasting into `docs/growth/AUTOMATION.md` does nothing for cloud runs.

AWS key IAM needs:

- `ssm:GetParameter` on `/youtubebooster/growth/*`, `/youtubebooster/admin/email`, `/youtubebooster/ses/from-email`
- `ses:SendEmail` for `youtubeboosterai.com`

## Verify SSM from your laptop (safe)

```bash
node scripts/growth/verify-ssm-secrets.mjs
```

Prints only `present` / `missing` / `type` — never values.
