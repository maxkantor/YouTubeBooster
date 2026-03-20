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

## Parameters managed by Terraform (summary)

Under your prefix (default `/youtubebooster`):

- **Strings:** `ses/*`, `stripe/publishable-key`, `stripe/price-lookup-key`, `admin/email`, `admin/google/project-id`, `admin/google/auth-uri`, `admin/google/token-uri`, `admin/google/redirect-uri`, `pricing/*`, `features/*`, `cognito/*`
- **SecureStrings (value frozen after first apply):** `stripe/secret-key`, `stripe/webhook-secret`, `stripe/openai-api-key`, `admin/password`, `admin/google/credentials-json`, `admin/google/client-id`, `admin/google/client-secret`

## Lambda environment

- `SSM__BASEPATH=/youtubebooster` (must match parameter prefix)
