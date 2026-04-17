$ErrorActionPreference = 'Stop'

$script:InfoHubNodeVersion = '24.11.0'
$script:InfoHubNodeFolderName = "node-v$($script:InfoHubNodeVersion)-win-x64"

function Get-InfoHubDataRoot {
  param([string]$Root)

  $localAppData = $env:LOCALAPPDATA
  if ($localAppData) {
    return (Join-Path $localAppData 'InfoHub\data')
  }

  return (Join-Path $Root 'backend\data')
}

function Get-PreferredSqlitePath {
  param([string]$Root)

  return (Join-Path (Get-InfoHubDataRoot -Root $Root) 'infohub_v2.db')
}

function Get-LegacySqliteCandidates {
  param([string]$Root)

  return @(
    (Join-Path $Root 'backend\data\infohub_v2.db'),
    (Join-Path $Root 'backend\data\infohub.db'),
    (Join-Path $Root 'infohub\backend\data\infohub_v2.db'),
    (Join-Path $Root 'infohub\backend\data\infohub.db')
  ) | Select-Object -Unique
}

function Initialize-SqlitePath {
  param([string]$Root)

  $backendEnv = Join-Path $Root 'backend\.env'
  $preferredSqlitePath = Get-PreferredSqlitePath -Root $Root
  $preferredDir = Split-Path -Parent $preferredSqlitePath

  New-Item -ItemType Directory -Force -Path $preferredDir | Out-Null
  Set-EnvValue -FilePath $backendEnv -Key 'SQLITE_PATH' -Value $preferredSqlitePath

  if (Test-Path $preferredSqlitePath) {
    return $preferredSqlitePath
  }

  $candidate = Get-LegacySqliteCandidates -Root $Root |
    Where-Object { (Test-Path $_) -and ($_ -ne $preferredSqlitePath) } |
    Get-Item |
    Sort-Object Length, LastWriteTime -Descending |
    Select-Object -First 1

  if ($candidate) {
    Copy-Item -LiteralPath $candidate.FullName -Destination $preferredSqlitePath -Force

    $walPath = "$($candidate.FullName)-wal"
    if (Test-Path $walPath) {
      Copy-Item -LiteralPath $walPath -Destination "$preferredSqlitePath-wal" -Force
    }

    $shmPath = "$($candidate.FullName)-shm"
    if (Test-Path $shmPath) {
      Copy-Item -LiteralPath $shmPath -Destination "$preferredSqlitePath-shm" -Force
    }
  }

  return $preferredSqlitePath
}

function Get-InfoHubRuntimeRoot {
  param([string]$Root)

  return (Join-Path $Root '.runtime')
}

function Get-PortableNodeRoot {
  param([string]$Root)

  return (Join-Path (Get-InfoHubRuntimeRoot -Root $Root) $script:InfoHubNodeFolderName)
}

function Get-PortableNodeExe {
  param([string]$Root)

  return (Join-Path (Get-PortableNodeRoot -Root $Root) 'node.exe')
}

function Get-PortableNpmCmd {
  param([string]$Root)

  return (Join-Path (Get-PortableNodeRoot -Root $Root) 'npm.cmd')
}

function Get-PortableNpxCmd {
  param([string]$Root)

  return (Join-Path (Get-PortableNodeRoot -Root $Root) 'npx.cmd')
}

function Test-SupportedNodeVersion {
  param([string]$Version)

  if (-not $Version) {
    return $false
  }

  $majorText = $Version.Split('.')[0]
  $major = 0
  if (-not [int]::TryParse($majorText, [ref]$major)) {
    return $false
  }

  return $major -ge 20 -and $major -le 24
}

function Get-NodeRuntime {
  param([string]$Root)

  $portableNodeExe = Get-PortableNodeExe -Root $Root
  $portableNpmCmd = Get-PortableNpmCmd -Root $Root
  $portableNpxCmd = Get-PortableNpxCmd -Root $Root
  if ((Test-Path $portableNodeExe) -and (Test-Path $portableNpmCmd) -and (Test-Path $portableNpxCmd)) {
    $version = (& $portableNodeExe -p "process.versions.node").Trim()
    if (Test-SupportedNodeVersion -Version $version) {
      return @{
        NodeExe = $portableNodeExe
        NpmCmd = $portableNpmCmd
        NpxCmd = $portableNpxCmd
        Version = $version
        Source = 'portable'
      }
    }
  }

  try {
    $nodeCommand = Get-Command node -ErrorAction Stop
    $npmCommand = Get-Command npm.cmd -ErrorAction Stop
    $npxCommand = Get-Command npx.cmd -ErrorAction Stop
    $version = (& $nodeCommand.Source -p "process.versions.node").Trim()
    if (Test-SupportedNodeVersion -Version $version) {
      return @{
        NodeExe = $nodeCommand.Source
        NpmCmd = $npmCommand.Source
        NpxCmd = $npxCommand.Source
        Version = $version
        Source = 'system'
      }
    }
  } catch {
  }

  return $null
}

function Ensure-NodeRuntime {
  param([string]$Root)

  $runtime = Get-NodeRuntime -Root $Root
  if ($runtime) {
    return $runtime
  }

  $runtimeRoot = Get-InfoHubRuntimeRoot -Root $Root
  $portableRoot = Get-PortableNodeRoot -Root $Root
  $downloadDir = Join-Path $Root '.tmp\downloads'
  $zipPath = Join-Path $downloadDir "$($script:InfoHubNodeFolderName).zip"
  $extractRoot = Join-Path $downloadDir 'node-extract'
  $url = "https://nodejs.org/dist/v$($script:InfoHubNodeVersion)/$($script:InfoHubNodeFolderName).zip"

  Write-Host "Downloading portable Node.js v$($script:InfoHubNodeVersion) ..."
  New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null

  $mergedExistingRuntime = $false
  if (Test-Path $portableRoot) {
    try {
      Remove-Item -LiteralPath $portableRoot -Recurse -Force -ErrorAction Stop
    } catch {
      $mergedExistingRuntime = $true
    }
  }

  Invoke-WebRequest -Uri $url -OutFile $zipPath
  if ($mergedExistingRuntime) {
    if (Test-Path $extractRoot) {
      Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
    }

    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force

    $extractedPortableRoot = Join-Path $extractRoot $script:InfoHubNodeFolderName
    Get-ChildItem -LiteralPath $extractedPortableRoot -Force | ForEach-Object {
      if ($_.Name -eq 'node.exe') {
        return
      }

      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $portableRoot $_.Name) -Recurse -Force
    }
  } else {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $runtimeRoot -Force
  }

  $runtime = Get-NodeRuntime -Root $Root
  if (-not $runtime) {
    throw 'Portable Node.js installation failed.'
  }

  return $runtime
}

function Invoke-NpmCommand {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )

  Push-Location $WorkingDirectory
  try {
    $originalPath = $env:PATH
    $nodeDir = Split-Path -Parent $NodeRuntime.NodeExe
    if ($nodeDir) {
      $env:PATH = "$nodeDir;$originalPath"
    }
    & $NodeRuntime.NpmCmd @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "npm command failed in ${WorkingDirectory}: npm $($Arguments -join ' ')"
    }
  } finally {
    if ($null -ne $originalPath) {
      $env:PATH = $originalPath
    }
    Pop-Location
  }
}

function Resolve-ChromeExecutablePath {
  param([string]$Root)

  $backendEnv = Join-Path $Root 'backend\.env'
  if (Test-Path $backendEnv) {
    $line = Get-Content $backendEnv -Encoding utf8 | Where-Object { $_ -match '^CHROME_EXECUTABLE_PATH=' } | Select-Object -First 1
    if ($line) {
      $candidate = $line.Substring('CHROME_EXECUTABLE_PATH='.Length).Trim()
      if ($candidate -and (Test-Path $candidate)) {
        return $candidate
      }
    }
  }

  $localAppData = $env:LOCALAPPDATA
  if (-not $localAppData) {
    $localAppData = ''
  }

  $commonPaths = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    (Join-Path $localAppData 'Google\Chrome\Application\chrome.exe'),
    'C:\Program Files\Chromium\Application\chrome.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
  ) | Where-Object { $_ }

  foreach ($candidate in $commonPaths) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $runtimeChromeRoot = Join-Path (Get-InfoHubRuntimeRoot -Root $Root) 'chrome'
  if (Test-Path $runtimeChromeRoot) {
    $localChrome = Get-ChildItem -Path $runtimeChromeRoot -Recurse -Filter chrome.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match 'chrome-win64\\chrome\.exe$' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1

    if ($localChrome) {
      return $localChrome.FullName
    }
  }

  $puppeteerCache = Join-Path $HOME '.cache\puppeteer\chrome'
  if (Test-Path $puppeteerCache) {
    $cachedChrome = Get-ChildItem -Path $puppeteerCache -Recurse -Filter chrome.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match 'chrome-win64\\chrome\.exe$' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1

    if ($cachedChrome) {
      return $cachedChrome.FullName
    }
  }

  return $null
}

function Set-EnvValue {
  param(
    [string]$FilePath,
    [string]$Key,
    [string]$Value
  )

  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path $FilePath) {
    foreach ($line in Get-Content $FilePath -Encoding utf8) {
      $lines.Add($line)
    }
  }

  $updated = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^$([Regex]::Escape($Key))=") {
      $lines[$i] = "$Key=$Value"
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    $lines.Add("$Key=$Value")
  }

  Set-Content -Path $FilePath -Value $lines -Encoding utf8
}

function Ensure-ChromeRuntime {
  param(
    [string]$Root,
    [hashtable]$NodeRuntime
  )

  $existing = Resolve-ChromeExecutablePath -Root $Root
  if ($existing) {
    Set-EnvValue -FilePath (Join-Path $Root 'backend\.env') -Key 'CHROME_EXECUTABLE_PATH' -Value $existing
    return $existing
  }

  $runtimeChromeRoot = Join-Path (Get-InfoHubRuntimeRoot -Root $Root) 'chrome'
  New-Item -ItemType Directory -Force -Path $runtimeChromeRoot | Out-Null

  Write-Host 'Chrome/Chromium not found. Downloading a local browser runtime ...'
  Push-Location $Root
  try {
    & $NodeRuntime.NpxCmd '-y' '@puppeteer/browsers' 'install' 'chrome@stable' '--path' $runtimeChromeRoot
    if ($LASTEXITCODE -ne 0) {
      throw 'Local browser download failed.'
    }
  } finally {
    Pop-Location
  }

  $resolved = Resolve-ChromeExecutablePath -Root $Root
  if (-not $resolved) {
    throw 'Chrome runtime installation completed but no chrome.exe could be located.'
  }

  Set-EnvValue -FilePath (Join-Path $Root 'backend\.env') -Key 'CHROME_EXECUTABLE_PATH' -Value $resolved
  return $resolved
}
