# 🛠️ แผนการพัฒนาฟีเจอร์ AI Control (สั่งงานผ่านแชท) & Daily Operations Report (สรุปยอดประจำวัน)

เอกสารฉบับนี้กำหนดรายละเอียด **Workflow & System Design** สำหรับการพัฒนาฟีเจอร์ขั้นสูงถัดไป เพื่อเตรียมพร้อมสำหรับการลงมือเขียนโค้ดจริงในเซสชันหน้าครับ

---

## 🧠 ฟีเจอร์ที่ 1: AI Control (การควบคุมไฟฟ้าและฮาร์ดแวร์ผ่านห้องแชท)

### 🔄 แผนผังขั้นตอนการทำงาน (Workflow Process)
```mermaid
sequenceDiagram
    participant Guest/Staff as แดชบอร์ด Copilot UI
    participant Backend as Express API Server
    participant LLM as OpenRouter / Gemini API
    participant DB as SQLite (hotel.db)
    participant PBX as ตู้สาขา Phonik PBX

    Guest/Staff->>Backend: พิมพ์แชท: "ช่วยเปิดไฟห้อง 101 ให้หน่อย"
    Backend->>LLM: ส่งแชทพร้อม System Prompt พิเศษ (Tool Calling/Intent detection)
    Note over LLM: วิเคราะห์เจตนาพบว่าผู้ใช้ต้องการควบคุมห้อง<br/>และดึงพารามิเตอร์: Action="ON", Room="101"
    LLM-->>Backend: ตอบกลับแบบโครงสร้าง: { controlRequest: true, action: "ON", room: "101" }
    
    rect rgb(240, 240, 240)
        Note over Backend: ขั้นตอนความปลอดภัย (Safety & Rule Check)
        Backend->>Backend: ยืนยันสิทธิ์ผู้สั่ง และแปลงเลขห้อง 101 -> 0101
    end

    Backend->>PBX: ส่งรหัสคำสั่งดิบ: ..ROOM0101=1\r\n
    PBX-->>Backend: ตอบกลับ: ==ACK=>ROOM0101=1
    Backend->>DB: บันทึกสถานะห้องพักล่าสุดเป็น Occupied / Power ON
    Backend-->>Guest/Staff: แสดงข้อความ: "ดำเนินการเปิดระบบไฟห้อง 101 เรียบร้อยแล้วครับ 🟢"
```

### 🛠️ สิ่งที่จะต้องพัฒนาในโค้ด:
1.  **System Prompt Tuning:** เพิ่มคำอธิบายใน `systemPrompt` ของ Copilot ให้รองรับการตรวจจับข้อความคำสั่ง และตอบกลับในรูปแบบ JSON เพื่อให้ Backend แกะพารามิเตอร์ไปสั่งงานต่อได้ง่าย (Intent Detection)
2.  **Command Safety Gate:** สร้างฟังก์ชันป้องกันและตรวจสอบค่าตัวแปร (Input validation) ก่อนส่งต่อให้ PBX Connector เช่น การตัดช่องว่าง, ตรวจสอบช่วงเลขห้องจริง และการจำกัดสิทธิ์เฉพาะบัญชีช่าง/พนักงาน (Role Authorization)
3.  **PBX Direct Call Integration:** นำโมดูล `pbx.sendCommand` มาผูกเข้ากับผลลัพธ์ของ Copilot API เพื่อยิงคำสั่งเปิด/ปิดไฟฟ้าห้องจริงในลูปเดียว

---

## 📊 ฟีเจอร์ที่ 2: Daily Operations Report (การส่งรายงานสรุปยอดและปัญหาประจำวัน)

### 🔄 แผนผังขั้นตอนการทำงาน (Workflow Process)
```mermaid
sequenceDiagram
    participant Cron as Node-Cron (หลังบ้าน Pi 4)
    participant DB as SQLite (hotel.db)
    participant GSheets as Google Sheets Webhook
    participant GChat as Google Chat Webhook (Operations Room)

    Note over Cron: ทำงานอัตโนมัติทุกวันเวลา 23:59 น.
    Cron->>DB: ดึงสถิติจำนวนรายการของวันปัจจุบัน
    Note over DB: Query ข้อมูล:<br/>- ยอดเช็คอินวันนี้<br/>- ยอดเช็คเอาท์วันนี้<br/>- สถิติฮาร์ดแวร์ขัดข้อง (NACK/Offline)
    DB-->>Cron: ส่งข้อมูลสถิติกลับมา
    
    par บันทึกข้อมูลลง Google Sheets
        Cron->>GSheets: ส่ง HTTP POST บันทึกสรุปรายวัน 1 แถว (Date, Check-In, Check-Out, ErrorCount)
    and แจ้งเตือนทีมบริหารผ่าน Google Chat
        Cron->>GChat: ส่งการ์ดรายงานสรุปสวยงาม (🛎️ Daily Summary Report Card)
    end
```

### 🛠️ สิ่งที่จะต้องพัฒนาในโค้ด:
1.  **Scheduler Module:** ติดตั้งแพ็กเกจ `node-cron` หรือสร้างฟังก์ชัน `setInterval` เฝ้าระวังเวลา 23:59 บนเครื่อง Pi 4 หลังบ้าน
2.  **Aggregation Queries:** เขียน SQL Queries สำหรับสรุปสถิติประจำวัน เช่น:
    - `SELECT COUNT(*) FROM bookings WHERE date(check_in_time) = date('now')`
    - `SELECT COUNT(*) FROM system_logs WHERE level = 'ERROR' AND date(timestamp) = date('now')`
3.  **Chat Card Formatter:** ออกแบบการ์ดรายงานประจำวัน (Daily Summary Card) ในรูปแบบ JSON เพื่อส่งผ่าน Google Chat Webhook แสดงสถิติตัวเลขสวยงามพร้อมไฟสถานะเขียว/แดงเพื่อรายงานภาพรวมให้ผู้บริหารโรงแรมทราบแบบเรียลไทม์
