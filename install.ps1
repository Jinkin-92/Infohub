$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\windows-runtime.ps1')

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$rsshubDir = Join-Path $root 'rsshub-local'
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

function Test-FrontendRuntimeModule {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory
  )

  Push-Location $WorkingDirectory
  try {
    & $NodeRuntime.NodeExe -e "require('next/package.json'); require('react/package.json'); require('react-dom/package.json'); console.log('ok')"
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  } finally {
    Pop-Location
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

function Test-BuildExists {
  param([string]$WorkingDirectory)
  if ($WorkingDirectory -eq (Join-Path $root 'backend')) {
    return Test-Path (Join-Path $WorkingDirectory 'dist\index.js')
  } else {
    return Test-Path (Join-Path $WorkingDirectory '.next\BUILD_ID')
  }
}

function Test-RsshubRuntimeModule {
  param(
    [hashtable]$NodeRuntime,
    [string]$WorkingDirectory
  )

  Push-Location $WorkingDirectory
  try {
    & $NodeRuntime.NodeExe -e "const fs = require('fs'); const path = require('path'); if (!fs.existsSync(path.join(process.cwd(), 'node_modules', 'rsshub', 'dist-lib', 'pkg.mjs'))) process.exit(1); require('node-releases/data/processed/envs.json'); require('stream-length/lib/stream-length.js'); console.log('ok')"
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  } finally {
    Pop-Location
  }
}

function Repair-RsshubRuntime {
  param([string]$WorkingDirectory)

  $nestedBluebirdDir = Join-Path $WorkingDirectory 'node_modules\stream-length\node_modules\bluebird'
  if (Test-Path $nestedBluebirdDir) {
    Remove-Item -LiteralPath $nestedBluebirdDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  $streamLengthDir = Join-Path $WorkingDirectory 'node_modules\stream-length\lib'
  $streamLengthFile = Join-Path $streamLengthDir 'stream-length.js'
  if (Test-Path $streamLengthDir) {
    @'
const fs = require("fs");

function nodeify(promise, callback) {
  if (typeof callback !== "function") {
    return promise;
  }

  promise.then(
    (value) => callback(null, value),
    (error) => callback(error)
  );
  return promise;
}

function createRetrieverPromise(stream, retriever) {
  return new Promise((resolve, reject) => {
    retriever(stream, (result) => {
      if (result != null) {
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
        return;
      }

      reject(new Error("Could not find a length using this lengthRetriever."));
    });
  });
}

function retrieveBuffer(stream, callback) {
  if (stream instanceof Buffer) {
    callback(stream.length);
    return;
  }

  callback(null);
}

function retrieveFilesystemStream(stream, callback) {
  if (!Object.prototype.hasOwnProperty.call(stream, "fd")) {
    callback(null);
    return;
  }

  if (stream.end !== undefined && stream.end !== Infinity && stream.start !== undefined) {
    callback(stream.end + 1 - (stream.start ?? 0));
    return;
  }

  fs.promises.stat(stream.path).then(
    (stat) => callback(stat.size - (stream.start ?? 0)),
    (error) => callback(error)
  );
}

function retrieveCoreHttpStream(stream, callback) {
  if (Object.prototype.hasOwnProperty.call(stream, "httpVersion") && stream.headers && stream.headers["content-length"] != null) {
    callback(parseInt(stream.headers["content-length"], 10));
    return;
  }

  callback(null);
}

function retrieveRequestHttpStream(stream, callback) {
  if (!Object.prototype.hasOwnProperty.call(stream, "httpModule")) {
    callback(null);
    return;
  }

  stream.on("response", (response) => {
    if (response.headers["content-length"] != null) {
      callback(parseInt(response.headers["content-length"], 10));
      return;
    }

    callback(null);
  });
}

function retrieveCombinedStream(stream, callback) {
  if (typeof stream.getCombinedStreamLength !== "function") {
    callback(null);
    return;
  }

  stream.getCombinedStreamLength().then(
    (length) => callback(length),
    (error) => callback(error)
  );
}

module.exports = function(stream, options, callback) {
  const resolvedOptions = options ?? {};

  return nodeify((async () => {
    const retrieverPromises = [];

    if (resolvedOptions.lengthRetrievers != null) {
      for (const retriever of resolvedOptions.lengthRetrievers) {
        retrieverPromises.push(createRetrieverPromise(stream, retriever));
      }
    }

    for (const retriever of [
      retrieveBuffer,
      retrieveFilesystemStream,
      retrieveCoreHttpStream,
      retrieveRequestHttpStream,
      retrieveCombinedStream,
    ]) {
      retrieverPromises.push(createRetrieverPromise(stream, retriever));
    }

    return Promise.any(retrieverPromises);
  })(), callback);
};
'@ | Set-Content -Path $streamLengthFile -Encoding ascii
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
  $sqlitePath = Initialize-SqlitePath -Root $root
  New-Item -ItemType Directory -Force -Path (Join-Path $backendDir 'data') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $root '.tmp') | Out-Null
  Write-Host "SQLite 数据库路径：$sqlitePath"
  Write-Success '基础目录已准备完成。'

  Write-Step -Index '4/7' -Message '检查浏览器运行环境'
  Ensure-ChromeRuntime -Root $root -NodeRuntime $nodeRuntime | Out-Null
  Write-Success '浏览器环境可用。'

  Write-Step -Index '5/7' -Message '安装后端、前端和 RSSHub 依赖'
  $backendReady = Test-BackendNativeModule -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
  $frontendReady = Test-FrontendRuntimeModule -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir
  $rsshubReady = Test-RsshubRuntimeModule -NodeRuntime $nodeRuntime -WorkingDirectory $rsshubDir

  if ($backendReady) {
    Write-Success '检测到后端依赖已可用，跳过后端依赖安装。'
  } else {
    Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
  }

  if ($frontendReady) {
    Write-Success '检测到前端依赖已可用，跳过前端依赖安装。'
  } else {
    Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir
  }

  if ($rsshubReady) {
    Write-Success '检测到 RSSHub 依赖已可用，跳过 RSSHub 依赖安装。'
  } else {
    Ensure-NodeModules -NodeRuntime $nodeRuntime -WorkingDirectory $rsshubDir
    Repair-RsshubRuntime -WorkingDirectory $rsshubDir
  }

  Repair-RsshubRuntime -WorkingDirectory $rsshubDir

  Write-Success '依赖安装完成。'

  Write-Step -Index '6/7' -Message '重建本地原生模块'
  if (Test-BackendNativeModule -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir) {
    Write-Success '检测到 better-sqlite3 已可用，跳过重建。'
  } else {
    Clear-BackendNativeArtifacts -WorkingDirectory $backendDir
    Invoke-BackendNativeRebuild -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir
    Write-Success '原生模块已重建。'
  }

  Write-Step -Index '7/7' -Message '构建前后端产物'
  $backendBuilt = Test-BuildExists -WorkingDirectory $backendDir
  $frontendBuilt = Test-BuildExists -WorkingDirectory $frontendDir
  if ($backendBuilt -and $frontendBuilt) {
    Write-Success '检测到构建产物已存在，跳过构建。'
  } else {
    if (-not $backendBuilt) {
      Invoke-Build -NodeRuntime $nodeRuntime -WorkingDirectory $backendDir -ScriptName 'build'
    }
    if (-not $frontendBuilt) {
      Invoke-Build -NodeRuntime $nodeRuntime -WorkingDirectory $frontendDir -ScriptName 'build'
    }
    Write-Success '构建完成。'
  }

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
