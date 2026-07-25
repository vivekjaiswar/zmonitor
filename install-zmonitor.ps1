<#
.SYNOPSIS
    ZMonitor installer for Windows Server.

.DESCRIPTION
    Requires Docker to already be running (Docker Desktop with the WSL2
    backend, or Docker Engine). Windows Server needs WSL2 and/or Hyper-V
    enabled first, which usually requires a reboot, so this script does not
    attempt to silently install Docker itself - it checks for it and gives
    you the official install steps if it's missing.

    Once Docker is present, this pulls the published ZMonitor image and
    starts it - the same outcome as install-zmonitor.sh on Linux.

.PARAMETER Version
    Image tag to pull. Default: latest

.PARAMETER Port
    Host port to expose. Default: 3001

.PARAMETER InstallDir
    Where the compose file and data are stored. Default: C:\zmonitor

.EXAMPLE
    .\install-zmonitor.ps1

.EXAMPLE
    .\install-zmonitor.ps1 -Port 8080 -InstallDir "D:\zmonitor"
#>

param(
    [string]$Version = "latest",
    [int]$Port = 3001,
    [string]$InstallDir = "C:\zmonitor"
)

$ErrorActionPreference = "Stop"

$Image = "ghcr.io/vivekjaiswar/zmonitor:$Version"
$DataDir = Join-Path $InstallDir "data"
$ComposeFile = Join-Path $InstallDir "compose.yaml"

function Log($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

Log "Checking for Docker..."
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
$dockerWorks = $false
if ($dockerCmd) {
    try {
        docker info *> $null
        $dockerWorks = $true
    } catch {
        $dockerWorks = $false
    }
}

if (-not $dockerWorks) {
    Write-Host ""
    Write-Host "Docker isn't installed or isn't running." -ForegroundColor Yellow
    Write-Host "Windows Server needs WSL2 and/or Hyper-V enabled before Docker can run,"
    Write-Host "which usually requires a reboot - so this script won't attempt to do it"
    Write-Host "silently. Please:"
    Write-Host ""
    Write-Host "  1. Install Docker: https://docs.docker.com/desktop/setup/install/windows-install/"
    Write-Host "     (or Docker Engine directly, for a headless Windows Server setup:"
    Write-Host "     https://docs.docker.com/engine/install/)"
    Write-Host "  2. Make sure 'docker info' runs without error"
    Write-Host "  3. Re-run this script"
    Write-Host ""
    exit 1
}

Write-Host "Docker is installed and running: $(docker --version)"

Log "Setting up $InstallDir ..."
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Log "Writing compose file to $ComposeFile ..."
$composeContent = @"
services:
  zmonitor:
    image: $Image
    container_name: zmonitor
    restart: unless-stopped
    ports:
      - "${Port}:3001"
    volumes:
      - ${DataDir}:/app/data
"@
Set-Content -Path $ComposeFile -Value $composeContent -Encoding UTF8

Log "Pulling ZMonitor image ($Image)..."
docker compose -f $ComposeFile pull

Log "Starting ZMonitor..."
docker compose -f $ComposeFile up -d

Log "Waiting for ZMonitor to become healthy..."
$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    $status = (docker inspect --format='{{.State.Health.Status}}' zmonitor 2>$null)
    if ($status -eq "healthy") {
        $healthy = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    Write-Host "Container did not report healthy yet - check 'docker logs zmonitor'." -ForegroundColor Yellow
}

$publicIp = $null
try {
    $publicIp = (Invoke-RestMethod -Uri "https://ifconfig.me/ip" -TimeoutSec 5)
} catch {
    $publicIp = $null
}
if (-not $publicIp) {
    $publicIp = "<this-server-ip>"
}

Write-Host ""
Write-Host "================================================="
Write-Host " ZMonitor is live!"
Write-Host " URL:  http://${publicIp}:${Port}"
Write-Host " Data: $DataDir"
Write-Host "================================================="
