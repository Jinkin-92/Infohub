$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\windows-runtime.ps1')

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$backendEnv = Join-Path $backendDir '.env'
$rootEnvExample = Join-Path $root '.env.example'

function Ensure-FileFromTemplate {
  param(
    [string]$Target,
    [string]$Template
  )

  if (-not (Test-Path $Target) -and (Test-Path $Template)) {
    Copy-Item $Template $Target
  }
}

function Invoke-Step {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory,
    [string[]]$NpmArguments
  )

  Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments $NpmArguments
}

function Invoke-BackendNativeRebuild {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory
  )

  Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('rebuild', 'better-sqlite3')
}

function Clear-BackendNativeArtifacts {
  param([string]$WorkingDirectory)

  Remove-Item -LiteralPath (Join-Path $WorkingDirectory 'node_modules\better-sqlite3') -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $WorkingDirectory 'node_modules\better-sqlite3\build') -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path (Join-Path $WorkingDirectory 'node_modules\.better-sqlite3-*') -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host '=========================================='
Write-Host 'InfoHub Windows Update'
Write-Host '=========================================='

$nodeRuntime = Ensure-NodeRuntime -Root $root
Write-Host "Using Node.js $($nodeRuntime.Version) [$($nodeRuntime.Source)]"

& (Join-Path $root 'stop.ps1')

Write-Host 'Refreshing dependencies and build artifacts...'
Ensure-FileFromTemplate -Target $backendEnv -Template $rootEnvExample
Ensure-ChromeRuntime -Root $root -NodeRuntime $nodeRuntime | Out-Null
Clear-BackendNativeArtifacts -WorkingDirectory $backendDir
Invoke-Step -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir -NpmArguments @('install')
Invoke-BackendNativeRebuild -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
Invoke-Step -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir -NpmArguments @('run', 'build')
Invoke-Step -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir -NpmArguments @('install')
Invoke-Step -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir -NpmArguments @('run', 'build')

& (Join-Path $root 'start.ps1')
