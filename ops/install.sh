#!/bin/bash
# HECS One-line Installer (Hotel Energy Control Server)
# Usage: curl -sL https://raw.githubusercontent.com/nithep/Hotel-ECS/main/install.sh | bash

set -e

echo "🏨 เริ่มต้นติดตั้ง Hotel ECS (HECS) - Smart Hotel System..."

# ตรวจสอบ Docker
if ! command -v docker &> /dev/null; then
    echo "❌ ไม่พบ Docker กรุณาติดตั้ง Docker ก่อนดำเนินการต่อ"
    echo "สามารถติดตั้งด้วยคำสั่ง: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ ไม่พบ Docker Compose"
    exit 1
fi

INSTALL_DIR="/home/ecs-agent/nithep/shc"
echo "📂 กำลังสร้างโฟลเดอร์สำหรับ HECS ที่ $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"
sudo chown -R $USER:$USER "$INSTALL_DIR"

cd "$INSTALL_DIR"

echo "📥 ดาวน์โหลดไฟล์ตั้งค่าเบื้องต้น..."
curl -sL -o docker-compose.prod.yml https://raw.githubusercontent.com/nithep/Hotel-ECS/main/docker-compose.prod.yml
mkdir -p data config logs

if [ ! -f "config/.env" ]; then
    echo "⚙️  สร้างไฟล์ Environment (.env)..."
    curl -sL -o config/.env https://raw.githubusercontent.com/nithep/Hotel-ECS/main/.env.example
fi

echo "🚀 กำลังเริ่มต้นระบบ (Starting HECS)..."
# ใช้ docker compose หรือ docker-compose แล้วแต่เวอร์ชั่นที่มี
if command -v docker-compose &> /dev/null; then
    docker-compose -f docker-compose.prod.yml up -d
else
    docker compose -f docker-compose.prod.yml up -d
fi

echo ""
echo "✅ ติดตั้ง Hotel ECS สำเร็จ!"
echo "   - 🌐 เข้าสู่ระบบ Admin Dashboard ได้ที่: http://localhost:3000"
echo "   - 📝 อย่าลืมตั้งค่ารหัสผ่านเพิ่มเติมใน $INSTALL_DIR/config/.env"
echo "   - 🔧 ควบคุมระบบผ่านตู้ PBX ที่พอร์ต 10001 (ค่าเริ่มต้น)"
echo "สนุกกับการใช้งาน HECS!"
