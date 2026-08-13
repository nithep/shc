#!/bin/bash

# ==========================================
# Hotel ECS - Raspberry Pi Setup Script
# สำหรับบอร์ด Pi 4 / Pi 4
# ==========================================

echo "=========================================="
echo "🏨 เริ่มต้นการติดตั้งสภาพแวดล้อมสำหรับ Hotel ECS"
echo "=========================================="

# 1. Update OS and Install Node.js
echo "[1/4] กำลังอัปเดตระบบและติดตั้ง Node.js..."
sudo apt-get update
sudo apt-get upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# 2. Install PM2 Globally
echo "[2/4] กำลังติดตั้ง PM2..."
sudo npm install -g pm2

# 3. Install Dependencies
echo "[3/4] กำลังติดตั้ง Dependencies สำหรับระบบ..."
# ย้ายไปที่ root directory (สมมติว่า script ถูกเรียกจาก root)
cd "$(dirname "$0")/.." || exit

# ติดตั้งแพ็กเกจหลัก
npm run install:all --if-present || (cd api && npm install && cd ../app && npm install && cd ../pbx && npm install)

# สร้าง build สำหรับ frontend เพื่อเตรียมรันบนโปรดักชัน
echo "-> กำลัง Build Frontend..."
cd frontend
npm run build
cd ..

# 4. ตั้งค่า PM2
echo "[4/4] กำลังตั้งค่า PM2 และ Service Auto-start..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup | grep "sudo env PATH" | bash

echo "=========================================="
echo "✅ การติดตั้งเสร็จสมบูรณ์!"
echo "ระบบพร้อมทำงานและจะเปิดอัตโนมัติเมื่อรีสตาร์ทเครื่อง"
echo "คุณสามารถดูสถานะการทำงานได้ด้วยคำสั่ง: pm2 status"
echo "และดู logs ได้ด้วยคำสั่ง: pm2 logs"
echo "=========================================="
