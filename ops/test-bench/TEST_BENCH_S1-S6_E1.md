# SHC ก้อน C — ชุดทดสอบบนโต๊ะ S1–S6 + E1 (Bench Test Suite)

> ชุดทดสอบสถานะคนอยู่ (presence) และโหนด ESP32+LD2410C+ประตู ก่อนต่อเข้าห้องจริง
> สโคป: **bench / dry-run เท่านั้น** — ห้ามต่อรีเลย์จริง ห้ามแตะสายงานโรงพยาบาล
> อ่านคู่กับ: `doc/raw/specs/shc_event_contract_v0.1.md`, `ops/firmware/esp32-presence/`

---

## 1. หลักการ

1. ทุกชุดทดสอบรันในโหมดจำลอง (`SHC_POLICY_DRY_RUN=true` คงเดิมตลอด)
2. ตัวรับ (subscriber) ยืนยันว่า "รับเข้า + ลงฐานข้อมูล" — ส่วนคำสั่งตัดไฟ **ต้องไม่มี**
3. การล้มเหลวทุกแบบต้องจบที่ **ไฟติด (fail-safe = ON)**
4. ห้ามแก้ `mqtt_connector.js` / `StateVerifier.js`

---

## 2. ชุดทดสอบฝั่งโหนด (Sensor/Node)

| ชุด | ชื่อ | วัตถุประสงค์ | เกณฑ์ผ่าน (PASS) | สถานะ |
|---|---|---|---|---|
| **S1** | Node boot + MQTT connect | โหนดบูต, ต่อ Wi-Fi + broker ด้วย credential ของตัวเอง | connect สำเร็จ, publish test ลง topic ได้, ไม่มี anonymous | ⬜ พร้อมรัน (รอฮาร์ดแวร์) |
| **S2** | LD2410C basic detect | ตรวจพบคนเข้า/ออกในระยะ 0.5–3 ม. | ฝั่งโหนด: parse กรอบ UART ได้ state → present (moving/static/ทั้งคู่=มีคน; ไม่มีเป้า=ว่าง) · ปลายทาง: `entered` เมื่อมีคน, `empty` เมื่อไม่มีคน + ประตูปิด — **ห้ามอ้างว่าผ่านก่อนรันกับฮาร์ดแวร์จริง** | ⬜ รอฮาร์ดแวร์ (parser พร้อม + unit test ผ่าน 23/23 บน PC) |
| **S3** | Count/occupancy | ตรวจว่ารายงานการมีอยู่ไม่กระตุ้น ECO + สัญญาณ count ทำงาน | **ข้อจำกัด:** LD2410C **ไม่นับจำนวนคน** — รายงานแค่มี/ไม่มีเป้า (persons เป็นค่าประมาณฝั่งโหนด = 1 เมื่อมีเป้า) · เกณฑ์ผ่านจริง = `count_changed`/การอัปเดตจำนวน**ไม่กระตุ้น ECO/คำสั่งตัดไฟใดๆ** และ DB รับค่าได้ — **ห้ามเคลมว่านับคนแม่นยำก่อนมีฮาร์ดแวร์/หลายโหนด** | ⬜ พร้อมรัน (จำกัดสโคปตามข้อจำกัดเซ็นเซอร์) |
| **S4** | Door switch + debounce | เปิด/ปิดประตูถี่ | เปลี่ยนสถานะครบ ไม่กระตุก (debounce 50ms), idle clock ใช้ `last_door_open_at` | ⬜ พร้อมรัน |
| **S5** | Credential isolation | โหนด publish topic อื่น/เขียน topic ต้องห้าม | ACL ปฏิเสธการเขียนนอก `shc/room/{room}/presence` | ⬜ พร้อมรัน (ACL broker) |
| **S6** | Malformed + reconnect | ยิง payload ผิดรูปแบบ + ตัด broker | ตัวรับ log+drop ไม่ crash; โหนด reconnect (backoff) ได้เอง | ⬜ พร้อมรัน |

## 3. ชุดทดสอบฝั่งจำลอง (Emulator)

| ชุด | ชื่อ | วัตถุประสงค์ | เกณฑ์ผ่าน (PASS) | สถานะ |
|---|---|---|---|---|
| **E1** | Event contract emulator | ยิง event v0.1 ทั้ง 3 ชนิด + payload ผิดรูป ทาง loopback | ก) `entered`→present=true ลง DB · ข) `count_changed`→occupancy เท่านั้น · ค) `empty`→present=false ลง DB · ง) ผิดรูป→ปฏิเสธ+log ไม่ล่ม · จ) **ไม่มี ECO/คำสั่งประหยัดไฟใดๆ จาก presence ล้วน** | ✅ ผ่านแล้ว (2026-10-21, ดูหลักฐานล่าง) |

---

## 4. หลักฐาน E1 — ผลยิงจริง (2026-10-21 04:57–04:59 น. เวลาไทย)

ทดสอบบน Pi (`127.0.0.1`), subscriber = `shc-api` (`shc-presence` credential), test publisher = `shc-testpub` (loopback, ลบหลังทดสอบแล้ว)

| ลำดับ | เหตุการณ์ | ค่าที่ส่ง | ท่อนบันทึกหลักฐาน (presence_subscriber) | ผล |
|---|---|---|---|---|
| ก | `entered` | persons=1, conf=0.90 | `presence room=TEST999 event=entered present=true persons=1 conf=0.9 sensor=test-sensor` | ✅ รับเข้า |
| ข | `count_changed` | persons=2, conf=0.85 | `presence room=TEST999 event=count_changed present=true persons=2 conf=0.85 sensor=test-sensor` | ✅ อัปเดตจำนวน (no ECO) |
| ค | `empty` | persons=0, conf=0.90 | `presence room=TEST999 event=empty present=false persons=0 conf=0.9 sensor=test-sensor` | ✅ ว่าง |
| ง | ผิดรูปแบบ | `{"room_id":"TEST999"}` | `ERROR invalid presence payload topic=shc/room/TEST999/presence payload={"room_id":"TEST999"}` | ✅ ปฏิเสธ+log ไม่ล่ม |
| จ | ลบ (no ECO) | หลัง ก–ค | ไม่พบ `eco_on\|eco_off\|ECO\|command=` ใดๆ ที่ผูกกับ TEST999; `SHC_POLICY_DRY_RUN=true` คงเดิม | ✅ **ไม่มีคำสั่งประหยัดไฟ** |

**การยืนยันลงฐานข้อมูล:** publish `entered` ไปห้อง seed `101` → `last_presence_at` เปลี่ยนจาก `null` เป็น `2026-10-20T21:58:42.000Z` (แล้ว reset กลับเป็น `null` หลังทดสอบ)

**การยืนยันสิทธิ์ (ACL):** anonymous → `CONNACK (5) not authorised`; wrong password → ปฏิเสธ; `shc-presence` read-only (ไม่มี write)

---

## 5. เกณฑ์ปิดชุดทดสอบ

- ต้องผ่าน S1–S6 **ครบ** ก่อนประกอบเข้าห้องจริง (ยังรอฮาร์ดแวร์)
- E1 ผ่านแล้ว (ฝั่งจำลอง)
- ทุกกรณีล้มเหลว → ไฟติด (fail-safe = ON) — ห้ามมีคำสั่งตัดไฟจาก presence ล้วน
