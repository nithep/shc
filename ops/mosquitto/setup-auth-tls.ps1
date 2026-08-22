# ==============================================================================
# setup-auth-tls.ps1 — Install Mosquitto auth + TLS config (Hotel ECS)
# Run as Administrator:  powershell -ExecutionPolicy Bypass -File setup-auth-tls.ps1
# ==============================================================================
param(
    [string]$MqttUser = "hotel",
    [string]$MqttPass = "HotelEcs@2026"
)

$ErrorActionPreference = "Stop"

# 1) Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Must run as Administrator." -ForegroundColor Red
    exit 1
}

$MosquittoDir = "C:\Program Files\Mosquitto"
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceName  = "mosquitto"

if (-not (Test-Path "$MosquittoDir\mosquitto.exe")) {
    Write-Host "[ERROR] Mosquitto not found at $MosquittoDir" -ForegroundColor Red
    exit 1
}

# 2) Backup existing config
if (Test-Path "$MosquittoDir\mosquitto.conf") {
    $bak = "$MosquittoDir\mosquitto.conf.bak." + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item "$MosquittoDir\mosquitto.conf" $bak -Force
    Write-Host "[1/5] Backed up config -> $bak" -ForegroundColor Cyan
}

# 3) Copy TLS certs
New-Item -ItemType Directory -Path "$MosquittoDir\certs" -Force | Out-Null
Copy-Item "$ScriptDir\certs\server.crt" "$MosquittoDir\certs\server.crt" -Force
Copy-Item "$ScriptDir\certs\server.key" "$MosquittoDir\certs\server.key" -Force
Write-Host "[2/5] Installed TLS certs" -ForegroundColor Cyan

# 4) Generate password file
if (Test-Path "$MosquittoDir\pwfile") { Remove-Item "$MosquittoDir\pwfile" -Force }
& "$MosquittoDir\mosquitto_passwd.exe" -c -b "$MosquittoDir\pwfile" $MqttUser $MqttPass | Out-Null
# NOTE: mosquitto_passwd สร้าง pwfile ด้วย ACL เฉพาะเจ้าของ (mode 0600) บน Windows
#       -> service (SYSTEM) อ่านไม่ได้ = service start ไม่ขึ้น! ต้อง grant ให้ SYSTEM/Admins อ่าน
& icacls "$MosquittoDir\pwfile" /grant '*S-1-5-18:(R)' '*S-1-5-32-544:(R)' | Out-Null
Write-Host "[3/5] Created password file (user: $MqttUser) + ACL for SYSTEM/Admins" -ForegroundColor Cyan
# ถ้า log file มีอยู่แล้ว ให้สิทธิ์ทั้งคู่ (กันกรณี ACL ค้างจาก start ที่ล้มเหลว)
if (Test-Path "$MosquittoDir\mosquitto.log") {
    & icacls "$MosquittoDir\mosquitto.log" /grant '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
}

# 5) Create data dir + install config
New-Item -ItemType Directory -Path "$MosquittoDir\data" -Force | Out-Null
Copy-Item "$ScriptDir\mosquitto.conf" "$MosquittoDir\mosquitto.conf" -Force
Write-Host "[4/5] Installed mosquitto.conf (auth + TLS)" -ForegroundColor Cyan

# 6) Restart service
try {
    Restart-Service -Name $ServiceName -Force
    Write-Host "[5/5] Restarted '$ServiceName' service" -ForegroundColor Cyan
} catch {
    Write-Host "[WARN] Could not restart service: $_" -ForegroundColor Yellow
    Write-Host "       Start it manually: net start $ServiceName  (or start Mosquitto via Services.msc)"
}

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "MQTT listeners now active:"
Write-Host "  - mqtt://<host>:1883    (username/password required)"
Write-Host "  - mqtts://<host>:8883   (username/password + TLS)"
Write-Host "Client credentials:"
Write-Host "  username = $MqttUser"
Write-Host "  password = $MqttPass"
Write-Host ""
Write-Host "NOTE: self-signed cert -> set MQTT_TLS_REJECT_UNAUTHORIZED=false on clients (dev only)."
Write-Host "      For production, replace certs/server.crt + server.key with a CA-signed cert."
