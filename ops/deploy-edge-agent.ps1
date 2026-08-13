# Hotel-ECS Edge Agent Deployment & Testing Script for Raspberry Pi Zero 2 W
# สคริปต์นี้ใช้ Deploy Edge Agent แบบ Lightweight + ทดสอบ MQTT + ตรวจสอบ Log

$PiUser = "admin"
$PiHost = Read-Host "ระบุ IP Address ของ Raspberry Pi Zero 2W (เช่น 192.168.1.XX)"
$PiPath = "/home/ecs-agent/nithep/shc/ops/edge-agent"
$ProjectRoot = Join-Path $PSScriptRoot "edge-agent"
$PBX_IP = "192.168.1.91"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "HECS Edge Agent Deployment + Testing" -ForegroundColor Cyan
Write-Host "Target: Pi Zero 2W @ $PiHost" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: ตรวจสอบไฟล์ .env
Write-Host "[1/7] Checking configuration files..." -ForegroundColor Yellow
if (-not (Test-Path "$ProjectRoot\.env")) {
    Write-Host "  [ERROR] .env file not found!" -ForegroundColor Red
    Write-Host "  Please create .env from .env.example first" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "  [OK] .env file found" -ForegroundColor Green
    
    # แสดงค่า Configuration
    $envContent = Get-Content "$ProjectRoot\.env" | Select-String "^BRANCH_ID=|^PBX_MODE=|^PBX_HOST=|^MQTT_BROKER_URL="
    Write-Host "  Configuration:" -ForegroundColor Cyan
    $envContent | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
}

# Step 2: สร้างแพ็กเกจ Deployment
Write-Host ""
Write-Host "[2/7] Creating deployment package..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipFile = "edge-agent-deploy-$timestamp.zip"

$TempDir = Join-Path $env:TEMP ("temp_edge_deploy_" + [guid]::NewGuid().ToString())
try {
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    # คัดลอกไฟล์ทั้งหมดไปยัง Temp (ยกเว้น node_modules ฯลฯ)
    Copy-Item -Path "$ProjectRoot\*" -Destination $TempDir -Recurse -Force -Exclude "node_modules", ".git", "test-results", "*.log", ".env" -ErrorAction SilentlyContinue
    
    # ซิปโฟลเดอร์ Temp
    Compress-Archive -Path "$TempDir\*" -DestinationPath "$PSScriptRoot\$zipFile" -Force -ErrorAction Stop
    
    # ลบ Temp
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "  Package created: $zipFile ($( [math]::Round((Get-Item "$PSScriptRoot\$zipFile").Length / 1MB, 2)) MB)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Failed to create package: $_" -ForegroundColor Red
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
    exit 1
}

# Step 3: ถ่ายโอนไปยัง Pi Zero 2W
Write-Host ""
Write-Host "[3/7] Transferring to Raspberry Pi Zero 2W ($PiHost)..." -ForegroundColor Yellow
try {
    scp "$PSScriptRoot\$zipFile" "${PiUser}@${PiHost}:~/"
    Write-Host "  Transfer complete" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Transfer failed: $_" -ForegroundColor Red
    Write-Host "  Make sure SSH is enabled on Pi Zero 2W" -ForegroundColor Yellow
    Remove-Item "$PSScriptRoot\$zipFile" -Force
    exit 1
}

# Step 4: ติดตั้งและตั้งค่าบน Pi Zero 2W
Write-Host ""
Write-Host "[4/7] Installing on Raspberry Pi Zero 2W..." -ForegroundColor Yellow
$installScript = @"
# สร้างไดเรกทอรี
sudo mkdir -p $PiPath
sudo chown ${PiUser}:${PiUser} $PiPath

# แตกไฟล์
cd $PiPath
unzip -o ~/edge-agent-deploy.zip

# ติดตั้ง Dependencies
echo "Installing Node.js dependencies (this may take a few minutes)..."
npm install --production

# คัดลอก .env จากเครื่องพัฒนา
# (หมายเหตุ: คุณต้องแก้ไข .env บน Pi เองหลังจากนี้)
if [ ! -f .env ]; then
    echo "[WARNING] .env not found. Please copy and edit it manually."
fi

# ตั้งสิทธิ์
sudo chown -R ${PiUser}:${PiUser} $PiPath

# ลบไฟล์ ZIP
rm -f ~/edge-agent-deploy.zip

echo "Installation complete!"
"@

try {
    ssh "${PiUser}@${PiHost}" $installScript
    Write-Host "  Installation complete" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Installation failed: $_" -ForegroundColor Red
    exit 1
}

# Step 5: สร้าง Systemd Service
Write-Host ""
Write-Host "[5/7] Setting up systemd service..." -ForegroundColor Yellow
$serviceScript = @"
# สร้างไฟล์ Service
sudo tee /etc/systemd/system/mqtt-agent.service > /dev/null <<'EOF'
[Unit]
Description=HECS Edge Agent MQTT Service
After=network.target

[Service]
Type=simple
User=${PiUser}
WorkingDirectory=$PiPath
ExecStart=/usr/bin/node $PiPath/mqtt_agent.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=$PiPath/.env

[Install]
WantedBy=multi-user.target
EOF

# เปิดใช้งาน Service
sudo systemctl daemon-reload
sudo systemctl enable mqtt-agent
sudo systemctl restart mqtt-agent

echo "Service started!"
"@

try {
    ssh "${PiUser}@${PiHost}" $serviceScript
    Write-Host "  Systemd service configured and started" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Service setup failed: $_" -ForegroundColor Red
    exit 1
}

# Step 6: ตรวจสอบสถานะและ Log
Write-Host ""
Write-Host "[6/7] Checking service status and logs..." -ForegroundColor Yellow
try {
    Start-Sleep -Seconds 3
    
    Write-Host "`n  Service Status:" -ForegroundColor Cyan
    $statusCmd = "ssh ${PiUser}@${PiHost} 'sudo systemctl status mqtt-agent --no-pager -l'"
    Invoke-Expression $statusCmd
    
    Write-Host "`n  Recent Logs (last 20 lines):" -ForegroundColor Cyan
    $logsCmd = "ssh ${PiUser}@${PiHost} 'journalctl -u mqtt-agent -n 20 --no-pager'"
    Invoke-Expression $logsCmd
    
    Write-Host "`n  PBX Connection Test:" -ForegroundColor Cyan
    $pbxTestCmd = "ssh ${PiUser}@${PiHost} 'nc -zv -w2 $PBX_IP 23 2>&1 || echo `"Connection to PBX failed`"'"
    Invoke-Expression $pbxTestCmd
    
    Write-Host "  Verification complete" -ForegroundColor Green
} catch {
    Write-Host "  [WARNING] Could not verify deployment" -ForegroundColor Yellow
}

# Step 7: สร้างสคริปต์ทดสอบ MQTT
Write-Host ""
Write-Host "[7/7] Creating MQTT test script on Pi..." -ForegroundColor Yellow
$testScript = @"
# สร้างสคริปต์ทดสอบส่งคำสั่ง ON/OFF
cat > $PiPath/test_mqtt_command.sh <<'TESTEOF'
#!/bin/bash
echo "📡 HECS MQTT Command Test"
echo "=========================="
echo ""

# โหลดตัวแปรจาก .env
if [ -f .env ]; then
    export `$(`grep -v '^#' .env | xargs`)
fi

ROOM=`${1:-0101}
COMMAND=`${2:-ON}

echo "Room: `$ROOM"
echo "Command: `$COMMAND"
echo ""

# ส่งคำสั่งผ่าน MQTT (ต้องใช้ mosquitto_pub)
if command -v mosquitto_pub &> /dev/null; then
    TOPIC="hotel/`$BRANCH_ID/room/`$ROOM/command"
    PAYLOAD="{\`"command\`":\`"`$COMMAND\`",\`"guestName\`":\`"Test Guest\`",\`"timestamp\`":`$(date +%s)}"
    
    echo "Publishing to: `$TOPIC"
    echo "Payload: `$PAYLOAD"
    echo ""
    
    mosquitto_pub -h `$(`echo `$MQTT_BROKER_URL | sed 's|mqtt://||' | cut -d':' -f1`) \
                  -p `$(`echo `$MQTT_BROKER_URL | sed 's|mqtt://||' | cut -d':' -f2`) \
                  -t "`$TOPIC" \
                  -m "`$PAYLOAD"
    
    echo ""
    echo "✅ Command sent! Check logs for result."
else
    echo "❌ mosquitto_pub not installed. Install with: sudo apt install mosquitto-clients"
fi
TESTEOF

chmod +x $PiPath/test_mqtt_command.sh
echo "Test script created at $PiPath/test_mqtt_command.sh"
"@

try {
    ssh "${PiUser}@${PiHost}" $testScript
    Write-Host "  MQTT test script created" -ForegroundColor Green
} catch {
    Write-Host "  [WARNING] Could not create test script" -ForegroundColor Yellow
}

# Cleanup
Write-Host ""
Write-Host "Cleaning up local package..." -ForegroundColor Yellow
Remove-Item "$PSScriptRoot\$zipFile" -Force -ErrorAction SilentlyContinue
Write-Host "Cleanup complete" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. SSH into Pi Zero 2W: ssh ${PiUser}@${PiHost}" -ForegroundColor White
Write-Host "2. Edit .env if needed: cd $PiPath && nano .env" -ForegroundColor White
Write-Host "3. Restart service: sudo systemctl restart mqtt-agent" -ForegroundColor White
Write-Host "4. View live logs: journalctl -u mqtt-agent -f" -ForegroundColor White
Write-Host "5. Test MQTT command: ./test_mqtt_command.sh 0101 ON" -ForegroundColor White
Write-Host ""
Write-Host "To monitor PBX connection in real-time:" -ForegroundColor Yellow
Write-Host "  ssh ${PiUser}@${PiHost} 'journalctl -u mqtt-agent -f | grep PBX'" -ForegroundColor Gray
Write-Host ""
