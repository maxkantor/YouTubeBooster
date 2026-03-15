# Deploy Amplify app via Terraform (creates app in AWS and connects GitHub repo).
# Requires: GitHub Personal Access Token with repo scope.
#
# Usage:
#   $env:TF_VAR_amplify_access_token = "ghp_your_token_here"
#   .\deploy-amplify.ps1
#
# Or run from repo root:
#   $env:TF_VAR_amplify_access_token = "ghp_xxx"; cd infra\terraform; .\deploy-amplify.ps1

$ErrorActionPreference = "Stop"
$token = $env:TF_VAR_amplify_access_token
if (-not $token -or $token.Length -lt 10) {
    Write-Host "Set TF_VAR_amplify_access_token to your GitHub Personal Access Token (repo scope)." -ForegroundColor Yellow
    Write-Host "Example: `$env:TF_VAR_amplify_access_token = 'ghp_xxxx'" -ForegroundColor Gray
    exit 1
}

$repo = "https://github.com/maxkantor/YouTubeBooster"
$dir = $PSScriptRoot
Push-Location $dir
try {
    terraform init -input=false
    terraform apply -input=false -auto-approve `
        -var "enable_amplify_app=true" `
        -var "amplify_repository_url=$repo" `
        -var "amplify_branch_name=main"
    Write-Host "Amplify app created. Check AWS Amplify Console for the new app." -ForegroundColor Green
} finally {
    Pop-Location
}
