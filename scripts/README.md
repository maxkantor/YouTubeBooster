# Release scripts

## `full-release.sh`

Runs, in order:

1. `frontend`: `npm ci` and `npm run build` (TypeScript + Vite).
2. `backend`: `dotnet build` (Release) for the API project.
3. `backend/publish-lambda.sh` → produces **`backend/artifacts/youtubebooster-api.zip`** (gitignored).

**Deploy:** Push to the branch Amplify watches (e.g. `main`) so the frontend builds in AWS. Upload `backend/artifacts/youtubebooster-api.zip` to the Lambda function when the API changed (see `backend/LAMBDA-DEPLOY.md`).

**Note:** On some environments `dotnet restore` needs outbound network; run the script from a machine with NuGet access if the build fails.
