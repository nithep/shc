# 🔧 คู่มือช่าง: การเชื่อมต่อตู้สาขา Phonik PBX และระบบ Webhook (Technician Manual)

คู่มือฉบับนี้สรุปองค์ความรู้เชิงลึก (Deep Dive) ที่ได้จากการทำ Reverse-Engineering ระบบ Phonik PBX และการแก้ปัญหาระบบคลาวด์ เพื่อให้ช่างเทคนิคหรือผู้ดูแลระบบใช้เป็นเอกสารอ้างอิงในการซ่อมบำรุง

---

## 1. โปรโตคอลการสื่อสารกับตู้ Phonik PBX (TCP/Telnet)
จากการดักจับแพ็กเก็ต (Packet Sniffing) ผ่านโปรแกรม PC Operator เดิม เราพบเงื่อนไขสำคัญที่ต้องปฏิบัติตามอย่างเคร่งครัด หากต้องการสั่งเปิด-ปิดไฟห้องพัก:

### 1.1 ลำดับการส่งคำสั่งที่ถูกต้อง (Handshake Sequence)
ตู้ PBX จะ **ปฏิเสธ (NACK)** หรือเพิกเฉยต่อคำสั่งเปิด/ปิดไฟ หากเราไม่ทำการยืนยันตัวตน (Authentication) อย่างถูกต้อง ลำดับการทำงานที่ถูกต้องคือ:

1. **รอรับ Welcome Banner:** 
   เมื่อเชื่อมต่อ TCP (Port 23) สำเร็จ ตู้ PBX จะส่งข้อความต้อนรับออกมาก่อน เช่น `Phonik PABX Telnet system\r\n`
   *ข้อควรระวัง:* ต้องเขียนโค้ดให้อ่านและทิ้ง (Consume) ข้อความนี้ไปก่อน ห้ามส่งคำสั่งสวนไปทันที ไม่งั้น Buffer จะเหลื่อมกัน
2. **เข้าสู่โหมด Terminal Command:**
   ส่งคำสั่ง: `..tcmd=1\r\n`
3. **ส่ง Ping / เช็คเวอร์ชัน (Optional แต่แนะนำ):**
   ส่งคำสั่ง: `..VERS=\r\n`
4. **ยืนยันรหัสผ่าน (Authentication):**
   ส่งคำสั่ง: `..PASS=1234\r\n` (เปลี่ยนตัวเลขตามรหัสผ่านของตู้)
5. **ส่งคำสั่งควบคุม (Control Command):**
   - เปิดไฟ (Check-in 1 วัน): `..PWER1017=1\r\n`
   - ตัดไฟ (Check-out): `..PWER1017=0\r\n`
6. **รอผลลัพธ์และปิดการเชื่อมต่อ:**
   ต้องรอให้ตู้ตอบกลับ `==PWER...` ก่อนเสมอ จากนั้นให้ส่ง `..STOP\r\n` ก่อนตัดการเชื่อมต่อ TCP

### 1.2 ข้อควรระวัง (Troubleshooting PBX)
- **Error NACK ตอนอ่านสถานะห้อง:** หากระบบส่ง NACK ตอนใช้คำสั่ง `PWER0101=` มักแปลว่าในระบบตู้ PBX ไม่มีหมายเลขห้องนั้นอยู่จริง (ต้องส่งคำสั่งให้ตรงกับหมายเลขห้องที่คอนฟิกไว้ในตู้ เช่น 1005, 1017)
- **ไฟไม่ดับ แต่โปรแกรมส่งคำสั่งผ่าน:** เกิดจากการที่โปรแกรมส่งคำสั่งเร็วเกินไปและตัดการเชื่อมต่อ TCP ก่อนที่ PBX จะทันประมวลผลคำสั่งไฟตัด 

---

## 2. การแก้ปัญหา Google Sheets Webhook (Error 500)
ระบบ Hotel-ECS มีการส่งข้อมูล Check-in/Check-out ไปบันทึกลง Google Sheets แบบเรียลไทม์ผ่าน Google Apps Script (`doPost`)

### 2.1 สาเหตุของ Error 500 (Server Error)
มักเกิดจาก **การแย่งกันเขียนข้อมูล (Race Condition)** เมื่อมีการกดปุ่มคำสั่งติดๆ กัน (เช่น Check-in และ Check-out ภายในไม่กี่วินาที) ระบบ Google จะล็อกไฟล์ไม่ทัน ทำให้สคริปต์แครช

### 2.2 โค้ดมาตรฐานสำหรับช่าง (Best Practice for Google Apps Script)
เพื่อป้องกันปัญหานี้ สคริปต์ฝั่ง Google ต้องใช้ `LockService` ควบคุมคิวเสมอ:

```javascript
function doPost(e) {
  // 1. สร้างคิว (Lock) ป้องกันข้อมูลชนกัน รอนานสุด 30 วินาที
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); 

  try {
    // 2. ใช้ getActive() ซึ่งเสถียรกว่า getActiveSpreadsheet() ในบริบท Web App
    const doc = SpreadsheetApp.getActive();
    const sheet = doc.getActiveSheet();
    
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No data received");
    }

    const data = JSON.parse(e.postData.contents);
    const timestamp = data.time || new Date();
    
    // 3. เขียนข้อมูล
    sheet.appendRow([timestamp, data.action, data.roomNumber, data.guestName, data.guestEmail]);
    SpreadsheetApp.flush(); // บังคับให้เขียนลงไฟล์ทันที
    
    return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    // 4. ปลดล็อกคิวเสมอ
    lock.releaseLock();
  }
}
```
*ช่างเทคนิคพึงจำไว้เสมอ:* ทุกครั้งที่มีการแก้โค้ดฝั่ง Google จะต้องกด **Deploy > Manage Deployments > กดสร้าง New Version** ทุกครั้ง มิฉะนั้นระบบจะรันโค้ดเก่า

---

**สรุปการทำงานร่วมกัน (System Flow):**
[Web Dashboard] -> [API Server (Node.js)] -> (ตรวจสอบ Safety) -> [PBX Connector (ส่ง tcmd, PASS)] -> [PBX Hardware (ตัด/ต่อไฟ)] -> [API Server] -> [Google Chat & Google Sheets Webhooks]
