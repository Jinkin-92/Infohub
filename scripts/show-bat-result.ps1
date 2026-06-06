param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('install', 'start', 'package')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [int]$ExitCode
)

$ErrorActionPreference = 'Stop'

Write-Host ''

switch ($Mode) {
  'install' {
    if ($ExitCode -eq 0) {
      Write-Host '[成功] 安装已完成。' -ForegroundColor Green
      Write-Host '下一步：请双击 start.bat 启动 InfoHub。'
    } else {
      Write-Host "[失败] 安装未完成，错误码：$ExitCode" -ForegroundColor Red
      Write-Host '请保留窗口中的报错内容，或截图发给开发者排查。' -ForegroundColor Yellow
    }
  }
  'start' {
    if ($ExitCode -eq 0) {
      Write-Host '[成功] InfoHub 已启动。' -ForegroundColor Green
      Write-Host '如果浏览器没有自动打开，请手动访问：http://localhost:3000'
    } else {
      Write-Host "[失败] 启动未完成，错误码：$ExitCode" -ForegroundColor Red
      Write-Host '请查看上方报错信息和日志路径，必要时把截图发给开发者。' -ForegroundColor Yellow
    }
  }
  'package' {
    if ($ExitCode -eq 0) {
      Write-Host '[成功] 测试分发包已生成。' -ForegroundColor Green
    } else {
      Write-Host "[失败] 打包未完成，错误码：$ExitCode" -ForegroundColor Red
    }
  }
}

[void](Read-Host '按回车关闭窗口')
