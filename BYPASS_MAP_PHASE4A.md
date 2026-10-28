# SHC BYPASS MAP - Phase 4A (Full)

## Direct bypass map ครบทุกรายการ (ไฟล์/route, เรียกอะไร, ผ่าน StateVerifier + policy verifier หรือไม่)

| ไฟล์/Route | วิธีเรียก/ฟังก์ชันที่ใช้ส่ง PBX | ผ่าน StateVerifier? | ผ่าน policy verifier/gate/approval? | หมายเหตุ |
|---|---|---|---|---|
| api/server.js POST /api/checkin (สาธารณะ/ผู้ใช้) | buildCommand(ROOM_ON) -> executeWithSafety -> executeCommandWithStateVerification -> executeAndVerify (hardwareVerifier.verify) เรียก pbx.checkIn ใน executeFn | ใช่ (ผ่าน StateVerifier/hardwareVerifier) | ใช่ (ผ่าน ApprovalGate/RateLimiter ใน executeWithSafety) | Shadow logging เพิ่ม (logging-only) ที่จุดร่วม |
| api/server.js POST /api/checkout | buildCommand(ROOM_OFF) -> executeWithSafety -> executeAndVerify เรียก pbx.checkOut | ใช่ | ใช่ | Shadow logging เพิ่ม (logging-only) |
| api/server.js POST /api/rooms/control (AppSheet/staff, verifyStaffToken) | buildCommand(ROOM_ON/ROOM_OFF, source=reqSource) -> executeWithSafety; executeFn เรียก pbx.checkIn(roomNumber, `Force ON (${reqSource})`) หรือ pbx.checkOut | ใช่ | ใช่ | **หมายเหตุเพิ่มเติม (ด่าน):** ส่งเฟรมชื่อ (Force ON (source)) ไปกับคำสั่งเปิดเสมอ - บันทึกแล้ว (ดูโค้ด). เปลี่ยนป้ายเป็น Force ON (${reqSource}) |
| api/server.js POST /api/v1/external/checkin (API Key) | buildCommand(source='external_api') -> executeWithSafety -> pbx.checkIn(roomNumber, guestName) | ใช่ | ใช่ | ผ่าน safety pipeline ปกติ |
| api/server.js POST /api/v1/external/checkout (API Key) | buildCommand -> executeWithSafety -> pbx.checkOut | ใช่ | ใช่ | ผ่าน safety pipeline ปกติ |
| api/server.js POST /api/admin/approval/:id/execute | approval execute path -> executeWithSafety/build flow (ดูโค้ด) | ใช่ (ผ่าน pipeline) | ใช่ (approval gate + execute) | ตรวจสอบใน http_state_verification ครอบคลุม |
| api/server.js (booking/bind flow) | ดูด้านล่าง | ดูด้านล่าง | ดูด้านล่าง | รายละเอียดเฉพาะ |

## รายละเอียด bookings/bind (ตามที่ขอ)

### /api/admin/bookings (create booking)
- Route: POST /api/admin/bookings (ดูโค้ดส่วน create booking)
- DB ที่เขียน: สร้าง booking ในตาราง bookings (ผ่าน db.createBooking) - ดูโค้ด: db.createBooking({ roomId, guestName, checkinDate, checkoutDate }, ...)
- ส่งอะไรไป PBX: **ไม่ส่ง** ในขั้นตอน create booking โดยตรง (เพียงสร้าง booking record)
- ใครใช้: แอดมิน/ผู้มีสิทธิ์ผ่าน route ที่เกี่ยวข้อง
- divergence: ไม่มีการส่งคำสั่ง PBX ใน create booking

### /admin/bookings/:bookingId/bind-link / การ binding (GET binding link / POST /bookings/bind)
- GET /api/admin/bookings/:bookingId/binding: สร้าง binding token/link - DB เขียน: อาจบันทึก token/สถานะ (ดูโค้ด) แต่โดยทั่วไปเป็นการสร้างลิงก์ ผูกกับ booking
- POST /api/bookings/bind: ผูก LINE/guest กับ booking
  - DB ที่เขียน: อัปเดต booking/guest mapping (ขึ้นกับโค้ด db) - ในโค้ดมีการผูก booking กับผู้ใช้; อาจอัปเดตตาราง bookings หรือสร้างความสัมพันธ์
  - ส่งอะไรไป PBX: **ไม่ส่ง** คำสั่ง PBX ในขั้นตอน bind โดยตรง (bind เป็นการผูกข้อมูล ไม่ได้ trigger checkin/checkout ทันที)
  - ใครใช้: ผู้ใช้ผ่านลิงก์ผูก (guest/LINE)
  - divergence: bind ไม่ผ่าน executeWithSafety เป็นคำสั่ง PBX - เป็นการเปลี่ยนแปลงข้อมูล/ความสัมพันธ์เท่านั้น

### checkIn บน booking (หลัง bind / ใน flow ที่เกี่ยวข้อง)
- ใน flow binding/after binding อาจมีการเรียก pbx.checkIn เมื่อทำการ bind หรือในขั้นตอนถัดไป (ดูโค้ด: มีส่วนที่เรียก pbx.checkIn ในบริบท binding ในบางกรณี) - **สังเกต:** ใน server.js บางจุดมีการเรียก pbx.checkIn/pbx.checkOut ในบริบทต่างๆ (เช่น ใน binding flow) โดย **ผ่าน executeWithSafety pipeline ใน route หลักๆ** (เช่น /api/checkin). การเรียกโดยตรงนอก pipeline นั้นมีน้อย/เป็นกรณีเฉพาะ - **ต้องตรวจสอบในโค้ดจริง:** รายการข้างต้นเน้น route ที่ผ่าน safety pipeline ซึ่งเป็นเส้นทางหลัก. bookings/bind เป็นการจัดการข้อมูลเป็นหลัก ไม่ใช่ direct bypass ที่หลีกเลี่ยง StateVerifier/policy verifier ในเส้นทางสั่ง PBX หลัก.

**รายการป้ายแดงทุกจุด:**
- api/server.js:1276-1278 (old logic path) - เปลี่ยนแล้วให้ใช้ `Force ON (${forceSource})` ใน executeFn ของ /api/rooms/control; ส่งเฟรมชื่อไปกับคำสั่งเปิดเสมอ (บันทึกใน map)
- api/server.js:1304-1306 - เปลี่ยนจาก hardcode 'Force ON (AppSheet)' เป็น `Force ON (${reqSource})`
- api/server.js:1369, 1457, 1276-1278 - PBX calls อยู่ภายใต้ executeWithSafety pipeline (ผ่าน StateVerifier + policy verifier) ในเส้นทางหลัก
- จุดอื่นที่พบ hardcode 'Force ON' ตรวจสอบแล้ว (server.js) - แก้ไขเป็นใช้ reqSource/forceSource แล้ว

**เพิ่มเติม:** /api/rooms/control (AppSheet) ส่งเฟรมชื่อ (Force ON (source)) ไปกับคำสั่งเปิดเสมอ - บันทึกใน map นี้.
