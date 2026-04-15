$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\windows-runtime.ps1')

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$backendEnv = Join-Path $backendDir '.env'
$rootEnvExample = Join-Path $root '.env.example'
$stopScript = Join-Path $root 'stop.ps1'

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

function Test-BackendNativeModule {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory
  )

  Push-Location $WorkingDirectory
  try {
    & $NodeRuntime.NodeExe -e "require('better-sqlite3'); console.log('ok')"
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  } finally {
    Pop-Location
  }
}

try {
  Write-Host '=========================================='
  Write-Host 'InfoHub Windows Local Install'
  Write-Host '=========================================='
  Write-Host '说明：首次安装可能需要几分钟，请耐心等待。'

  Write-Step -Index '1/7' -Message '检查 Node.js 运行时'
  $nodeRuntime = Ensure-NodeRuntime -Root $root
  Write-Success "已就绪：Node.js $($nodeRuntime.Version) [$($nodeRuntime.Source)]"

  Write-Step -Index '2/7' -Message '停止旧的 InfoHub 进程'
  if (Test-Path $stopScript) {
    & $stopScript | Out-Null
  }
  Write-Success '旧进程已清理。'

  Write-Step -Index '3/7' -Message '准备配置文件和数据目录'
  Ensure-FileFromTemplate -Target $backendEnv -Template $rootEnvExample
  New-Item -ItemType Directory -Force -Path (Join-Path $backendDir 'data') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $root '.tmp') | Out-Null
  Write-Success '基础目录已准备完成。'

  Write-Step -Index '4/7' -Message '检查浏览器运行环境'
  Ensure-ChromeRuntime -Root $root -NodeRuntime $nodeRuntime | Out-Null
  Write-Success '浏览器环境可用。'

  Write-Step -Index '5/7' -Message '安装后端和前端依赖'
  if (Test-BackendNativeModule -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir) {
    Write-Success '检测到 better-sqlite3 预编译二进制，跳过后端依赖安装。'
  } else {
    Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
    Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir
    Write-Success '依赖安装完成。'
  }

  Write-Step -Index '6/7' -Message '重建本地原生模块'
  if (Test-BackendNativeModule -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir) {
    Write-Success '检测到 better-sqlite3 已可用，跳过重建。'
  } else {
    Clear-BackendNativeArtifacts -WorkingDirectory $backendDir
    Invoke-BackendNativeRebuild -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
    Write-Success '原生模块已重建。'
  }

  Write-Step -Index '7/7' -Message '构建前后端产物'
  Invoke-Build -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir -ScriptName 'build'
  Invoke-Build -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir -ScriptName 'build'
  Write-Success '构建完成。'

  Write-Host ''
  Write-Host '安装完成。现在可以双击 start.bat 启动 InfoHub。' -ForegroundColor Green
  Write-Host '如果首次安装时间较长，通常是 npm 安装依赖和下载浏览器运行时所致。'
  Write-Host ''
} catch {
  Write-Host ''
  Write-Host "安装失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host '请保留窗口内容，或把报错截图发给我排查。' -ForegroundColor Yellow
  exit 1
}
