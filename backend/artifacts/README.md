# Backend Lambda deployment

## Zip for manual upload

- **File:** `youtubebooster-api.zip`
- **Use:** Upload this file in the AWS Lambda console as the function code (upload from .zip).

1. Open AWS Console → Lambda → your function (e.g. `youtubebooster-ai-api`).
2. Code source → Upload from → .zip file.
3. Choose `youtubebooster-api.zip` from this folder.

## Regenerate the zip

From repo root:

```powershell
cd backend\src\YouTubeBoosterAi.Api
dotnet publish -c Release -r linux-x64 --self-contained false -o ..\..\..\artifacts\publish
cd ..\..\..\artifacts
Compress-Archive -Path publish\* -DestinationPath youtubebooster-api.zip -Force
Copy-Item youtubebooster-api.zip ..\backend\artifacts\
```

## Terraform

If you use Terraform to deploy Lambda, set `backend_package_path` to the full path to `backend/artifacts/youtubebooster-api.zip` (or `artifacts/youtubebooster-api.zip`) and run `terraform apply`.
