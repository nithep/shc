---
type: software-spec
title: SHC Event Contract v0.1 — Presence (MQTT)
source: "Event Contract v0.1 (2026-10-04) — สัญญา event presence ระหว่าง edge node กับ api"
contract_version: "v0.1"
capture_method: reconstructed_ground_truth
extracted_at: 2026-10-20T00:00:00+07:00
status: ground-truth
tags:
  - shc
  - mqtt
  - presence
  - event-contract
  - spec
---

# SHC Event Contract v0.1 — Presence (MQTT)

> ⚠️ **Ground Truth:** สำเนาสัญญา event v0.1 (ล็อกตาม Mnemo §9.2 ข้อ 1)
> ปรับจากบรีฟต้นฉบับ — เนื้อหาตรงกับที่ implement ใน `api/services/presence_subscriber.js`

---

## Topic
```
shc/room/{room_id}/presence
```
- **QoS 1** + **retain = true** (`SHC_PRESENCE_QOS=1`)
- ผู้ข่าวประกาศ (publish): edge node เซ็นเซอร์จริง (ก้อน C ถัดไป)
- ผู้สมัครรับ (subscribe): `api/services/presence_subscriber.js` — **read-only**

## Payload (JSON)
```json
{
  "room_id": "302",
  "event": "entered",
  "persons": 1,
  "confidence": 0.87,
  "ts": "2026-10-04T05:50:00+07:00",
  "sensor_id": "z2w-302"
}
```

### ฟิลด์
| ฟิลด์ | ชนิด | คำอธิบาย |
|---|---|---|
| `room_id` | string | รหัสห้อง (จำเป็น) |
| `event` | enum | `entered` \| `empty` \| `count_changed` (จำเป็น) |
| `persons` | number | จำนวนคน (ใช้กับ `count_changed`) |
| `confidence` | number | ความเชื่อมั่น 0–1 |
| `ts` | string (ISO8601 + tz) | เวลาที่เกิด event |
| `sensor_id` | string | รหัสเซ็นเซอร์ต้นทาง |

## การแปลง event → presence state
| event | present |
|---|---|
| `entered` | `true` |
| `empty` | `false` |
| `count_changed` | `persons > 0` (อัปเดต occupancy widget เท่านั้น — ไม่ขับรีเลย์) |

## กฎการ validate
- ต้องมี `room_id` และ `event` ที่อยู่ในลิสต์ที่อนุญาต — ไม่งั้น log + drop (ห้าม crash)
- `ts` แปลง ISO8601 → epoch ms (normalize; persist เป็น ISO UTC)
- payload ที่ไม่ใช่ JSON → log `malformed` + drop

## หมายเหตุ (ขอบเขต MVP)
- **presence ห้ามขับ ECO** — เป็นข้อมูลประกอบ; นาฬิกา idle ใช้ประตู (§4 ของสเปก)
- contract ตัวอย่างกฎข้อ 1 ระบุ "empty ต่อเนื่อง 15 นาที" — MVP ใช้ idle 20/30 นาที (Mnemo §9.2) แทน
