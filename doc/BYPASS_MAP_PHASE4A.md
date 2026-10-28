# SHC BYPASS MAP - Phase 4A (Full)

## Direct bypass map ครบทุกรายการ (ไฟล์/route, เรียกอะไร, ผ่าน StateVerifier + policy verifier หรือไม่)

| ไฟล์/Route | วิธีเรียก/ฟังก์ชันที่ใช้ส่ง PBX | ผ่าน StateVerifier? | ผ่าน policy verifier/gate/approval? | หมายเหตุ |
|---|---|---|---|---|
| api/server.js POST /api/checkin | buildCommand(ROOM_ON) -> executeWithSafety -> executeCommandWithStateVerification -> executeAndVerify (hardwareVerifier.verify) เรียก pbx.checkIn ใน executeFn | ใช่ | ใช่ (ApprovalGate/RateLimiter) | Shadow logging เพิ่ม (logging-only) |
| api/server.js POST /api/checkout | buildCommand(ROOM_OFF) -> executeWithSafety -> executeAndVerify เรียก pbx.checkOut | ใช่ | ใช่ | Shadow logging เพิ่ม (logging-only) |
| api/server.js POST /api/rooms/control (AppSheet/staff, verifyStaffToken) | buildCommand(ROOM_ON/ROOM_OFF, source=reqSource) -> executeWithSafety; executeFn เรียก pbx.checkIn(roomNumber, `Force ON (${reqSource})`) หรือ pbx.checkOut | ใช่ | ใช่ | ส่งเฟรมชื่อ (Force ON (source)) ไปกับคำสั่งเปิดเสมอ; ป้าย Google Chat เปลี่ยนเป็น Force ON (${reqSource}) |
| api/server.js POST /api/v1/external/checkin | buildCommand(source="external_api") -> executeWithSafety -> pbx.checkIn | ใช่ | ใช่ | ผ่าน safety pipeline |
| api/server.js POST /api/v1/external/checkout | buildCommand -> executeWithSafety -> pbx.checkOut | ใช่ | ใช่ | ผ่าน safety pipeline |
| api/server.js POST /api/admin/approval/:id/execute | approval execute path -> executeWithSafety | ใช่ | ใช่ | ครอบคลุมใน http_state_verification |
| api/server.js bookings/bind routes | ดูรายละเอียดด้านล่าง | ดูด้านล่าง | ดูด้านล่าง | เป็นการจัดการข้อมูลเป็นหลัก |

## รายละเอียด bookings/bind

### POST /api/admin/bookings (create booking)
- DB ที่เขียน: สร้าง booking record ผ่าน db.createBooking({ roomId, guestName, checkinDate, checkoutDate }, ...)
- ส่ง/ไม่ส่งอะไรไป PBX: **ไม่ส่ง** คำสั่ง PBX ในขั้นตอน create booking
- ใครใช้: ผู้มีสิทธิ์ admin/staff (ตาม route ที่เกี่ยวข้อง)
- divergence: ไม่มีการ bypass StateVerifier/policy verifier เนื่องจากไม่มีการส่ง PBX

### GET /api/admin/bookings/:bookingId/binding, POST /api/bookings/bind
- DB ที่เขียน: สร้าง/อัปเดต binding token และความสัมพันธ์ booking-guest (ผูกข้อมูล) ตามโค้ด db ใน flow binding
- ส่ง/ไม่ส่งอะไรไป PBX: **ไม่ส่ง** โดยตรงในขั้นตอน bind (bind เป็นการผูกข้อมูล)
- ใครใช้: ผู้ใช้ผ่าน binding link/guest
- divergence: ไม่ใช่ direct PBX command bypass; การ checkin ที่อาจเกิดขึ้นภายหลังจะผ่าน route /api/checkin หรือ safety pipeline

### หมายเหตุ
- /api/rooms/control ส่งเฟรมชื่อ (Force ON (source)) ไปกับคำสั่งเปิดเสมอ - บันทึกใน map นี้
- ป้าย hardcode เดิม 'Force ON (AppSheet)' เปลี่ยนเป็นใช้ reqSource แล้ว
- จุดที่ไม่ผ่าน StateVerifier: ไม่มี (เส้นทาง PBX หลักอยู่ใน executeWithSafety -> executeAndVerify)
- จุดเขียน DB ที่ไม่ได้ผ่าน StateVerifier: การอัปเดต DB ทำใน route หลัง safety pipeline อนุญาต (เช่น หลัง blocked=false/dryRun ตามที่ออกแบบ) - ต้องแยกแยะระหว่าง "ส่ง PBX" กับ "อัปเดต DB" (PBX calls ผ่าน pipeline)
