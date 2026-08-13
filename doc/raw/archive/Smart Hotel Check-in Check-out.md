---
type: raw-capture
title: Smart Hotel Check-in Check-out
source: "{{url}}"
author:
published:
created: 2026-07-08T04:49
description:
status: inbox
tags:
  - capture
---
# 🏨 เอกสารการออกแบบและเปรียบเทียบระบบ 
# Smart Hotel Check-in Check-out

## Summary
- **One-line summary**: 

---

## 📝 Captured Content



เอกสารฉบับนี้ออกแบบขึ้นเพื่อจำลองสถานการณ์การทำ **Self Check-in และ Check-out ด้วย QR Code** เพื่อควบคุมระบบไฟฟ้าของห้องพัก โดยเชื่อมต่อผ่านบอร์ดควบคุม **Phonik ECS-103R V.5** และตู้สาขา **Phonik PBX** บนระบบ **Raspberry Pi 4**

ทางผู้พัฒนาได้นำเสนอ **3 แบบจำลอง (Models)** เพื่อประกอบการตัดสินใจในการเลือกระบบที่เหมาะสมที่สุดสำหรับโครงการของคุณ

---

## 🗂️ การเปรียบเทียบ 3 แบบจำลอง (Model Comparison)

เราได้แบ่งรูปแบบการจำลองการทำงานออกเป็น 3 โมเดลหลัก ดังนี้:

### 1️⃣ Model A: LINE LIFF Guest-Centric (สแกนคิวอาร์โค้ดทางฝั่งลูกค้า)
> [!NOTE]
> เน้นประสบการณ์ของลูกค้าโดยตรง (Customer Experience) ลูกค้าสแกน QR Code หน้าห้องเพื่อทำรายการบนสมาร์ทโฟนของตัวเอง

* **แนวคิดการทำงาน**: 
  1. ลูกค้าเดินไปที่หน้าห้องพัก (เช่น ห้อง 205) และสแกน QR Code ที่ติดอยู่หน้าประตู
  2. โทรศัพท์จะเปิดหน้าเว็บ **LINE LIFF app** (ผ่านหน้า [GuestView.tsx](file:///C:/Users/Nithep/Hotel-ECS/frontend/src/pages/GuestView.tsx))
  3. ระบบดึงชื่อโปรไฟล์ LINE มาแสดงอัตโนมัติ ลูกค้ากดปุ่ม **"Check-in เข้าห้องพัก"**
  4. Backend ส่งคำสั่ง `ROOM_ON` ไปที่ตู้สาขา PBX เพื่อเปิดรีเลย์ของห้องนั้น
  5. ระบบไฟในห้องพักพร้อมใช้งาน ลูกค้าเดินเข้าห้องแล้วเสียบคีย์การ์ด ไฟสว่างทันที
  6. เมื่อต้องการเช็คเอาท์ ลูกค้าเปิดหน้าเดิมแล้วกด **"Check-out"** -> ระบบตัดไฟรีเลย์ทันที

![หน้าต่างการทำรายการของลูกค้าผ่าน LINE LIFF (Model A)](C:/Users/Nithep/.gemini/antigravity/brain/9b8bafbf-344b-4b2f-82dd-f69606a0c58c/model_a_qr_scan_checkin_1783460121651.png)

---

### 2️⃣ Model B: Staff & Kiosk Simulator (ระบบจำลองโฟลว์แบบขั้นตอน)
> [!NOTE]
> เหมาะสำหรับการทดสอบภายใน (Internal Testing) หรือการทำ Kiosk ส่วนกลางที่ต้อนรับลูกค้า เพื่อตรวจสอบการทำงานของ Flow แบบ Step-by-Step

* **แนวคิดการทำงาน**:
  1. ใช้หน้าเว็บจำลองขั้นตอน (เช่น หน้า [Scan.tsx](file:///C:/Users/Nithep/Hotel-ECS/frontend/src/pages/Scan.tsx))
  2. มีหน้าจอจำลองการสแกน QR Code และแสดงสถานะกำลังประมวลผล (Scanning Animation) พร้อมสัญญาณไฟวิ่ง
  3. บันทึกและทดสอบ Flow ระบบนิรภัย (Safety Pipeline) เช่น การจำกัดความถี่การส่งคำสั่ง (Rate Limiter) และระบบส่งไปอนุมัติที่ Telegram (Approval Gate) เมื่อทำรายการนอกเวลา

![ผังการทำงานของขั้นตอนจำลอง (Model B)](C:/Users/Nithep/.gemini/antigravity/brain/9b8bafbf-344b-4b2f-82dd-f69606a0c58c/model_b_flow_diagram_1783460131675.png)

---

### 3️⃣ Model C: Full IoT Digital Twin (การเชื่อมโยงระบบเครือข่ายและฮาร์ดแวร์จริง)
> [!NOTE]
> เน้นโครงสร้างทางวิศวกรรม (Engineering & Hardware Architecture) แสดงการไหลของข้อมูลจากโทรศัพท์มือถือ -> คลาวด์ -> Pi 4 -> ตู้สาขา PBX -> บอร์ดรีเลย์ในห้องพัก

* **แนวคิดการทำงาน**:
  1. เน้นการจำลองและการเชื่อมต่อกับฮาร์ดแวร์จริงผ่านพอร์ต พอร์ต LAN ของPBX หรือ TCP Socket
  2. Backend บน Raspberry Pi ทำการ Sync สถานะระหว่างฐานข้อมูล SQLite และตู้สาขา PBX เสมอ (State Synchronization)
  3. เหมาะสำหรับการนำเสนอภาพรวมของสถาปัตยกรรมระบบเชื่อมต่อฮาร์ดแวร์ให้เห็นภาพรวมขององค์ประกอบในห้องพัก

![แผนภาพสถาปัตยกรรมการเชื่อมต่อของระบบ (Model C)](C:/Users/Nithep/.gemini/antigravity/brain/9b8bafbf-344b-4b2f-82dd-f69606a0c58c/model_c_architecture_1783460141426.png)

---

## 📊 ตารางเปรียบเทียบคุณสมบัติ (Comparison Table)

| คุณสมบัติ | Model A (LINE LIFF) | Model B (Kiosk/Scan Simulator) | Model C (Full IoT Integration) |
| :--- | :--- | :--- | :--- |
| **กลุ่มเป้าหมายผู้ใช้งาน** | ลูกค้าของโรงแรม (Guest) | พนักงานต้อนรับ / ใช้ทดสอบระบบ | นักพัฒนาฮาร์ดแวร์ / ผู้ตรวจสอบระบบ |
| **เทคโนโลยีหลัก** | React, LINE LIFF SDK, REST API | React (Framer Motion UI) | Node.js PBX-Connector, SQLite, Serial |
| **ความยุ่งยากในการติดตั้ง** | ปานกลาง (ต้องลงทะเบียน LINE Developer) | ต่ำ (รันบนเว็บจำลองได้ทันที) | สูง (ต้องตั้งค่าฮาร์ดแวร์จริง/พอร์ตสื่อสาร) |
| **จุดเด่น** | หรูหรา สะดวกสบาย ลูกค้าใช้งานง่าย | เหมาะสำหรับ Demo และทดสอบระบบนิรภัย | เห็นภาพรวมทางวิศวกรรมและการ Sync สถานะ |
| **ความพรีเมียมของ UI** | 🟢 สูงมาก (ดาร์กโหมดสไตล์โรงแรมหรู) | 🟡 ปานกลาง (เน้นโฟลว์การทดสอบ) | 🟡 เน้นการแสดงผล Dashboard เทคโนโลยี |

---

## 🤖 ข้อเสนอแนะในการตัดสินใจจาก Senior Engineer

1. **หากต้องการให้ลูกค้าประทับใจเป็นอันดับแรก (WOW Factor):**
   👉 แนะนำ **Model A (LINE LIFF)** เพราะผู้เข้าพักแค่ใช้สมาร์ทโฟนของตัวเองสแกน QR Code หน้าห้อง ไม่ต้องดาวน์โหลดแอปเพิ่ม สามารถระบุตัวตนและเช็คอินเพื่อเปิดไฟในห้องได้ทันที 
2. **หากต้องการระบบสำหรับแสดงผลความปลอดภัยและทดสอบภายใน:**
   👉 แนะนำ **Model B (Scan Simulator)** เนื่องจากช่วยให้เห็นจังหวะการสแกนและการแจ้งเตือนระบบ Safety ได้ดีที่สุด
3. **หากต้องการเตรียมความพร้อมของอุปกรณ์ฮาร์ดแวร์:**
   👉 แนะนำ **Model C (Full IoT)** เพื่อใช้สถาปัตยกรรมนี้ในการทดสอบสัญญาณส่งออก (Command Relay Pulse) ไปยังบอร์ด ECS-103R

> [!TIP]
> **ระบบปัจจุบันของคุณรองรับทั้ง 3 รูปแบบแล้ว!** โดยไฟล์ [GuestView.tsx](file:///C:/Users/Nithep/Hotel-ECS/frontend/src/pages/GuestView.tsx) ถูกออกแบบมารองรับ Model A, ไฟล์ [Scan.tsx](file:///C:/Users/Nithep/Hotel-ECS/frontend/src/pages/Scan.tsx) รองรับ Model B และตัว Backend [server.js](file:///C:/Users/Nithep/Hotel-ECS/backend/server.js) + [pbx-connector](file:///C:/Users/Nithep/Hotel-ECS/pbx-connector) รองรับ Model C 

โปรดตรวจสอบรายงานและรูปภาพด้านบน และระบุว่าต้องการให้ผมพัฒนาหรือปรับปรุงส่วนใดเพิ่มเติมเป็นพิเศษครับ!
