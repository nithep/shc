# Hotel-ECS Edge Agent Deployment Script for Raspberry Pi Zero 2 W
param (
    [string]$PiHost = "192.168.1.20",
    [string]$PiUser = "admin"
)

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Deploying Edge Agent to Pi Zero 2 W ($PiHost) " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

$DeployDir = "$PSScriptRoot\edge-agent-deploy"

if (-not (Test-Path $DeployDir)) {
    Write-Host "[ERROR] Directory edge-agent-deploy not found." -ForegroundColor Red
    exit 1
}

# Compress files
$ZipFile = "$PSScriptRoot\edge-deploy.zip"
if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }
Compress-Archive -Path "$DeployDir\*" -DestinationPath $ZipFile -Force

Write-Host "[1/3] Copying files to Pi Zero 2 W..." -ForegroundColor Yellow
try {
    scp $ZipFile "${PiUser}@${PiHost}:/home/${PiUser}/edge-deploy.zip"
} catch {
    Write-Host "[ERROR] Transfer failed: $_" -ForegroundColor Red
    exit 1
}

$InstallScript = @"
echo "[2/3] Installing dependencies and setting up directory..."
sudo apt update && sudo apt install -y python3-pip unzip
sudo pip3 install paho-mqtt asyncio --break-system-packages

sudo mkdir -p /opt/edge-agent
sudo unzip -o /home/$PiUser/edge-deploy.zip -d /opt/edge-agent
sudo chown -R root:root /opt/edge-agent
sudo chmod 600 /opt/edge-agent/.env

echo "[3/3] Setting up Systemd Service..."
sudo cp /opt/edge-agent/edge-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable edge-agent
sudo systemctl restart edge-agent
sudo systemctl status edge-agent --no-pager
echo "Deployment Successful!"
"@

Write-Host "[2/3] Executing installation script on Pi Zero 2 W..." -ForegroundColor Yellow
try {
    ssh "${PiUser}@${PiHost}" $InstallScript
    Write-Host "[OK] Edge Agent installed successfully." -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Installation script failed: $_" -ForegroundColor Red
}

Remove-Item $ZipFile -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Cyan
