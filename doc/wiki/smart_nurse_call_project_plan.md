# 📋 บันทึกโครงการ Smart Nurse Call & Predictive Analytics Architecture
**โปรเจกต์:** ระบบเรียกพยาบาลอัจฉริยะและการวิเคราะห์เชิงคาดการณ์ (โรงพยาบาลราชเวช)  
**สถาปัตยกรรมหลัก:** PBX – Raspberry Pi – GCP (Hybrid Cloud-Native Edge Architecture)  
**โดเมนหลักของระบบ:** `nithep.com` (`nursecall.nithep.com` / `api-nurse.nithep.com` / `liff.nithep.com`)  
**วันที่บันทึก:** 1 สิงหาคม 2026  
**สถานะปัจจุบัน:** 🟢 **วางระบบและเตรียมความพร้อมสำหรับการใช้งานจริงเสร็จสิ้น (Ready for Deployment)**

---

## 🏛️ 1. บทนำและวัตถุประสงค์โครงการ (Project Overview)
โครงการนี้จัดทำขึ้นเพื่อยกระดับระบบเรียกพยาบาล (Nurse Call) เดิมของ **โรงพยาบาลราชเวช** จากระบบอนาล็อกดิบ ให้กลายเป็น **Smart Nurse Call & Predictive Analytics Platform** โดยไม่ต้องรื้อถอนสายสัญญาณหรือเปลี่ยนตู้สาขาหลักเดิม (Phonik DX-32C/80C/144C) 

### 🎯 เป้าหมายหลัก
1. **Zero Infrastructure Overhaul**: เชื่อมต่อเข้ากับตู้ Phonik PBX และสายปุ่มเรียกข้างเตียง (NCX-CORD / NCX-PULL) เดิมผ่านสัญญาณ RS-232 อนุกรม
2. **Real-time Alerting & SLA Tracking**: ติดตามเวลาในการตอบสนองเคสของพยาบาล (SLA Counter) และยิงการ์ดแจ้งเตือนเข้าสมาร์ทโฟน/สมาร์ทวอทช์ทันที
3. **Offline-First Resilience**: ระบบเคาน์เตอร์พยาบาลต้องทำงานและส่งสัญญาณเตือนได้ 100% แม้อินเทอร์เน็ตล่ม
4. **Data Analytics & AI Prediction**: รวบรวมข้อมูลการกดเรียกขึ้น BigQuery เพื่อวิเคราะห์สถิติ พฤติกรรมคนไข้ และคาดการณ์การกดเรียกซ้ำด้วย Vertex AI

---

## 🏗️ 2. สถาปัตยกรรมระบบ 4 ชั้น (System Architecture Blueprint)

```
+-----------------------------------------------------------------------------------+
| 1. PHYSICAL & HARDWARE LAYER (โรงพยาบาลราชเวช)                                    |
|  [ Bedside / Call Switch ]  -->  [ Phonik Main Control ]  -->  [ RS-232 / Serial ] |
|  (NCX-CORD / NCX-PULL)           (DX-32C/80C/144C)                 │             |
+-----------------------------------------------------------------------------------+
                                                                      │
                                                                      ▼
+-----------------------------------------------------------------------------------+
| 2. EDGE COMPUTING LAYER (Raspberry Pi Zero 2 W / Pi 4 @ Ward Counter)              |
|  ┌─────────────────────────────────────────────────────────────────────────────┐  |
|  │  Serial Data Listener (worker/nurse_call_serial_listener.py)                │  |
|  └──────────────────────────────────────┬──────────────────────────────────────┘  |
|                                         │                                         |
|  ┌──────────────────────────────────────▼──────────────────────────────────────┐  |
|  │  Edge AI Engine (Emergency Classification & SLA Tracking)                   │  |
|  └──────────────────────────────────────┬──────────────────────────────────────┘  |
|                                         │                                         |
|  ┌──────────────────────────────────────▼──────────────────────────────────────┐  |
|  │  Local Event Queue & SQLite Fallback (กรณี Internet หลุด)                   │  |
|  └──────────────────────────────────────┬──────────────────────────────────────┘  |
+-----------------------------------------------------------------------------------+
                                          │
                                          │ MQTT / HTTPS (Cloudflare Tunnel TLS 1.3)
                                          ▼
+-----------------------------------------------------------------------------------+
| 3. CLOUD & ANALYTICS LAYER (Google Cloud Platform)                                |
|                                                                                   |
|    [ GCP Pub/Sub ] ──> [ Cloud Functions ] ──> [ BigQuery ] ──> [ Looker Studio ] |
|    (Message Ingest)     (Data Processing)     (Data Lake)      (Dashboard/KPI)    |
|                                │                                                  |
|                                ▼                                                  |
|                        [ GCP Vertex AI ] (สำหรับ Retrain โมเดลขนาดใหญ่)           |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| 4. NOTIFICATION & PRESENTATION LAYER                                             |
|  • LINE Messaging API / LIFF (`liff.nithep.com` - สแกน QR / รับแจ้งเตือน)         |
|  • Nurse Station Web Dashboard (`nursecall.nithep.com` - แสดงผล Real-time)         |
|  • Google Workspace (Chat Webhooks & Sheets Audit Log)                            |
|  • PBX Escalation Voice Call (โทรแจ้งหัวหน้ากะอัตโนมัติเมื่อเกินเวลา SLA)             |
+-----------------------------------------------------------------------------------+
```

---

## 🗓️ 3. แผนการดำเนินงานและลำดับขั้นตอนจนจบโครงการ (Execution Roadmap)

### 🔹 Phase 1: การวางแผนและการออกแบบสถาปัตยกรรม (Architecture & Design) — ✅ Completed
- [x] วิเคราะห์โจทย์และข้อกำหนดฮาร์ดแวร์ Phonik DX Series (DX-32C/80C/144C)
- [x] ออกแบบสถาปัตยกรรม Hybrid Cloud-Native Edge (PBX + Pi + GCP)
- [x] กำหนดโครงสร้างโดเมน `nithep.com` และวางระบบรักษาความปลอดภัยข้ามเครือข่ายด้วย Cloudflare Tunnel

### 🔹 Phase 2: การพัฒนาส่วนประมวลผลปลายทาง (Edge Computing Layer) — ✅ Completed
- [x] **Serial Data Listener (`worker/nurse_call_serial_listener.py`)**: พัฒนาตัวดักจับสัญญาณ RS-232 ถอดรหัส ASCII Frames (`CALL0101=BED1`, `EMG0202=BATH`, `CARDIAC0305=BED2`, `CANCEL0101=BED1`)
- [x] **Edge AI Engine & Emergency Classifier**: แบ่งระดับความฉุกเฉินและกำหนดค่า SLA:
  - `Level 0 (CANCEL)`: ยกเลิกการเรียก
  - `Level 1 (NORMAL_CALL)`: เรียกทั่วไปข้างเตียง (NCX-CORD) — SLA 180 วินาที
  - `Level 2 (BATHROOM_PULL)`: ฉุกเฉินในห้องน้ำ (NCX-PULL) — SLA 60 วินาที
  - `Level 3 (CARDIAC_CODE)`: ฉุกเฉินวิกฤต Code Blue — SLA 30 วินาที
- [x] **Offline Local Fallback**: บันทึก Nurse Call Event ลง SQLite (`nurse_call_events.db`) บน Raspberry Pi ทันที รับประกันข้อมูลไม่สูญหายเมื่ออินเทอร์เน็ตล่ม
- [x] **Background Cloud Sync Worker**: พัฒนาสคริปต์พื้นหลังคอยส่งข้อมูลใน SQLite ขึ้น GCP Pub/Sub เมื่อระบบกลับมาออนไลน์

### 🔹 Phase 3: การเชื่อมต่อ Cloud, Analytics & Notification — ✅ Completed
- [x] **Cloud Ingestion & Data Lake**: เชื่อมต่อ GCP Pub/Sub ➔ Cloud Functions ──> BigQuery สำหรับวิเคราะห์ประวัติและจัดทำรายงาน KPI ผ่าน Looker Studio
- [x] **Google Workspace & LINE Integration**: ยิงการ์ดแจ้งเตือนสถานะการเรียกเข้า Google Chat และ LINE LIFF (`liff.nithep.com`) พร้อมลงบันทึก Audit Log ใน Google Sheets
- [x] **Network Security**: ตั้งค่า Cloudflare Tunnel เชื่อมต่อ HTTPS (TLS 1.3) ไปยัง `nursecall.nithep.com` โดยไม่ต้องเปิดพอร์ตเราเตอร์โรงพยาบาล

### 🔹 Phase 4: การทดสอบ End-to-End & Software-in-the-Loop Validation — ✅ Completed
- [x] รันการทดสอบจำลอง (Mock Listener & Event Pipeline) บนสภาพแวดล้อม Windows / Raspberry Pi ผ่านเกณฑ์ 100%
- [x] ทดสอบการสลับสถานะ Online/Offline และการซิงค์ข้อมูลย้อนหลัง (Data Re-synchronization) สำเร็จ
- [x] บันทึกประวัติและอัปเดตความก้าวหน้าลงระบบคลังความรู้ `docs/wiki/project_timeline.md`

### 🔹 Phase 5: การลงพื้นที่จริงและส่งมอบงาน (Field Deployment & Handover) — 🟢 Ready to Execute
- [ ] **การติดตั้งอุปกรณ์หน้างาน (On-site Installation)**:
  1. ต่อสาย RS-232 จากตู้ Phonik Main Control เข้ากับ Raspberry Pi @ เคาน์เตอร์พยาบาล
  2. เสียบสาย LAN / เชื่อมต่อ Wi-Fi ให้ Pi ออกอินเทอร์เน็ตเพื่อสร้าง Cloudflare Tunnel
- [ ] **การทำ UAT (User Acceptance Test)**:
  1. ทดลองกดปุ่ม NCX-CORD ข้างเตียง ➔ ตรวจสอบว่า Nurse Station Dashboard (`nursecall.nithep.com`) และ LINE แจ้งเตือนขึ้นทันที
  2. ทดลองกดปุ่ม NCX-PULL ในห้องน้ำ ➔ ตรวจสอบว่าเกิดเคส High Priority และนับถอยหลัง SLA 60 วินาที
  3. ทดลองกดถอดสายเน็ต ➔ ตรวจสอบว่าระบบเคาน์เตอร์พยาบาลยังเตือนได้ และเมื่อเสียบสายกลับ ข้อมูลจะซิงค์ขึ้น GCP/Google Sheets
- [ ] **การฝึกอบรมทีมงาน (Knowledge Transfer)**:
  1. ส่งมอบคู่มือการใช้งานและการบำรุงรักษาแก่วิศวกรและทีมพยาบาลโรงพยาบาลราชเวช

---

## 🛠️ 4. สรุปรายการทรัพยากรและลิงก์ระบบ (System Resource Inventory)

| ส่วนประกอบ | รายละเอียดการตั้งค่า / ลิงก์ | สภาพแวดล้อม |
| :--- | :--- | :--- |
| **Nurse Station Dashboard** | `https://nursecall.nithep.com` | Web UI (React/Vite) |
| **Nurse Call API** | `https://api-nurse.nithep.com` | Backend Server (Node.js/Express) |
| **LINE LIFF App** | `https://liff.nithep.com` | LINE MINI App / Mobile UI |
| **Edge Listener Code** | `worker/nurse_call_serial_listener.py` | Python 3 (Raspberry Pi OS) |
| **Local Database** | `nurse_call_events.db` (SQLite) | Local Pi Storage |
| **Cloud Analytics** | GCP Pub/Sub ➔ BigQuery ➔ Looker Studio | Google Cloud Platform |
| **Audit Log & Chat** | Google Sheets & Google Chat Webhooks | Google Workspace |
| **Domain Provider** | Squarespace DNS (CNAME pointing to Cloudflare) | `nithep.com` |

---

## 🟢 Conclusion: ความพร้อมในการดำเนินงาน
ระบบ **Smart Nurse Call & Predictive Analytics Architecture** สำหรับโรงพยาบาลราชเวช ถูกออกแบบ วางโครงสร้าง พัฒนาโค้ด และทดสอบระบบปิดลูปเสร็จสิ้นเรียบร้อยแล้ว **พร้อมสำหรับการนำไปติดตั้งและเปิดใช้งานจริงภาคสนามทันที** ครับ!
