---
description: แผนงาน (Master Plan) และกรอบเวลาในการพัฒนาระบบ Hotel ECS Digital Twin จำลองตู้สาขา Phonik PBX
tags:
  - project
  - hotel-ecs
  - architecture
  - raspberry-pi
---

# Hotel ECS Digital Twin (Master Plan)

## Summary
- **One-line summary**: แผนงานและ Timeline สำหรับโครงการ Hotel ECS Digital Twin ที่บูรณาการ Frontend เข้ากับ Backend และตู้สาขา (PBX)
- **Why save this**: เพื่อใช้ติดตามความคืบหน้าของโครงการ (Project Tracking) และเป็นเอกสารอ้างอิงสำหรับการพัฒนา Phase 2 (Backend & Mock PBX)

---

## 🗺️ Master Plan & Timeline: Hotel ECS Digital Twin

แผนงานฉบับนี้คือภาพรวม (Overview) และกรอบเวลา (Timeline) ในการบูรณาการระบบทั้งหมดเข้าด้วยกัน ตั้งแต่ซอฟต์แวร์หน้าเว็บ ไปจนถึงการจำลองฮาร์ดแวร์เพื่อสร้าง Sandbox สำหรับนำเสนอครับ

### 🎯 เป้าหมายหลัก
สร้าง **Digital Twin (ระบบคู่ขนานเสมือนจริง)** ที่สามารถแสดงการทำงานของ Hotel Check-in ตั้งแต่ลูกค้ากดมือถือ จนถึงระบบจำลองการเปิด/ปิดไฟ โดยไม่ต้องใช้ฮาร์ดแวร์จริงในขั้นตอนการนำเสนอ

---

## 📅 Timeline & Phases (แผนการดำเนินงาน)

### Phase 1: Frontend UI (✅ ปัจจุบัน)
* **สถานะ:** เสร็จสิ้นแล้ว
* **สิ่งที่ทำไปแล้ว:** ระบบหน้าจอ Dashboard (สำหรับพนักงาน) และหน้าจอ Scan (สำหรับลูกค้า) 
* **ระยะเวลา:** 0 วัน (พร้อมใช้งาน)

### Phase 2: Backend API & Mock PBX (Digital Twin) 
* **สถานะ:** รอการอนุมัติ (Next Step)
* **สิ่งที่จะทำ:** 
  1. สร้าง Backend API (Node.js/Python) เพื่อรับ Request จากหน้าเว็บ Frontend
  2. สร้าง **Mock PBX (ตู้สาขาเสมือน)** ที่จำลองตัวตัวเองเป็นตู้ Phonik ECS โดยจะแสดง Log ผ่านหน้าจอ Terminal แทนการจ่ายไฟจริง
* **ผลลัพธ์:** เมื่อกด Check-in บนเว็บ จะเห็นข้อความเด้ง in Terminal ว่า `💡 ROOM 101 POWER: ON`
* **ระยะเวลา:** 1-2 วัน

### Phase 3: End-to-End Integration (การเชื่อมระบบ Sandbox)
* **สถานะ:** รอคิว
* **สิ่งที่จะทำ:** นำ Frontend (Phase 1) มาเชื่อมต่อกับ Backend (Phase 2) ให้สมบูรณ์ จัดการเรื่อง State ของห้องพักให้เปลี่ยนสีอัตโนมัติบน Dashboard 
* **ผลลัพธ์:** ระบบ Sandbox พร้อมสำหรับการถ่ายทำวิดีโอนำเสนอ 100%
* **ระยะเวลา:** 1 วัน

### Phase 4: Media & Manual Production (การทำสื่อนำเสนอ)
* **สถานะ:** รอคิว
* **สิ่งที่จะทำ:** 
  1. จัดหน้าจอแบบ Split-screen (Mobile + Dashboard + Terminal) เพื่ออัดคลิปโชว์การทำงาน
  2. ให้ AI (Librarian) รวบรวมข้อมูลทั้งหมดทำเป็นคู่มือ (Automated Manual) แจกจ่าย
* **ระยะเวลา:** 1 วัน

### Phase 5: Production Deployment (ลุยของจริง)
* **สถานะ:** อนาคต (หลังจากผู้บริหาร/ลูกค้า อนุมัติจาก Sandbox)
* **สิ่งที่จะทำ:** นำโค้ดทั้งหมดไปรันบน Raspberry Pi 4 และเชื่อมต่อสาย LAN เข้ากับตู้ Phonik PBX ตัวจริง
* **ระยะเวลา:** ขึ้นอยู่กับการลงพื้นที่หน้างาน
