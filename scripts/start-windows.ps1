[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$NodeRecord = Join-Path $ProjectRoot ".runtime\node-command.txt"

if (Test-Path -LiteralPath $NodeRecord -PathType Leaf) {
  $NodeExecutable = (Get-Content -LiteralPath $NodeRecord -Raw).Trim()
} else {
  $NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $NodeCommand) { throw "Node.js is not available. Run scripts\setup-windows.ps1 first." }
  $NodeExecutable = $NodeCommand.Source
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist\index.html") -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules\electron") -PathType Container)) {
  throw "USA Map Studio is not built. Run scripts\setup-windows.ps1 first."
}

Push-Location $ProjectRoot
try {
  & $NodeExecutable (Join-Path $ProjectRoot "scripts\start-electron.mjs")
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
