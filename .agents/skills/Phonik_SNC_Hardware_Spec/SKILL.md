---
name: Phonik_SNC_Hardware_Spec
description: สเปกฮาร์ดแวร์ ยุทธศาสตร์สถาปัตยกรรม และโปรโตคอลการทำงานของระบบ Smart Nurse Call (SNC) ร่วมกับตู้ Phonik Help Call (Main Control DX-32C/80C/144C และ Call Station v.107)
---

# ทักษะ Smart Nurse Call (SNC) — Hardware Spec, Network Architecture & Protocol

ทักษะนี้เก็บบันทึกข้อมูลความรู้และยุทธศาสตร์ทั้งหมดของ **ระบบ Smart Nurse Call (SNC)** สำหรับโรงพยาบาลและศูนย์ดูแลผู้ป่วยแบบเฉพาะเจาะจง (Dedicated SNC Memory)

---

## 🏥 1. โครงสร้างซอฟต์แวร์และยุทธศาสตร์อธิปไตย (SNC Software & Sovereignty Strategy)

1. **โครงสร้างสถาปัตยกรรมแยกเดี่ยว (`snc-poc/`)**:
   * **`snc-poc/pbx-connector/snc_pbx_listener.py`**: ดักจับ Real-time SMDR Log (`==SMDX...`) ผ่าน TCP Telnet (`192.168.1.91:23`) และสกัดเบอร์ห้อง/ประเภท Event แปลงเป็นมาตรฐาน **HL7 FHIR JSON Standard** ตั้งแต่ต้นทาง
   * **`snc-poc/backend/server.py`**: FastAPI + WebSocket + SQLite (`nurse_call_events.db`) กระจายสัญญาณ Alert Real-time และคำนวณ Response Time / SLA Level 1-3
   * **`snc-poc/frontend/index.html`**: Nurse Station Monitor Dashboard (Dark Mode พรีเมียม, Dynamic Status Grid: เขียว=ปกติ, แดงกะพริบ=ฉุกเฉิน, เหลือง=รับเรื่องแล้ว พร้อมเสียง Audio Alert Siren)

2. **เครือข่ายส่วนตัวอธิปไตย (Autonomous Private Network Architecture)**:
   * **Direct Wired Hardware (Micro-USB to Ethernet Adapter)**: บอร์ด Edge Agent (Raspberry Pi Zero 2 W / Pi 4) เชื่อมต่อสาย LAN ตรงเข้าตู้ Phonik PBX (`192.168.1.91:23`) ขจัดปัญหาสัญญาณ Wi-Fi รบกวน ได้ Latency < 1ms เสถียรสูงสุด
   * **Zero Corporate IT Dependency**: เชื่อมต่อผ่าน **IoT 4G/5G SIM Modem** และส่งสัญญาณผ่าน **Cloudflare Tunnel (Outbound TCP Stream)** 
   * **Zero Inbound Ports**: ไม่ต้องเปิดพอร์ตขาเข้าบน Router (Inbound Ports = 0) ทะลุผ่าน Private APN / CGNAT ป้องกัน Cyber Attack 100%

---

## ⚙️ 2. โครงสร้างฮาร์ดแวร์ Phonik Help Call (Hardware Specification)

1. **ตู้ควบคุมหลัก (Main Control)**:
   * **รุ่นตู้**: DX-32C (3 Slots), DX-80C (6 Slots), DX-144C (10 Slots)
   * **บอร์ดประมวลผล (DX-CPA)**: 32-bit CPU + DSP + พอร์ต LAN (`192.168.1.91`, Port `23`) / RS-232
   * **แผงขยายสายใน (DX-8ATI)**: 1 แผง คุม 8 พอร์ตเสียง (EXT Port) + 8 พอร์ตข้อมูล (Data Port)

2. **อุปกรณ์ในห้องผู้ป่วย (Room Station / Call Station)**:
   * **NCX-STA (Call Station)**: ติดตั้งข้างเตียง สนทนา 2 ทาง มีปุ่ม `CALL` และ `CLEAR`
   * **NCX-CORD (Bed Side Switch / Call Cord)**: สายกดเรียกข้างเตียง
   * **NCX-PULL (Emergency Pull Switch)**: สวิทช์ดึงฉุกเฉินในห้องน้ำ (ยกเลิกที่จุดเกิดเหตุเท่านั้น)
   * **NCX-LED (Corridor Lamp)**: ไฟสัญญาณเตือนหน้าห้อง
   * **NCX-BUZZER**: เสียงบัซเซอร์เตือน

3. **อุปกรณ์เคาน์เตอร์พยาบาล (Nurse Console)**:
   * **PI-32G / PK-32T (Master Console)**: มี 32 ปุ่มกดพร้อมไฟแสดงสถานะ 2 สี
   * **NCX-M-DSP / NCX-B-DSP (Display)**: จอ LED แสดงเบอร์ห้องและคิวการเรียก

---

## 📡 3. โปรโตคอลข้อมูล Real-time SMDR Log Stream (Port 23 Telnet)

ตู้ Phonik จะส่ง Log บรรทัด `==SMDX...` ออกมาทาง Telnet เมื่อเกิดเหตุการณ์เรียกพยาบาล:

* **รูปแบบ Log Line**:
  ```text
  ==SMDX2005=03/08/26 18:59 401 e.400 EC 0:00'09 0 #1
  ==SMDX2011=03/08/26 19:14 401 e.400 EC 0:00'13 0 #1
  ```

* **Event Codes**:
  * `e.{room_id}` (เช่น `e.400`, `e.401`): สัญญาณเรียกฉุกเฉิน / กดเรียกพยาบาลจากห้องพัก
  * `onM -9` / `onto -1`: พยาบาลยกหูรับสายสนทนา
  * `offM =0` / `offx -0`: วางสาย / เคลียร์สถานะการเรียก (Clear)
