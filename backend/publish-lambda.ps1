# Publish .NET Lambda package to backend/artifacts/youtubebooster-api.zip (see LAMBDA-DEPLOY.md).
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutDir = Join-Path $Here ".lambda-publish\out"
$Artifacts = Join-Path $Here "artifacts"
$Zip = Join-Path $Artifacts "youtubebooster-api.zip"
$Csproj = Join-Path $Here "src\YouTubeBoosterAi.Api\YouTubeBoosterAi.Api.csproj"
if (Test-Path (Join-Path $Here ".lambda-publish")) { Remove-Item -Recurse -Force (Join-Path $Here ".lambda-publish") }
New-Item -ItemType Directory -Path $Artifacts -Force | Out-Null
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
dotnet publish $Csproj -c Release -r linux-x64 --self-contained false -o $OutDir
Push-Location $OutDir
try {
  Compress-Archive -Path * -DestinationPath $Zip -Force
} finally {
  Pop-Location
}
Write-Host "Wrote $Zip"
