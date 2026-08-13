# Phase 5: LINE Ecosystem Integration (Smart Check-in)

## 📌 วิสัยทัศน์ (Vision)
ยกระดับประสบการณ์แขกผู้เข้าพัก (Guest Experience) สู่ระดับสากลแบบ Seamless (เทียบเท่าดีไซน์ของ Google) โดยเปลี่ยนกระบวนการ Check-in/Check-out ให้เป็น Self-service ผ่าน **LINE OA และ LINE LIFF** โดยผสานเข้ากับระบบ Hardware (PBX/Pi4) ที่มีอยู่เดิมอย่างไร้รอยต่อ

## 🔄 User Journey & Workflow
1. **Booking & Arrival:** แขกเดินทางมาถึงและเห็น QR Code ประจำห้องพัก (เช่น หน้าห้อง 101)
2. **Scan (LIFF Entry):** แขกสแกน QR Code ด้วยแอป LINE ระบบจะเปิดหน้า Web App (Frontend ของเรา) ผ่าน LINE LIFF ทันที โดยดึงโปรไฟล์ LINE มายืนยันตัวตนอัตโนมัติ (ไม่ต้องสมัครสมาชิก/ล็อกอิน)
3. **One-Tap Check-in:** แขกกดยืนยันการเข้าพักบนหน้าจอโทรศัพท์
4. **Hardware Trigger:** 
   - Backend รับคำสั่งผ่าน API -> ส่งคำสั่ง "ON" ไปที่ Pi4 (PBX Connector)
   - PBX สั่งเปิดระบบ Relay ที่ห้อง 101 (Armed State)
5. **Physical Action (เสียบการ์ด):** แขกเปิดประตูห้องและเสียบคีย์การ์ด ไฟฟ้าในห้องจะทำงานทันที *(หากไม่ Check-in ใน LINE ก่อน ไฟจะไม่ติดแม้จะเสียบการ์ด)*
6. **Check-out:** แขกกด "Check-out" บน LINE -> Backend สั่ง "OFF" ไปที่ PBX -> ไฟดับทันที (แม้การ์ดจะเสียบอยู่)

## 💻 Tech Stack & Implementation Plan
- **Frontend (Vite/React):** เพิ่ม `@line/liff` SDK สร้าง UI คลีนๆ สำหรับแขก
- **Backend (Node.js):** เพิ่ม API Endpoint สำหรับรับ Request จาก LIFF และอาจเสริมด้วย LINE Messaging API Webhook สำหรับส่งข้อความทักทาย/แจ้งเตือน
- **Hardware:** ใช้ชุดสถาปัตยกรรม Pi4 + Phonik ECS-103R เดิมโดยไม่ต้องปรับแต่งเพิ่มเติม
