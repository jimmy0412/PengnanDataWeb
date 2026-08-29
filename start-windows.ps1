[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,

    [string]$ListenHost = "127.0.0.1",

    [switch]$NoReload,

    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$RequirementsFile = Join-Path $ProjectRoot "requirements.txt"

Set-Location $ProjectRoot

if (-not (Test-Path $PythonExe -PathType Leaf)) {
    throw "Virtual environment not found. Run install-windows.bat first."
}

if (-not (Test-Path $RequirementsFile -PathType Leaf)) {
    throw "requirements.txt was not found in $ProjectRoot."
}

& $PythonExe -c "import fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Website dependencies are incomplete. Run install-windows.bat again."
}

$env:PYTHONPATH = $ProjectRoot
$UrlHost = if ($ListenHost -in @("0.0.0.0", "::")) { "127.0.0.1" } else { $ListenHost }
$Url = "http://${UrlHost}:$Port"

$UvicornArgs = @(
    "-m", "uvicorn", "app.main:app",
    "--host", $ListenHost,
    "--port", $Port.ToString()
)
if (-not $NoReload) {
    $UvicornArgs += "--reload"
}

Write-Host "Starting the website at $Url" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop it."

if (-not $NoBrowser) {
    Start-Process $Url
}

& $PythonExe @UvicornArgs
exit $LASTEXITCODE
