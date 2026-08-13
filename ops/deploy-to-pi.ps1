# Hotel-ECS Deployment Script for Raspberry Pi
# This script packages and deploys the latest code to your Raspberry Pi

$PiUser = "ecs-agent"
$PiHost = "192.168.1.94"
$PiPath = "/home/ecs-agent/nithep/shc"
$ProjectRoot = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Hotel-ECS Deployment to Raspberry Pi" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create deployment package
Write-Host "[1/5] Creating deployment package..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipFile = "deploy-$timestamp.zip"

$TempDir = Join-Path $env:TEMP ("temp_deploy_" + [guid]::NewGuid().ToString())
try {
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    # คัดลอกโฟลเดอร์ที่จำเป็นแบบข้าม node_modules และไฟล์ขยะ
    $FoldersToCopy = @("backend", "frontend", "pbx-connector", "docs", "scripts", "worker", "vpn-setup")
    foreach ($folder in $FoldersToCopy) {
        if (Test-Path "$ProjectRoot\$folder") {
            $dest = "$TempDir\$folder"
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
            # คัดลอกแบบ Exclude โฟลเดอร์ node_modules
            Copy-Item -Path "$ProjectRoot\$folder\*" -Destination $dest -Recurse -Force -Exclude "node_modules" -ErrorAction SilentlyContinue
        }
    }

    # คัดลอกไฟล์เดี่ยวในระดับ root (รวม .env แต่ข้าม zip เก่า, exe และไฟล์ log ขนาดใหญ่)
    $FilesToCopy = Get-ChildItem -Path "$ProjectRoot\*" -File -Exclude "*.zip", "*.exe", "*.log", "cf_output.txt", "cf_stderr.txt", "cf_stdout.txt"
    foreach ($file in $FilesToCopy) {
        Copy-Item -Path $file.FullName -Destination $TempDir -Force
    }

    # ตรวจสอบว่าไฟล์ .env มีอยู่และจะถูกคัดลอก
    if (Test-Path "$ProjectRoot\.env") {
        Copy-Item -Path "$ProjectRoot\.env" -Destination "$TempDir\.env" -Force
        Write-Host "  [OK] .env file included in package" -ForegroundColor Green
    } else {
        Write-Host "  [WARNING] .env file not found!" -ForegroundColor Yellow
    }

    # บีบอัดโฟลเดอร์ชั่วคราว
    Compress-Archive -Path "$TempDir\*" -DestinationPath "$ProjectRoot\$zipFile" -Force -ErrorAction Stop
    
    # ล้างโฟลเดอร์ชั่วคราวออกไป
    Remove-Item $TempDir -Recurse -Force
    Write-Host "Package created: $zipFile" -ForegroundColor Green
} catch {
    Write-Host "Failed to create package: $_" -ForegroundColor Red
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
    exit 1
}


# Step 2: Transfer to Raspberry Pi
Write-Host ""
Write-Host "[2/5] Transferring to Raspberry Pi ($PiHost)..." -ForegroundColor Yellow
try {
    scp "$ProjectRoot\$zipFile" "${PiUser}@${PiHost}:${PiPath}/"
    Write-Host "Transfer complete" -ForegroundColor Green
} catch {
    Write-Host "Transfer failed: $_" -ForegroundColor Red
    Write-Host "Make sure you have SSH access to the Pi" -ForegroundColor Yellow
    Remove-Item "$ProjectRoot\$zipFile" -Force
    exit 1
}

# Step 3: Deploy on Raspberry Pi
Write-Host ""
Write-Host "[3/5] Deploying on Raspberry Pi..." -ForegroundColor Yellow
$deployScript = @"
cd '$PiPath'

# Stop and remove existing containers to avoid name conflicts
echo "Stopping and removing old containers..."
docker rm -f hotel-app 2>/dev/null || true
docker rm -f hotel-tunnel 2>/dev/null || true

# Stop current containers gracefully
if [ -d "app" ]; then
    cd app
    docker compose -f docker-compose.prod.yml down 2>/dev/null || true
    cd ..
fi

# Backup current deployment
echo "Creating backup..."
if [ -d "app" ]; then
    mv app "app_backup_`$(date +%Y%m%d_%H%M%S)"
fi

# Extract new deployment
echo "Extracting new version..."
mkdir -p app
cd app
unzip -o '../$zipFile'

# Verify .env file exists
if [ ! -f .env ]; then
    echo "[ERROR] .env file not found in deployment package!"
    echo "Please ensure .env is included in the ZIP file"
    exit 1
fi

# Verify CLOUDFLARE_TUNNEL_TOKEN exists in .env
if ! grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' .env; then
    echo "[WARNING] CLOUDFLARE_TUNNEL_TOKEN not found in .env file"
    echo "Tunnel service may not start correctly"
fi

# Set permissions
chown -R ecs-agent:ecs-agent /home/ecs-agent/nithep/shc/app

# Start containers with fresh build
echo "Starting containers..."
docker compose -f docker-compose.prod.yml up -d --build

# Wait for containers to initialize
echo "Waiting for services to start..."
sleep 5

# Show status
echo ""
echo "Deployment complete! Container status:"
docker compose -f docker-compose.prod.yml ps

# Show tunnel logs (last 10 lines)
echo ""
echo "Cloudflare Tunnel status - last 10 lines:"
docker compose -f docker-compose.prod.yml logs --tail=10 hotel-tunnel 2>/dev/null || echo "Tunnel logs not available yet"
"@

try {
    ssh "${PiUser}@${PiHost}" $deployScript
    Write-Host "Deployment successful" -ForegroundColor Green
} catch {
    Write-Host "Deployment failed: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Verify deployment
Write-Host ""
Write-Host "[4/5] Verifying deployment..." -ForegroundColor Yellow
try {
    $verifyCmd = "cd '$PiPath/app' ; docker compose -f docker-compose.prod.yml ps"
    $status = ssh "${PiUser}@${PiHost}" $verifyCmd
    Write-Host $status
    Write-Host "Verification complete" -ForegroundColor Green
} catch {
    Write-Host "Could not verify deployment" -ForegroundColor Yellow
}

# Step 5: Cleanup
Write-Host ""
Write-Host "[5/5] Cleaning up..." -ForegroundColor Yellow
Remove-Item "$ProjectRoot\$zipFile" -Force -ErrorAction SilentlyContinue
$cleanupCmd = "rm -f '$PiPath/$zipFile'"
ssh "${PiUser}@${PiHost}" $cleanupCmd
Write-Host "Cleanup complete" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
$frontendUrl = "http://" + $PiHost + ":5173"
$backendUrl = "http://" + $PiHost + ":3000"
$sshCmd = "ssh " + $PiUser + "@" + $PiHost
Write-Host "Access URLs:" -ForegroundColor White
Write-Host "  Frontend: $frontendUrl" -ForegroundColor White
Write-Host "  Backend API: $backendUrl" -ForegroundColor White
Write-Host ""
Write-Host "To view logs, run:" -ForegroundColor Gray
Write-Host "  $sshCmd" -ForegroundColor Gray
Write-Host "  cd /home/ecs-agent/nithep/shc/app && docker compose -f docker-compose.prod.yml logs -f" -ForegroundColor Gray
