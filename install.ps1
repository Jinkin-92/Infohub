$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\windows-runtime.ps1')

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$backendEnv = Join-Path $backendDir '.env'
$rootEnvExample = Join-Path $root '.env.example'
$stopScript = Join-Path $root 'stop.ps1'

function Ensure-FileFromTemplate {
  param(
    [string]$Target,
    [string]$Template
  )

  if (-not (Test-Path $Target) -and (Test-Path $Template)) {
    Copy-Item $Template $Target
  }
}

function Ensure-NodeModules {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory
  )

  Write-Host "Installing dependencies in $WorkingDirectory ..."
  if ((Test-Path (Join-Path $WorkingDirectory 'package-lock.json')) -and -not (Test-Path (Join-Path $WorkingDirectory 'node_modules'))) {
    Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('ci')
  } else {
    Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('install')
  }
}

function Invoke-Build {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory,
    [string]$ScriptName
  )

  Write-Host "Building $WorkingDirectory ..."
  Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('run', $ScriptName)
}

function Invoke-BackendNativeRebuild {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory
  )

  Write-Host 'Rebuilding backend native modules ...'
  Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('rebuild', 'better-sqlite3')
}

function Clear-BackendNativeArtifacts {
  param([string]$WorkingDirectory)

  Remove-Item -LiteralPath (Join-Path $WorkingDirectory 'node_modules\better-sqlite3') -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $WorkingDirectory 'node_modules\better-sqlite3\build') -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path (Join-Path $WorkingDirectory 'node_modules\.better-sqlite3-*') -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host '=========================================='
Write-Host 'InfoHub Windows Local Install'
Write-Host '=========================================='

$nodeRuntime = Ensure-NodeRuntime -Root $root
Write-Host "Using Node.js $($nodeRuntime.Version) [$($nodeRuntime.Source)]"

if (Test-Path $stopScript) {
  & $stopScript | Out-Null
}

Ensure-FileFromTemplate -Target $backendEnv -Template $rootEnvExample
New-Item -ItemType Directory -Force -Path (Join-Path $backendDir 'data') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root '.tmp') | Out-Null

Ensure-ChromeRuntime -Root $root -NodeRuntime $nodeRuntime | Out-Null
Clear-BackendNativeArtifacts -WorkingDirectory $backendDir
Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir
Invoke-BackendNativeRebuild -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
Invoke-Build -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir -ScriptName 'build'
Invoke-Build -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir -ScriptName 'build'

Write-Host ''
Write-Host 'Install completed. You can now run .\start.bat'
Write-Host ''
