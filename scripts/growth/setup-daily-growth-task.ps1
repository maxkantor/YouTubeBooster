<#
.SYNOPSIS
    Setup Windows Scheduled Task for YouTubeBooster Daily Growth Automation

.DESCRIPTION
    Creates, queries, triggers, or removes the Windows Scheduled Task:
    "YouTubeBooster Daily Growth".
    Runs Monday-Friday at 8:00 AM (or specified time) without needing Cursor active.

.PARAMETER Action
    Register (default), Unregister, Status, or RunNow.

.PARAMETER Time
    Start time in 24-hour HH:mm format (default: "08:00").

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

    [string]$Time = "08:00"
)

$TaskName = "YouTubeBooster Daily Growth"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$RunnerPs1 = Join-Path $ScriptDir "run-daily-growth-job.ps1"

function Show-Status {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
        Write-Host "Task Name:        $($existing.TaskName)" -ForegroundColor Green
        Write-Host "State:            $($existing.State)" -ForegroundColor Green
        Write-Host "Last Run Time:    $($info.LastRunTime)"
        Write-Host "Last Result:      $($info.LastTaskResult)"
        Write-Host "Next Run Time:    $($info.NextRunTime)"
        Write-Host "Script:           $RunnerPs1"
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
            Start-Sleep -Seconds 2
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
        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "Task '$TaskName' already exists. Updating..." -ForegroundColor Yellow
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }

        $parsedTime = [datetime]::ParseExact($Time, "HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)
        $trigger = New-ScheduledTaskTrigger -Daily -At $parsedTime

        $powershellExe = (Get-Command powershell.exe).Source
        $argumentList = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerPs1`""
        $taskAction = New-ScheduledTaskAction -Execute $powershellExe -Argument $argumentList -WorkingDirectory $RepoRoot

        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 45) -WakeToRun

        $principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType S4U

        Register-ScheduledTask -TaskName $TaskName `
            -Trigger $trigger `
            -Action $taskAction `
            -Settings $settings `
            -Principal $principal `
            -Description "YouTubeBooster AI Autonomous Daily Growth Automation (Daily including weekends at $Time)" | Out-Null

        Write-Host "Scheduled task '$TaskName' successfully registered!" -ForegroundColor Green
        Write-Host "Schedule: Every day (including weekends) at $Time" -ForegroundColor Cyan
        Write-Host "Catch-up: Will run automatically on wake/boot if missed." -ForegroundColor Cyan
        Write-Host ""
        Show-Status
    }
}
