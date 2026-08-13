#!/bin/bash
# -----------------------------------------------------------------------------
# VPN Tunnel Health Check Script for Raspberry Pi 4
# This script pings the VPN Hub (10.0.0.1) and restarts the WireGuard
# interface if connection fails.
# Recommended cron job: */2 * * * * /usr/local/bin/vpn-healthcheck.sh
# -----------------------------------------------------------------------------

PING_TARGET="10.0.0.1"
INTERFACE="wg0"
LOG_FILE="/var/log/vpn-healthcheck.log"

# ตรวจสอบสิทธิ์ Root (เพราะต้องสั่ง wg-quick)
if [ "$EUID" -ne 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] This script must be run as root." >> "$LOG_FILE"
  exit 1
fi

# ตรวจสอบความพร้อมของอินเทอร์เฟซ wg0 ในระบบ
if ! ip link show "$INTERFACE" > /dev/null 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] Interface $INTERFACE does not exist. Trying to start it..." >> "$LOG_FILE"
    wg-quick up "$INTERFACE" > /dev/null 2>&1
    sleep 3
fi

# ตรวจสอบความถูกต้องของการ Ping (ยิง 3 ครั้ง, รอการตอบรับใน 2 วินาที)
if ping -c 3 -W 2 "$PING_TARGET" > /dev/null 2>&1; then
    # การเชื่อมต่อปกติ ไม่ดำเนินการใดๆ
    exit 0
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] VPN Tunnel down. Ping to $PING_TARGET failed." >> "$LOG_FILE"
    
    # พยายามรีสตาร์ทบริการ WireGuard
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Restarting WireGuard interface $INTERFACE..." >> "$LOG_FILE"
    
    wg-quick down "$INTERFACE" > /dev/null 2>&1
    sleep 2
    wg-quick up "$INTERFACE" > /dev/null 2>&1
    
    # ตรวจสอบผลการรีสตาร์ทหลังหน่วงเวลาสั้นๆ
    sleep 5
    if ping -c 2 -W 2 "$PING_TARGET" > /dev/null 2>&1; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] VPN Tunnel restored successfully." >> "$LOG_FILE"
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') [CRITICAL] Failed to restore VPN Tunnel. Will retry in next cron cycle." >> "$LOG_FILE"
    fi
fi
