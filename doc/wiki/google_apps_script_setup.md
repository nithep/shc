# 📊 คู่มือการตั้งค่า Google Sheets & Apps Script (สำหรับ Owner)

เพื่อให้เจ้าของกิจการ (Owner) สามารถดูข้อมูลสรุปการ Check-in ได้แบบเรียลไทม์ และรับอีเมลรายงานสรุปทุกช่วงเย็น เราจะใช้ความสามารถของ **Google Apps Script** ที่ฝังอยู่ใน Google Sheets

## ขั้นตอนที่ 1: การเตรียม Google Sheets
1. เปิด [Google Sheets](https://sheets.google.com) แล้วสร้างไฟล์ใหม่ (เช่นตั้งชื่อว่า "Hotel-ECS Check-in Logs")
2. ในแผ่นงาน (Sheet1) สร้างหัวข้อคอลัมน์ในแถวที่ 1 (A1 ถึง D1) ดังนี้:
   - A1: `Timestamp`
   - B1: `Action` (เช่น Check-in / Check-out)
   - C1: `Room Number`
   - D1: `Guest Name`

## ขั้นตอนที่ 2: วางโค้ด Google Apps Script (Web App)
1. ใน Google Sheets เมนูด้านบนคลิก **Extensions (ส่วนขยาย)** > **Apps Script**
2. ลบโค้ดเก่าที่มีอยู่ แล้ววางโค้ดด้านล่างนี้ลงไป:

```javascript
// โค้ดนี้จะรับข้อมูลจากระบบหลังบ้านของโรงแรม (Webhook) และบันทึกลง Sheet
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    // เตรียมข้อมูลเพิ่มลงแถวใหม่
    const timestamp = data.time || new Date();
    const action = data.action || 'Unknown';
    const room = data.roomNumber || '-';
    const guest = data.guestName || '-';
    const guestEmail = data.guestEmail || '';
    
    sheet.appendRow([timestamp, action, room, guest, guestEmail]);
    
    // ส่งอีเมลต้อนรับถ้าเป็น Check-in และมีอีเมล
    if (action === 'Check-in' && guestEmail) {
      sendWelcomeEmail(guest, room, guestEmail);
    }
    
    return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": error.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันส่งอีเมลต้อนรับ (Welcome Email)
function sendWelcomeEmail(guestName, roomNumber, guestEmail) {
  const subject = `ยินดีต้อนรับสู่โรงแรมของเรา - ห้องพัก ${roomNumber}`;
  const body = `
  เรียนคุณ ${guestName},

  ขอบคุณที่เลือกเข้าพักกับเรา! 
  
  ห้องพักของคุณคือห้อง: ${roomNumber}
  
  หากคุณต้องการความช่วยเหลือเพิ่มเติม สามารถติดต่อผ่านทางหน้าเว็บ Self Check-in ได้ตลอด 24 ชั่วโมง

  ขอให้มีความสุขกับการพักผ่อนครับ
  ทีมงาน Hotel-ECS
  `;
  
  try {
    MailApp.sendEmail(guestEmail, subject, body);
  } catch (e) {
    console.error("Email send failed:", e);
  }
}

// โค้ดสำหรับส่งอีเมลสรุปตอนเย็น (ตั้งเวลาให้รันทุกวันตอน 18:00)
function sendEveningSummary() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  // หายอดวันนี้
  const today = new Date().toDateString();
  let checkinCount = 0;
  
  for (let i = 1; i < data.length; i++) {
    const rowDate = new Date(data[i][0]).toDateString();
    const action = data[i][1];
    if (rowDate === today && action === 'Check-in') {
      checkinCount++;
    }
  }
  
  const emailBody = `สวัสดีครับ,\n\nสรุปยอดการเช็คอินของวันนี้ (${today}):\nมีแขกทำการสแกน Check-in ผ่านระบบสำเร็จจำนวน: ${checkinCount} ห้อง\n\nสามารถดูรายละเอียดเต็มได้ที่ Google Sheets ครับ`;
  
  // เปลี่ยนอีเมลด้านล่างเป็นอีเมลของเจ้าของ
  MailApp.sendEmail("owner@example.com", `สรุปยอดเช็คอินรายวัน - ${today}`, emailBody);
}
```

## ขั้นตอนที่ 3: เผยแพร่เป็น Web App
1. กดปุ่ม **Deploy (ทำให้ใช้งานได้)** ที่มุมขวาบน เลือก **New deployment (การทำให้ใช้งานได้รายการใหม่)**
2. คลิกรูปฟันเฟืองตรง Select type เลือก **Web app**
3. ตั้งค่า:
   - Execute as: **Me (คุณ)**
   - Who has access: **Anyone (ทุกคน)**
4. กด **Deploy** และกดยอมรับสิทธิ์ (Authorize access)
5. คัดลอก **Web app URL** ที่ได้ ส่งให้กับทีมพัฒนาเพื่อนำไปใส่เป็น `GOOGLE_SHEETS_WEBHOOK_URL` ในเซิร์ฟเวอร์ `backend/.env` ของโรงแรม

## ขั้นตอนที่ 4: ตั้งเวลาส่งสรุปตอนเย็นอัตโนมัติ (Trigger)
1. เมนูด้านซ้ายใน Apps Script กดที่รูปนาฬิกา (Triggers)
2. กด **Add Trigger (เพิ่มทริกเกอร์)** มุมขวาล่าง
3. ตั้งค่า:
   - Choose which function to run: `sendEveningSummary`
   - Select event source: `Time-driven`
   - Select type of time based trigger: `Day timer`
   - Select time of day: `6pm to 7pm` (ตามต้องการ)
4. กด **Save**

เพียงเท่านี้ ระบบ Google Sheets ก็พร้อมรับข้อมูลและส่งสรุปให้เจ้าของทางอีเมลเรียบร้อย!
