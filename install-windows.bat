@echo off
setlocal EnableExtensions

rem Always work relative to this script, even when launched by double-click.
cd /d "%~dp0"

echo [1/4] Checking Python 3.10 or newer...
set "PYTHON_EXE="
set "PYTHON_ARGS="

py -3 --version >nul 2>&1
if errorlevel 1 goto :check_python_path
py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 goto :check_python_path
set "PYTHON_EXE=py"
set "PYTHON_ARGS=-3"
goto :python_found

:check_python_path
python --version >nul 2>&1
if not errorlevel 1 (
    python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_EXE=python"
        goto :python_found
    )
)

echo.
echo ERROR: Python 3.10 or newer was not found.
echo Download it from https://www.python.org/downloads/windows/
echo During installation, select "Add Python to PATH", then run this file again.
goto :failed

:python_found
echo [2/4] Creating the virtual environment...
if not exist ".venv\Scripts\python.exe" (
    %PYTHON_EXE% %PYTHON_ARGS% -m venv .venv
    if errorlevel 1 goto :failed
) else (
    echo Existing .venv will be reused.
)

echo [3/4] Updating Python packaging tools...
".venv\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :failed

echo [4/4] Installing website dependencies...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed

:success
echo.
echo Installation completed successfully.
echo Start the website with: powershell -ExecutionPolicy Bypass -File .\start-windows.ps1
echo.
pause
exit /b 0

:failed
echo.
echo Installation failed. Review the error above, then run this file again.
echo.
pause
exit /b 1
