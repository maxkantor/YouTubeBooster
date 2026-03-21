# Lambda deploy (YouTube Booster API)

**Full local pipeline** (frontend build + backend compile + zip): from repo root run `./scripts/full-release.sh`.

## Build zip

From **repo root**:

**macOS / Linux**

```bash
chmod +x backend/publish-lambda.sh
./backend/publish-lambda.sh
```

**Windows (PowerShell)**

```powershell
.\backend\publish-lambda.ps1
```

**Output:** `backend/artifacts/youtubebooster-api.zip` (gitignored — run the script to generate it).

Upload that file to Lambda.

## AWS Console

1. **Lambda** → function **youtubebooster-ai-api** → **Code** → **Upload from** → **.zip file** → choose `backend/artifacts/youtubebooster-api.zip`.
2. **Runtime settings** (Code tab, right) → **Edit**:
   - **Runtime:** .NET 8 (C#/F#/PowerShell)
   - **Handler:** `YouTubeBoosterAi.Api`
3. **Save**.
4. **Configuration** → **Environment variables**: ensure **LambdaEventSource** = `HttpApi` (so the app uses HTTP API payload v2, not REST).

## Test

Open:

`https://<your-api-id>.execute-api.us-east-1.amazonaws.com/health`

Expected: `{"status":"ok","service":"youtube-booster-ai-api"}`.

## Important

- **Only** `Program.cs` should call `AddAWSLambdaHosting(LambdaEventSource.HttpApi)`. Do **not** add it in `Infrastructure.cs` or anywhere else (a duplicate `RestApi` registration was overriding and causing `MarshallRequest` errors).

## If you see errors

- **Invalid lambda function handler**  
  Handler must be exactly `YouTubeBoosterAi.Api` (no `::Type::Method`).

- **MarshallRequest NullReferenceException**  
  API Gateway is sending REST (v1) payload; your API must be **HTTP API** (payload v2). In API Gateway, confirm the API type is HTTP API, not REST API.

- **CreateContext NullReferenceException**  
  This can occur if the handler is overridden to a custom class. Use only handler `YouTubeBoosterAi.Api` with this project (no custom entry point).

## Deploy via AWS CLI / Terraform

- Terraform: set `backend_package_path` to the full path to `backend/artifacts/youtubebooster-api.zip` and run `terraform apply`.

## SSM / secrets (YouTube API key, Stripe, etc.)

See **`docs/SSM-PARAMETER-CHECKLIST.md`**. The YouTube Data API key is read from **`/youtubebooster/admin/google/credentials-json`** (`youtube_api_key` in JSON). Terraform does not overwrite SecureString values after the first create.
