<#
.SYNOPSIS
    Setup Windows Scheduled Task — BACKUP for YouTubeBooster Daily Growth

.DESCRIPTION
    Primary trigger is Cursor Automation "YouTubeBooster daily paid growth"
    (Mon–Fri 8:00 AM America/New_York).

    This Windows task is the local BACKUP: it runs later the same morning so a
    disabled/rate-limited Cursor Automation still produces the Admin email +
    COOK-001 weekday send when this PC is on.

.PARAMETER Action
    Register (default), Unregister, Status, or RunNow.

.PARAMETER Time
    Backup start time HH:mm (default: "08:30" — after Cursor's 08:00).

.EXAMPLE
    .\scripts\growth\setup-daily-growth-task.ps1 -Action Register
    .\scripts\growth\setup-daily-growth-task.ps1 -Action Status
    .\scripts\growth\setup-daily-growth-task.ps1 -Action RunNow
    .\scripts\growth\setup-daily-growth-task.ps1 -Action Unregister
#>

[CmdletBinding()]
param(
    [ValidateSet("Register", "Unregister", "Status", "RunNow")]
    [string]$Action = "Register",

    [string]$Time = "08:30"
)

$TaskName = "YouTubeBooster Daily Growth"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$RunnerPs1 = Join-Path $ScriptDir "run-daily-growth-job.ps1"

function Show-Status {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
        $resultHex = if ($null -ne $info.LastTaskResult) { ("0x{0:X8}" -f [uint32]$info.LastTaskResult) } else { "n/a" }
        Write-Host "Task Name:        $($existing.TaskName)" -ForegroundColor Green
        Write-Host "State:            $($existing.State)" -ForegroundColor Green
        Write-Host "Role:             BACKUP (Cursor Automation is primary at 08:00 ET)" -ForegroundColor Cyan
        Write-Host "Last Run Time:    $($info.LastRunTime)"
        Write-Host "Last Result:      $($info.LastTaskResult) ($resultHex)"
        Write-Host "Next Run Time:    $($info.NextRunTime)"
        Write-Host "Script:           $RunnerPs1"
        Write-Host "Log folder:       $(Join-Path $RepoRoot 'docs\growth\logs')"
    } else {
        Write-Host "Task '$TaskName' is NOT registered." -ForegroundColor Yellow
    }
}

switch ($Action) {
    "Status" {
        Show-Status
    }

    "RunNow" {
        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if (-not $existing) {
            Write-Host "Task not registered yet. Running script directly..." -ForegroundColor Yellow
            & powershell.exe -ExecutionPolicy Bypass -File $RunnerPs1
        } else {
            Write-Host "Triggering scheduled task '$TaskName'..." -ForegroundColor Cyan
            Start-ScheduledTask -TaskName $TaskName
            Start-Sleep -Seconds 3
            Show-Status
        }
    }

    "Unregister" {
        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existing) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            Write-Host "Task '$TaskName' removed successfully." -ForegroundColor Green
        } else {
            Write-Host "Task '$TaskName' does not exist." -ForegroundColor Yellow
        }
    }

    "Register" {
        if (-not (Test-Path $RunnerPs1)) {
            throw "Runner script missing: $RunnerPs1"
        }

        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "Task '$TaskName' already exists. Updating..." -ForegroundColor Yellow
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }

        $parsedTime = [datetime]::ParseExact($Time, "HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)
        # Weekdays only — matches Cursor Automation Mon–Fri 08:00 ET primary.
        $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $parsedTime

        $powershellExe = (Get-Command powershell.exe).Source
        $argumentList = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerPs1`""
        $taskAction = New-ScheduledTaskAction -Execute $powershellExe -Argument $argumentList -WorkingDirectory "$RepoRoot"

        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -ExecutionTimeLimit (New-TimeSpan -Minutes 45) `
            -WakeToRun `
            -MultipleInstances IgnoreNew

        # Interactive: runs in the logged-on user session (reliable PATH / AWS creds).
        # Falls back notes: if the PC is locked/asleep past catch-up, StartWhenAvailable still applies.
        $principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel Limited

        Register-ScheduledTask -TaskName $TaskName `
            -Trigger $trigger `
            -Action $taskAction `
            -Settings $settings `
            -Principal $principal `
            -Description "BACKUP for Cursor Automation 'YouTubeBooster daily paid growth'. Primary = Cursor 08:00 ET weekdays; this task = $Time ET weekdays (Admin email + COOK-001)." | Out-Null

        Write-Host "Scheduled task '$TaskName' registered as BACKUP." -ForegroundColor Green
        Write-Host "Primary:  Cursor Automation Mon-Fri 08:00 ET" -ForegroundColor Cyan
        Write-Host "Backup:   Windows task Mon-Fri $Time ET (this PC must be on / logged in)" -ForegroundColor Cyan
        Write-Host "Catch-up: StartWhenAvailable if the PC was asleep at $Time." -ForegroundColor Cyan
        Write-Host ""
        Show-Status
    }
}
