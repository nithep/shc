---
type: raw-capture
title: freebuff-preview status
source: "{{url}}"
author:
published:
created: 2026-08-13T22:38
description:
status: inbox
tags:
  - capture
---
✅ **เรียบร้อยแล้ว — ขั้นตอนการ Config ผ่านและจบลงแล้วครับ** (ตั้งใจไม่เริ่ม preview ตามที่สั่งไว้)

สถานะล่าสุด (`freebuff-preview status`):

|คอมมานด์|ค่าที่ตั้งไว้|
|---|---|
|**install**|`npm install --prefix frontend && npm install --prefix backend && npm install --prefix pbx-connector`|
|**dev/preview**|`npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173`|
|**build**|`npm --prefix frontend run build`|
|สถานะ|ยังไม่ running — รอคุณกด Start เองจากปุ่มใน UI|

---

## 🚀 ขั้นต่อไปสำหรับมือใหม่ (เรียงตามลำดับที่ควรทำ)

**1. เปิด Preview ดูหน้าเว็บก่อน**

- กดปุ่ม **Start Preview** ใน UI ของ Freebuff → ระบบจะรัน install แล้วเปิด frontend ขึ้นมา
- หมายเหตุสำคัญ: preview นี้รัน **เฉพาะ frontend (React/Vite)** เท่านั้น — ยังไม่มี backend/DB ต่ออยู่

**2. ลองรัน PBX Simulator (ไม่ต้องมีฮาร์ดแวร์ก็เล่นได้)**

bashCopy

```
cd pbx-connector && npm run simulator
```

- ใช้จำลองตู้ PBX จริง ไว้ทดสอบโปรโตคอลได้ปลอดภัย ก่อนแตะฮาร์ดแวร์จริง
- ตามด้วย `npm test` ใน `pbx-connector` เพื่อรัน test harness ที่มีอยู่

**3. อ่าน docs เพื่อปูพื้นฐาน (10–15 นาที)**

- `docs/index.md` — ภาพรวมระบบทั้งหมด
- `docs/concepts/phonik-ecs.md` — ฮาร์ดแวร์ ECS-103R และโปรโตคอล
- `docs/concepts/prototype-strategy.md` — กลยุทธ์การทำ prototype ทีละขั้น

**4. เตรียม env vars (ยังไม่ต้องมีตอนนี้ ถ้ายังไม่ต่อฮาร์ดแวร์จริง)**

- `backend/.env`: `PORT=3001`, `PBX_HOST`, `PBX_PORT`, `PBX_PROTOCOL=serial|tcp`, `JWT_SECRET`, ฯลฯ
- `pbx-connector/.env`: `PBX_SERIAL_PORT=/dev/ttyUSB0`, `PBX_BAUDRATE=9600`
- ดูตัวอย่างครบใน `SETUP.md` §4 (จริง ๆ ต้องใช้ตอนลงบน Raspberry Pi)

**5. ต่อ backend + ฮาร์ดแวร์จริง (ขั้นสุดท้าย)**

- เปิด backend บน Pi (`PORT=3001`), ต่อ USB-to-Serial กับ PBX, ตั้งค่า `.env` แล้วทดสอบ `POST /api/pbx/test` ตาม `SETUP.md` §Testing

---

คำแนะนำย่อสำหรับมือใหม่: **เริ่มจากข้อ 1 → 2 → 3 ก่อน** — ได้เห็นภาพระบบและปลอดภัยไม่ต้องเสี่ยงกับไฟ 220V ในห้องพัก แต่ถ้าอยากให้ผมช่วยอะไรต่อ บอกได้เลยครับ 😊