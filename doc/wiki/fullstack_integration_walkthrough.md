---
title: คู่มือสถาปัตยกรรมและการเชื่อมต่อ HECS Full-Stack Integration
type: wiki
tags: [architecture, fullstack, backend, edge-agent, digital-twin, testing]
created: 2026-07-28
updated: 2026-08-02
---

# 🌐 คู่มือสถาปัตยกรรมและการเชื่อมต่อ HECS Full-Stack Integration

---
type: raw-capture
title: HECS Full-Stack Integration — Walkthrough
source: "{{url}}"
author:
published:
created: 2026-07-28T15:32
description:
status: inbox
tags:
  - capture
---
# 
# HECS Full-Stack Integration — Walkthrough

## Summary
- **One-line summary**: 

---

## 📝 Captured Content



## สรุปสิ่งที่ทำสำเร็จ

เซสชันนี้เชื่อมต่อ **3 ชั้น (Layer)** เข้าหากันเป็นครั้งแรก สร้าง End-to-End Pipeline แบบ Software-in-the-Loop สมบูรณ์

```
LINE MINI App (Frontend-LIFF)
         │ POST /api/guest/checkin
         ▼
Backend Cloud Run  ←──── แก้ Bug Topic + เพิ่ม /checkout + /status
         │ MQTT: hotel/branch-a/room/0101/command  ← แก้ /cmd → /command
         ▼
HiveMQ Public Broker
         │ Subscribe
         ▼
Edge Agent  ←──── เพิ่ม PBX_MODE env var (mock|tcp|serial)
         │ TCP CCH2: ..PWER0101=1
         ▼
Digital Twin Simulator  ←──── Dashboard + 9 rooms + v2.0
         │ Response: ==PWER0101=on
         ▼
Edge Agent → MQTT result → Backend → State Updated
```

---

## ไฟล์ที่เปลี่ยนแปลง

### 1. Backend Cloud Run

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| [index.js](file:///c:/Users/Nithep/ไดรฟ์ของฉัน%20(cnithep@gmail.com)/Hotel-ECS/backend-cloudrun/index.js) | แก้ Topic Bug, +checkout, +status endpoint, +State Store |
| [package.json](file:///c:/Users/Nithep/ไดรฟ์ของฉัน%20(cnithep@gmail.com)/Hotel-ECS/backend-cloudrun/package.json) | [NEW] npm start script |
| [.env.example](file:///c:/Users/Nithep/ไดรฟ์ของฉัน%20(cnithep@gmail.com)/Hotel-ECS/backend-cloudrun/.env.example) | [NEW] ตัวอย่างตัวแปรทั้งหมด |

### 2. Edge Agent

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| [mqtt_agent.js](file:///c:/Users/Nithep/ไดรฟ์ของฉัน%20(cnithep@gmail.com)/Hotel-ECS/edge-agent/mqtt_agent.js) | เพิ่ม PBX_MODE, แก้ Topic, เพิ่ม error result publish |
| [.env.example](file:///c:/Users/Nithep/ไดรฟ์ของฉัน%20(cnithep@gmail.com)/Hotel-ECS/edge-agent/.env.example) | [NEW] PBX_MODE, PBX_HOST, PBX_PORT |

### 3. Digital Twin

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| [simulator.py](file:///c:/Users/Nithep/ไดรฟ์ของฉัน%20(cnithep@gmail.com)/Hotel-ECS/worker/digital-twin/simulator.py) | v2.0: State Dashboard, 9 rooms, argparse |
| [run_all.ps1](file:///c:/Users/Nithep/ไดรฟ์ของฉัน%20(cnithep@gmail.com)/Hotel-ECS/worker/digital-twin/run_all.ps1) | [NEW] รัน 3 services พร้อมกัน |
| [e2e_test.js](file:///c:/Users/Nithep/ไดรฟ์ของฉัน%20(cnithep@gmail.com)/Hotel-ECS/worker/digital-twin/e2e_test.js) | [NEW] E2E Test 6 cases |

---

## วิธีรัน End-to-End Test

### ขั้นตอนที่ 1 — เปิดทุก Service พร้อมกัน
```powershell
.\worker\digital-twin\run_all.ps1
```
จะเปิด Terminal 3 หน้าต่างอัตโนมัติ

### ขั้นตอนที่ 2 — รัน E2E Test (รอ ~10 วินาที)
```powershell
node worker\digital-twin\e2e_test.js
```

### ผลลัพธ์ที่คาดหวัง
```
✅ PASS: Health endpoint returns 200
✅ PASS: Check-in endpoint returns 200
✅ PASS: Room power state updated
✅ PASS: Check-out endpoint returns 200
✅ PASS: Room state reflects checkout
✅ PASS: Missing roomNumber returns 400

🎉 ALL TESTS PASSED — Full-Stack Integration OK!
```

### Debug ด้วย curl
```powershell
# Check-in
curl -X POST http://localhost:8080/api/guest/checkin `
  -H "Content-Type: application/json" `
  -d '{"roomNumber":"0101","lineUserId":"U123","guestName":"TestGuest","transactionId":"TXN-001"}'

# Check-out
curl -X POST http://localhost:8080/api/guest/checkout `
  -H "Content-Type: application/json" `
  -d '{"roomNumber":"0101","lineUserId":"U123"}'

# Room Status
curl http://localhost:8080/api/room/status/0101
```

---

## Bug ที่แก้ไปในเซสชันนี้

> [!CAUTION]
> **MQTT Topic Mismatch (Critical Bug):** Backend publish ที่ `…/room/0101/**cmd**` แต่ Edge subscribe `…/room/+/**command**` — คำสั่งจะถูกยิงออกไปแต่ไม่มีใครรับ ระบบจะ Silent Fail โดยไม่มี Error
>
> แก้ไขแล้ว: ใช้ `/command` ให้ตรงกันทั้งระบบ

---

## ขั้นตอนถัดไป (Roadmap)

- [ ] **ตั้งค่า LIFF_ID จริง** จาก LINE Developers Console และเชื่อม Frontend กับ Backend URL จริง
- [ ] **Deploy Edge Agent** ลงบน Pi Zero 2 W พร้อม `.env` ที่ `PBX_MODE=tcp`, `PBX_HOST=<IP ตู้ PBX>`
- [ ] **Deploy Backend** ขึ้น Google Cloud Run ผ่าน GitHub Actions (CI/CD มีอยู่แล้วใน `.github/workflows/`)
- [ ] **Vertex AI Dynamic Pricing** ฝึกโมเดลและ deploy `.tflite` ลง Pi Z2W


---
## 🔗 ลิงก์เชื่อมโยงที่เกี่ยวข้อง (Knowledge Graph)
- [[index|สารบัญระบบ]]
- [[hybrid_cloud_edge_manual|คู่มือการใช้งานระบบ Hybrid Cloud Edge]]
- [[architecture_overview|ภาพรวมสถาปัตยกรรม Hotel-ECS]]
- [[project_timeline|ประวัติการพัฒนาระบบ]]
