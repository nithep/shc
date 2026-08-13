# แผนการสร้าง Guest Simulation Loop Agent (จำลองการทดสอบเสมือนจริง)

การสร้าง "Loop Agent" เพื่อจำลองพฤติกรรมผู้เข้าพัก (Guest) เป็นไอเดียที่ยอดเยี่ยมมากครับ! สิ่งนี้จะช่วยให้เราทำ **Stress Test** และ **Progress Monitoring (PM)** เพื่อดูความเสถียรของระบบ (Frontend -> Backend -> PBX) เมื่อมีการใช้งานจริงได้อย่างชัดเจน

## 🎯 เป้าหมาย (Goal)
สร้างสคริปต์อัตโนมัติ (Simulation Agent) ที่ทำตัวเป็น "แขกจำลอง" วนลูปทำรายการ Check-in และ Check-out พร้อมสรุปผลการทำงาน (PM) ในแต่ละขั้นตอนอย่างละเอียด

## ❓ Open Questions
> [!WARNING]
> 1. **ความหมายของ "PM":** ในบริบทนี้ คุณหมายถึง Progress Monitoring (การมอนิเตอร์สถานะทีละสเตป) หรือ Preventive Maintenance (การเก็บล็อกเพื่อวิเคราะห์ความเสื่อม/ข้อผิดพลาดของตู้ PBX) ครับ? (ในแผนนี้ผมจะเน้นไปที่ Progress & Performance Monitoring ก่อน)
> 2. **รูปแบบของ Agent:** คุณต้องการให้ Agent ตัวนี้รันเป็นสคริปต์ Node.js ในเครื่องเซิร์ฟเวอร์ที่วนลูปพิมพ์ Log สวยๆ บน Terminal หรือต้องการให้แสดงผลเป็นหน้า Dashboard UI บนเว็บครับ? (เบื้องต้นผมเสนอเป็น CLI Script ที่อ่านง่าย)

## 📋 Proposed Changes

---

### Backend / Simulation Script

เราจะสร้างโฟลเดอร์ใหม่สำหรับเครื่องมือจำลองระบบโดยเฉพาะ เพื่อไม่ให้ปนกับโค้ดหลัก

#### [NEW] `backend/scripts/loop_agent.js`
สคริปต์นี้จะทำหน้าที่เป็นบอทจำลองแขก โดยมีพฤติกรรมดังนี้:
1. **[Step 1]** สุ่มเลือกห้องพัก (เช่น 101, 102) และสร้างชื่อแขกจำลอง
2. **[Step 2]** ยิง API `POST /api/checkin` ไปที่ Backend
3. **[Step 3]** จับเวลา Response Time และอ่านสถานะที่ตอบกลับจาก PBX
4. **[Step 4]** หน่วงเวลา (Delay) สมมติว่าแขกกำลังพักผ่อนในห้อง (เช่น 10-15 วินาที สำหรับการทดสอบ)
5. **[Step 5]** ยิง API `POST /api/checkout` เพื่อตัดไฟ
6. **[Step 6]** สรุปผล PM (Progress Monitoring) ออกมาเป็นตารางหรือ Log ที่อ่านง่าย เช่น
   - ความเร็วในการตอบสนอง (Latency)
   - อัตราความสำเร็จ (Success Rate)
   - ปัญหาที่พบ (ถ้ามี)
7. วนลูปไปทำห้องต่อไปเรื่อยๆ หรือทำพร้อมๆ กันหลายห้อง (Concurrency) เพื่อจำลองโหลดช่วง High Season

#### [MODIFY] `backend/package.json`
- เพิ่มคำสั่ง `npm run simulate` เพื่อเรียกใช้งาน Loop Agent ได้ง่ายๆ

---

## 🔬 Verification Plan

### Automated Tests
- Loop Agent ตัวนี้เองจะทำหน้าที่เป็น Automated Test (End-to-End Test) ในตัว โดยจะเก็บสถิติและรายงานผลว่ามี Request ไหนที่ตาย หรือ PBX ไม่ตอบสนองบ้าง

### Manual Verification
- รันคำสั่ง `npm run simulate` บน Terminal
- นั่งดู Log ที่ค่อยๆ ปรากฏขึ้นมาทีละ Step (สีสันชัดเจน แบ่งเป็น Check-in, Waiting, Check-out, Summary)
- สังเกตหน้าจอของ PBX Simulator (ถ้าเปิดอยู่) ว่ามีการทำงานสอดคล้องกันหรือไม่
