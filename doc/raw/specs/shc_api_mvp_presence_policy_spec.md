---
type: software-spec
title: SHC API MVP — Presence/Policy Spec (สเปก §4 timestamp, §5 นโยบาย 5 ข้อ, §8 acceptance)
source: "สเปก SHC API MVP (จากบรีฟ + Mnemo Decision Log §9.2 + Gate 2 corrections 2026-10-20)"
spec_version: "MVP-2026-10-20"
capture_method: reconstructed_ground_truth
extracted_at: 2026-10-20T00:00:00+07:00
status: ground-truth
tags:
  - shc
  - api-mvp
  - presence
  - policy
  - spec
---

# SHC API MVP — Presence/Policy Spec (Ground Truth)

> ⚠️ **Ground Truth:** เอกสารนี้คือสำเนาสเปก SHC API MVP ที่ล็อกแล้ว (Mnemo §9.2 + Gate 2)
> ห้ามแก้ไขโดยไม่ผ่านความเห็นชอบ Mnemo หรือผ่านระบบ checksum ใน `MANIFEST.sha256`
>
> ปรับจากบรีฟต้นฉบับ (ยังไม่มีไฟล์ต้นฉบับใน repo) — เนื้อหาตรงกับที่ implement ใน
> `api/services/policy_verifier.js`, `presence_subscriber.js`, `cron_scheduler.js`

---

## §4 — นาฬิกา idle (Idle Clock)

- **`idle = now − last_door_open_at`** — **ประตูคือพยานหลัก (primary witness)**
- **presence อย่างเดียวห้ามขับ ECO ใน MVP** (ใช้เป็น occupancy / ข้อมูลประกอบเท่านั้น)
- ตัวตรวจ 60 วิ เป็นแบบ **timestamp-based**: ตัวตรวจตื่นทุก 60 วิ แล้วคำนวณ elapsed จาก timestamp ที่เก็บ
  (ไม่ใช่นาฬิกานับถอยหลังรายห้อง)
- ถ้าห้องไม่มีพยานประตู (ไม่มี `last_door_open_at`) → **ห้ามตัดสิน ECO** (skip)

### Idle thresholds
| ชนิดห้อง | threshold (นาที) |
|---|---|
| ปกติ | 20 |
| suite (`SHC_SUITE_ROOM_IDS`) | 30 |
| dim/warn lead | threshold − 1 นาที |

---

## §5 — นโยบาย 5 ข้อ (Policy Checklist)

**ความหมายคำสั่ง (ยืนยัน Gate 2):**
- `eco_on` = เข้าโหมด ECO = **ตัดไฟ**
- `eco_off` = ออกจากโหมด ECO = **คืนไฟปกติ**

| ลำดับ | กฎ | ผล | rule id |
|---|---|---|---|
| 1 | override locked | deny | `rule1_override_locked` |
| 2 | state transition ไม่ถูกต้อง (VACANT→ECO illegal) | deny | `rule2_illegal_transition` |
| 3 | relay อยู่ที่ target แล้ว | skip (idempotency) | `rule3_idempotent_skip` |
| 4a | กลางคืนห้าม `eco_on` (sleep guard 22:00–06:00) | deny | `rule4_night_no_eco_on` |
| 4b | ประตูเปิดค้าง > X นาที (door-open-too-long) | deny + alert | `rule4_door_open_too_long` |
| 5 | relay ห้องเดิมห่างกัน < 2 นาที (flap) | deny | `rule5_relay_flap` |

- ทุก denial ต้อง log (room/command/rule/time/reason)
- policy = deny → **ไม่เรียก hardware verifier เลย**
- policy verifier **ห่อ** hardware StateVerifier (frozen) — ห้ามแก้ภายใน

### ค่า X (door-open-too-long timeout)
- **X = 10 นาที** (`SHC_DOOR_SENSOR_TIMEOUT_MIN`, default 10) — Mnemo ยืนยัน (Gate 2, 2026-10-20)
- พฤติกรรมจริง = ประตูเปิดค้าง > X → deny + alert (ไม่ใช่ sensor heartbeat — heartbeat จริงเป็นงานเฟิร์มแวร์โหนด)

---

## §8 — Acceptance (logic, simulator)

| # | เคส | ผลที่คาด |
|---|---|---|
| 1 | door idle 30 นาที ประตูปิด (กลางวัน) | ECO (ตัดไฟ) |
| 2 | door idle 29 นาที (suite) | ไม่ดับ + warn zone |
| 3 | 23:00 door idle 2 ชม. | ไม่ดับ (night guard) |
| 4 | override ระหว่าง ECO | คืนไฟทันที + ล็อก |
| 5 | ฆ่า api | ไม่มีคำสั่งดับค้าง/ส่งซ้ำ |
| 6 | MQTT เงียบสนิท | ระบบไม่ error (log เท่านั้น) |

เพิ่มเคสกันความเข้าใจผิด:
- ประตูแง้ม (เปิดค้าง > X) → alert, ไม่ ECO
- ห้องไม่มี presence data + door idle 30 นาที → ECO ได้ (เส้นทาง pilot check-in + door)
- presence empty แต่ประตูเพิ่งเปิด → ไม่ ECO
- override_locked → ไม่ ECO

---

## กฎเหล็ก MVP
- Simulator/วงแล็บเท่านั้น — ห้ามต่อ ECS/รีเลย์จริง
- **dry-run บังคับ** (`SHC_POLICY_DRY_RUN=true`) ตลอด MVP
- ห้ามแก้ `api/services/mqtt_connector.js` / `pbx/safety/StateVerifier.js` (+ mirror `ops/edge-agent/safety/StateVerifier.js`)
- **fail-safe = ON** (ไฟเปิดเป็นค่าเริ่มต้นที่ปลอดภัย)
- ไม่มี face recognition; event เป็นข้อความเท่านั้น
