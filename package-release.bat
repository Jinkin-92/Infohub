@echo off
setlocal
title InfoHub Package
cd /d "%~dp0"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-release.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\show-bat-result.ps1" -Mode package -ExitCode %EXIT_CODE%
exit /b %EXIT_CODE%
