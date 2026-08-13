# บันทึกการทดสอบและแก้ปัญหา (Troubleshooting & Test Log)

## วันที่ทดสอบ: 1 กรกฎาคม 2026

### 📌 ปัญหาที่ 1: เครือข่าย Wi-Fi ของ Raspberry Pi 4 ไม่เสถียร
**อาการ:** 
- ไม่สามารถ SSH เข้าเครื่อง Pi 4 ได้ (Connection timed out)
- IP Address เปลี่ยนบ่อยครั้ง (จาก `.109` เป็น `.70`)
- หน้าเว็บแสดงข้อความ `ERR_NETWORK_CHANGED`

**สาเหตุ:** 
สัญญาณ Wi-Fi ไม่เสถียร ทำให้การเชื่อมต่อหลุดและเร้าเตอร์ทำการแจก IP ใหม่เมื่อเชื่อมต่อกลับเข้าไป

**การแก้ไข (Solution):** 
✅ **เปลี่ยนมาใช้การเชื่อมต่อผ่านสาย LAN (Ethernet) แทน Wi-Fi** เพื่อความเสถียรสูงสุดและป้องกันปัญหา IP เปลี่ยนระหว่างการทดสอบระบบ

---

### 📌 ปัญหาที่ 2: PBX Simulator บน Windows ไม่ได้รับการเชื่อมต่อ (Connections: 0)
**อาการ (อ้างอิงจากภาพที่ 2):**
- หน้าเว็บ Frontend แสดงสถานะว่ากด Check-in สำเร็จ
- Log ของ `hotel-backend` บน Pi 4 แสดงข้อความว่าได้รับคำสั่งและทำงานสำเร็จ (แสดงข้อความ `[DIGITAL TWIN - PBX SIMULATOR] RESULT: Room 0101 is now POWERED ON`)
- **แต่หน้าต่าง Simulator บน Windows (PowerShell) ยังคงแสดง Connections: 0 และไฟห้อง 101 ยังเป็นสถานะ OFF**

**สาเหตุ:**
ระบบ Backend/PBX Connector บน Pi 4 กำลังทำงานในโหมด **Mock (จำลองในตัวมันเอง)** แทนที่จะเป็นโหมด **TCP** สาเหตุมาจากโปรเซสที่รันอยู่บน PM2 (`~/RelaySync/backend`) ไม่พบไฟล์ตั้งค่า `.env` ที่กำหนดให้ชี้มาที่ IP ของ Windows (`192.168.1.8`) ระบบจึงใช้ค่าเริ่มต้น (Fallback) เป็นโหมด Mock ภายในเครื่องแทน

**การแก้ไข (Next Steps):**
1. ต้องสร้างไฟล์ `.env` ไว้ในโฟลเดอร์ที่ Backend รันอยู่ (ในกรณีนี้คือ `/home/admin/RelaySync/backend/.env`)
2. กำหนดค่า:
   ```env
   PBX_MODE=tcp
   PBX_HOST=192.168.1.8
   PBX_PORT=10001
   ```
3. สั่ง `pm2 restart hotel-backend` เพื่อให้โหลดค่าใหม่
