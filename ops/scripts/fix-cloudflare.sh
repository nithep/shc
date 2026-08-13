#!/bin/bash
# ==============================================================================
# scripts/fix-cloudflare.sh
# สคริปต์วินิจฉัยและแก้ไขปัญหา Cloudflare Tunnel บน Raspberry Pi 4
# วิธีใช้: ssh pi4@192.168.1.109 'bash -s' < fix-cloudflare.sh
# หรือ: sudo bash fix-cloudflare.sh
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}🏨 Hotel-ECS: Cloudflare Tunnel Diagnostics${NC}"
echo -e "${BLUE}============================================${NC}"

# ─── ขั้นตอนที่ 1: เช็คสถานะคอนเทนเนอร์ ────────────────────────
echo ""
echo -e "${YELLOW}[STEP 1] ตรวจสอบสถานะ Docker Containers...${NC}"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo -e "${RED}❌ ไม่พบ Docker ในระบบ${NC}"

# ─── ขั้นตอนที่ 2: ดึง Log ของ Cloudflare Tunnel ─────────────────
echo ""
echo -e "${YELLOW}[STEP 2] Log ล่าสุดของ hotel-tunnel (20 บรรทัดล่าสุด):${NC}"
docker logs --tail 20 hotel-tunnel 2>/dev/null || echo -e "${RED}❌ ไม่พบคอนเทนเนอร์ 'hotel-tunnel' — อาจยังไม่ได้ Start${NC}"

# ─── ขั้นตอนที่ 3: เช็ค Token ─────────────────────────────────────
echo ""
echo -e "${YELLOW}[STEP 3] ตรวจสอบ Token ใน /home/ecs-agent/nithep/shc/config/.env:${NC}"
CONFIG_FILE="/home/ecs-agent/nithep/shc/config/.env"
if [ -f "$CONFIG_FILE" ]; then
    TOKEN=$(grep "CLOUDFLARE_TUNNEL_TOKEN" "$CONFIG_FILE" | cut -d= -f2 | tr -d ' ')
    if [ -z "$TOKEN" ] || echo "$TOKEN" | grep -qi "ใส่\|your_secure\|placeholder\|token_here"; then
        echo -e "${RED}❌ ไม่พบ Token จริง (ยังเป็นค่า Placeholder)${NC}"
        echo -e "${YELLOW}   → ต้องแก้ไขไฟล์: $CONFIG_FILE${NC}"
    else
        echo -e "${GREEN}✅ พบ Token (ความยาว ${#TOKEN} ตัวอักษร)${NC}"
    fi
else
    echo -e "${RED}❌ ไม่พบไฟล์ .env ที่ $CONFIG_FILE${NC}"
    # เช็ค Path สำรอง
    ALT_FILE="/home/ecs-agent/nithep/shc/.env"
    if [ -f "$ALT_FILE" ]; then
        echo -e "${YELLOW}⚠️  แต่พบไฟล์ .env ที่ $ALT_FILE (Path ไม่ตรงกับที่ Docker Compose คาดหวัง!)${NC}"
        echo -e "${YELLOW}   → กำลังซ่อมแซม: คัดลอก .env ไปยัง Path ที่ถูกต้อง...${NC}"
        mkdir -p /home/ecs-agent/nithep/shc/config
        cp "$ALT_FILE" "$CONFIG_FILE"
        chmod 600 "$CONFIG_FILE"
        echo -e "${GREEN}✅ คัดลอกไฟล์เรียบร้อย: $ALT_FILE → $CONFIG_FILE${NC}"
    fi
fi

# ─── ขั้นตอนที่ 4: เช็คอินเทอร์เน็ตออก ─────────────────────────
echo ""
echo -e "${YELLOW}[STEP 4] ทดสอบการเชื่อมต่ออินเทอร์เน็ต:${NC}"
if ping -c 1 -W 3 8.8.8.8 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ อินเทอร์เน็ตปกติ (Ping 8.8.8.8 ผ่าน)${NC}"
else
    echo -e "${RED}❌ ไม่มีการเชื่อมต่ออินเทอร์เน็ต — Cloudflare Tunnel ไม่สามารถทำงานได้!${NC}"
fi

# ─── ขั้นตอนที่ 5: เช็คว่า Port 3000 ของ Backend เปิดอยู่ ────────
echo ""
echo -e "${YELLOW}[STEP 5] ทดสอบ Backend API ที่ port 3000:${NC}"
if curl -s --max-time 3 http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend ทำงานปกติ (http://localhost:3000 ตอบสนอง)${NC}"
else
    echo -e "${RED}❌ Backend ไม่ตอบสนอง — Cloudflare จะไม่มีอะไรส่งต่อ!${NC}"
fi

# ─── สรุปและคำแนะนำ ───────────────────────────────────────────────
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}📋 สรุปผลการวินิจฉัยและขั้นตอนถัดไป:${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "ถ้า Log ใน [STEP 2] แสดง 'ERR_CLOUDFLARE_TUNNEL_TOKEN_INVALID' หรือ 'missing token':"
echo -e "  ${YELLOW}1. เปิดไฟล์: sudo nano /home/ecs-agent/nithep/shc/config/.env${NC}"
echo -e "  ${YELLOW}2. แก้ไขบรรทัด: CLOUDFLARE_TUNNEL_TOKEN=<วาง Token จาก Cloudflare Dashboard ที่นี่>${NC}"
echo -e "  ${YELLOW}3. รีสตาร์ท Tunnel: docker compose -f /home/ecs-agent/nithep/shc/docker-compose.yml restart cloudflare-tunnel${NC}"
echo ""
echo -e "ถ้าคอนเทนเนอร์ 'hotel-tunnel' ไม่มีในรายการ:"
echo -e "  ${YELLOW}→ cd /home/ecs-agent/nithep/shc && docker compose up -d${NC}"
echo ""
echo -e "ถ้าทุกอย่างปกติแต่ยังเข้าเว็บไม่ได้ — เช็ค Cloudflare Dashboard ว่า Tunnel Status เป็น HEALTHY ไหม:"
echo -e "  ${YELLOW}→ https://one.dash.cloudflare.com/ > Networks > Tunnels${NC}"
