$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
Set-Location $repoRoot

$port = if ($env:DASHBOARD_PORT) { $env:DASHBOARD_PORT } else { "8501" }

$process = Start-Process `
  -FilePath "python" `
  -ArgumentList @("main.py", "dashboard", "--host", "127.0.0.1", "--port", $port, "--headless", "--background") `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -PassThru

Write-Output "Dashboard launcher started. PID=$($process.Id) URL=http://127.0.0.1:$port"
