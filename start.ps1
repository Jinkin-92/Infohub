$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\windows-runtime.ps1')

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$backendEnv = Join-Path $backendDir '.env'
$rootEnvExample = Join-Path $root '.env.example'
$stateDir = Join-Path $root '.tmp'
$backendPidPath = Join-Path $stateDir 'backend.pid'
$frontendPidPath = Join-Path $stateDir 'frontend.pid'
$backendLog = Join-Path $backendDir 'backend-run.log'
$backendErrorLog = Join-Path $backendDir 'backend-error.log'
$frontendLog = Join-Path $frontendDir 'frontend-run.log'
$frontendErrorLog = Join-Path $frontendDir 'frontend-error.log'

function Ensure-FileFromTemplate {
  param(
    [string]$Target,
    [string]$Template
  )

  if (-not (Test-Path $Target) -and (Test-Path $Template)) {
    Copy-Item $Template $Target
  }
}

function Stop-KnownProcess {
  param([string]$PidFile)

  if (-not (Test-Path $PidFile)) {
    return
  }

  $pidValue = Get-Content -Path $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pidValue) {
    try {
      Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }

  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Get-ListeningPids {
  param([int]$Port)

  $lines = netstat -ano -p tcp | Select-String ":$Port\s+.*LISTENING\s+"
  $pids = @()
  foreach ($line in $lines) {
    $parts = ($line.ToString().Trim() -split '\s+')
    if ($parts.Length -gt 0) {
      $processId = $parts[-1]
      if ($processId -match '^\d+$') {
        $pids += [int]$processId
      }
    }
  }

  return $pids | Select-Object -Unique
}

function Get-ProcessCommandLine {
  param([int]$ProcessId)

  try {
    return (Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId").CommandLine
  } catch {
    return ''
  }
}

function Stop-StrayInfoHubProcess {
  param(
    [int]$Port,
    [string[]]$ExpectedMarkers
  )

  $pids = Get-ListeningPids -Port $Port
  foreach ($processId in $pids) {
    $commandLine = Get-ProcessCommandLine -ProcessId $processId
    $matchesMarker = $false
    foreach ($marker in $ExpectedMarkers) {
      if ($marker -and $commandLine -and $commandLine.Contains($marker)) {
        $matchesMarker = $true
        break
      }
    }

    if ($matchesMarker) {
      try {
        taskkill /F /T /PID $processId | Out-Null
      } catch {
        try {
          Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        } catch {
        }
      }
    }
  }
}

function Assert-PortFree {
  param(
    [int]$Port,
    [string]$Name
  )

  $pids = Get-ListeningPids -Port $Port
  if ($pids.Count -gt 0) {
    throw "$Name port $Port is already occupied by another process ($($pids -join ', ')). Please close that app and try again."
  }
}

function Ensure-NodeModules {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory
  )

  if (-not (Test-Path (Join-Path $WorkingDirectory 'node_modules'))) {
    Write-Host "Installing dependencies in $WorkingDirectory ..."
    if (Test-Path (Join-Path $WorkingDirectory 'package-lock.json')) {
      Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('ci')
    } else {
      Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('install')
    }
  }
}

function Ensure-BuildArtifacts {
  if (-not (Test-Path (Join-Path $backendDir 'dist\index.js')) -or -not (Test-Path (Join-Path $frontendDir '.next\BUILD_ID'))) {
    Write-Host 'Build artifacts missing. Running first-time install steps...'
    & (Join-Path $root 'install.ps1')
  }
}

function Start-ServiceProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [string]$StdoutPath,
    [string]$StderrPath,
    [string]$PidFile
  )

  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $ArgumentList `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath `
    -PassThru

  Set-Content -Path $PidFile -Value $process.Id -Encoding ascii
}

function Wait-ForHttpOk {
  param(
    [string]$Url,
    [int]$Attempts = 40,
    [int]$DelaySeconds = 1
  )

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        return
      }
    } catch {
    }
    Start-Sleep -Seconds $DelaySeconds
  }

  throw "Service check failed: $Url"
}

Write-Host '=========================================='
Write-Host 'InfoHub Windows Local Start'
Write-Host '=========================================='

$nodeRuntime = Ensure-NodeRuntime -Root $root
Write-Host "Using Node.js $($nodeRuntime.Version) [$($nodeRuntime.Source)]"

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backendDir 'data') | Out-Null

Ensure-FileFromTemplate -Target $backendEnv -Template $rootEnvExample
Ensure-ChromeRuntime -Root $root -NodeRuntime $nodeRuntime | Out-Null
Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir
Ensure-BuildArtifacts

Stop-KnownProcess -PidFile $backendPidPath
Stop-KnownProcess -PidFile $frontendPidPath
Stop-StrayInfoHubProcess -Port 3002 -ExpectedMarkers @($backendDir, 'dist/index.js')
Stop-StrayInfoHubProcess -Port 3000 -ExpectedMarkers @($frontendDir, 'next start')
Start-Sleep -Seconds 2

Remove-Item -LiteralPath $backendLog -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $backendErrorLog -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $frontendLog -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $frontendErrorLog -Force -ErrorAction SilentlyContinue

Assert-PortFree -Port 3000 -Name 'Frontend'
Assert-PortFree -Port 3002 -Name 'Backend'

Start-ServiceProcess `
  -FilePath $nodeRuntime.NodeExe `
  -ArgumentList @('./scripts/run-with-compatible-node.mjs', './dist/index.js') `
  -WorkingDirectory $backendDir `
  -StdoutPath $backendLog `
  -StderrPath $backendErrorLog `
  -PidFile $backendPidPath

Start-ServiceProcess `
  -FilePath $nodeRuntime.NodeExe `
  -ArgumentList @('.\node_modules\next\dist\bin\next', 'start') `
  -WorkingDirectory $frontendDir `
  -StdoutPath $frontendLog `
  -StderrPath $frontendErrorLog `
  -PidFile $frontendPidPath

Wait-ForHttpOk -Url 'http://localhost:3002/health'
Wait-ForHttpOk -Url 'http://localhost:3000'

$frontendUrl = 'http://localhost:3000'
Write-Host ''
Write-Host 'Opening frontend in browser...'

$chromePath = Resolve-ChromeExecutablePath -Root $root
if ($chromePath) {
  Start-Process -FilePath $chromePath -ArgumentList "--new-window", "--disable-cache", "$frontendUrl"
} else {
  Start-Process -FilePath $frontendUrl
}

Write-Host ''
