# Hotel ECS Control Center Launcher (PowerShell)
# Encoding: UTF-8 with BOM

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Clear-Host
$Host.UI.RawUI.WindowTitle = "Hotel ECS Control Center"

# Styling colors
$yellow = "Yellow"
$cyan = "Cyan"
$green = "Green"
$red = "Red"
$white = "White"

function Show-Header {
    Write-Host "==========================================================" -ForegroundColor $yellow
    Write-Host "🏨  HOTEL ECS - SMART CHECK-IN SYSTEM CONTROL CENTER      " -ForegroundColor "DarkYellow"
    Write-Host "==========================================================" -ForegroundColor $yellow
    Write-Host "  [Developer & Support Panel - Raspberry Pi 4 & Phonik PBX]" -ForegroundColor $cyan
    Write-Host ""
}

function Test-Connection-Status {
    Write-Host "🛰️  กำลังตรวจสอบสถานะเครือข่ายหน้างาน (Network Diagnostics)..." -ForegroundColor $cyan
    $piIp = "192.168.1.94"
    $pbxIp = "192.168.1.91"
    
    # Ping check
    $piPing = Test-Connection -ComputerName $piIp -Count 1 -Quiet -ErrorAction SilentlyContinue
    $pbxPing = Test-Connection -ComputerName $pbxIp -Count 1 -Quiet -ErrorAction SilentlyContinue
    
    if ($piPing) {
        Write-Host "  [+] Raspberry Pi 4 ($piIp) : " -NoNewline; Write-Host "ONLINE (พร้อมควบคุม)" -ForegroundColor $green
    } else {
        Write-Host "  [-] Raspberry Pi 4 ($piIp) : " -NoNewline; Write-Host "OFFLINE (สัญญาณขาดหาย)" -ForegroundColor $red
    }
    
    if ($pbxPing) {
        Write-Host "  [+] Phonik PBX ($pbxIp)   : " -NoNewline; Write-Host "ONLINE (พร้อมทำงาน)" -ForegroundColor $green
    } else {
        Write-Host "  [-] Phonik PBX ($pbxIp)   : " -NoNewline; Write-Host "OFFLINE (ตู้สาขาตัดการติดต่อ)" -ForegroundColor $red
    }
    Write-Host ""
}

while ($true) {
    Clear-Host
    Show-Header
    Test-Connection-Status
    
    Write-Host "----------------------------------------------------------" -ForegroundColor $yellow
    Write-Host "📂 หมวดเข้าถึงด่วนผ่านเบราว์เซอร์ (Quick Access Links):" -ForegroundColor $cyan
    Write-Host "  [1] 💻 เปิดหน้าจอแอดมินพนักงาน (Staff Dashboard - hotel.nithep.com/dashboard)"
    Write-Host "  [2] 📱 เปิดหน้าจอเช็คอินลูกค้า (Kiosk Scan - hotel.nithep.com/scan)"
    Write-Host "  [3] 📊 เปิดบันทึก Google Sheets Check-in Logs"
    Write-Host "  [4] 💬 เปิดห้องแจ้งเตือน Google Chat Room"
    Write-Host ""
    Write-Host "🛠️  หมวดเครื่องมือและซ่อมแซมระบบ (DevOps & Troubleshooting):" -ForegroundColor $cyan
    Write-Host "  [5] 🔄 สั่งรีสตาร์ทบริการหลังบ้านบน Pi 4 ทันที (SSH Force Restart)"
    Write-Host "  [6] 📋 สังเกตการณ์ Logs การทำงานของเซิร์ฟเวอร์แบบ Real-time"
    Write-Host "  [7] 📂 เปิดโฟลเดอร์เอกสารและคู่มือในโปรเจกต์ (Docs Folder)"
    Write-Host "  [8] 🚪 ปิดโปรแกรมควบคุม (Exit)"
    Write-Host "----------------------------------------------------------" -ForegroundColor $yellow
    Write-Host ""
    
    $choice = Read-Host "กรุณาเลือกเมนูทำรายการ [1-8]"
    
    switch ($choice) {
        "1" {
            Start-Process "https://hotel.nithep.com/dashboard"
        }
        "2" {
            Start-Process "https://hotel.nithep.com/scan"
        }
        "3" {
            Start-Process "https://docs.google.com/spreadsheets"
        }
        "4" {
            Start-Process "https://chat.google.com"
        }
        "5" {
            Write-Host ""
            Write-Host "🔄 กำลังส่งคำสั่ง SSH รีสตาร์ท Docker Container ไปยัง Pi 4..." -ForegroundColor $yellow
            ssh -i C:\Users\Nithep\.ssh\id_rsa -o StrictHostKeyChecking=no ecs-agent@192.168.1.94 "docker restart hotel-app"
            Write-Host "✅ รีสตาร์ทสำเร็จเรียบร้อย! กำลังโหลดหน้าเมนูหลัก..." -ForegroundColor $green
            Start-Sleep -Seconds 3
        }
        "6" {
            Write-Host ""
            Write-Host "📋 กำลังดึง Logs เซิร์ฟเวอร์ Pi (กด Ctrl + C เพื่อออกจาก Logs)..." -ForegroundColor $yellow
            ssh -i C:\Users\Nithep\.ssh\id_rsa -o StrictHostKeyChecking=no ecs-agent@192.168.1.94 "docker logs --tail 100 -f hotel-app"
        }
        "7" {
            $docsPath = Join-Path $PSScriptRoot "..\docs"
            if (Test-Path $docsPath) {
                Start-Process explorer.exe -ArgumentList $docsPath
            } else {
                Write-Host "[-] ไม่พบโฟลเดอร์เอกสาร" -ForegroundColor $red
                Start-Sleep -Seconds 2
            }
        }
        "8" {
            Write-Host "🚪 กำลังปิดหน้าต่างควบคุม..." -ForegroundColor $yellow
            Start-Sleep -Seconds 1
            break
        }
        default {
            Write-Host "[-] เลือกเมนูไม่ถูกต้อง กรุณาลองอีกครั้ง" -ForegroundColor $red
            Start-Sleep -Seconds 1
        }
    }
}