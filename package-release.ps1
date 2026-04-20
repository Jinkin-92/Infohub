$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\windows-runtime.ps1')

$releaseRoot = Join-Path $root '.tmp\releases'
$stageRoot = Join-Path $releaseRoot 'stage'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmm'
$packageName = "infohub-windows-test-$timestamp"
$stageDir = Join-Path $stageRoot $packageName
$zipPath = Join-Path $releaseRoot "$packageName.zip"
$sizeLimitMb = 320
$portableRuntimeStage = Join-Path $stageDir (Join-Path '.runtime' $script:InfoHubNodeFolderName)

function Copy-Tree {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$ExcludeDirs = @(),
    [string[]]$ExcludeFiles = @()
  )

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  $robocopyArgs = @(
    $Source,
    $Destination,
    '/E',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP'
  )

  if ($ExcludeDirs.Count -gt 0) {
    $robocopyArgs += '/XD'
    $robocopyArgs += $ExcludeDirs
  }

  if ($ExcludeFiles.Count -gt 0) {
    $robocopyArgs += '/XF'
    $robocopyArgs += $ExcludeFiles
  }

  & robocopy @robocopyArgs | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed while copying $Source"
  }
}

function Get-FileSizeMb {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return 0
  }

  return [math]::Round((Get-Item $Path).Length / 1MB, 2)
}

function Invoke-ProductionPrune {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory
  )

  if (-not (Test-Path (Join-Path $WorkingDirectory 'package.json'))) {
    return
  }

  if (-not (Test-Path (Join-Path $WorkingDirectory 'node_modules'))) {
    return
  }

  Write-Host "Pruning devDependencies in $WorkingDirectory ..."
  Invoke-NpmCommand -NodeRuntime $NodeRuntime -WorkingDirectory $WorkingDirectory -Arguments @('prune', '--omit=dev')
}

function Build-ReleaseArchive {
  param(
    [string]$SourceDir,
    [string]$DestinationZip
  )

  if (Test-Path $DestinationZip) {
    Remove-Item -LiteralPath $DestinationZip -Force
  }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $zipFileStream = [System.IO.File]::Open($DestinationZip, [System.IO.FileMode]::CreateNew)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new($zipFileStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      $sourceRoot = (Resolve-Path $SourceDir).Path
      $sourceRootWithSeparator = $sourceRoot.TrimEnd('\') + '\'

      Get-ChildItem -LiteralPath $SourceDir -Recurse -Force | ForEach-Object {
        $fullPath = $_.FullName
        $relativePath = $fullPath.Substring($sourceRootWithSeparator.Length).Replace('\', '/')

        if ([string]::IsNullOrWhiteSpace($relativePath)) {
          return
        }

        if ($_.PSIsContainer) {
          if (-not $relativePath.EndsWith('/')) {
            $relativePath += '/'
          }
          $archive.CreateEntry($relativePath) | Out-Null
          return
        }

        $entry = $archive.CreateEntry($relativePath, [System.IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        $fileStream = [System.IO.File]::OpenRead($fullPath)
        try {
          $fileStream.CopyTo($entryStream)
        } finally {
          $fileStream.Dispose()
          $entryStream.Dispose()
        }
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $zipFileStream.Dispose()
  }
}

function Assert-ZipContainsRequiredContent {
  param([string]$ZipPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)

  try {
    $requiredPrefixes = @(
      'backend/node_modules/',
      'frontend/node_modules/',
      'rsshub-local/node_modules/',
      '.runtime/'
    )

    foreach ($prefix in $requiredPrefixes) {
      $count = ($zip.Entries | Where-Object { $_.FullName -like ($prefix + '*') }).Count
      if ($count -le 0) {
        throw "Archive verification failed: missing required content under $prefix"
      }
    }
  } finally {
    $zip.Dispose()
  }
}

Write-Host '=========================================='
Write-Host 'InfoHub Windows Test Package'
Write-Host '=========================================='
Write-Host "目标：生成更稳的 Windows 测试包，优先确保朋友机器可安装、可启动。"

$nodeRuntime = Ensure-NodeRuntime -Root $root
Write-Host "Using Node.js $($nodeRuntime.Version) [$($nodeRuntime.Source)]"

& (Join-Path $root 'install.ps1')
if ($LASTEXITCODE -ne 0) {
  throw 'install.ps1 failed during packaging.'
}

Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $stageDir '.env.example')
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination (Join-Path $stageDir 'README.md')
Copy-Item -LiteralPath (Join-Path $root '使用说明.txt') -Destination (Join-Path $stageDir '使用说明.txt')
Copy-Item -LiteralPath (Join-Path $root 'install.ps1') -Destination (Join-Path $stageDir 'install.ps1')
Copy-Item -LiteralPath (Join-Path $root 'install.bat') -Destination (Join-Path $stageDir 'install.bat')
Copy-Item -LiteralPath (Join-Path $root 'start.ps1') -Destination (Join-Path $stageDir 'start.ps1')
Copy-Item -LiteralPath (Join-Path $root 'start.bat') -Destination (Join-Path $stageDir 'start.bat')
Copy-Item -LiteralPath (Join-Path $root 'stop.ps1') -Destination (Join-Path $stageDir 'stop.ps1')
Copy-Item -LiteralPath (Join-Path $root 'stop.bat') -Destination (Join-Path $stageDir 'stop.bat')
Copy-Item -LiteralPath (Join-Path $root 'update.ps1') -Destination (Join-Path $stageDir 'update.ps1')
Copy-Item -LiteralPath (Join-Path $root 'update.bat') -Destination (Join-Path $stageDir 'update.bat')
Copy-Item -LiteralPath (Join-Path $root 'package-release.ps1') -Destination (Join-Path $stageDir 'package-release.ps1')
Copy-Item -LiteralPath (Join-Path $root 'package-release.bat') -Destination (Join-Path $stageDir 'package-release.bat')

Copy-Tree -Source (Join-Path $root 'docs') -Destination (Join-Path $stageDir 'docs')
Copy-Tree -Source (Join-Path $root 'scripts') -Destination (Join-Path $stageDir 'scripts')
Copy-Tree -Source (Join-Path $root 'backend') -Destination (Join-Path $stageDir 'backend') -ExcludeDirs @('.tmp', 'data', '__pycache__') -ExcludeFiles @('backend-run.log', 'backend-error.log')
Copy-Tree -Source (Join-Path $root 'frontend') -Destination (Join-Path $stageDir 'frontend') -ExcludeDirs @('.next\\cache', 'test-results') -ExcludeFiles @('frontend-run.log', 'frontend-error.log')
Copy-Tree -Source (Join-Path $root 'rsshub-local') -Destination (Join-Path $stageDir 'rsshub-local') -ExcludeDirs @('.tmp', 'logs')

Invoke-ProductionPrune -NodeRuntime $nodeRuntime -WorkingDirectory (Join-Path $stageDir 'backend')
Invoke-ProductionPrune -NodeRuntime $nodeRuntime -WorkingDirectory (Join-Path $stageDir 'frontend')
Invoke-ProductionPrune -NodeRuntime $nodeRuntime -WorkingDirectory (Join-Path $stageDir 'rsshub-local')

$portableNodeRoot = Get-PortableNodeRoot -Root $root
if (Test-Path $portableNodeRoot) {
  Write-Host '内置固定依赖：便携 Node.js 运行时。'
  Copy-Tree -Source $portableNodeRoot -Destination $portableRuntimeStage
}

Build-ReleaseArchive -SourceDir $stageDir -DestinationZip $zipPath
Assert-ZipContainsRequiredContent -ZipPath $zipPath
$zipSizeMb = Get-FileSizeMb -Path $zipPath

if ($zipSizeMb -gt $sizeLimitMb) {
  throw "打包后的 ZIP 体积为 ${zipSizeMb}MB，仍然超过 ${sizeLimitMb}MB 限制。请先清理包内容后再打包。"
}

Write-Host ''
Write-Host "Package ready: $zipPath"
Write-Host "压缩包大小：${zipSizeMb}MB"
Write-Host '已内置：便携 Node.js、前后端构建产物、backend node_modules、frontend node_modules、rsshub-local node_modules、脚本和说明文档。'
Write-Host '未内置：Chrome/Edge 浏览器运行时。'
Write-Host ''
