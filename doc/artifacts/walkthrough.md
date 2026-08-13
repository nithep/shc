# Walkthrough: Guest Simulation Loop Agent

## 🎯 สรุปผลการสร้างเครื่องมือทดสอบ (Loop Agent)
เราได้สร้างสคริปต์จำลองการทำงานของแขก (Guest Simulation) ขึ้นมาในรูปแบบ CLI Script บน Node.js เพื่อทดสอบระบบแบบ End-to-End ตั้งแต่ฝั่ง Frontend (ยิง API) -> Backend (Pi4) -> ตู้สาขา (PBX) พร้อมกับแสดง **Process Management (PM)** ในแต่ละสเตปอย่างชัดเจน

## 💻 สิ่งที่สร้างขึ้น
1. **[loop_agent.js](file:///c:/Users/Nithep/%E0%B9%84%E0%B8%94%E0%B8%A3%E0%B8%9F%E0%B9%8C%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%89%E0%B8%B1%E0%B8%99%20%28cnithep@gmail.com%29/Hotel-ECS/backend/scripts/loop_agent.js)**: สคริปต์หลักที่บรรจุตรรกะการสุ่มเลือกห้อง, จำลองชื่อแขก, และหน่วงเวลาเสมือนแขกกำลังพักผ่อนในห้อง
2. **`package.json`**: เพิ่มคำสั่ง `npm run simulate` ในโฟลเดอร์ Backend เพื่อให้รันได้สะดวกขึ้น

## 🔄 ตัวอย่างการทำงาน (Process Management Log)
สคริปต์นี้จะแสดงผลออกมาเป็นสีสันสวยงามและแยกขั้นตอนชัดเจน ดังนี้:

```text
======================================================
🚀 SIMULATION LOOP #1 STARTING...
======================================================

--- 🏨 ทดลองจำลองแขกห้อง: 202 (ชื่อ: Bob) ---
[18:50:14.431] [LINE-WEB] Guest clicked Check-in -> Room: 202
[18:50:14.431] [FRONTEND] Sending API Request -> POST /api/checkin (Guest: Bob)
[18:50:14.443] [BACKEND (Pi4)] Approved & Routed Command -> Response Time: 11ms
[18:50:14.443] [PABX] Hardware Relay -> Status: ON (ไฟห้อง 202 พร้อมใช้งาน)
[18:50:14.443] [GUEST] Staying in room -> Sleeping for 5 seconds...
[18:50:19.445] [LINE-WEB] Guest clicked Check-out -> Room: 202
[18:50:19.445] [FRONTEND] Sending API Request -> POST /api/checkout
[18:50:19.479] [BACKEND (Pi4)] Approved & Routed Command -> Response Time: 33ms
[18:50:19.479] [PABX] Hardware Relay -> Status: OFF (ไฟห้อง 202 ถูกตัด)
```

## 🛠️ วิธีการใช้งาน
สามารถสั่งรันจำลองระบบได้ตลอดเวลาโดย:
1. เปิด Terminal ในโฟลเดอร์ `backend`
2. พิมพ์คำสั่ง: `npm run simulate`

คุณสามารถไปแก้ไขจำนวนรอบการจำลองที่ตัวแปร `ITERATIONS` หรือแก้ไขระยะเวลาจำลองการพักที่ตัวแปร `DELAY_BETWEEN_ACTIONS` ภายในไฟล์ `loop_agent.js` ได้ตามความต้องการครับ
