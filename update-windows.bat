@echo off
setlocal EnableExtensions

rem Check the current branch's upstream and update with a fast-forward only.
rem Always work relative to this script, even when launched by double-click.
cd /d "%~dp0"

echo Checking for Git updates...

where git >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git was not found. Install Git for Windows and try again.
    goto :failed
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo ERROR: %CD% is not a Git working tree.
    goto :failed
)

set "UPSTREAM="
for /f "delims=" %%I in ('git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" 2^>nul') do set "UPSTREAM=%%I"
if not defined UPSTREAM (
    echo ERROR: The current branch does not have an upstream branch.
    goto :failed
)

git fetch
if errorlevel 1 (
    echo ERROR: Could not fetch updates from the remote repository.
    goto :failed
)

git merge-base --is-ancestor "%UPSTREAM%" HEAD >nul 2>&1
set "UPSTREAM_ANCESTOR_RESULT=%ERRORLEVEL%"
if "%UPSTREAM_ANCESTOR_RESULT%"=="0" (
    echo The current branch is already up to date with %UPSTREAM%.
    exit /b 0
)
if not "%UPSTREAM_ANCESTOR_RESULT%"=="1" (
    echo ERROR: Could not compare the current branch with %UPSTREAM%.
    goto :failed
)

git merge-base --is-ancestor HEAD "%UPSTREAM%" >nul 2>&1
set "HEAD_ANCESTOR_RESULT=%ERRORLEVEL%"
if "%HEAD_ANCESTOR_RESULT%"=="1" (
    echo ERROR: The current branch and %UPSTREAM% have diverged.
    echo Resolve the branch history manually before updating.
    goto :failed
)
if not "%HEAD_ANCESTOR_RESULT%"=="0" (
    echo ERROR: Could not compare the current branch with %UPSTREAM%.
    goto :failed
)

echo Updates are available from %UPSTREAM%. Pulling them now...
git pull --ff-only
if errorlevel 1 (
    echo ERROR: Git could not apply the update safely.
    echo Local changes were not stashed or overwritten.
    goto :failed
)

echo Git update completed successfully.
exit /b 0

:failed
exit /b 1
