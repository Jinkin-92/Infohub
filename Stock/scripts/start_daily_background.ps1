$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
Set-Location $repoRoot

$provider = if ($env:DATA_PROVIDER) { $env:DATA_PROVIDER } else { "akshare" }
$logDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdoutLog = Join-Path $logDir "daily-background.out.log"
$stderrLog = Join-Path $logDir "daily-background.err.log"

$process = Start-Process `
  -FilePath "python" `
  -ArgumentList @("main.py", "--run", "daily", "--provider", $provider) `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden `
  -PassThru

Write-Output "Daily run started in background. PID=$($process.Id) Stdout=$stdoutLog Stderr=$stderrLog"
