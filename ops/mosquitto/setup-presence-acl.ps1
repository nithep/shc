# ==============================================================================
# setup-presence-acl.ps1 — Add SHC presence credential + install ACL (ก้อน C 0.2)
# Run as Administrator:  powershell -ExecutionPolicy Bypass -File setup-presence-acl.ps1
#
# หลัก 1 device/service = 1 credential:
#   - presence_subscriber ใช้ user 'shc-presence' (read-only shc/room/+/presence)
#   - ไม่ใช้ credential รวมกับ service อื่น (hotel / edge-agent)
# ==============================================================================
param(
    [string]$PresenceUser = "shc-presence",
    [string]$PresencePass = ""
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

# 2) ต้องมี password ชัดเจน (ห้าม default ฝังในสคริปต์)
if ([string]::IsNullOrWhiteSpace($PresencePass)) {
    $sec = Read-Host "Enter password for '$PresenceUser'" -AsSecureString
    $PresencePass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if ([string]::IsNullOrWhiteSpace($PresencePass)) {
    Write-Host "[ERROR] Password must not be empty." -ForegroundColor Red
    exit 1
}

# 3) Add/update presence user in existing pwfile (ไม่ลบ user อื่น)
if (-not (Test-Path "$MosquittoDir\pwfile")) {
    Write-Host "[ERROR] pwfile not found — run setup-auth-tls.ps1 first." -ForegroundColor Red
    exit 1
}
& "$MosquittoDir\mosquitto_passwd.exe" -b "$MosquittoDir\pwfile" $PresenceUser $PresencePass | Out-Null
Write-Host "[1/3] Added/updated MQTT user '$PresenceUser' in pwfile" -ForegroundColor Cyan

# 4) Install ACL file
Copy-Item "$ScriptDir\acl" "$MosquittoDir\acl" -Force
& icacls "$MosquittoDir\acl" /grant '*S-1-5-18:(R)' '*S-1-5-32-544:(R)' | Out-Null
Write-Host "[2/3] Installed ACL -> $MosquittoDir\acl (read-only shc/room/+/presence)" -ForegroundColor Cyan

# 5) Restart service
try {
    Restart-Service -Name $ServiceName -Force
    Write-Host "[3/3] Restarted '$ServiceName' service" -ForegroundColor Cyan
} catch {
    Write-Host "[WARN] Could not restart service: $_" -ForegroundColor Yellow
    Write-Host "       Start manually: net start $ServiceName"
}

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Set on the api (.env):"
Write-Host "  SHC_PRESENCE_MQTT_URL=mqtt://<broker-ip>:1883"
Write-Host "  SHC_PRESENCE_MQTT_USER=$PresenceUser"
Write-Host "  SHC_PRESENCE_MQTT_PASS=<the password you entered>"
Write-Host "  SHC_PRESENCE_ALLOW_INSECURE=false"
