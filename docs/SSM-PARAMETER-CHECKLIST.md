# SSM Parameter Store (`/youtubebooster`)

The API reads secrets with `SSM__BASEPATH=/youtubebooster` (Lambda env). Use **Parameter Store only** in production — the backend resolves the **YouTube Data API v3** key from **`/youtubebooster/admin/google/credentials-json`** (see below).

## YouTube Data API key (required for live channel data)

Store the key **inside** the SecureString parameter:

**`/youtubebooster/admin/google/credentials-json`**

Add **`youtube_api_key`** (or **`api_key`**) at the **root** of the JSON, or under **`installed`** / **`web`**:

```json
{
  "installed": {
    "client_id": "...",
    "youtube_api_key": "YOUR_YOUTUBE_DATA_API_KEY"
  }
}
```

Or at root next to `installed`:

```json
{
  "installed": { ... },
  "youtube_api_key": "YOUR_YOUTUBE_DATA_API_KEY"
}
```

**Restrictions (Google Cloud):** For Lambda, do **not** restrict the key to **HTTP referrers only**. Use **IP** or **none** for server-side calls.

### Legacy (optional)

An older separate parameter **`/youtubebooster/youtube/api-key`** is **not** managed by Terraform anymore. If it still exists in AWS, the app can still read it as a **fallback** after credentials-json. Prefer credentials-json only.

## One-command update: Google admin OAuth JSON → SSM

Terraform **does not** push new values for existing SecureStrings (see below). To set **all** `/youtubebooster/admin/google/*` parameters from your desktop OAuth JSON (`installed` block):

1. Save your credentials as a file **outside the repo** (e.g. `%USERPROFILE%\secrets\google-oauth.json`).
2. Authenticate AWS: `aws sso login` (or ensure your profile works): `aws sts get-caller-identity --region us-east-1`
3. Run:

```powershell
.\scripts\Update-GoogleAdminSsm.ps1 -CredentialsPath "$env:USERPROFILE\secrets\google-oauth.json" -Region us-east-1
```

This updates: `credentials-json`, `client-id`, `client-secret`, `project-id`, `auth-uri`, `token-uri`, `redirect-uri`.

## Terraform: SecureString parameters are not overwritten after first create

`infra/terraform/main.tf` splits SSM into:

- **`aws_ssm_parameter.defaults_string`** — non-secret strings; Terraform may update values (e.g. Cognito IDs).
- **`aws_ssm_parameter.defaults_secure`** — SecureStrings with `lifecycle { ignore_changes = [value] }` so **`terraform apply` does not push** placeholder/template values over secrets you edited in the Console.

**Terraform ≥ 1.7** is required (see `terraform` block in `main.tf`).

### One-time state migration

If you previously had **`aws_ssm_parameter.defaults`**, the config includes **`moved`** blocks to **`defaults_string`** / **`defaults_secure`**.

If state still contains **`aws_ssm_parameter.defaults["/youtubebooster/youtube/api-key"]`** (legacy), remove it from state **before** apply so Terraform does not try to destroy the AWS parameter:

```bash
terraform state rm 'aws_ssm_parameter.defaults["/youtubebooster/youtube/api-key"]'
```

That only drops it from Terraform state; it does **not** delete the parameter in AWS unless you run `terraform destroy` on a tracked resource.

### If `ssm_prefix` is not `/youtubebooster`

The **`moved`** blocks use a fixed prefix. If you use a custom `var.ssm_prefix`, adjust the **`moved`** addresses or manage state migration manually.

## Cognito (`cognito/*`) and sign-in

Terraform writes **`cognito/region`**, **`cognito/user-pool-id`**, **`cognito/app-client-id`** from the managed User Pool. If you **recreated** the stack, you may have a **new** pool while users still exist in an **older** pool — sign-in then fails even when `VITE_API_BASE_URL` is correct. See **`docs/COGNITO-AMPLIFY-TROUBLESHOOTING.md`**.

## Parameters managed by Terraform (summary)

Under your prefix (default `/youtubebooster`):

- **Strings:** `ses/*`, `stripe/publishable-key`, `stripe/price-lookup-key`, `admin/google/project-id`, `admin/google/auth-uri`, `admin/google/token-uri`, `admin/google/redirect-uri`, `features/*`, `cognito/*`
- **`admin/email`:** dedicated Terraform resource `aws_ssm_parameter.admin_email` (value frozen after create, like pricing params).
- **`pricing/one-time-price` and `pricing/currency`:** Managed as dedicated `aws_ssm_parameter` resources with `lifecycle { ignore_changes = [value] }` so **Console edits are never overwritten** by `terraform apply`. The API and Stripe checkout read these values (no separate Stripe price object required for the amount).
- **SecureStrings (value frozen after first apply):** `stripe/secret-key`, `stripe/webhook-secret`, `stripe/openai-api-key`, `admin/password`, `admin/google/credentials-json`, `admin/google/client-id`, `admin/google/client-secret`

## Growth reporting secrets (agents / Automation)

Not read by Lambda at runtime. Used by `scripts/growth/*` and Cursor Automation.

| Parameter | Type |
|-----------|------|
| `/youtubebooster/growth/ga4-property-id` | String |
| `/youtubebooster/growth/google-analytics-credentials-json` | SecureString |
| `/youtubebooster/growth/stripe-restricted-read-key` | SecureString (`rk_…` only) |

Setup: **`docs/growth/SECRETS-SETUP.md`**. Verify: `node scripts/growth/verify-ssm-secrets.mjs`.

## Bedrock AI runtime parameters

Create these **String** parameters under your prefix (example uses `/youtubebooster`):

- `/youtubebooster/bedrock/model` (example: `anthropic.claude-3-sonnet-20240229-v1:0`)
- `/youtubebooster/bedrock/maxTokens` (recommended `800`–`1200`, default `900`)
- `/youtubebooster/bedrock/temperature` (recommended `0.7`)

The API reads these values at runtime for `/api/ai/generate`.

## Admin CRM login (`/admin/login` on the site)

The API checks credentials against **Parameter Store** (not Cognito):

| Parameter | Type | Notes |
|-----------|------|--------|
| `{prefix}/admin/email` | String | Must match the email you type (comparison is case-insensitive). Managed as **`aws_ssm_parameter.admin_email`** in Terraform with `lifecycle { ignore_changes = [value] }` so **`terraform apply` does not overwrite** Console edits. Initial value: variable `admin_login_email` (default `mykantor@bellsouth.net`). |
| `{prefix}/admin/password` | SecureString | Must match the password you type. |
| `{prefix}/admin/password-format` | String (optional) | Omit or `plain` for literal password. Use `bcrypt` only if the stored value is a **bcrypt hash** (then you type the raw password and the API verifies with BCrypt). Unknown values reject login. |

If email/password params are **missing**, the API returns **500** (“not configured”). **401** means they **exist** but **do not match** what you entered, or `password-format` does not match how the password was stored.

Terraform often creates a **placeholder** `admin/password`; update it in the **AWS Console** (Terraform ignores value changes on that SecureString).

## Lambda environment

- `SSM__BASEPATH=/youtubebooster` (must match parameter prefix)
