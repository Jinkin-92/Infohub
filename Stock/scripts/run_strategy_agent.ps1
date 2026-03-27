$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Set-Location $repoRoot

$provider = if ($env:AGENT_PROVIDER) { $env:AGENT_PROVIDER } elseif ($env:DATA_PROVIDER) { $env:DATA_PROVIDER } else { "akshare" }

python main.py --run daily --provider $provider
