@echo off
setlocal EnableExtensions

rem Start the FastAPI website on Windows.
rem
rem Supported options:
rem   --port NUMBER    Port to listen on. Default: 8000
rem   --host ADDRESS   Address to listen on. Default: 127.0.0.1
rem   --no-reload      Disable automatic reload when files change.
rem   --no-browser     Do not open the website in the default browser.
rem   --help, -h       Show command usage.
rem
rem Examples:
rem   start-windows.bat
rem   start-windows.bat --port 8080
rem   start-windows.bat --host 0.0.0.0 --no-browser
rem   start-windows.bat --no-reload --no-browser

rem Always work relative to this script, even when launched by double-click.
cd /d "%~dp0"

set "PORT=8000"
set "LISTEN_HOST=127.0.0.1"
set "RELOAD_ARG=--reload"
set "OPEN_BROWSER=1"

:parse_arguments
if "%~1"=="" goto :arguments_parsed

if /i "%~1"=="--port" (
    if "%~2"=="" goto :missing_port
    set "PORT=%~2"
    shift
    shift
    goto :parse_arguments
)

if /i "%~1"=="--host" (
    if "%~2"=="" goto :missing_host
    set "LISTEN_HOST=%~2"
    shift
    shift
    goto :parse_arguments
)

if /i "%~1"=="--no-reload" (
    set "RELOAD_ARG="
    shift
    goto :parse_arguments
)

if /i "%~1"=="--no-browser" (
    set "OPEN_BROWSER=0"
    shift
    goto :parse_arguments
)

if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage

echo ERROR: Unknown argument: %~1
goto :usage_error

:arguments_parsed
rem Reject empty, non-numeric, or out-of-range port values.
echo(%PORT%| findstr /r /x "[0-9][0-9]*" >nul
if errorlevel 1 goto :invalid_port
if %PORT% LSS 1 goto :invalid_port
if %PORT% GTR 65535 goto :invalid_port

if not exist ".venv\Scripts\python.exe" (
    echo ERROR: Virtual environment not found. Run install-windows.bat first.
    goto :failed
)

if not exist "requirements.txt" (
    echo ERROR: requirements.txt was not found in %CD%.
    goto :failed
)

".venv\Scripts\python.exe" -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Website dependencies are incomplete. Run install-windows.bat again.
    goto :failed
)

set "PYTHONPATH=%CD%"
set "URL_HOST=%LISTEN_HOST%"
if "%LISTEN_HOST%"=="0.0.0.0" set "URL_HOST=127.0.0.1"
if "%LISTEN_HOST%"=="::" set "URL_HOST=127.0.0.1"
set "URL=http://%URL_HOST%:%PORT%"

echo Starting the website at %URL%
echo Press Ctrl+C to stop it.

if "%OPEN_BROWSER%"=="1" start "" "%URL%"

".venv\Scripts\python.exe" -m uvicorn app.main:app --host "%LISTEN_HOST%" --port "%PORT%" %RELOAD_ARG%
exit /b %ERRORLEVEL%

:missing_port
echo ERROR: --port requires a value.
goto :usage_error

:missing_host
echo ERROR: --host requires a value.
goto :usage_error

:invalid_port
echo ERROR: Port must be a number from 1 through 65535.
goto :failed

:usage_error
echo.
:usage
echo Usage: %~nx0 [--port NUMBER] [--host ADDRESS] [--no-reload] [--no-browser]
echo.
echo   --port NUMBER    Port to listen on. Default: 8000
echo   --host ADDRESS   Address to listen on. Default: 127.0.0.1
echo   --no-reload      Disable automatic reload when files change.
echo   --no-browser     Do not open the website in the default browser.
if /i "%~1"=="--help" exit /b 0
if /i "%~1"=="-h" exit /b 0
exit /b 1

:failed
exit /b 1
