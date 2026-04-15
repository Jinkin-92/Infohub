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

function Write-Step {
  param(
    [string]$Index,
    [string]$Message
  )

  Write-Host ''
  Write-Host "[$Index] $Message" -ForegroundColor Cyan
}

function Write-Success {
  param([string]$Message)

  Write-Host $Message -ForegroundColor Green
}

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
    if ($WorkingDirectory -eq $frontendDir -and (Test-Path (Join-Path $WorkingDirectory '.next'))) {
      Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('install', 'next')
    } elseif (Test-Path (Join-Path $WorkingDirectory 'package-lock.json')) {
      Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('ci')
    } else {
      Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('install')
    }
  }
}
function Ensure-BuildArtifacts {
  if (-not (Test-Path (Join-Path $backendDir 'dist\index.js')) -or -not (Test-Path (Join-Path $frontendDir '.next\BUILD_ID'))) {
    Write-Host '检测到缺少构建产物，正在自动补齐首次安装步骤，请稍候...' -ForegroundColor Yellow
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

try {
  Write-Host '=========================================='
  Write-Host 'InfoHub Windows Local Start'
  Write-Host '=========================================='
  Write-Host '说明：启动过程会检查环境、拉起后端和前端，然后自动打开网页。'

  Write-Step -Index '1/6' -Message '检查 Node.js 运行时'
  $nodeRuntime = Ensure-NodeRuntime -Root $root
  Write-Success "已就绪：Node.js $($nodeRuntime.Version) [$($nodeRuntime.Source)]"

  Write-Step -Index '2/6' -Message '检查配置、浏览器和依赖'
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $backendDir 'data') | Out-Null
  Ensure-FileFromTemplate -Target $backendEnv -Template $rootEnvExample
  Ensure-ChromeRuntime -Root $root -NodeRuntime $nodeRuntime | Out-Null
  if (-not (Test-Path (Join-Path $backendDir 'node_modules\better-sqlite3\build\Release\better_sqlite3.node'))) {
    Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
  }
  if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir
  }
  Ensure-BuildArtifacts
  Write-Success '运行环境已就绪。'

  Write-Step -Index '3/6' -Message '清理旧进程和旧日志'
  Stop-KnownProcess -PidFile $backendPidPath
  Stop-KnownProcess -PidFile $frontendPidPath
  Stop-StrayInfoHubProcess -Port 3002 -ExpectedMarkers @($backendDir, 'dist/index.js')
  Stop-StrayInfoHubProcess -Port 3000 -ExpectedMarkers @($frontendDir, 'next start')
  Start-Sleep -Seconds 2

  Remove-Item -LiteralPath $backendLog -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $backendErrorLog -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $frontendLog -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $frontendErrorLog -Force -ErrorAction SilentlyContinue
  Write-Success '旧状态已清理。'

  Write-Step -Index '4/6' -Message '检查端口是否可用'
  Assert-PortFree -Port 3000 -Name 'Frontend'
  Assert-PortFree -Port 3002 -Name 'Backend'
  Write-Success '端口检查通过。'

  Write-Step -Index '5/6' -Message '启动后端和前端服务'
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
  Write-Success '服务进程已拉起。'

  Write-Step -Index '6/6' -Message '等待服务就绪并打开网页'
  Wait-ForHttpOk -Url 'http://localhost:3002/health'
  Wait-ForHttpOk -Url 'http://localhost:3000'

  $frontendUrl = 'http://localhost:3000'
  Start-Process -FilePath $frontendUrl
  Write-Success '前端页面已尝试自动打开。'

  Write-Host ''
  Write-Host 'InfoHub 已启动成功。' -ForegroundColor Green
  Write-Host "前端地址：$frontendUrl"
  Write-Host '后端健康检查：http://localhost:3002/health'
  Write-Host "后端日志：$backendLog"
  Write-Host "前端日志：$frontendLog"
  Write-Host ''
} catch {
  Write-Host ''
  Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "后端日志：$backendLog" -ForegroundColor Yellow
  Write-Host "前端日志：$frontendLog" -ForegroundColor Yellow
  Write-Host '请保留窗口内容，或把报错和日志发给我排查。' -ForegroundColor Yellow
  exit 1
}
