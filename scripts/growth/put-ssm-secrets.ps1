#!/usr/bin/env pwsh
# Put growth secrets from env → AWS SSM. Never logs secret values.
# Requires: GA4_PROPERTY_ID, GOOGLE_ANALYTICS_CREDENTIALS_JSON, STRIPE_RESTRICTED_READ_KEY
$ErrorActionPreference = 'Stop'
$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }

function Assert-Env([string]$Name) {
  $v = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($v)) {
    throw "Missing env var $Name. See docs/growth/SECRETS-SETUP.md"
  }
  return $v
}

function Put-Param([string]$Name, [string]$Value, [string]$Type) {
  $null = aws ssm put-parameter `
    --name $Name `
    --type $Type `
    --value $Value `
    --overwrite `
    --region $Region `
    --output text
  Write-Host "OK  $Name ($Type)"
}

$ga4 = Assert-Env 'GA4_PROPERTY_ID'
$creds = Assert-Env 'GOOGLE_ANALYTICS_CREDENTIALS_JSON'
$stripe = Assert-Env 'STRIPE_RESTRICTED_READ_KEY'

if ($stripe -notmatch '^rk_') {
  throw 'STRIPE_RESTRICTED_READ_KEY must be a restricted key (rk_…). Do not use sk_.'
}

# Light JSON sanity check without printing contents
try {
  $null = $creds | ConvertFrom-Json
} catch {
  throw 'GOOGLE_ANALYTICS_CREDENTIALS_JSON is not valid JSON.'
}

Put-Param '/youtubebooster/growth/ga4-property-id' $ga4 'String'
Put-Param '/youtubebooster/growth/google-analytics-credentials-json' $creds 'SecureString'
Put-Param '/youtubebooster/growth/stripe-restricted-read-key' $stripe 'SecureString'

Write-Host 'Done. Run: node scripts/growth/verify-ssm-secrets.mjs'
