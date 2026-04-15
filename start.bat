@echo off
setlocal
title InfoHub Start
cd /d "%~dp0"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\show-bat-result.ps1" -Mode start -ExitCode %EXIT_CODE%
exit /b %EXIT_CODE%
