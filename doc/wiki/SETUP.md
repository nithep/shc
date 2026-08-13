# การติดตั้งและการตั้งค่าระบบ (Setup Guide)

คู่มือนี้ครอบคลุมการติดตั้งและการตั้งค่าสภาพแวดล้อมสำหรับ **Hotel ECS Project (Smart Hotel Self Check-in/Check-out)** ซึ่งทำงานบน Raspberry Pi 4 และเชื่อมต่อกับตู้สาขา Phonik PBX

## 📌 ข้อกำหนดเบื้องต้น (Prerequisites)

- **Hardware**: Raspberry Pi 4 (RAM 4GB+ แนะนำ 8GB), สาย LAN, ตู้สาขา Phonik ECS-103R V.5
- **OS**: Raspberry Pi OS (Debian-based)
- **Software**: 
  - Node.js (v18+)
  - Python (3.9+)
  - Docker & Docker Compose (สำหรับการ Deploy แบบ Production)
  - Git

## 🚀 ขั้นตอนการติดตั้ง (Installation Steps)

### 1. โคลนโปรเจกต์ (Clone the Repository)
```bash
git clone https://github.com/nithep/hotel-ecs-checkin.git
cd hotel-ecs-checkin
```

### 2. ตั้งค่า Backend
```bash
cd backend
npm install
cp .env.example .env  # แก้ไขค่าตัวแปรใน .env ให้ตรงกับสภาพแวดล้อมของคุณ
npm run dev
```

### 3. ตั้งค่า Frontend
```bash
cd frontend
npm install
cp .env.example .env  # ตั้งค่า API Endpoint ให้ชี้ไปที่ Backend
npm run dev
```

### 4. ตั้งค่า PBX Connector
PBX Connector ทำหน้าที่คุยกับฮาร์ดแวร์ โปรดตรวจสอบหมายเลข IP และ Port ของตู้สาขา Phonik ก่อนดำเนินการ
```bash
cd pbx-connector
npm install
# หรือหากใช้ Python
# pip install -r requirements.txt
```

---

## 🔒 มาตรฐานความปลอดภัยและ PDPA (Security & PDPA Setup)

ก่อนนำระบบขึ้นใช้งานจริง (Production) ต้องตรวจสอบการตั้งค่าดังนี้:

1. **เปิดใช้งาน HTTPS**: จำเป็นต้องใช้ HTTPS สำหรับหน้า Frontend เสมอ เพื่อให้การส่งผ่านข้อมูล PII ปลอดภัย
2. **การแยกฐานข้อมูล (Database Isolation)**: ไม่ควรเปิดให้เข้าถึงฐานข้อมูลโดยตรงจากอินเทอร์เน็ต
3. **ตรวจสอบ Consent UI**: ตรวจสอบหน้า Frontend ว่ามีการแสดง Checkbox สำหรับยินยอมนโยบาย PDPA อย่างชัดเจนก่อนผู้ใช้กดปุ่ม Check-in
4. **ตั้งเวลา Cron Job ลบข้อมูล**: เปิดใช้งาน Worker สำหรับทำ Data Anonymization ตามกฎของ Data Retention

---

## 🛠 คำสั่งที่ใช้บ่อย (Useful Commands)

- **ตรวจสอบสถานะระบบ**: `npm run status`
- **Deploy ผ่าน Docker Compose**: `docker-compose -f docker-compose.prod.yml up -d`
- **ดู Log การเชื่อมต่อตู้ PBX**: `docker logs hotel_pbx_connector -f`
