$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\windows-runtime.ps1')

$releaseRoot = Join-Path $root '.tmp\releases'
$stageRoot = Join-Path $releaseRoot 'stage'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmm'
$packageName = "infohub-windows-test-$timestamp"
$stageDir = Join-Path $stageRoot $packageName
$zipPath = Join-Path $releaseRoot "$packageName.zip"

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

Write-Host '=========================================='
Write-Host 'InfoHub Windows Test Package'
Write-Host '=========================================='

$nodeRuntime = Ensure-NodeRuntime -Root $root
Write-Host "Using Node.js $($nodeRuntime.Version) [$($nodeRuntime.Source)]"

& (Join-Path $root 'install.ps1')

Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $stageDir '.env.example')
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination (Join-Path $stageDir 'README.md')
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
Copy-Tree -Source (Join-Path $root 'backend') -Destination (Join-Path $stageDir 'backend') -ExcludeDirs @('node_modules', '.tmp', 'data', '__pycache__') -ExcludeFiles @('backend-run.log', 'backend-error.log')
Copy-Tree -Source (Join-Path $root 'frontend') -Destination (Join-Path $stageDir 'frontend') -ExcludeDirs @('node_modules', '.next\\cache') -ExcludeFiles @('frontend-run.log', 'frontend-error.log')
Copy-Tree -Source (Join-Path $root 'rsshub-local') -Destination (Join-Path $stageDir 'rsshub-local') -ExcludeDirs @('node_modules', '.tmp', 'logs')

$portableNodeRoot = Get-PortableNodeRoot -Root $root
if (Test-Path $portableNodeRoot) {
  Copy-Tree -Source $portableNodeRoot -Destination (Join-Path $stageDir (Join-Path '.runtime' (Split-Path $portableNodeRoot -Leaf)))
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ''
Write-Host "Package ready: $zipPath"
Write-Host ''
