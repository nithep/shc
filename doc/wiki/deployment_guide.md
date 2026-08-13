# Deployment Guide (คู่มือการติดตั้งขึ้นเซิร์ฟเวอร์จริง)

ระบบถูกออกแบบมาให้รันบน **Raspberry Pi 4 (IP: 192.168.1.94)** โดยใช้ Node.js และ SQLite เป็นหลัก

## ขั้นตอนการส่งโค้ดขึ้นระบบจริง (Deploy)

### 1. เครื่อง Matebook (เครื่องนักพัฒนา)
ก่อนส่งโค้ดขึ้นระบบ ต้องทำการ Build Frontend ให้เรียบร้อยเสียก่อน:
```bash
# 1. เข้าไปที่โฟลเดอร์ frontend และทำการ Build
cd frontend
npm run build

# 2. คอมมิตการเปลี่ยนแปลงทั้งหมดเข้าสู่ Git
cd ..
git add .
git commit -m "Deploy: UI/UX Overhaul & Auto-Eviction"

# 3. ส่งโค้ดขึ้น Github (เพื่อเป็นศูนย์กลาง)
git push origin main
```

### 2. เครื่อง Raspberry Pi 4 (เซิร์ฟเวอร์หลัก)
ใช้ SSH เข้าไปยังเครื่อง Pi 4 เพื่อดึงโค้ดชุดใหม่:
```bash
# 1. SSH เข้าไปที่เครื่อง Pi 4
ssh pi@192.168.1.94

# 2. เข้าไปที่โฟลเดอร์โปรเจกต์
cd /path/to/Hotel-ECS

# 3. ดึงโค้ดล่าสุดจาก Github
git pull origin main

# 4. ติดตั้ง Dependencies เผื่อมีการอัปเดต
cd backend
npm install

# 5. รีสตาร์ทเซิร์ฟเวอร์ (สมมติว่าใช้ PM2)
pm2 restart server
# หรือถ้ารันสด
node server.js
```

## ระบบจัดการปัญหาไฟดับ (Power Failure Recovery)
เมื่อทำการ `pm2 restart server` หรือไฟดับแล้ว Pi 4 บูตขึ้นมาใหม่ ไฟล์ `server.js` จะทำการ:
1. เชื่อมต่อ PBX
2. อ่านข้อมูลห้องจาก `hotel.db`
3. เปรียบเทียบห้องที่มีสถานะ `occupied` แต่ PBX มองว่า `OFF`
4. สั่ง `checkIn('SyncRecovery')` เพื่อจ่ายไฟให้ห้องนั้นกลับมาสว่างตามเดิมทันที

## ระบบตัดไฟอัตโนมัติ (Auto-Eviction)
- เซิร์ฟเวอร์จะรันคำสั่ง `0 12 * * *` (เที่ยงตรง) ทุกวันผ่าน `node-cron`
- ดึงข้อมูลห้องพักที่ `checkout_date` หมดอายุ
- สั่งตัดไฟ (`checkOut`) เพื่อป้องกันไม่ให้แขกพักเกินกำหนดโดยไม่แจ้ง
- ข้อมูล `checkout_date` จะตั้งค่าเริ่มต้นเมื่อเช็คอินเป็นเวลา 12:00 น. ของวันถัดไป แอดมินสามารถเรียกใช้ API `/api/rooms/:id/extend` เพื่อยืดเวลาออกไปได้
