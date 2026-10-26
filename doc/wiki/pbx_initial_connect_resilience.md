---
title: ความทนทานการเชื่อมต่อตู้ PBX ตั้งแต่เริ่มระบบ (Initial Connect Resilience)
type: wiki
tags: [pbx, resilience, self-healing, phase2, shc, reconnect]
created: 2026-10-26
updated: 2026-10-26
---

# ความทนทานการเชื่อมต่อตู้ PBX ตั้งแต่เริ่มระบบ (Initial Connect Resilience)

## 🎯 เป้าหมาย
แก้ปัญหา API Server ล้มหรือค้างเมื่อเชื่อมต่อตู้ Phonik PBX ไม่ได้ในจังหวะเริ่มระบบ (cold boot / ตู้ยังไม่พร้อม / เครือข่ายสะดุด) โดยให้บริการส่วนอื่นยังทำงานได้ และระบบฟื้นตัวเองเมื่อตู้กลับมา โดยไม่ต้องรีสตาร์ตบริการ

อ้างอิงบริบทฮาร์ดแวร์: [[wiki/phase2-hardware-integration|การเชื่อมต่อตู้สาขาฮาร์ดแวร์จริง]] และ [[wiki/phonik-pbx-protocol|โปรโตคอลตู้สาขา Phonik ECS]]

## ✅ พฤติกรรมที่รับประกัน
1. **API ไม่ล้มตามตู้** — ถ้า `pbx.connect()` ครั้งแรกล้มเหลว ตัว server ยังเปิดพอร์ต API (ค่าเริ่มต้น `3999`) และให้บริการ endpoint อื่นได้ตามปกติ
2. **เชื่อมใหม่เองแบบ backoff** — ตัว server ตั้งเวลาลองเชื่อมใหม่เองที่ 1, 2, 4, 8, 16, 30 วินาที (เพดาน 30 วินาที) ไม่ต้องมีคนสั่ง
3. **Health ตรงความจริง** — `/health` และ `/api/health` รายงาน `pbxConnected` จาก `pbx.isReady` (ไม่เชื่อม = `false`)
4. **Sync ข้ามอย่างสุภาพ** — รอบ Digital Twin Sync จะข้ามทันทีเมื่อ `pbx.isReady === false` พร้อม log `[SYNC] ... PBX unavailable — skipping sync` โดยไม่เขียน DB และไม่ตีความห้องใดเป็น OFF
5. **ฟื้นเองหลังตู้กลับมา** — เมื่อเชื่อมได้อีกครั้ง ระบบจะ sync อ่านสถานะห้องและกลับมาทำงานต่อโดยไม่ต้องรีสตาร์ต service

## 🛠️ การออกแบบที่ลงมือทำ
### `pbx/transport/tcp.js`
- initial connect ต้อง **reject** เสมอเมื่อ error/close/timeout ก่อน handshake สำเร็จ (เดิม promise อาจค้าง)
- ทำความสะอาด socket เก่าและ timer ทุกตัวก่อนเริ่ม connection ใหม่
- แยก callback `fail()` / `succeed()` แบบ settle ครั้งเดียว ป้องกัน resolve/reject ซ้ำ
- คงพฤติกรรมเดิม: รอ welcome banner สูงสุด 500 ms แล้วเข้าสู่โหมดรับข้อมูลปกติ

### `api/server.js`
- เพิ่ม `scheduleReconnection()` แบบ backoff (1–30 วินาที) ครอบทั้งกรณี **initial connect ล้มเหลว** และ `reconnect_failed`
- Timer ถูกยกเลิก/รีเซ็ตเมื่อเชื่อมสำเร็จ และไม่ทำงานซ้ำซ้อนระหว่าง state `CONNECTING`/`RECONNECTING`
- ย้ายการเริ่ม periodic sync ออกมาเริ่มได้แม้ PBX ยังไม่พร้อม (ค่าเริ่มต้นทุก 5 นาที, override ด้วย `SHC_SYNC_INTERVAL_MS`)
- `syncPbxStateWithDatabase()` ตรวจ `pbx.isReady` ก่อนเริ่ม และตรวจ `statusLabel` ต้องเป็น `ON`/`OFF` ก่อนตัดสินใจใด ๆ — อ่านล้มเหลว = `SKIPPED` และ state เดิมไม่เปลี่ยน

## 🧪 หลักฐานการทดสอบ
ชุดทดสอบใหม่ `api/test/tcp_initial_failure_reconnect.test.js` พิสูจน์ครบ 6 ข้อ:

1. ชี้ PBX ไปพอร์ตที่ไม่มีผู้ฟัง → API ยังขึ้น และ `/health` ตอบ `pbxConnected=false`
2. รอบ sync ข้ามอย่างสุภาพระหว่างตู้ไม่พร้อม
3. การอ่านที่ล้มเหลวไม่เปลี่ยนสถานะห้องใน DB
4. เปิด PBX Simulator ตามหลัง → connector เชื่อมกลับเองโดยไม่รีสตาร์ต API
5. Read-only sync กลับมาทำงานหลังเชื่อมต่อได้
6. สถานะห้องยังคงเดิมหลัง sync รอบ reconnect

ผลรวม ณ วันที่บันทึก:
- `node api/test/run_all.js` — ผ่านทุกไฟล์ (78 เคส; เดิม 72 + ใหม่ 6)
- `npx jest --runInBand` ใน `pbx/` — 37/37 (7 suites)

## ⚙️ หมายเหตุการปฏิบัติการ
- งานนี้ยังเป็น **ซอฟต์แวร์/แล็บเท่านั้น** ไม่มีการแก้ค่า `PBX_MODE=mock` หรือ `SHC_POLICY_DRY_RUN=true` บน Pi
- ไม่แตะ `cctv-gateway` และบริการ SNC (ระบบ SNC มี listener แยกของตัวเอง)
- การตรวจสุขภาพหน้างาน: `curl -s http://127.0.0.1:3999/health` ดู `pbxConnected`
- Backoff อยู่ฝั่ง API process จึงยังทำงานแม้ตู้จะยังไม่พร้อมตอน service start

## 🔗 ไฟล์ที่เกี่ยวข้อง
- `api/server.js`
- `pbx/transport/tcp.js`
- `api/test/tcp_initial_failure_reconnect.test.js`
- `api/test/run_all.js`
