#!/bin/bash

# ─── HECS Edge Agent Health Check Script ──────────────────────────────────────
# สคริปต์สำหรับตรวจสอบสถานะการเชื่อมต่อของ Edge Agent บน Raspberry Pi Zero 2 W
# วิธีใช้: sudo chmod +x health_check.sh && ./health_check.sh

echo "🏨 HECS Edge Agent — System Health Check"
echo "═══════════════════════════════════════════════════════════"
date '+%Y-%m-%d %H:%M:%S'
echo ""

# โหลดตัวแปรจาก .env (ถ้ามี)
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  Warning: .env file not found. Using defaults."
fi

# 1. ตรวจสอบสถานะ MQTT Broker Connectivity
echo "📡 1. MQTT Broker Connectivity:"
MQTT_HOST=$(echo $MQTT_BROKER_URL | sed 's|mqtt://||' | cut -d':' -f1)
MQTT_PORT=$(echo $MQTT_BROKER_URL | sed 's|mqtt://||' | cut -d':' -f2)
if nc -zv -w2 $MQTT_HOST $MQTT_PORT 2>/dev/null; then
    echo "   ✅ Connected to $MQTT_HOST:$MQTT_PORT"
else
    echo "   ❌ Failed to connect to $MQTT_HOST:$MQTT_PORT"
fi
echo ""

# 2. ตรวจสอบสถานะ PBX Connection ตามโหมด
echo "🔌 2. PBX Connection Status (Mode: ${PBX_MODE:-mock}):"
if [ "$PBX_MODE" = "tcp" ]; then
    if nc -zv -w2 $PBX_HOST $PBX_PORT 2>/dev/null; then
        echo "   ✅ TCP Connected to $PBX_HOST:$PBX_PORT"
    else
        echo "   ❌ TCP Connection failed to $PBX_HOST:$PBX_PORT"
    fi
elif [ "$PBX_MODE" = "serial" ]; then
    if [ -c "$SERIAL_PATH" ]; then
        echo "   ✅ Serial Port $SERIAL_PATH exists"
    else
        echo "   ❌ Serial Port $SERIAL_PATH not found"
    fi
else
    echo "   ℹ️  Mock Mode — No hardware connection required"
fi
echo ""

# 3. ตรวจสอบการใช้ทรัพยากรระบบ (System Resources)
echo "💻 3. System Resources:"
echo "   Memory Usage:"
free -m | awk 'NR==2{printf "   Total: %sMB, Used: %sMB, Free: %sMB (%.1f%%)\n", $2, $3, $4, $3*100/$2}'
echo "   CPU Load (1 min):"
uptime | awk -F'load average:' '{print "   " $2}' | xargs
echo ""

# 4. ตรวจสอบสถานะกระบวนการ Edge Agent (ถ้ารันเป็น Service)
echo "⚙️  4. Edge Agent Process Status:"
if pgrep -f "mqtt_agent.js" > /dev/null; then
    echo "   ✅ Edge Agent is running (PID: $(pgrep -f mqtt_agent.js))"
else
    echo "   ⚠️  Edge Agent process not found"
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "✅ Health check completed."
