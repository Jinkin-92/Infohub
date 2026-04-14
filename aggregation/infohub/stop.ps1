$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $root '.tmp'
$backendPidPath = Join-Path $stateDir 'backend.pid'
$frontendPidPath = Join-Path $stateDir 'frontend.pid'
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

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
      }
    }
  }
}

Stop-KnownProcess -PidFile $backendPidPath
Stop-KnownProcess -PidFile $frontendPidPath
Stop-StrayInfoHubProcess -Port 3002 -ExpectedMarkers @($backendDir, 'dist/index.js')
Stop-StrayInfoHubProcess -Port 3000 -ExpectedMarkers @($frontendDir, 'next start')

Write-Host 'InfoHub stopped.'
