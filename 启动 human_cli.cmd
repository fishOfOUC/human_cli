@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launchers\Start-human_cli.ps1"
if errorlevel 1 pause
