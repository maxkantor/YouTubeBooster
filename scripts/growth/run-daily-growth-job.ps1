<#
.SYNOPSIS
    YouTubeBooster AI - Automated Daily Growth Job (PowerShell Wrapper)

.DESCRIPTION
    Executes the autonomous daily growth runner (scripts/growth/run-daily-growth-job.mjs).
    Works independently of Cursor IDE / Cursor Cloud Automations.
    Designed for Windows Task Scheduler as a BACKUP when Cursor Automation does not run.

.PARAMETER DryRun
    Runs the pipeline in preview mode (does not send emails or mutate state).

.PARAMETER Force
    Overrides the weekend pause and attempts COOK-001 outreach send.

.PARAMETER MaxSends
    Maximum qualified contacts to attempt (default: 100, cap: 500).

.EXAMPLE
    .\scripts\growth\run-daily-growth-job.ps1
    .\scripts\growth\run-daily-growth-job.ps1 -DryRun
    .\scripts\growth\run-daily-growth-job.ps1 -Force
#>

[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Force,
    [int]$MaxSends = 100
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$LogDir = Join-Path $RepoRoot "docs\growth\logs"

# Ensure Task Scheduler (S4U) sessions can find Node and AWS CLI.
$env:Path = @(
    "C:\Program Files\nodejs",
    "C:\Program Files\Amazon\AWSCLIV2",
    "$env:LOCALAPPDATA\Microsoft\WindowsApps",
    $env:Path
) -join ";"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$TodayYmd = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $LogDir "daily-run-$TodayYmd.log"

function Resolve-ToolPath {
    param([string]$Name, [string[]]$Fallbacks)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    foreach ($p in $Fallbacks) {
        if (Test-Path $p) { return $p }
    }
    return $Name
}

$NodeExe = Resolve-ToolPath "node" @(
    "C:\Program Files\nodejs\node.exe",
    "$env:ProgramFiles\nodejs\node.exe"
)
$RunnerScript = Join-Path $ScriptDir "run-daily-growth-job.mjs"

if (-not (Test-Path $NodeExe)) {
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] FATAL: node.exe not found (tried $NodeExe)"
    Add-Content -Path $LogFile -Value $msg
    Write-Error $msg
    exit 1
}
if (-not (Test-Path $RunnerScript)) {
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] FATAL: runner missing: $RunnerScript"
    Add-Content -Path $LogFile -Value $msg
    Write-Error $msg
    exit 1
}

$RunnerArgs = @($RunnerScript, "--max", ([Math]::Max(1, [Math]::Min(500, $MaxSends))).ToString())
if ($DryRun) { $RunnerArgs += "--dry-run" }
if ($Force) { $RunnerArgs += "--force" }

$Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
@(
    "[$Timestamp] Starting YouTubeBooster Daily Growth Run (Windows backup runner)",
    "[$Timestamp] Working directory: $RepoRoot",
    "[$Timestamp] Node executable: $NodeExe",
    "[$Timestamp] Args: $($RunnerArgs -join ' ')"
) | ForEach-Object { $_ | Tee-Object -FilePath $LogFile -Append }

Push-Location $RepoRoot
$ExitCode = 1
try {
    # Avoid Start-Process here: under Task Scheduler S4U it has failed with
    # 0x800705AF (paging/commitment) and produced no log. Invoke node in-process.
    $output = & $NodeExe @RunnerArgs 2>&1
    $ExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    if ($output) {
        $output | ForEach-Object { "$_" } | Tee-Object -FilePath $LogFile -Append | Out-Null
    }
} catch {
    $ExitCode = 1
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] EXCEPTION: $($_.Exception.Message)" | Tee-Object -FilePath $LogFile -Append | Out-Null
} finally {
    $EndTimestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    "[$EndTimestamp] Finished with exit code $ExitCode" | Tee-Object -FilePath $LogFile -Append | Out-Null
    Pop-Location
}

exit $ExitCode
