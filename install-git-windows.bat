@echo off
setlocal EnableExtensions

rem Install Git for Windows with winget.
git --version >nul 2>&1
if not errorlevel 1 goto :already_installed

where winget >nul 2>&1
if errorlevel 1 (
    echo ERROR: winget was not found.
    echo Install or update "App Installer" from the Microsoft Store, then run this file again.
    echo Git can also be downloaded from https://git-scm.com/download/win
    goto :failed
)

echo Installing Git for Windows...
winget install --id Git.Git --exact --source winget --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :failed

echo.
echo Git was installed successfully.
echo Close and reopen Command Prompt or PowerShell before using Git.
goto :success

:already_installed
echo Git is already installed:
git --version

:success
echo.
pause
exit /b 0

:failed
echo.
echo Git installation failed. Review the error above, then run this file again.
echo.
pause
exit /b 1
