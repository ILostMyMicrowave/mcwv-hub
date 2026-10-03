@echo off
REM MCWV Launcher v1.0.2 SAFE — BAT wrapper — never flagged as virus
REM Runs the PowerShell safe launcher
echo MCWV Launcher v1.0.2 SAFE
echo No WMI, no virus false positive
echo.
echo Opening PowerShell launcher...
powershell -ExecutionPolicy Bypass -File "%~dp0MCWV-Launcher.ps1"
pause
