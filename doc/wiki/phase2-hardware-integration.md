---
title: การเชื่อมต่อตู้สาขาฮาร์ดแวร์จริง (Real Hardware Integration)
tags: [hardware, integration, phase2, pbx, test]
type: evergreen
source: docs/phase2_hardware_integration.md
created: 2026-07-02
---

# การเชื่อมต่อตู้สาขาฮาร์ดแวร์จริง (Real Hardware Integration)

## 🎯 เป้าหมายหลัก
นำ Raspberry Pi 4 ไปเชื่อมต่อกับตู้สาขาโทรศัพท์จริงของโรงแรม (**Phonik ECS-103R V.5**) เพื่อควบคุมระบบกระแสไฟฟ้า 220V ในห้องพักโดยตรง

## 🔌 ข้อมูลการเชื่อมต่อ (ตู้ Phonik PBX จริง)
- **IP Address**: `192.168.1.91`
- **Port (Telnet)**: `23`
- **ห้องทดสอบ**: ห้อง `101`
- **การเชื่อมต่อ**: TCP/LAN Mode (สามารถสลับเป็น พอร์ต LAN ของPBX ได้)

## 🛠️ โหมดการเชื่อมต่อระบบ
ตั้งค่าในไฟล์ `.env` ของ `backend` หรือ `pbx-connector`:
- **โหมด TCP/LAN (แนะนำ)**:
  ```env
  PBX_MODE=tcp
  PBX_HOST=192.168.1.91
  PBX_PORT=23
  ```
- **โหมด Serial**:
  ```env
  PBX_MODE=serial
  PBX_SERIAL=/dev/ttyUSB0
  PBX_BAUD=9600
  ```

## 🧪 ขั้นตอนการทดสอบ (4 Steps)
1. **ทดสอบเชื่อมต่อ (Read-only)**:
   ```bash
   node probe-pbx.js 192.168.1.91 23 101
   ```
   *สคริปต์นี้จะทดสอบ Socket, ดึง Firmware Version และอ่านสถานะห้อง 101*
2. **ทดสอบยิง ON/OFF (ไฟ 220V จริง)**:
   ```bash
   node test-relay.js 192.168.1.91 23 101 on
   node test-relay.js 192.168.1.91 23 101 status
   node test-relay.js 192.168.1.91 23 101 off
   ```
   *คำสั่งนี้จะสั่งจ่ายหรือตัดไฟ 220V จริง ควรมีทีมงานตรวจสอบที่ห้องพัก*
3. **รันระบบจริง**: สั่งรัน Backend สื่อสารกับ IP ตู้จริง
4. **ทดสอบผ่าน Browser**: เข้าสู่หน้า Dashboard แล้วสั่ง Check-in/Check-out เพื่อทดสอบดูระบบไฟฟ้าจริง
