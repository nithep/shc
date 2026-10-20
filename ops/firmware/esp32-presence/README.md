# SHC Edge Node Firmware — ESP32 + LD2410C + Magnetic Door Switch

> เฟิร์มแวร์ประจำโหนด (node firmware) สำหรับ SHC API MVP ก้อน C ถัดไป
> อ่านคู่กับ `doc/raw/specs/shc_event_contract_v0.1.md` (สัญญา event presence)

## ฮาร์ดแวร์เป้าหมาย

| ส่วน | รุ่น | บทบาท |
|---|---|---|
| MCU | ESP32 (DevKit / WROOM-32) | อ่านเซ็นเซอร์ + publish MQTT |
| เซ็นเซอร์คนอยู่ | HLK-LD2410C (24GHz mmWave) | ตรวจจับการมีอยู่ + จำนวนคน (presence/occupancy) |
| ประตู | Magnetic reed switch (NO) | เปิด/ปิดประตู (พยานหลักของ idle clock) |

## หลักการ (บังคับ)

1. **Read-only ต่อระบบไฟ**: โหนดนี้ publish สถานะเท่านั้น — **ห้ามรับ/ส่งคำสั่งตัดไฟ** ตามหลัก "presence ห้ามขับ ECO"
2. **สัญญา event v0.1**: publish ลง `shc/room/{room_id}/presence` QoS1 (payload ครบ 6 ฟิลด์)
3. **1 node = 1 credential**: ใช้ user `shc-edge-{room_id}` (ACL: `topic write shc/room/{room}/presence` — ยังคอมเมนต์ไว้ใน `ops/mosquitto/acl`)
4. **Fail-safe = ON**: ถ้า broker หลุด โหนด reconnect เอง (backoff) — ไม่กระทำการใดต่อรีเลย์
5. **Zero pop-up**: log ผ่าน serial/`logger` — ห้ามเปิด console UI บนเครื่อง Chief

## โครงสร้าง

```
esp32-presence/
├── README.md
├── platformio.ini            # PlatformIO (esp32dev) + libs
├── include/
│   └── config.example.h      # wifi/mqtt/credential (ห้าม commit ค่าจริง)
└── src/
    ├── main.cpp              # entry: wifi + mqtt + scheduler
    ├── ld2410_parser.h       # parser กรอบ UART LD2410C (pure, host-testable)
    ├── presence_sensor.h     # LD2410C reader (UART) → persons/confidence
    ├── door_sensor.h         # reed switch (GPIO) → opened/closed + debounce
    └── event_publisher.h     # ประกอบ payload ตาม event contract v0.1
```

## การอ่านค่า LD2410C (UART)

- อ่านผ่าน **HardwareSerial2** ที่ **256000 8N1** (ค่าเริ่มต้นโรงงาน — ห้ามเปลี่ยน baud, ห้าม factory reset)
- RX=GPIO16, TX=GPIO17; ขา OUT ต่อขาสำรองเพื่อ **เทียบยืนยัน** บนโต๊ะเท่านั้น
- ตรรกะแยกอยู่ใน `src/ld2410_parser.h` (ไม่พึ่ง Arduino → คอมไพล์ทดสอบบน PC ได้)
- สเปกกรอบข้อมูล: `doc/raw/hardware_specs/hlk_ld2410c_uart_protocol_v1.07.md`
- **ห้ามเปิดโหมดวิศวกรรม (engineering mode) ในเฟิร์มแวร์ใช้งานจริง**

## การแมปเซ็นเซอร์ → event

| เหตุการณ์จริง | event ที่ publish | หมายเหตุ |
|---|---|---|
| LD2410C ตรวจพบคนเข้า (moving/static) | `entered` (persons, confidence) | present=true |
| จำนวนคนเปลี่ยน | `count_changed` (persons) | occupancy เท่านั้น |
| ไม่มีคน + ประตูปิด | `empty` (persons=0) | present=false |
| ประตูเปลี่ยน เปิด↔ปิด | (ไม่ publish presence — ประตูเป็น topic/คอลัมน์แยกตามสเปก §4) | idle clock ใช้ `last_door_open_at` ฝั่ง API |

> ⚠️ ประตู **ไม่** publish ใน topic presence ของ MVP นี้ — ฝั่ง API มี route `/api/door/events` แยก (ดู `api/server.js`) และใช้ `last_door_open_at` เป็นนาฬิกา idle ตาม Gate 2.

## การทดสอบ (บนโต๊ะ)

- **Unit test parser (host, PC):** `test/test_ld2410_parser.cpp` — คอมไพล์/รันได้โดยไม่ต้องมี Arduino
  ```
  g++ -std=c++17 -Wall -Wextra -I src test/test_ld2410_parser.cpp -o test/test_ld2410_parser && ./test/test_ld2410_parser
  ```
  เคส: กรอบปกติ · กรอบแยกสองท่อน · ขยะนำหน้า (resync) · ท้ายกรอบผิด · กรอบวิศวกรรม+OUT · data head ผิด
- ชุด S1–S6 และ E1 อยู่ที่ `ops/test-bench/` (ดู `TEST_BENCH_S1-S6_E1.md`)
- โหนดต้องผ่าน S1–S6 ก่อนต่อเข้าห้องจริง

## สถานะงาน

- [x] โครงสร้างโฟลเดอร์ + สัญญาประกอบ
- [x] โค้ดอ่าน LD2410C (UART framing) + unit test host ผ่าน (23/23)
- [ ] ยืนยัน baud/โหมด กับฮาร์ดแวร์จริง (S1–S6 บนโต๊ะ)
- [ ] โค้ด debounce ประตู
- [ ] ต่อ Wi-Fi/MQTT credential จริง
