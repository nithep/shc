---
title: SHC API MVP — ก้อน B Implementation Note (Presence Subscriber & Policy Verifier)
type: implementation
description: บันทึกการ implement ก้อน B ของ SHC API MVP — presence_subscriber service, policy verifier 5 ข้อ (สเปก §5), additive migration 004, door events route, และตัวตรวจ idle 60 วิแบบ timestamp-based (dry-run)
tags: [implementation, mvp, presence, policy, safety, migration, shc]
timestamp: "2026-10-20T00:00:00+07:00"
status: implemented
scope: ก้อน B (Core Logic — simulator เท่านั้น) — ไม่แตะ mqtt_connector.js / StateVerifier.js ตัวเดิม
---

# SHC API MVP — ก้อน B Implementation Note

> ผลของ **ก้อน B (Core Logic)** ของ SHC api MVP — simulator เท่านั้น
> อ้างอิง design note ก้อน A: `doc/wiki/shc-api-mvp-presence-policy-design.md`
> **ไม่แตะ** `api/services/mqtt_connector.js` และ `pbx/safety/StateVerifier.js` (+ mirror)

---

## 1. ไฟล์ใหม่ (Additive)

| ไฟล์ | บทบาท |
|---|---|
| `api/services/shc_policy_config.js` | ศูนย์รวม threshold ทั้งหมด (ห้าม hardcode) + dry-run flag + ค่า X |
| `api/services/presence_subscriber.js` | (B1) subscribe `shc/room/+/presence` QoS1 read-only — parse ตาม **Event Contract v0.1** (`room_id`/`event`/`persons`/`confidence`/`ts` ISO8601/`sensor_id`) |
| `api/services/policy_verifier.js` | (B4) checklist 5 ข้อ §5 → allow/deny/skip/defer |
| `api/test/*.test.js` | ชุดทดสอบ dependency-free (node:assert) |

## 2. ไฟล์ที่แก้แบบ minimal (จุดต่อ)

| ไฟล์ | การแก้ |
|---|---|
| `api/db.js` | เพิ่ม 5 คอลัมน์เข้า migration list (idempotent) |
| `api/scripts/migrate.js` | append migration 004 (additive) |
| `api/services/cron_scheduler.js` | เพิ่ม `startPresenceIdleCheck` + `runPresenceIdleRound` (B5) |
| `api/server.js` | require + instantiate policy layer, 5 route ใหม่, start subscriber/checker |
| `api/package.json` | `test:shc` script |
| `.env.example` | SHC_* config keys |

## 3. Migration 004 (additive)

```sql
ALTER TABLE rooms ADD COLUMN last_door_open_at TEXT;
ALTER TABLE rooms ADD COLUMN last_presence_at  TEXT;
ALTER TABLE rooms ADD COLUMN door_closed       BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN override_locked   BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN warned            BOOLEAN NOT NULL DEFAULT 0;
```

idempotent — SQLite จะ error `duplicate column name` ถ้ามีอยู่แล้ว → ignore

## 4. Policy Verifier — Checklist 5 ข้อ (§5)

| ลำดับ | กฎ | ผล |
|---|---|---|
| 1 | override locked | deny (`rule1_override_locked`) |
| 2 | VACANT→ECO illegal | deny (`rule2_illegal_transition`) |
| 3 | relay already at target | skip (`rule3_idempotent_skip`) |
| 4 | night no eco_on / door silent > X | deny + alert (`rule4_*`) |
| 5 | relay same room < 2 min | deny (`rule5_relay_flap`) |

- ทุก denial log (room/command/rule/time/reason) ลง `D:\_scripts\logs\shc-policy-YYYY-MM-DD.log` + audit log
- policy = deny → ไม่เรียก hardware verifier เลย
- **ห่อ** hardware verifier — ไม่แก้ภายใน

## 5. ค่า X — ข้อเสนอ B6

**X = 10 นาที** (`SHC_DOOR_SENSOR_TIMEOUT_MIN`, default 10) — **Mnemo ยืนยันแล้ว** (Gate 2, 2026-10-20 01:54)

เหตุผล:
1. idle ปกติ 20 นาที → X = 50% ของ idle → จับได้ก่อนถึงรอบตัดไฟ
2. suite idle 30 นาที → X = 1/3 → ยังเป็น safety guard ที่มีความหมาย
3. 10 นาทีอ่านง่ายสำหรับพนักงาน และไม่สั้นจนเกิด false positive
4. เป็น deny+alert เท่านั้น (ไม่ตัดไฟเอง) → เลือก conservative

> ต้องยืนยันที่ gate 2 (Mnemo)

## 6. ตัวตรวจ 60 วิ (B5) — timestamp-based

- cron ตื่นทุก 60 วิ (`SHC_CHECKER_CRON`) → คำนวณ elapsed จาก `last_presence_at`
- **dry-run บังคับ** (`SHC_POLICY_DRY_RUN=true` ตลอด MVP) → ไม่ยิง eco_off จริง
- notifier = stub (log เท่านั้น)
- dim/warn เมื่อ idle ≥ threshold − warnLead (1 นาที)
- sleep guard 22:00–06:00 (คุมเฉพาะ eco_on)

## 7. Route ใหม่ (B3)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/presence/:room` | verifyStaffToken |
| GET | `/api/rooms/:id/presence-history` | verifyStaffToken |
| POST | `/api/door/events` | verifyStaffToken |
| POST | `/api/rooms/override` | verifyOwnerToken |
| GET | `/api/policy/decisions` | verifyOwnerToken |

## 8. ผลทดสอบ (npm run test:shc)

| ชุด | จำนวน | ผล |
|---|---|---|
| B2 migration (idempotent) | 2 | ✅ |
| B4 policy_verifier (checklist + acceptance §8) | 14 | ✅ |
| B1 presence_subscriber (contract + T6/T7) | 9 | ✅ |
| B5 idle checker | 6 | ✅ |
| **รวม** | **31** | **✅ ผ่านทั้งหมด** |

Integration smoke (server mock PBX): `/health` OK, door event persist, presence reflect, override (owner) OK, staff→owner 403, policy decisions live
