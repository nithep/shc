# Windows Network Diagnostics & Self-Healing Toolkit for Hotel-ECS
# Resolves conflicts between Cloudflare WARP and WireGuard VPN
# Encoding: UTF-8

Clear-Host
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "🏨 HOTEL-ECS NETWORK STABILIZATION & SELF-HEALING SYSTEM " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host ""

# ─────────────────────────────────────────────────────────────
# 1. Update Windows Registry NCSI (UseGlobalDNS)
# ─────────────────────────────────────────────────────────────
Write-Host "[1/3] Updating Registry for Windows NCSI..." -ForegroundColor Cyan
$registryPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\NetworkConnectivityStatusIndicator"
$propertyName = "UseGlobalDNS"

try {
    # Check Administrator privileges
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "⚠️ Warning: This script requires Administrator privileges to write Registry!" -ForegroundColor Red
        Write-Host "👉 If it fails, please run PowerShell as Administrator." -ForegroundColor Yellow
    }

    if (-not (Test-Path $registryPath)) {
        New-Item -Path $registryPath -Force | Out-Null
        Write-Host "  [+] Created NCSI registry key" -ForegroundColor Green
    }
    
    Set-ItemProperty -Path $registryPath -Name $propertyName -Value 1 -Type DWord -Force | Out-Null
    Write-Host "  [+] Forced Global DNS for NCSI (UseGlobalDNS = 1)" -ForegroundColor Green
} catch {
    Write-Host "  [-] Failed: Cannot modify registry without Admin privileges." -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor DarkGray
}
Write-Host ""

# ─────────────────────────────────────────────────────────────
# 2. Resolve WireGuard "Manager already installed and running"
# ─────────────────────────────────────────────────────────────
Write-Host "[2/3] Resolving WireGuard GUI conflicts..." -ForegroundColor Cyan

# Find any running WireGuard GUI instances
$wireguardProcesses = Get-Process -Name "wireguard" -ErrorAction SilentlyContinue

if ($wireguardProcesses) {
    Write-Host "  [i] Found running WireGuard process instances: $($wireguardProcesses.Count)" -ForegroundColor Yellow
    Write-Host "  [+] Closing old instances to clear 'Manager already installed and running'..." -ForegroundColor Yellow
    
    try {
        Stop-Process -Name "wireguard" -Force -ErrorAction Stop
        Write-Host "  [+] Closed old instances successfully." -ForegroundColor Green
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "  [-] Failed to stop WireGuard processes." -ForegroundColor Red
    }
} else {
    Write-Host "  [+] No existing WireGuard GUI processes found." -ForegroundColor Green
}

# Boot WireGuard GUI to restore system tray icon
try {
    $paths = @(
        "$env:ProgramFiles\WireGuard\wireguard.exe",
        "$env:ProgramFiles(x86)\WireGuard\wireguard.exe"
    )
    
    $wgPath = $null
    foreach ($path in $paths) {
        if (Test-Path $path) {
            $wgPath = $path
            break
        }
    }
    
    if ($wgPath) {
        Write-Host "  [+] Launching WireGuard GUI from: $wgPath" -ForegroundColor Yellow
        Start-Process -FilePath $wgPath -WindowStyle Hidden
        Write-Host "  [+] WireGuard GUI launched. Check system tray icon!" -ForegroundColor Green
    } else {
        Write-Host "  [-] WireGuard installation not found in program files." -ForegroundColor Red
    }
} catch {
    Write-Host "  [-] Error launching WireGuard GUI: $_" -ForegroundColor Red
}
Write-Host ""

# ─────────────────────────────────────────────────────────────
# 3. Setup Network Interface Metric
# ─────────────────────────────────────────────────────────────
Write-Host "[3/3] Setting Network Interface Metrics..." -ForegroundColor Cyan

try {
    # Find Wi-Fi interfaces
    $wifiInterfaces = Get-NetIPInterface -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like "*Wi-Fi*" -or $_.InterfaceAlias -like "*Wireless*"}
    # Find WireGuard interfaces
    $wgInterfaces = Get-NetIPInterface -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like "*wireguard*" -or $_.InterfaceAlias -like "*wg*"}
    
    if ($wifiInterfaces) {
        foreach ($wifi in $wifiInterfaces) {
            $idx = $wifi.InterfaceIndex
            Set-NetIPInterface -InterfaceIndex $idx -InterfaceMetric 10 -ErrorAction Stop | Out-Null
            Write-Host "  [+] Set Wi-Fi (Index: $idx) Metric to 10 (High Priority)" -ForegroundColor Green
        }
    } else {
        Write-Host "  [i] No active Wi-Fi adapters found." -ForegroundColor Yellow
    }
    
    if ($wgInterfaces) {
        foreach ($wg in $wgInterfaces) {
            $idx = $wg.InterfaceIndex
            Set-NetIPInterface -InterfaceIndex $idx -InterfaceMetric 50 -ErrorAction Stop | Out-Null
            Write-Host "  [+] Set WireGuard (Index: $idx) Metric to 50 (Lower Priority)" -ForegroundColor Green
        }
    } else {
        Write-Host "  [i] No active WireGuard interfaces found (or currently disconnected)." -ForegroundColor Yellow
        Write-Host "  [i] Metric will apply automatically next time you connect WireGuard." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [-] Failed to set metrics (requires Administrator privileges)." -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "✅ Network diagnostics and patches applied successfully!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Yellow
