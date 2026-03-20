# SSM Parameter Store checklist (`/youtubebooster`)

The API reads secrets via `SSM__BASEPATH=/youtubebooster` (see Lambda env). **Nothing in this repo deletes your AWS parameters** — only AWS/Terraform/Console actions in your account can change them.

## Why YouTube “works” for the built-in demo but not other channels

If `youtube/api-key` is missing or still `replace-me`, the demo service **does not call YouTube** for arbitrary channels. Only the built-in MaxKantor showcase uses **hardcoded marketing numbers** so `/demo` still looks good. Other channels show zeros and the “could not load live data” message.

## Required parameter for real YouTube Data API data

| Parameter | Type | Used by |
|-----------|------|--------|
| `/youtubebooster/youtube/api-key` | **SecureString** | `GET /api/public/channel/*`, `POST /api/public/demo` |

Create or fix in **AWS Console → Systems Manager → Parameter Store** (or AWS CLI). Value = your **YouTube Data API v3** key (Google Cloud Console → APIs & Services → Credentials).

**Restrictions:** For Lambda/server calls, do **not** restrict the key to **HTTP referrers only**. Use **IP restriction** or **none** for backend use.

## Optional: embed key in `credentials-json` instead

If you prefer one blob for `admin/google/credentials-json`, add a field (same project as OAuth is fine):

```json
{
  "installed": { ... },
  "youtube_api_key": "YOUR_YOUTUBE_DATA_API_KEY"
}
```

The app also checks `installed.youtube_api_key` / `installed.api_key` (see `SecretProviders.cs`).

## Terraform and “lost” / overwritten values

`infra/terraform/main.tf` uses `overwrite = true` on placeholder parameters. A **`terraform apply`** that runs with **empty** sensitive variables (e.g. `youtube_api_key = ""`) can **write `replace-me` back** into SSM and overwrite what you fixed in the Console.

**Mitigation:**

- Pass real values via `terraform.tfvars` / `-var` for secrets, **or**
- Set `create_placeholder_parameters = false` once placeholders exist and manage values only in AWS, **or**
- After apply, re-apply real secrets in Console/CLI.

We did **not** delete parameters from this repo — only applies in your AWS account change Parameter Store.

## Full parameter list (from Terraform `local.ssm_parameters`)

- `ses/from-email`, `ses/admin-email`
- `stripe/secret-key`, `stripe/webhook-secret`, `stripe/publishable-key`, `stripe/price-lookup-key`, `stripe/openai-api-key`
- `admin/email`, `admin/password`
- **`youtube/api-key`** ← often missing if Console list doesn’t show it
- `admin/google/credentials-json`, `admin/google/client-id`, `admin/google/client-secret`, `admin/google/project-id`, `admin/google/auth-uri`, `admin/google/token-uri`, `admin/google/redirect-uri`
- `pricing/one-time-price`, `pricing/currency`
- `features/enable-public-demo`, `features/demo-rate-limit-per-hour`
- `cognito/region`, `cognito/user-pool-id`, `cognito/app-client-id`

## Lambda env (often set by Terraform)

- `SSM__BASEPATH=/youtubebooster` (must match your parameters’ prefix)

## AWS CLI (example — replace `VALUE` locally, do not commit)

```bash
aws ssm put-parameter --name "/youtubebooster/youtube/api-key" --type "SecureString" --value "VALUE" --overwrite --region us-east-1
```

## If you pasted secrets in chat

**Rotate them** in Google Cloud (new API key, regenerate OAuth client secret) — treat them as compromised.
