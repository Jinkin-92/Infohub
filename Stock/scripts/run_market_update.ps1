$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Set-Location $repoRoot

$provider = if ($env:MARKET_WORKER_PROVIDER) { $env:MARKET_WORKER_PROVIDER } elseif ($env:DATA_PROVIDER) { $env:DATA_PROVIDER } else { "akshare" }

python main.py --run daily --provider $provider
