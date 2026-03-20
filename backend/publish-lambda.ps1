# Build Lambda deployment zip — output is ONLY under backend/artifacts/
$ErrorActionPreference = "Stop"
$BackendDir = $PSScriptRoot
$RepoRoot = Split-Path $BackendDir -Parent
$PublishOut = Join-Path $BackendDir "artifacts\publish"
$ZipOut = Join-Path $BackendDir "artifacts\youtubebooster-api.zip"

if (Test-Path $PublishOut) { Remove-Item -Recurse -Force $PublishOut }
dotnet publish (Join-Path $RepoRoot "backend\src\YouTubeBoosterAi.Api\YouTubeBoosterAi.Api.csproj") `
  -c Release -r linux-x64 --self-contained false -o $PublishOut

if (Test-Path $ZipOut) { Remove-Item -Force $ZipOut }
Compress-Archive -Path (Join-Path $PublishOut "*") -DestinationPath $ZipOut -Force

Write-Host "Lambda zip: $ZipOut"
Get-Item $ZipOut | Format-List FullName, Length
