---
title: คู่มือการติดตั้งและเริ่มต้นใช้งานด่วน (HECS Quick Start Guide)
type: wiki
tags: [installation, setup, quickstart, docker, raspberry-pi]
created: 2026-07-25
updated: 2026-08-02
---

# 🚀 คู่มือการติดตั้งและเริ่มต้นใช้งานด่วน (HECS Quick Start Guide)

**Hotel ECS (Hotel Energy Control Server)** คือระบบบริหารจัดการห้องพัก Smart Hotel Self Check-in และควบคุมระบบไฟฟ้าผ่านตู้สาขาโทรศัพท์ Phonik PBX (ECS-103R V.5)

---

## 📋 ข้อกำหนดของระบบ (System Requirements)

1. **Hardware:**
   - **Raspberry Pi 4** (RAM 2GB ขึ้นไป) หรือเครื่อง Linux/Windows Server
   - **Phonik PBX (ECS-103R V.5)** หรือตู้สาขา Phonik ที่รองรับ CCH2 Protocol ผ่าน LAN (TCP/IP) หรือ Serial Port
   - บอร์ดควบคุมรีเลย์ไฟฟ้าห้องพัก (220V Relay Board)

2. **Software Prerequisites:**
   - **Docker** & **Docker Compose** (แนะนำสำหรับ Production)
   - **Node.js 20+** (กรณีรันโดยไม่ใช้ Docker)

---

## ⚡ วิธีการติดตั้งด่วนด้วย Docker Compose (แนะนำ)

### 1. ดาวน์โหลดซอร์สโค้ด (Clone Repository)
```bash
git clone https://github.com/nithep/Hotel-ECS.git
cd Hotel-ECS
```

### 2. ตั้งค่าไฟล์ Environment Variable
คัดลอกไฟล์ `.env.example` ไปเป็น `.env` และปรับแต่งค่าตามการใช้งานของคุณ:
```bash
cp .env.example .env
```

**ตัวอย่างการตั้งค่าสำคัญใน `.env`:**
```env
PORT=3000
PBX_MODE=tcp                  # เลือกระหว่าง 'tcp' หรือ 'serial'
PBX_HOST=192.168.1.200        # IP Address ของตู้สาขา PBX
PBX_PORT=10001                # พอร์ตของตู้สาขา PBX
CLOUDFLARE_TUNNEL_TOKEN=your_token_here # (ถ้าต้องการเข้าถึงจากภายนอก)
```

### 3. รันระบบทั้งหมดด้วย Docker Compose
```bash
docker-compose -f docker-compose.prod.yml up -d
```

ระบบจะทำการสร้างและรัน Service ทั้งหมดอัตโนมัติ:
- **Backend API & Web Dashboard:** `http://localhost:3000`
- **Cloudflare Tunnel:** เชื่อมต่อโดเมนภายนอกผ่าน Secure Tunnel

---

## 🧪 การทดสอบระบบด้วย Digital Twin (Simulator Mode)

หากคุณยังไม่มีตู้สาขา PBX จริง หรือต้องการทดสอบระบบบนเครื่อง Local PC สามารถรันในโหมดจำลองได้ดังนี้:

```bash
# รันผ่าน Docker Compose dev stack (รวม PBX Simulator ในตัว)
docker-compose up -d
```

ระบบจะเปิด:
- **Web Frontend (Vite Dev):** `http://localhost:5173`
- **Backend API:** `http://localhost:3000`
- **PBX Digital Twin Simulator:** `localhost:10001`

---

## 🔒 การเข้าถึงระยะไกลด้วยความปลอดภัยสูง (Security & Remote Access)

1. **Cloudflare Tunnel:** ใช้งานง่าย ไม่ต้อง Forward Port บน Router ปลอดภัยจาก DDoS และปัญหา Dynamic IP
2. **WireGuard VPN:** สำหรับผู้ดูแลระบบที่ต้องการเข้าถึง SSH ของ Raspberry Pi หรือตั้งค่าตู้ PBX ทางไกล ดูคู่มือในโฟลเดอร์ `/vpn-setup`

---

## 📞 การสนับสนุนและคู่มือฉบับเต็ม (Documentation & Support)

- อ่านสถาปัตยกรรมฉบับเต็มได้ที่ [`docs/wiki/index.md`](docs/wiki/index.md)
- รายงานปัญหาหรือข้อเสนอแนะได้ที่ GitHub Issues

---
*พัฒนาและกำกับดูแลสถาปัตยกรรมโดย HECS (Hotel ECS Integration Team)*


---
## 🔗 ลิงก์เชื่อมโยงที่เกี่ยวข้อง (Knowledge Graph)
- [[index|สารบัญระบบ]]
- [[raspberry-pi-setup|คู่มือการตั้งค่า Raspberry Pi 4]]
- [[infrastructure_setup|โครงสร้างพื้นฐานและการติดตั้ง]]
