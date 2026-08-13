#!/bin/bash

# ==============================================================================
# Hotel-ECS: Raspberry Pi 4 Bootstrap Script
# สำหรับเตรียมโครงสร้างโฟลเดอร์ สิทธิ์การเข้าถึง และไฟล์ตั้งค่าพื้นฐานก่อนรัน Docker Compose
# ==============================================================================

# ตรวจสอบการรันด้วยสิทธิ์ root
if [ "$EUID" -ne 0 ]; then
  echo "❌ กรุณารันสคริปต์นี้ด้วยสิทธิ์ sudo: 'sudo $0'"
  exit 1
fi

echo "=========================================================="
echo "🏨 กำลังจัดตั้งระบบโครงสร้างพื้นฐานสำหรับ Hotel-ECS Gateway..."
echo "=========================================================="

# 1. ตรวจสอบและสร้างผู้ใช้ ecs-agent
if id "ecs-agent" &>/dev/null; then
  echo "👤 พบผู้ใช้ 'ecs-agent' อยู่ในระบบแล้ว"
else
  echo "👤 กำลังสร้างผู้ใช้ 'ecs-agent'..."
  useradd -m -s /bin/bash ecs-agent
  # เพิ่มเข้ากลุ่ม docker (หากมี docker ติดตั้งแล้ว)
  if getent group docker > /dev/null; then
    usermod -aG docker ecs-agent
  fi
  echo "✅ สร้างผู้ใช้ 'ecs-agent' เรียบร้อย"
fi

# 2. สร้างโครงสร้างโฟลเดอร์หลัก
echo "📂 กำลังสร้างไดเรกทอรีสำหรับระบบ..."
mkdir -p /home/ecs-agent/nithep/shc/config
mkdir -p /home/ecs-agent/nithep/shc/data
mkdir -p /home/ecs-agent/nithep/shc/logs
mkdir -p /home/ecs-agent/nithep/shc/app
echo "✅ สร้างไดเรกทอรีสำเร็จ"

# 3. สร้างไฟล์ตั้งค่าระบบ (.env) หากยังไม่มี
ENV_FILE="/home/ecs-agent/nithep/shc/config/.env"
if [ -f "$ENV_FILE" ]; then
  echo "⚠️  พบไฟล์ .env เดิมที่ $ENV_FILE แล้ว (จะไม่มีการเขียนทับ)"
else
  echo "⚙️  กำลังสร้างไฟล์เทมเพลต .env พื้นฐานพร้อมค่าติดตั้งหน้างาน..."
  cat <<EOT > "$ENV_FILE"
# ==============================================================================
# Hotel-ECS Gateway Environment Configuration
# ==============================================================================

# ระบบควบคุมและรันเวย์
PORT=3000
NODE_ENV=production

# 🔌 การเชื่อมต่อตู้สาขา Phonik PBX จริง (ข้อมูลตรงตามหน้างาน)
PBX_MODE=tcp
PBX_HOST=192.168.1.91        # IP จริงของตู้ PBX
PBX_PORT=23                  # พอร์ต TCP ของตู้สาขา (Telnet)

# 💾 ฐานข้อมูล SQLite (วางอยู่ในโฟลเดอร์ Persistence)
DATABASE_PATH=/app/backend/hotel.db

# 🛡️ โทเคนสำหรับเชื่อมต่อ Cloudflare Tunnel (hotel.nithep.com)
CLOUDFLARE_TUNNEL_TOKEN=ใส่โทเคนคลาวด์แฟลร์ของคุณที่นี่

# 🛎️ การแจ้งเตือนระบบ (Google Chat / Telegram)
GOOGLE_CHAT_WEBHOOK_URL=ใส่ลิงก์เว็บฮุคกูเกิลแชทของคุณที่นี่
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
EOT
  chmod 600 "$ENV_FILE"
  chown ecs-agent:ecs-agent "$ENV_FILE"
  echo "✅ สร้างเทมเพลต .env เรียบร้อยแล้วที่ $ENV_FILE (กรุณาอัปเดตโทเคนก่อนรัน)"
fi

# 4. ตั้งสิทธิ์ของไดเรกทอรีหลัก
echo "🔒 กำลังตั้งสิทธิ์เข้าถึงระบบไฟล์..."
chown -R ecs-agent:ecs-agent /home/ecs-agent/nithep/shc
chmod -R 775 /home/ecs-agent/nithep/shc
chmod -R 777 /home/ecs-agent/nithep/shc/data # ให้ Docker container เขียนไฟล์ sqlite db ได้อย่างอิสระ
echo "✅ ตั้งสิทธิ์เสร็จสิ้น"

# 5. ตรวจสอบการติดตั้ง Docker
echo "=========================================================="
echo "🎯 ตรวจสอบสภาพแวดล้อม Docker:"

if command -v docker &>/dev/null; then
  echo "🐳 Docker: ติดตั้งแล้ว ($(docker --version))"
else
  echo "⚠️  ยังไม่พบ Docker ในระบบ!"
  echo "👉 คำแนะนำในการติดตั้ง Docker บน Raspberry Pi OS:"
  echo "   curl -fsSL https://get.docker.com -o get-docker.sh"
  echo "   sudo sh get-docker.sh"
  echo "   sudo usermod -aG docker ecs-agent"
fi

if command -v docker-compose &>/dev/null || docker compose version &>/dev/null; then
  echo "🐳 Docker Compose: ติดตั้งแล้ว"
else
  echo "⚠️  ยังไม่พบ Docker Compose! แนะนำให้ติดตั้ง docker-compose-plugin หรือ docker-compose"
fi

echo "=========================================================="
echo "🎉 เสร็จเรียบร้อย! ขั้นตอนต่อไปสำหรับทีมช่าง/AI Agent:"
echo "1. คัดลอกซอร์สโค้ดของแอปพลิเคชันมาวางที่ '/home/ecs-agent/nithep/shc/app'"
echo "2. อัปเดตตัวแปรใน '/home/ecs-agent/nithep/shc/config/.env' ให้ถูกต้อง"
echo "3. คัดลอก 'docker-compose.prod.yml' ไปที่ '/home/ecs-agent/nithep/shc/docker-compose.yml'"
echo "4. รันคำสั่ง 'docker compose up -d' จากไดเรกทอรี '/home/ecs-agent/nithep/shc'"
echo "=========================================================="
