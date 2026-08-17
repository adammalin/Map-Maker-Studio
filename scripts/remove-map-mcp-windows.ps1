[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$NodeRecord = Join-Path $ProjectRoot ".runtime\node-command.txt"

$NodeExecutable = $null
if (Test-Path -LiteralPath $NodeRecord -PathType Leaf) {
  $RecordedNode = (Get-Content -LiteralPath $NodeRecord -Raw).Trim()
  if ($RecordedNode -and (Test-Path -LiteralPath $RecordedNode -PathType Leaf)) {
    $NodeExecutable = $RecordedNode
  }
}

if (-not $NodeExecutable) {
  $NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $NodeCommand) { throw "Node.js is not available. Run scripts\setup-windows.ps1 first." }
  $NodeExecutable = $NodeCommand.Source
}

Write-Host ""
Write-Host "USA Map Studio - remove local AI connection"
Write-Host "================================================"
Write-Host ""

Push-Location $ProjectRoot
try {
  & $NodeExecutable (Join-Path $ProjectRoot "scripts\configure-map-mcp.mjs") remove
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
