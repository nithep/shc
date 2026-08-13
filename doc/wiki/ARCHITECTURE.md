# สถาปัตยกรรมระบบ (Architecture)

**Hotel ECS (Smart Hotel Self Check-in/Check-out)** เป็นระบบจัดการห้องพักโรงแรมสมัยใหม่ที่ผสานระหว่าง Web Application และ Hardware Control เข้าด้วยกัน โดยมุ่งเน้นความน่าเชื่อถือ (Reliability) ความปลอดภัย (Security) และประสบการณ์ผู้ใช้ที่ยอดเยี่ยม (Premium UX)

---

## 🏗️ 1. โครงสร้างฮาร์ดแวร์ (Hardware Topology)

ระบบมีจุดศูนย์กลางอยู่ที่ตู้สาขาโทรศัพท์ (PBX) ซึ่งทำหน้าที่เป็นสะพานเชื่อมระหว่างเซิร์ฟเวอร์กับห้องพัก

1. **Raspberry Pi 4 (Server):** 
   - ทำหน้าที่รัน Web Server, Database, และ PBX Connector
   - เชื่อมต่อเครือข่ายภายในผ่านพอร์ต Ethernet
2. **Phonik PBX (ECS-103R V.5):** 
   - ตู้สาขารองรับการสั่งการแบบ Digital CCH2 Protocol
   - เชื่อมต่อกับ Raspberry Pi ผ่านวง LAN เดียวกัน (TCP/IP) หรือ Serial Port
3. **Room Relay Board (ในห้องพัก):**
   - รับคำสั่งจาก PBX ไปเปิด/ปิดรีเลย์ไฟฟ้า 220V 
   - ระบบไฟห้องจะพร้อมทำงาน (Standby) เมื่อมีคำสั่ง ON จากระบบ

---

## 💻 2. โครงสร้างซอฟต์แวร์ (Software Architecture)

ระบบแบ่งออกเป็น 3 ส่วนหลัก (3-Tier Architecture) เพื่อความยืดหยุ่นในการขยายและดูแลรักษา:

### A. Frontend (React + Vite + Tailwind/Custom CSS)
- **Dashboard:** อินเทอร์เฟซสำหรับพนักงาน (Admin/Staff) ในการตรวจสอบสถานะห้องพัก
- **Self Check-in:** หน้าเว็บสำหรับผู้เข้าพัก สแกน QR Code เพื่อทำรายการด้วยตนเอง
- **Premium Design:** เน้น UI ที่ดูทันสมัย, Micro-animations, และ Dark Mode

### B. Backend (Node.js + Express)
- **API Server:** ให้บริการ RESTful API แด่ Frontend
- **Database (SQLite/JSON):** จัดเก็บข้อมูลห้องพัก, ประวัติการเข้าพัก, และ Audit Log
- **Authentication:** ระบบป้องกัน Endpoint ด้วย JWT 
- **Business Logic & PDPA:** จัดการเรื่องระยะเวลาการจัดเก็บข้อมูล และเงื่อนไข Consent

### C. PBX Connector (Node.js/Python)
- **Protocol Translator:** รับคำสั่ง JSON จาก Backend แปลงเป็นฐานข้อมูลระดับไบต์ (Byte/Hex) ตามมาตรฐาน Phonik CCH2 
- **Connection Manager:** ควบคุม TCP Socket, จัดการ Auto-Reconnect เมื่อสัญญาณหลุด
- **State Verifier:** ตรวจสอบความถูกต้องของสถานะ (ACK/NACK) ก่อนส่งกลับให้ Backend

---

## 🔄 3. การไหลของข้อมูล (Data Flow Workflow)

### Flow 1: การเช็คอิน (Self Check-in)
1. **Guest (Frontend)** กรอกข้อมูล, ยืนยัน PDPA Consent และกด "Check-in"
2. **Backend** บันทึกสถานะห้องลง Database ว่า `occupied` และบันทึก Audit Log
3. **Backend** ส่งคำสั่ง `ROOM_ON` ไปที่ **PBX Connector**
4. **PBX Connector** สื่อสารกับ **Phonik PBX** ด้วย CCH2 Protocol
5. **Phonik PBX** สั่งเปิดไฟเข้า **Room Relay**
6. **Backend** ส่งผลลัพธ์ (Success) คืนกลับไปยัง **Frontend**

### Flow 2: การเชื่อมต่อภายนอก (External Network / Cloudflare Tunnel)
เพื่อแก้ปัญหา Dynamic IP บนเครือข่ายโรงแรม และหลีกเลี่ยงการทำ Port Forwarding ที่ไม่ปลอดภัย
- ใช้ **Cloudflare Tunnel (cloudflared)** ฝังไว้ใน Raspberry Pi
- Map Domain Name (เช่น `hotel.example.com`) พุ่งตรงมาที่ `localhost:3000` 
- ให้บริการ HTTP/WSS ที่ปลอดภัย (HTTPS/SSL) อย่างอัตโนมัติ

---

## 🛡️ 4. ข้อพิจารณาด้านความปลอดภัยและความทนทาน (Safety & Reliability)

- **Graceful Degradation:** หาก PBX Connector ล่ม หน้า Web ยังต้องทำงานได้ (แต่ขึ้นสถานะ Hardware Offline)
- **Data Anonymization:** มี Background Worker คอยตรวจสอบข้อมูล Check-out ที่เกิน 90 วัน เพื่อซ่อนข้อมูล PII ของลูกค้า
- **Safety Gate:** ทุกคำสั่งที่เปลี่ยนสถานะฮาร์ดแวร์ ต้องผ่านระบบ State Verifier เพื่อป้องกัน Race Conditions
