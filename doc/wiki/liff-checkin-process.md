---
title: สรุปกระบวนการทำงาน LINE LIFF Smart Check-in
date: 2026-07-07
status: evergreen
---

# 🏨 สรุปกระบวนการทำงาน LINE LIFF Smart Check-in (Phase 5)

เอกสารนี้อธิบายการทำงานของระบบ Self Check-in ด้วย LINE LIFF ซึ่งเชื่อมต่อระหว่างผู้เข้าพัก (Guest) กับฮาร์ดแวร์ตู้สาขา (PBX) ในห้องพัก

## 🔄 ภาพรวมกระบวนการทำงาน (End-to-End Process)

กระบวนการทั้งหมดเกิดขึ้นภายในไม่กี่วินาที โดยมีลำดับขั้นตอนดังนี้:

1. **สแกน QR Code (Scan)**
   - แขกนำโทรศัพท์มือถือสแกน QR Code ประจำห้องพัก (เช่น `https://liff.line.me/2010634930-gRJCLqbu?room=101`)
   - แอป LINE จะเปิดหน้าต่างเว็บ (LIFF Browser) ภายในแอปทันที โดยไม่ต้องโหลดแอปใหม่

2. **ยืนยันตัวตนอัตโนมัติ (Auto-Authentication)**
   - Frontend (React) ทำการเรียกคำสั่ง `liff.init()`
   - ระบบของ LINE จะส่งข้อมูลโปรไฟล์ (ชื่อ, รูปภาพ, User ID) มาให้ Frontend โดยที่แขก **ไม่ต้องสมัครสมาชิกหรือกรอกรหัสผ่านใดๆ** 

3. **แสดงหน้าจอควบคุม (Smart Key UI)**
   - Frontend นำชื่อและรูปภาพมาแสดงผล พร้อมดึงหมายเลขห้องจาก URL (`?room=101`) มาโชว์บนหน้าจอ
   - แขกจะเห็นปุ่ม "Check-in เข้าห้องพัก"

4. **ส่งคำสั่งเข้าเซิร์ฟเวอร์ (API Request)**
   - เมื่อแขกกดปุ่ม **Check-in** Frontend จะยิง API `POST /api/checkin` ไปยัง Backend (Node.js) 
   - แนบข้อมูลหมายเลขห้อง (`roomNumber`) และชื่อแขก (`guestName`) ไปด้วย

5. **ฮาร์ดแวร์ทำงาน (Hardware Execution)**
   - Backend รับคำสั่งผ่านระบบความปลอดภัย (Approval Gate / Rate Limiter)
   - หากผ่าน Backend จะส่งคำสั่งต่อไปที่สคริปต์ **PBX Connector**
   - PBX Connector สื่อสารผ่าน TCP/Serial ไปที่ตู้สาขา Phonik
   - ตู้สาขาส่งสัญญาณปลดล็อกรีเลย์ไฟฟ้าในห้องพักให้ทำงาน (ON)

6. **เสร็จสิ้น (Success & Physical Action)**
   - Frontend ได้รับสถานะว่าสำเร็จ จึงแสดงข้อความสีเขียว "ดำเนินการสำเร็จ ไฟห้องพักพร้อมใช้งานแล้ว"
   - แขกสามารถเดินเข้าห้องพัก เสียบคีย์การ์ด และระบบไฟฟ้าในห้องจะทำงานทันที

---

## 🛠️ บันทึกการตั้งค่าระบบ (System Configuration Record)

เพื่อให้ระบบ LIFF ทำงานได้ สมบูรณ์ ต้องมีการตั้งค่า 3 ส่วนหลัก:

### 1. ฝั่ง LINE Developers Console
- **Provider**: `Hotel ECS`
- **Channel**: `LINE Login` (Web App)
- **LIFF App**: `Smart Key` 
- **Endpoint URL**: เป็น URL ของ Frontend (ตอนทดสอบใช้ ngrok เช่น `https://uncapering-aubrey-verbally.ngrok-free.dev/guest`)
- **Scopes**: เปิดใช้งาน `openid` และ `profile` เพื่อดึงข้อมูลแขก

### 2. ฝั่ง Frontend (Vite/React)
- ติดตั้งแพ็กเกจ `@line/liff`
- ใส่ค่า `VITE_LIFF_ID` ในไฟล์ `.env` เพื่อให้ Frontend รู้ว่าจะต้องคุยกับ LIFF App ตัวไหน
- สร้างหน้าคอมโพเนนต์ `GuestView.tsx` สำหรับเป็น UI รับรองแขก

### 3. ฝั่ง Network (สำหรับทดสอบ)
- จำเป็นต้องรัน **ngrok** (`npx ngrok http 5173`) เพื่อสร้าง HTTPS URL แบบ Public ให้ LINE สามารถเรียกเข้าถึง Localhost ของเราได้

---
*บันทึกเมื่อ: จบการทำงาน Phase 5 (Step 1)*
