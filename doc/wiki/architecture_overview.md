---
title: สถาปัตยกรรม HECS Hybrid Cloud-Native Edge (Current Architecture)
date: 2026-07-28T16:38:56+07:00
tags: [architecture, cloud-native, edge-computing, pi-zero-2w, google-cloud-run]
---

# 🏨 HECS Hybrid Cloud-Native Edge Architecture

สถาปัตยกรรมปัจจุบันของระบบ Hotel-ECS (Smart Check-in System) ได้ยกระดับสู่รูปแบบ **Hybrid Cloud-Native** อย่างสมบูรณ์ โดยผสานความสามารถของ Google Cloud Platform เข้ากับ Edge Computing บน Raspberry Pi Zero 2W เพื่อความเสถียรและ Scalability ระดับสากล

---

## 🌐 ภาพรวมสถาปัตยกรรม (Architecture Overview)

```mermaid
graph TD
    A[LINE MINI App / Frontend-LIFF] -->|HTTPS / REST API| B(Google Cloud Run - Backend API)
    B -->|MQTT Broker| C[Edge Agent - Pi Zero 2W]
    C -->|CCH2 Protocol (TCP/Serial)| D[Phonik PBX ECS-103R V.5]
    D -->|Relay Control| E[Room Power 220V]
    
    subgraph "Cloud Layer (Google Cloud)"
        B
        F[Firebase Hosting - Frontend]
    end
    
    subgraph "Edge Layer (On-Premise)"
        C
        G[StateVerifier - Safety Gate]
        H[Self-Healing Reconnection Loop]
    end
    
    subgraph "Hardware Layer"
        D
        E
    end
```

---

## ☁️ ส่วนที่ 1: Cloud Layer (บนฟ้า)

### 1.1 Backend API (Google Cloud Run)
- **ตำแหน่ง:** `backend-cloudrun/index.js`
- **หน้าที่:** 
  - รับ Request จาก LINE MINI App และ Frontend อื่นๆ
  - ประมวลผล Business Logic (Check-in, Check-out, Payment)
  - ส่งคำสั่งควบคุมไปยัง Edge Agent ผ่าน MQTT Broker
  - บันทึก Audit Log และ Sync ข้อมูลกับ Google Workspace (Sheets, Chat, Calendar)
- **จุดเด่น:** 
  - Auto-scaling ตามปริมาณ Traffic
  - จ่ายตามการใช้งานจริง (Pay-per-use)
  - ไม่ต้องดูแล Server เอง

### 1.2 Frontend Hosting (Firebase Hosting)
- **ตำแหน่ง:** `frontend/` และ `frontend-liff/`
- **หน้าที่:** 
  - เสิร์ฟหน้าเว็บ Dashboard สำหรับพนักงาน (Admin/Staff)
  - เสิร์ฟหน้า Self Check-in สำหรับแขกผ่าน LINE LIFF
- **จุดเด่น:** 
  - CDN กระจายเนื้อหาทั่วโลก
  - SSL Certificate อัตโนมัติ
  - Deploy อัตโนมัติผ่าน GitHub Actions

---

## 🌱 ส่วนที่ 2: Edge Layer (บนบก)

### 2.1 Edge Gateway (Raspberry Pi Zero 2W)
- **ตำแหน่ง:** `edge-agent-deploy/mqtt_agent_pi.py`
- **หน้าที่:**
  - รับคำสั่งจาก Cloud ผ่าน MQTT Topic `hotel/{BRANCH_ID}/room/{ROOM}/command`
  - แปลงคำสั่งเป็นโปรโตคอล CCH2 ของตู้สาขา Phonik PBX
  - ส่งสถานะกลับไปยัง Cloud ผ่าน MQTT Topic `hotel/{BRANCH_ID}/room/{ROOM}/status`
- **คุณสมบัติพิเศษ:**
  - **Self-Healing Reconnection Loop:** พยายามเชื่อมต่อใหม่ทุก 60 วินาทีหากขาดการติดต่อ
  - **StateVerifier Safety Gate:** ตรวจสอบความปลอดภัยก่อนส่งคำสั่งควบคุมไฟฟ้า 220V ทุกครั้ง
  - **Lightweight:** ใช้ทรัพยากรต่ำ เหมาะกับ Pi Zero 2W (RAM < 45MB)

### 2.2 StateVerifier (Safety Gate)
- **ตำแหน่ง:** `edge-agent/safety/StateVerifier.js` (หรือเวอร์ชัน Python ใน `mqtt_agent_pi.py`)
- **หน้าที่:** 
  - Syntax Validation: ตรวจสอบรูปแบบคำสั่ง
  - Authorization Whitelist: ตรวจสอบสิทธิ์ผู้สั่งการ
  - State Conflict Check: ตรวจสอบความขัดแย้งของสถานะ
  - Rate Limiting: จำกัดอัตราการส่งคำสั่ง
  - Debouncing: ป้องกันการส่งคำสั่งซ้ำซ้อน (อย่างน้อย 2 วินาที)

---

## 🔌 ส่วนที่ 3: Hardware Layer (ฮาร์ดแวร์)

### 3.1 Phonik PBX (ECS-103R V.5)
- **โปรโตคอล:** CCH2 ASCII Protocol ผ่าน TCP Port 23 หรือ Serial Port
- **คำสั่งหลัก:**
  - `..PWER{ROOM}=1` : เปิดไฟห้องพัก (Check-in)
  - `..PWER{ROOM}=0` : ปิดไฟห้องพัก (Check-out)
  - `..ROOM{EXT}={NAME}` : ตั้งชื่อผู้เข้าพักที่ Extension
- **การตอบสนอง:**
  - `==ACKW` : คำสั่งสำเร็จ
  - `==NACK` : คำสั่งถูกปฏิเสธ

### 3.2 Room Relay Board
- **หน้าที่:** รับสัญญาณจาก PBX ไปควบคุมรีเลย์ไฟฟ้า 220V ในแต่ละห้อง
- **ความปลอดภัย:** มีระบบป้องกัน Overload และ Short Circuit

---

## 🔄 การไหลของข้อมูล (Data Flow)

### Flow 1: Guest Check-in
1. แขกสแกน QR Code ผ่าน LINE MINI App
2. Frontend ส่ง Request ไปยัง `POST /api/guest/checkin` บน Google Cloud Run
3. Backend บันทึกข้อมูลลง Database และส่งคำสั่ง `ON` ผ่าน MQTT ไปยัง Edge Agent
4. Edge Agent รับคำสั่ง ตรวจสอบผ่าน StateVerifier แล้วส่ง `..PWER{ROOM}=1` ไปยัง PBX
5. PBX สั่งเปิดรีเลย์ ไฟในห้องสว่างขึ้น
6. Edge Agent ส่งสถานะ `success` กลับไปยัง Backend ผ่าน MQTT
7. Backend ส่ง Response กลับไปยัง Frontend และแจ้งเตือนเข้า Google Chat

### Flow 2: Self-Healing Reconnection
1. Edge Agent ขาดการติดต่อกับ MQTT Broker (Network Issue)
2. ระบบจับได้ว่า Connection หลุด เริ่มนับเวลาถอยหลัง 60 วินาที
3. เมื่อครบเวลา พยายามเชื่อมต่อใหม่ (Reconnection Attempt)
4. หากสำเร็จ กลับไปรับคำสั่งต่อ หากล้มเหลว รออีก 60 วินาทีแล้วลองใหม่
5. วงจรนี้ทำงานต่อเนื่องจนกว่าจะเชื่อมต่อได้สำเร็จ

---

## 🛡️ ความปลอดภัยและความทนทาน (Security & Reliability)

- **JWT Authentication:** ทุก API Request ต้องมี Token ที่ถูกต้อง
- **MQTT QoS 1:** รับประกันว่าคำสั่งจะถูกส่งถึงปลายทางอย่างน้อย 1 ครั้ง
- **StateVerifier Safety Gate:** ป้องกันคำสั่งที่เป็นอันตรายหรือไม่ได้รับอนุญาต
- **Audit Logging:** บันทึกทุกการกระทำลง Google Sheets และ Local Log
- **Graceful Degradation:** หาก Edge ล่ม Frontend ยังทำงานได้ (แต่จะแสดงสถานะ Offline)

---

## 📝 หมายเหตุสำหรับการพัฒนาต่อไป

- **Raspberry Pi 4 (Local):** ถูกตัดออกจากระบบหลักแล้ว หากต้องการใช้ต้องติดตั้งใหม่ผ่าน Git
- **Cloudflare Tunnel:** ใช้ Docker Container Name (`hotel-app:3000`) แทน IP Address เพื่อป้องกันปัญหา DHCP เปลี่ยน IP
- **LIFF Configuration:** ต้องตั้งค่า `LIFF_ID` จริงจาก LINE Developers Console ก่อนใช้งาน Production

---
