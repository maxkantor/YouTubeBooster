<#
.SYNOPSIS
    YouTubeBooster AI - Automated Daily Growth Job (PowerShell Wrapper)

.DESCRIPTION
    Executes the autonomous daily growth runner (scripts/growth/run-daily-growth-job.mjs).
    Works independently of Cursor IDE / Cursor Cloud Automations.
    Designed for Windows Task Scheduler or direct manual execution.

.PARAMETER DryRun
    Runs the pipeline in preview mode (does not send emails or mutate state).

.PARAMETER Force
    Overrides the weekend pause and attempts COOK-001 outreach send.

.PARAMETER MaxSends
    Maximum qualified contacts to approve and attempt (default: 10, cap: 30).

.EXAMPLE
    .\scripts\growth\run-daily-growth-job.ps1
    .\scripts\growth\run-daily-growth-job.ps1 -DryRun
    .\scripts\growth\run-daily-growth-job.ps1 -Force
#>

[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Force,
    [int]$MaxSends = 10
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$LogDir = Join-Path $RepoRoot "docs\growth\logs"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$TodayYmd = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $LogDir "daily-run-$TodayYmd.log"

$NodeExe = "node"
try {
    $NodeCommand = Get-Command "node" -ErrorAction SilentlyContinue
    if ($NodeCommand) {
        $NodeExe = $NodeCommand.Source
    } elseif (Test-Path "C:\Program Files\nodejs\node.exe") {
        $NodeExe = "C:\Program Files\nodejs\node.exe"
    }
} catch {}

$AwsExe = "aws"
try {
    $AwsCommand = Get-Command "aws" -ErrorAction SilentlyContinue
    if ($AwsCommand) {
        $AwsExe = $AwsCommand.Source
    } elseif (Test-Path "C:\Program Files\Amazon\AWSCLIV2\aws.exe") {
        $AwsExe = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
    }
} catch {}

$RunnerScript = Join-Path $ScriptDir "run-daily-growth-job.mjs"

$RunnerArgs = @($RunnerScript, "--max", $MaxSends.ToString())
if ($DryRun) { $RunnerArgs += "--dry-run" }
if ($Force) { $RunnerArgs += "--force" }

$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
Write-Output "[$Timestamp] Starting YouTubeBooster Daily Growth Run" | Tee-Object -FilePath $LogFile -Append
Write-Output "[$Timestamp] Working directory: $RepoRoot" | Tee-Object -FilePath $LogFile -Append
Write-Output "[$Timestamp] Node executable: $NodeExe" | Tee-Object -FilePath $LogFile -Append

Push-Location $RepoRoot
try {
    $Process = Start-Process -FilePath $NodeExe -ArgumentList $RunnerArgs -WorkingDirectory $RepoRoot -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$LogDir\temp-out.log" -RedirectStandardError "$LogDir\temp-err.log"
    
    if (Test-Path "$LogDir\temp-out.log") {
        Get-Content "$LogDir\temp-out.log" | Tee-Object -FilePath $LogFile -Append
        Remove-Item "$LogDir\temp-out.log" -Force
    }
    if (Test-Path "$LogDir\temp-err.log") {
        Get-Content "$LogDir\temp-err.log" | Tee-Object -FilePath $LogFile -Append
        Remove-Item "$LogDir\temp-err.log" -Force
    }

    $ExitCode = $Process.ExitCode
    $EndTimestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Write-Output "[$EndTimestamp] Finished with exit code $ExitCode" | Tee-Object -FilePath $LogFile -Append
    exit $ExitCode
} finally {
    Pop-Location
}
