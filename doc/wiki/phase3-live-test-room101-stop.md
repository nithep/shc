# Phase 3 Live Test Room 101 - Stopped 2026-10-26

## Summary
- เปิดหน้าต่างเขียนเมื่อ 2026-10-26 13:59:58 +07
- ทดสอบห้อง 101 สำเร็จ 2/10 transitions: ON 1 ครั้ง, OFF 1 ครั้ง
- หยุดก่อน transition 3/10 เนื่องจากพบเฟรมชนิด `ROOM` ซึ่งอยู่นอกเงื่อนไขหยุดที่อนุญาต
- ปิดหน้าต่างเขียนเมื่อ 2026-10-26 14:06:35 +07 และคืนค่า read-only/dry-run เรียบร้อย
- สถานะสุดท้ายห้อง 101: DB `vacant`, `power=0`; PBX read-back `OFF`; sync 6/6 matched

## Trigger
คำสั่ง OFF ผ่าน `pbx.checkOut()` ส่งเฟรมเสริม:
- `..ROOM1017=Guest 1017`
- PBX ตอบกลับ `==NACK=>ROOM1017=Guest 1017`

เฟรมนี้ไม่ใช่ `..PWER101=0/1` หรือ `..NAME101=` ตามที่อนุญาต จึงหยุดทันทีตามเงื่อนไขความปลอดภัย
เนื่องจาก PBX ตอบ NACK จึงไม่มีการเปลี่ยนชื่อแขกบน PBX

## Executed Transitions
| # | Action | API | StateVerifier | Read-back | DB | Control frames |
|---|--------|-----|---------------|-----------|----|----------------|
| 1 | ON | 202 -> approve 200 -> execute 200 | success, attempts=1 | ON | occupied, power=1 | 1x `..PWER101=1` |
| 2 | OFF | 202 -> approve 200 -> execute 200 | success, attempts=1 | OFF | vacant, power=0 | 1x `..PWER101=0`, 1x `..ROOM1017=Guest 1017` (NACK) |

Trace IDs:
- ON: `41caea94-a849-4f7d-8242-b13247174cf0`
- OFF: `af10c4fd-d3b3-463b-969f-c5a0c9d4667c`

## Final State
- `PBX_READ_ONLY=true`
- `SHC_POLICY_DRY_RUN=true`
- `PBX_MODE=tcp`, `PBX_HOST=192.168.1.91`, `PBX_PORT=23`
- shc-api PID 166605, health `pbxConnected:true`
- Startup sync หลังปิดหน้าต่าง: 6 matched, 0 mismatched
- cctv-gateway PID 1070 active และรับ `POST /detect` 200
- snc-backend และ snc-pbx-listener active
- DB SHA-256 ก่อนเปิดหน้าต่าง: `1df90016fcc2e2ea36bc8e11ba4e00b1b6a0d6f11c6528ea93ebc80d1415361a`
- DB SHA-256 หลังปิดหน้าต่าง: `9db800afffc627dcdd64c38e080e88e874254e7915a95db5527088616b7db19c`
- ข้อมูลห้อง 101 กลับสู่ค่าเดิม: `vacant`, `power=0`, `guest_name=null`
- audit events เพิ่มจาก 5 เป็น 11 รายการ (id 6-11)

## Root Cause
`pbx/index.js` ใน `checkOut()` เรียก:
`protocol.buildSetName(room, ' ')`

แต่ `pbx/protocol.js`:
- `buildSetName()` สร้างคำสั่ง `..ROOM{ext}=...` ไม่ใช่ `..NAME{room}=...`
- `sanitizeName()` เมื่อชื่อเป็นช่องว่างจะ fallback เป็น `Guest ${ext}`
- ผลลัพธ์คือ `..ROOM1017=Guest 1017` แทนการล้างชื่อ

## Required Follow-up
1. ห้ามทดสอบต่อจนกว่าจะแก้โค้ดและมี unit test ครอบคลุม
2. แก้ `checkOut()` ไม่ให้ส่ง name/room frame เมื่อไม่มีชื่อแขก หรือเปลี่ยนให้ล้างชื่ออย่างถูกต้องตามโปรโตคอล PBX
3. เพิ่ม unit test ยืนยันว่า OFF ปกติส่งเฉพาะ `..PWER101=0` (หรืออนุมัติ frame เสริมอย่างชัดเจน)
4. ขออนุมัติใหม่ก่อนเปิดหน้าต่างเขียนรอบถัดไป

## Fix Implemented (2026-10-26)
- `checkOut()` ไม่ส่งเฟรมชื่อใด ๆ อีกต่อไป; คำสั่งจริงเหลือเฉพาะ `..PWER101=0`
- `checkIn()` จะส่งเฟรมชื่อเฉพาะเมื่อชื่อเป็น string ที่ไม่ว่างหลัง trim; ชื่อว่าง/ช่องว่างส่งเฉพาะ `..PWER101=1`
- `setGuestName()` ตรวจชื่อก่อนเข้า queue; ชื่อว่าง/ช่องว่าง reject ด้วย `Guest name must contain at least one printable character` และไม่ส่ง byte ใด ๆ
- `sanitizeName()` ไม่ fallback เป็น `Guest ${ext}` อีกต่อไป; `buildSetName()` reject ชื่อว่าง
- ไม่มีการประดิษฐ์เฟรมล้างชื่อใหม่; การล้างชื่อบน PBX ยังต้องรอหลักฐานยืนยันจากตู้จริง

### Regression Tests
- เพิ่ม `pbx/test/unit/checkout_name_frames.test.js` ด้วย recording fake transport และปิด heartbeat
- ยืนยัน 4 กรณี: OFF มีเพียง `..PWER101=0`; ON ไม่มีชื่อมีเพียง `..PWER101=1`; ON พร้อมชื่อมี power + `..ROOM1017=John Doe`; `setGuestName(101, ' ')` reject และ zero frames
- `npx jest --runInBand` ใน `pbx/` ผ่าน 8 suites, 42/42 tests
- `npm run test:shc` ใน `api/` ผ่านทุกไฟล์

> **สถานะ:** แก้โค้ดและทดสอบในเครื่องแล้ว; ยังไม่แตะ Pi และต้องรอคำสั่งเปิดหน้าต่างเขียนรอบใหม่จากห้องบัญชาการ

## Evidence
- Backup/pcap: `/home/ecs-agent/backup/phase3_20261026_135029`
- pcap: `pbx-phase3.pcap` (155,901 bytes)
- transitions: `transition-01.json`, `transition-02.json`, `transitions.jsonl`
- env/health/sync/cctv: `env-after-close.txt`, `health-after-close.json`, `shc-api-after-close.txt`, `cctv-after-close.txt`
- SHA-256: `SHA256SUMS.txt`, `hotel.db.sha256.after-close.txt`
