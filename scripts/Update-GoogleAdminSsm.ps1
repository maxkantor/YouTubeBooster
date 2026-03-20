<#
.SYNOPSIS
  Updates /youtubebooster/admin/google/* SSM parameters from a Google OAuth "installed" credentials JSON.

.DESCRIPTION
  Terraform creates SecureStrings with `lifecycle { ignore_changes = [value] }`, so placeholders
  like `replace-me` are NOT overwritten by `terraform apply`. Run this once (or whenever
  credentials change) after authenticating: `aws sso login` or `aws configure`.

.PARAMETER CredentialsPath
  Path to JSON file with an "installed" object (desktop OAuth client JSON from Google Cloud).

.PARAMETER Region
  AWS region (default us-east-1).

.PARAMETER Prefix
  SSM prefix (default /youtubebooster).

.EXAMPLE
  .\scripts\Update-GoogleAdminSsm.ps1 -CredentialsPath "$env:USERPROFILE\secrets\google-oauth.json"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $CredentialsPath,

    [string] $Region = "us-east-1",

    [string] $Prefix = "/youtubebooster"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CredentialsPath)) {
    throw "File not found: $CredentialsPath"
}

$raw = Get-Content -LiteralPath $CredentialsPath -Raw -Encoding UTF8
$doc = $raw | ConvertFrom-Json
if (-not $doc.installed) {
    throw 'JSON must contain an "installed" object (desktop OAuth client).'
}

$i = $doc.installed
$clientId = [string]$i.client_id
$clientSecret = [string]$i.client_secret
$projectId = [string]$i.project_id
$authUri = $i.auth_uri -as [string]; if (-not $authUri) { $authUri = "https://accounts.google.com/o/oauth2/auth" }
$tokenUri = $i.token_uri -as [string]; if (-not $tokenUri) { $tokenUri = "https://oauth2.googleapis.com/token" }
$redirectUri = "http://localhost"
if ($i.redirect_uris -and $i.redirect_uris.Count -gt 0) {
    $redirectUri = [string]$i.redirect_uris[0]
}

if ([string]::IsNullOrWhiteSpace($clientId) -or [string]::IsNullOrWhiteSpace($clientSecret)) {
    throw "installed.client_id and installed.client_secret are required."
}

Write-Host "Using AWS region: $Region, SSM prefix: $Prefix" -ForegroundColor Cyan

function Put-SecureString {
    param([string]$Name, [string]$Value, [string]$Description)
    aws ssm put-parameter `
        --region $Region `
        --name $Name `
        --value $Value `
        --type SecureString `
        --overwrite `
        --description $Description
    if ($LASTEXITCODE -ne 0) { throw "put-parameter failed: $Name" }
}

function Put-String {
    param([string]$Name, [string]$Value, [string]$Description)
    aws ssm put-parameter `
        --region $Region `
        --name $Name `
        --value $Value `
        --type String `
        --overwrite `
        --description $Description
    if ($LASTEXITCODE -ne 0) { throw "put-parameter failed: $Name" }
}

# Full JSON blob (YouTube API key can be added later as top-level youtube_api_key in this param)
Put-SecureString -Name "$Prefix/admin/google/credentials-json" -Value $raw -Description "Admin Google OAuth credentials (full JSON or built from granular params)"
Put-SecureString -Name "$Prefix/admin/google/client-id" -Value $clientId -Description "Admin Google OAuth client id (from credentials.json installed.client_id)"
Put-SecureString -Name "$Prefix/admin/google/client-secret" -Value $clientSecret -Description "Admin Google OAuth client secret (from credentials.json)"

Put-String -Name "$Prefix/admin/google/project-id" -Value $projectId -Description "Admin Google OAuth project id (from credentials.json)"
Put-String -Name "$Prefix/admin/google/auth-uri" -Value $authUri -Description "Admin Google OAuth auth URI"
Put-String -Name "$Prefix/admin/google/token-uri" -Value $tokenUri -Description "Admin Google OAuth token URI"
Put-String -Name "$Prefix/admin/google/redirect-uri" -Value $redirectUri -Description "Admin Google OAuth redirect URI (first redirect_uris entry)"

Write-Host "Done. Verify in SSM Parameter Store (decrypted) for client-id and credentials-json." -ForegroundColor Green
