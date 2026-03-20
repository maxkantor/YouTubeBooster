# Lambda deploy (YouTube Booster API)

## Build zip (always under `backend/artifacts/`)

From **repo root**:

**macOS / Linux**

```bash
./backend/publish-lambda.sh
```

**Windows (PowerShell)**

```powershell
.\backend\publish-lambda.ps1
```

**Output (only path):** `backend/artifacts/youtubebooster-api.zip`

Use that file in the steps below.

## AWS Console

1. **Lambda** → function **youtubebooster-ai-api** → **Code** → **Upload from** → **.zip file** → choose the zip above.
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

- Terraform: set `backend_package_path` to the zip path and run `terraform apply` so the function code and env (e.g. `LambdaEventSource=HttpApi`) stay in sync.
