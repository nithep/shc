import os

file_path = r"c:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS\docs\wiki\project_timeline.md"
content = """

## [2026-07-28] LINE MINI App Frontend Initialization
- **รายละเอียด:** ตั้งค่าระบบ Frontend สำหรับ LINE MINI App (Self Check-in)
- **การเปลี่ยนแปลงหลัก:**
  1. สร้าง `package.json` สำหรับโปรเจกต์
  2. ติดตั้ง Dependencies ที่จำเป็น ได้แก่ React, Vite, และ `@line/liff`
  3. คอนฟิกไฟล์ `vite.config.js` เพื่อรองรับการ Build
  4. ทดสอบการ Build (`npm run build`) สำเร็จสมบูรณ์ ไร้ข้อผิดพลาด
- **ผลลัพธ์:** โครงสร้างโปรเจกต์ `frontend-liff` มีความสมบูรณ์และพร้อมสำหรับการพัฒนา UI และการทำงานของระบบ Check-in ต่อไป
"""

with open(file_path, "a", encoding="utf-8") as f:
    f.write(content)
print("Timeline updated successfully.")
