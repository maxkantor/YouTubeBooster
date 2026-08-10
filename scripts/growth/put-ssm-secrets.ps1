#!/usr/bin/env pwsh
# Put growth secrets from env → AWS SSM. Never logs secret values.
# Requires: GA4_PROPERTY_ID, GOOGLE_ANALYTICS_CREDENTIALS_JSON, STRIPE_RESTRICTED_READ_KEY
# Optional: GOOGLE_ANALYTICS_CREDENTIALS_FILE (path to SA JSON; preferred over env JSON)
$ErrorActionPreference = 'Stop'
$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }

function Assert-Env([string]$Name) {
  $v = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($v)) {
    throw "Missing env var $Name. See docs/growth/SECRETS-SETUP.md"
  }
  return $v
}

function Put-ParamFile([string]$Name, [string]$FilePath, [string]$Type) {
  if (-not (Test-Path -LiteralPath $FilePath)) { throw "File not found: $FilePath" }
  # file:// avoids shell mangling of multiline JSON / PEM
  $uri = 'file://' + ($FilePath -replace '\\', '/')
  $null = aws ssm put-parameter `
    --name $Name `
    --type $Type `
    --value $uri `
    --overwrite `
    --region $Region `
    --output text
  if ($LASTEXITCODE -ne 0) { throw "aws ssm put-parameter failed for $Name (exit $LASTEXITCODE)" }
  Write-Host "OK  $Name ($Type) via file"
}

function Put-ParamValue([string]$Name, [string]$Value, [string]$Type) {
  $tmp = Join-Path $env:TEMP ("yb-ssm-" + [guid]::NewGuid().ToString('n') + '.txt')
  try {
    # UTF8 no BOM — AWS CLI file:// value
    [System.IO.File]::WriteAllText($tmp, $Value)
    Put-ParamFile $Name $tmp $Type
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

$ga4 = Assert-Env 'GA4_PROPERTY_ID'
$stripe = Assert-Env 'STRIPE_RESTRICTED_READ_KEY'

if ($stripe -notmatch '^rk_') {
  throw 'STRIPE_RESTRICTED_READ_KEY must be a restricted key (rk_…). Do not use sk_.'
}

$credsFile = [Environment]::GetEnvironmentVariable('GOOGLE_ANALYTICS_CREDENTIALS_FILE')
if ([string]::IsNullOrWhiteSpace($credsFile)) {
  $creds = Assert-Env 'GOOGLE_ANALYTICS_CREDENTIALS_JSON'
  try { $null = $creds | ConvertFrom-Json } catch { throw 'GOOGLE_ANALYTICS_CREDENTIALS_JSON is not valid JSON.' }
  Put-ParamValue '/youtubebooster/growth/ga4-property-id' $ga4 'String'
  Put-ParamValue '/youtubebooster/growth/google-analytics-credentials-json' $creds 'SecureString'
  Put-ParamValue '/youtubebooster/growth/stripe-restricted-read-key' $stripe 'SecureString'
} else {
  $raw = Get-Content -LiteralPath $credsFile -Raw
  try { $null = $raw | ConvertFrom-Json } catch { throw 'Credentials file is not valid JSON.' }
  Put-ParamValue '/youtubebooster/growth/ga4-property-id' $ga4 'String'
  Put-ParamFile '/youtubebooster/growth/google-analytics-credentials-json' $credsFile 'SecureString'
  Put-ParamValue '/youtubebooster/growth/stripe-restricted-read-key' $stripe 'SecureString'
}

Write-Host 'Done. Run: node scripts/growth/verify-ssm-secrets.mjs'
