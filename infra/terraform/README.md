# Terraform Deployment Scaffold

This Terraform stack is the preferred deployment baseline for the new `YouTube Booster AI` platform.

It provisions:

- DynamoDB tables for product and CRM data
- placeholder AWS SSM Parameter Store keys under `/youtubebooster/...`
- optional .NET Lambda + API Gateway deployment
- optional Amplify app + branch resources
- IAM and CloudWatch resources for the backend

## Parameter Store Keys Created

The stack creates placeholders for:

- `/youtubebooster/ses/from-email`
- `/youtubebooster/ses/admin-email`
- `/youtubebooster/stripe/secret-key`
- `/youtubebooster/stripe/webhook-secret`
- `/youtubebooster/stripe/publishable-key`
- `/youtubebooster/stripe/price-lookup-key`
- `/youtubebooster/stripe/openai-api-key`
- `/youtubebooster/admin/email`
- `/youtubebooster/admin/password`
- `/youtubebooster/admin/google/credentials-json` (include **`youtube_api_key`** in this JSON for YouTube Data API v3)
- `/youtubebooster/admin/google/client-id`
- `/youtubebooster/admin/google/client-secret`
- `/youtubebooster/admin/google/project-id`
- `/youtubebooster/admin/google/auth-uri`
- `/youtubebooster/admin/google/token-uri`
- `/youtubebooster/admin/google/redirect-uri`
- `/youtubebooster/pricing/one-time-price`
- `/youtubebooster/pricing/currency`
- `/youtubebooster/features/enable-public-demo`
- `/youtubebooster/features/demo-rate-limit-per-hour`

Update those values after the initial apply, or pass your `credentials.json` values via variables so Terraform writes them into SSM:

```bash
# Option A: granular (from credentials.json "installed" or "web")
terraform apply -var="admin_google_client_id=YOUR_CLIENT_ID" \
  -var="admin_google_client_secret=YOUR_CLIENT_SECRET" \
  -var="admin_google_project_id=youtubebooster-479002" \
  -var="admin_google_redirect_uri=http://localhost"

# Option B: full credentials JSON in one variable — include youtube_api_key in the JSON string
terraform apply -var="admin_google_credentials_json={\"installed\":{\"client_id\":\"...\",...},\"youtube_api_key\":\"AIza...\"}"
```

Or copy `terraform.tfvars.example` to `terraform.tfvars`, fill in admin Google variables, then run `terraform apply`. **SecureString** parameters use `lifecycle { ignore_changes = [value] }` so later applies do not overwrite Console edits. **`admin/email`** is a dedicated `aws_ssm_parameter.admin_email` resource with the same pattern (initial value from `admin_login_email`, default `mykantor@bellsouth.net`). See **`docs/SSM-PARAMETER-CHECKLIST.md`** and the one-time **`terraform state rm`** note for legacy `/youtubebooster/youtube/api-key`.

## Admin `credentials.json` in SSM

For admin-owned hosted Google OAuth flows, store the equivalent of `credentials.json` in:

- `/youtubebooster/admin/google/credentials-json`

The backend also supports granular fallback parameters if you prefer not to store the full JSON blob:

- `/youtubebooster/admin/google/client-id`
- `/youtubebooster/admin/google/client-secret`
- `/youtubebooster/admin/google/project-id`
- `/youtubebooster/admin/google/auth-uri`
- `/youtubebooster/admin/google/token-uri`
- `/youtubebooster/admin/google/redirect-uri`

Preferred format for `/youtubebooster/admin/google/credentials-json`:

```json
{
  "web": {
    "client_id": "replace-me.apps.googleusercontent.com",
    "project_id": "replace-me",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "replace-me",
    "redirect_uris": [
      "https://your-domain.com/oauth2/callback"
    ]
  }
}
```

**YouTube Data API key for public channel demo:** The backend can read the YouTube API key from the same credentials JSON. Add a top-level `youtube_api_key` (or `api_key`) to the JSON you store in `admin/google/credentials-json`, for example:

```json
{
  "installed": { "client_id": "...", "client_secret": "...", ... },
  "youtube_api_key": "AIzaSy..."
}
```

Create the API key in the same Google Cloud project (APIs & Services → Credentials → Create credentials → API key), enable **YouTube Data API v3**, then paste the key as `youtube_api_key` in **`credentials-json`** (preferred). A legacy optional SSM parameter `/youtubebooster/youtube/api-key` is still read by the app if present; Terraform no longer manages it.

Buyer-provided Google/YouTube settings should not be created as shared SSM parameters. The app should collect those during onboarding and store them per user in app data, ideally encrypted before persistence.

## Quick Start

1. Copy the example vars file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

2. Initialize Terraform:

```bash
terraform init
```

3. Apply placeholders and data layer first:

```bash
terraform apply
```

That creates the DynamoDB tables and SSM parameters even before Lambda or Amplify are enabled.

## Backend Deployment Flow

To enable backend deployment:

1. Publish/package the .NET Lambda app into a zip.
2. Set:
   - `deploy_backend_lambda = true`
   - `backend_package_path = "..."`.
3. Run `terraform apply` again.

The Lambda receives:

- `SSM__BASEPATH=/youtubebooster`
- DynamoDB table names
- pricing defaults
- feature flags

## Amplify Deployment Flow

**One-command deploy (recommended):** From `infra/terraform`, set your GitHub token and run:

```powershell
$env:TF_VAR_amplify_access_token = "ghp_your_personal_access_token"
.\deploy-amplify.ps1
```

This runs `terraform apply` with Amplify enabled and connects `https://github.com/maxkantor/YouTubeBooster` (main branch). The app will appear in AWS Amplify Console and build on every push.

**Manual Terraform:** Set in `terraform.tfvars`: `enable_amplify_app = true`, `amplify_repository_url`, `amplify_access_token`, then run `terraform apply`.

Amplify uses the build config from the repo root `amplify.yml`.

**Build on push:** With Terraform, the main branch has `enable_auto_build = true`, so each push to that branch starts a build. If you connected the app manually in the Amplify Console, open the app → **Branch** (e.g. main) → **Edit** and enable **Build on push** so Amplify starts a build on every push.

## Notes

- `admin/password` is a placeholder. In a production iteration, replace direct password storage with a hash or admin auth secret strategy.
- `admin/email` is not overwritten by `terraform apply` after the first create; edit the parameter in AWS or change `admin_login_email` only before the resource exists (or use `terraform apply -replace=...` intentionally).
- `stripe/openai-api-key` uses the exact sample path requested, even though it is semantically better under an `openai/` namespace.
- The legacy `infra/template.yaml` remains in the repo, but Terraform should be treated as the primary forward path.
