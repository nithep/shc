---
title: โปรโตคอลตู้สาขา Phonik ECS และการจำลอง
tags: [pbx, protocol, phonik, simulator, digital-twin]
type: evergreen
source: docs/pbx_protocol_simulation.md
created: 2026-07-02
---

# โปรโตคอลตู้สาขา Phonik ECS และการจำลอง

## สรุปสาระสำคัญ
ตู้สาขา **Phonik ECS-103R V.5** ใช้ ASCII text-based protocol สื่อสารผ่านพอร์ต LAN ของPBX (TCP) โดยมีรูปแบบคำสั่งที่เรียบง่าย

## รูปแบบคำสั่ง (Protocol Format)
- **ส่งคำสั่ง (Command)**: `..[COMMAND]\r\n`
- **รับผลลัพธ์ (Response)**: `==[RESULT]\r\n` หรือ `==NACK\r\n` (ข้อผิดพลาด)

## ค่าสถานะห้องพัก (Room Status Code)
| Code | สถานะ | ความหมาย |
|------|--------|-----------|
| `0` | OFF | ตัดไฟ (Check-out) |
| `1` | ON | จ่ายไฟ (Check-in) |
| `2` | MAINTENANCE | ซ่อมบำรุง |
| `3` | OUT_OF_ORDER | งดใช้งาน |

## คำสั่งหลัก
- **เปิดไฟห้อง**: `..ROOM 0101 1`
- **ปิดไฟห้อง**: `..ROOM 0101 0`
- **สอบถามสถานะ**: `..ROOM 0101`
- **ตอบกลับ**: `==ROOM 0101 1`

## การใช้ Simulator (Digital Twin)
ใช้สำหรับพัฒนาโดยไม่ต้องมีตู้ PBX จริง:
```bash
cd pbx-connector
node simulator/pbx-simulator.js --port 10001
```

### ตัวเลือกจำลองสถานการณ์
- `--delay <ms>`: จำลองความหน่วง
- `--drop-rate <0.0-1.0>`: จำลองข้อมูลสูญหาย
- `--nack-room <room>`: จำลองห้องที่พัง (ตอบ NACK เสมอ)

## การเชื่อมต่อกับ Simulator
```env
PBX_MODE=tcp
PBX_HOST=192.168.1.xxx
PBX_PORT=10001
```
