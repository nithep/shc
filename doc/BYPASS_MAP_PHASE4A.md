# SHC BYPASS MAP - Phase 4A (ฉบับแก้ไขตามโค้ดจริง)

## แผนที่โดยตรง (Direct map) - ทุก route/จุดที่ส่งคำสั่ง PBX

| ไฟล์/Route | วิธีเรียก/ฟังก์ชันที่ใช้ส่ง PBX | ผ่าน StateVerifier? | ผ่าน policy verifier/gate/approval? | หมายเหตุ |
|---|---|---|---|---|
| api/server.js POST /api/checkin | buildCommand(ROOM_ON) -> executeWithSafety -> executeCommandWithStateVerification -> executeAndVerify (hardwareVerifier.verify) เรียก pbx.checkIn ใน executeFn | ใช่ (StateVerifier/hardwareVerifier) | ใช่ (ApprovalGate/RateLimiter ผ่าน executeWithSafety) | Shadow logging เพิ่ม (logging-only). X-Client-Channel ถูกอ่านเพื่อ logging อย่างเดียว |
| api/server.js POST /api/checkout | buildCommand(ROOM_OFF) -> executeWithSafety -> executeAndVerify เรียก pbx.checkOut | ใช่ | ใช่ | Shadow logging เพิ่ม (logging-only). |
| api/server.js POST /api/rooms/control (verifyStaffToken) | buildCommand(ROOM_ON/ROOM_OFF, source=reqSource) -> executeWithSafety; executeFn เรียก pbx.checkIn(roomNumber, Force ON ()) หรือ pbx.checkOut | ใช่ | ใช่ | **พิเศษ:** ส่งเฟรมชื่อ Force ON () ไปกับคำสั่งเปิดเสมอ (แก้จาก hardcode 'Force ON (AppSheet)'). ป้าย Google Chat ใช้ reqSource. |
| api/server.js POST /api/v1/external/checkin (x-api-key) | buildCommand(source='external_api') -> executeWithSafety -> pbx.checkIn(roomNumber, guestName) | ใช่ | ใช่ | ผ่าน safety pipeline ตามปกติ |
| api/server.js POST /api/v1/external/checkout (x-api-key) | buildCommand -> executeWithSafety -> pbx.checkOut | ใช่ | ใช่ | ผ่าน safety pipeline ตามปกติ |
| api/server.js POST /api/admin/approval/:id/execute | ผ่าน executeWithSafety (ตามเส้นทางอนุมัติ) | ใช่ | ใช่ (approval gate) | ครอบคลุมโดย http_state_verification |
| api/server.js POST /api/bookings/bind (**ป้ายแดง - direct bypass**) | ผูก booking กับ LINE/guest; เมื่อสำเร็จเรียก **pbx.checkIn(room.id, booking.guest_name)** โดยตรง (ไม่ผ่าน executeWithSafety/buildCommand/StateVerifier/policy verifier/approval gate). จากนั้น **db.updateRoomState(room.id, 'occupied', true, ...) โดยไม่มีเงื่อนไขแม้ pbx.checkIn ล้มเหลว** | **ไม่ผ่าน** | **ไม่ผ่าน** | Route นี้**ไม่มี verifyStaffToken** ใช้ bindingToken + LINE/session เป็น credential. ชื่อแขกถูกส่งเป็นเฟรมชื่อไปกับคำสั่ง. อาจทำให้ DB กับสถานะตู้จริงคลาดเคลื่อนได้. **ห้ามใช้กับ Pi ตลอดช่วง 4A/4B.** สถานะจาก bind = เงื่อนไขยุติในหน้าต่าง 4B. การแก้ให้เข้าจุดร่วมเส้นทางเดียวเป็นชุดงานแยก รออนุมัติต่างหาก. |

## กลไก sync (Digital Twin)

| ไฟล์/ฟังก์ชัน | พฤติกรรม | ผ่าน StateVerifier? | ผ่าน policy verifier? | หมายเหตุ |
|---|---|---|---|---|
| api/server.js syncPbxStateWithDatabase() | โหมด **READ_ONLY** (pbx.readOnly): เทียบ DB vs PBX, log เท่านั้น **ไม่ส่งคำสั่ง PBX และไม่อัปเดต DB**. โหมดปกติ: ถ้า DB=occupied แต่ PBX=OFF -> ส่ง **pbx.checkIn(room.id, 'SyncRecovery')** (Auto-ON) และอัปเดต DB; ถ้า DB=vacant แต่ PBX=ON -> ส่ง **pbx.checkOut(room.id)** (Auto-OFF) และอัปเดต DB. | **ไม่ผ่าน** (ตรงไปยัง pbx method โดยไม่ผ่าน executeWithSafety/StateVerifier pipeline) | **ไม่ผ่าน** | เป็นแหล่งคำสั่งอีกแหล่งที่ต้องระบุใน map. มีการตรวจสอบว่าไม่มีคำสั่งหลุดไป PBX ในโหมด READ_ONLY. |

## บริการ/จุดอื่น (สังเกต)

| จุด | หมายเหตุ |
|---|---|
| api/services/cron_scheduler.js | ใช้ pbx ผ่านงาน cron (auto-eviction/reports) - ต้องพิจารณาแยกตามการใช้งานจริง; ในบริบทปัจจุบันเน้น route หลักตามข้อกำหนด |
| api/server.js /api/rooms/guest-control, อื่นๆ | ต้องตรวจแต่ละเส้นทาง - รายการข้างต้นครอบคลุมเส้นทางหลักที่ส่ง PBX |

## หมายเหตุการตรวจสอบ
- ทุกแถวตรวจจากโค้ดจริงใน api/server.js (และไฟล์ที่เกี่ยวข้อง) ไม่ใช่จากความจำ.
- bookings/bind ระบุชัดว่าเป็น direct bypass ตามโค้ดปัจจุบัน.
- /api/rooms/control ส่งเฟรมชื่อ (Force ON (source)) ไปกับคำสั่งเปิดเสมอ - บันทึกแล้ว.
