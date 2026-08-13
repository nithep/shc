# ─────────────────────────────────────────────────────────────────────────────
# run_all.ps1
# HECS Full-Stack Local Development Runner
#
# รัน 3 Service พร้อมกันใน Terminal แยก เพื่อทดสอบ End-to-End Flow แบบ Local:
#   1. Digital Twin Simulator  (Python, Port 2323)
#   2. Edge Agent              (Node.js, PBX_MODE=tcp → ชี้ไปที่ Simulator)
#   3. Cloud Run Backend       (Node.js, Port 8080)
#
# Usage:
#   .\run_all.ps1
#
# Stop:
#   ปิดแต่ละ Terminal หรือกด Ctrl+C ในแต่ละหน้าต่าง
# ─────────────────────────────────────────────────────────────────────────────

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🏨 HECS Full-Stack Local Runner" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Root: $RootDir"
Write-Host ""

# ─── 1. Digital Twin Simulator (Python) ──────────────────────────────────────
Write-Host "[1/3] Starting Digital Twin Simulator on Port 2323..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList `
    "-NoExit", "-Command", `
    "Write-Host '🔵 [Digital Twin Simulator]' -ForegroundColor Cyan; " + `
    "cd '$RootDir\worker\digital-twin'; " + `
    "python simulator.py --port 2323" `
    -PassThru | Out-Null

Start-Sleep -Seconds 2  # รอ Simulator เปิด Port ก่อน

# ─── 2. Edge Agent (Node.js in TCP Mode → Simulator) ─────────────────────────
Write-Host "[2/3] Starting Edge Agent (PBX_MODE=tcp → 127.0.0.1:2323)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList `
    "-NoExit", "-Command", `
    "Write-Host '🟡 [Edge Agent]' -ForegroundColor Yellow; " + `
    "cd '$RootDir\edge-agent'; " + `
    "`$env:PBX_MODE='tcp'; " + `
    "`$env:PBX_HOST='127.0.0.1'; " + `
    "`$env:PBX_PORT='2323'; " + `
    "`$env:BRANCH_ID='branch-a'; " + `
    "`$env:MQTT_BROKER_URL='mqtt://broker.hivemq.com:1883'; " + `
    "node mqtt_agent.js" `
    -PassThru | Out-Null

Start-Sleep -Seconds 2  # รอ Edge Agent connect MQTT ก่อน

# ─── 3. Cloud Run Backend (Node.js) ──────────────────────────────────────────
Write-Host "[3/3] Starting Cloud Run Backend on Port 8080..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList `
    "-NoExit", "-Command", `
    "Write-Host '🟢 [Backend Cloud Run]' -ForegroundColor Green; " + `
    "cd '$RootDir\backend-cloudrun'; " + `
    "`$env:PORT='8080'; " + `
    "`$env:BRANCH_ID='branch-a'; " + `
    "`$env:MQTT_BROKER='mqtt://broker.hivemq.com:1883'; " + `
    "node index.js" `
    -PassThru | Out-Null

Start-Sleep -Seconds 2

# ─── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ All 3 services started!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Services:" -ForegroundColor White
Write-Host "    🔵 Digital Twin Simulator : localhost:2323 (TCP/CCH2)"
Write-Host "    🟡 Edge Agent             : connected via MQTT"
Write-Host "    🟢 Backend API            : http://localhost:8080"
Write-Host ""
Write-Host "  Quick Test (copy & paste):" -ForegroundColor White
Write-Host '    curl -X POST http://localhost:8080/api/guest/checkin -H "Content-Type: application/json" -d "{""roomNumber"":""0101"",""lineUserId"":""U123"",""guestName"":""Test Guest"",""transactionId"":""TXN-001""}"' -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Or run automated E2E test:" -ForegroundColor White
Write-Host "    node worker\digital-twin\e2e_test.js" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Health check:" -ForegroundColor White
Write-Host "    curl http://localhost:8080/health" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  To stop: Close each terminal window or press Ctrl+C" -ForegroundColor DarkYellow
Write-Host ""
