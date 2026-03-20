# Backend Lambda deployment

## Canonical zip (only location)

**File:** `backend/artifacts/youtubebooster-api.zip`

This is the only path the repo uses for the Lambda package. Regenerate it with the script from the repo root:

```bash
./backend/publish-lambda.sh
```

Windows (PowerShell), from repo root:

```powershell
.\backend\publish-lambda.ps1
```

## Manual upload

1. AWS Console → Lambda → your function (e.g. `youtubebooster-ai-api`) → **Code** → **Upload from** → **.zip file**
2. Select `backend/artifacts/youtubebooster-api.zip`

See also `backend/LAMBDA-DEPLOY.md`.

## Terraform

Set `backend_package_path` to the absolute path of `backend/artifacts/youtubebooster-api.zip`, then `terraform apply`.
