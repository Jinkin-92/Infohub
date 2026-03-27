param(
    [string]$TaskPrefix = "StockStrategy",
    [string]$DailyTime = "15:35"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$dailyScript = Join-Path $scriptDir "run_market_update.ps1"

$dailyHour, $dailyMinute = $DailyTime.Split(":")
$dailyAt = Get-Date -Hour ([int]$dailyHour) -Minute ([int]$dailyMinute) -Second 0
if ($dailyAt -lt (Get-Date)) {
    $dailyAt = $dailyAt.AddDays(1)
}

$taskName = "$TaskPrefix-DailyRun"
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"$dailyScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At $dailyAt
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "Registered task:"
Write-Host " - $taskName"
Write-Host ""
Write-Host "Repo root: $repoRoot"
