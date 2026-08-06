[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$PinnedNodeVersion = "22.23.1"
$PortableRuntimeRoot = Join-Path $ProjectRoot ".runtime"
$NodeCommandRecord = Join-Path $PortableRuntimeRoot "node-command.txt"
$NpmCommandRecord = Join-Path $PortableRuntimeRoot "npm-command.txt"
$Utf8NoBom = New-Object Text.UTF8Encoding($false)

Write-Host ""
Write-Host "USA Map Studio - Windows local desktop setup"
Write-Host "=============================================="
Write-Host ""
Write-Host "This installs exact local dependencies, builds the Electron app, and runs"
Write-Host "a hidden smoke check. It does not install a signed package or make system-wide changes."
Write-Host ""

function Test-NodeRuntime {
  param([string]$NodeExecutable, [string]$NpmExecutable)
  if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf) -or
      -not (Test-Path -LiteralPath $NpmExecutable -PathType Leaf)) { return $false }
  try {
    $usable = & $NodeExecutable -p 'const [major, minor] = process.versions.node.split(".").map(Number); major > 22 || (major === 22 && minor >= 13) ? "1" : "0"'
    return $LASTEXITCODE -eq 0 -and $usable.Trim() -eq "1"
  } catch { return $false }
}

function Install-PortableNode {
  $machineArchitecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  switch ($machineArchitecture.ToUpperInvariant()) {
    "AMD64" { $nodeArchitecture = "x64" }
    "ARM64" { $nodeArchitecture = "arm64" }
    default { throw "Unsupported Windows architecture: $machineArchitecture" }
  }
  $archiveName = "node-v$PinnedNodeVersion-win-$nodeArchitecture.zip"
  $nodeUrl = "https://nodejs.org/dist/v$PinnedNodeVersion/$archiveName"
  $checksumsUrl = "https://nodejs.org/dist/v$PinnedNodeVersion/SHASUMS256.txt"
  $runtimeName = "node-v$PinnedNodeVersion-win-$nodeArchitecture"
  $runtimeDirectory = Join-Path $PortableRuntimeRoot $runtimeName
  $nodeExecutable = Join-Path $runtimeDirectory "node.exe"
  $npmExecutable = Join-Path $runtimeDirectory "npm.cmd"

  if (-not (Test-NodeRuntime -NodeExecutable $nodeExecutable -NpmExecutable $npmExecutable)) {
    New-Item -ItemType Directory -Path $PortableRuntimeRoot -Force | Out-Null
    $temporaryDirectory = Join-Path $PortableRuntimeRoot ("download-" + [guid]::NewGuid().ToString("N"))
    $archivePath = Join-Path $temporaryDirectory $archiveName
    $checksumsPath = Join-Path $temporaryDirectory "SHASUMS256.txt"
    try {
      New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
      Write-Host "Node.js 22.13 or later was not found. Downloading a private pinned runtime..."
      Invoke-WebRequest -Uri $nodeUrl -UseBasicParsing -OutFile $archivePath
      Invoke-WebRequest -Uri $checksumsUrl -UseBasicParsing -OutFile $checksumsPath
      $pattern = "^([a-fA-F0-9]{64})\s+$([regex]::Escape($archiveName))\s*$"
      $checksumLine = Get-Content -LiteralPath $checksumsPath | Where-Object { $_ -match $pattern } | Select-Object -First 1
      if (-not $checksumLine) { throw "The official checksum list did not contain $archiveName." }
      $expectedChecksum = ([regex]::Match($checksumLine, $pattern)).Groups[1].Value
      $actualChecksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
      if ($actualChecksum -ine $expectedChecksum) { throw "The downloaded Node.js checksum did not match the official list." }
      Expand-Archive -LiteralPath $archivePath -DestinationPath $temporaryDirectory -Force
      $extractedDirectory = Join-Path $temporaryDirectory $runtimeName
      if (-not (Test-Path -LiteralPath (Join-Path $extractedDirectory "node.exe") -PathType Leaf)) {
        throw "The Node.js archive did not contain the expected runtime."
      }
      if (Test-Path -LiteralPath $runtimeDirectory) {
        Move-Item -LiteralPath $runtimeDirectory -Destination "$runtimeDirectory.invalid-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
      }
      Move-Item -LiteralPath $extractedDirectory -Destination $runtimeDirectory
    } finally {
      if ($temporaryDirectory -like (Join-Path $PortableRuntimeRoot "download-*") -and (Test-Path -LiteralPath $temporaryDirectory)) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
      }
    }
  }
  return @{ Node = $nodeExecutable; Npm = $npmExecutable }
}

$systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
$systemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($systemNode -and $systemNpm -and (Test-NodeRuntime -NodeExecutable $systemNode.Source -NpmExecutable $systemNpm.Source)) {
  $NodeExecutable = $systemNode.Source
  $NpmExecutable = $systemNpm.Source
} else {
  $portable = Install-PortableNode
  $NodeExecutable = $portable.Node
  $NpmExecutable = $portable.Npm
}

New-Item -ItemType Directory -Path $PortableRuntimeRoot -Force | Out-Null
[IO.File]::WriteAllText($NodeCommandRecord, $NodeExecutable + [Environment]::NewLine, $Utf8NoBom)
[IO.File]::WriteAllText($NpmCommandRecord, $NpmExecutable + [Environment]::NewLine, $Utf8NoBom)

Push-Location $ProjectRoot
try {
  Write-Host "Project: $ProjectRoot"
  Write-Host "Node:    $(& $NodeExecutable --version)"
  Write-Host "npm:     $(& $NpmExecutable --version)"
  Write-Host ""
  Write-Host "Installing exact dependencies from package-lock.json..."
  & $NpmExecutable ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
  Write-Host ""
  Write-Host "Building USA Map Studio..."
  & $NpmExecutable run build
  if ($LASTEXITCODE -ne 0) { throw "The build failed with exit code $LASTEXITCODE." }
  Write-Host ""
  Write-Host "Running the hidden Electron interface check..."
  & $NpmExecutable run desktop:smoke
  if ($LASTEXITCODE -ne 0) { throw "The Electron smoke test failed with exit code $LASTEXITCODE." }
  if ($env:USA_MAP_SETUP_MCP -ne "skip") {
    Write-Host ""
    Write-Host "Registering the optional local AI connection for ChatGPT desktop and Codex..."
    & $NodeExecutable (Join-Path $ProjectRoot "scripts\configure-map-mcp.mjs") install --executable $NodeExecutable
    if ($LASTEXITCODE -ne 0) { throw "The MCP configuration step failed with exit code $LASTEXITCODE." }
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Setup verified. For later launches, double-click Start-USA-Map-Studio.cmd"
Write-Host "or run scripts\start-windows.ps1 from PowerShell."
Write-Host ""
if ($env:USA_MAP_SETUP_STAGE_ONLY -eq "1") { exit 0 }

Write-Host "Starting USA Map Studio..."
& (Join-Path $ProjectRoot "scripts\start-windows.ps1")
exit $LASTEXITCODE
