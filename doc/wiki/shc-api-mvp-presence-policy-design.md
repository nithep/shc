---
title: SHC API MVP — Presence Subscriber & Policy Verifier Design Note
type: design
description: ข้อกำหนดการออกแบบ (Design Note) สำหรับก้อน A ของ SHC API MVP — presence_subscriber service ใหม่, policy verifier ชั้นใหม่เหนือ hardware StateVerifier, การเพิ่มคอลัมน์แบบ additive และ route ที่เสนอสำหรับก้อน B
tags: [design, mvp, presence, policy, safety, adr, shc]
timestamp: "2026-10-20T00:00:00+07:00"
status: proposed
scope: ก้อน A (Audit + Gap + Design) — ยังไม่แตะโค้ด mqtt_connector.js / StateVerifier.js ตัวเดิม
---

# SHC API MVP — Presence Subscriber & Policy Verifier Design Note

> เอกสารนี้เป็นผลของ **ก้อน A (Audit + Gap + Design)** ของ SHC api MVP
> อ้างอิงโค้ด local ที่ HEAD `5f4b383` (สอดคล้อง GitHub origin/main)
> **ขอบเขต MVP: simulator เท่านั้น — ห้ามแตะ `mqtt_connector.js` / `pbx/safety/StateVerifier.js` ตัวเดิม — ห้ามต่อตู้จริง**

---

## 1. หลักการตั้งต้น (Design Principles)

1. **Layered Safety (แยกชั้น hardware vs policy)**: การตรวจสอบระดับฮาร์ดแวร์ (ACK/NACK/state match) กับระดับนโยบาย (เงื่อนไขธุรกิจ) เป็น**สองชั้นแยกกัน** ห้ามยัดรวมไฟล์เดียว
2. **Additive-only migration**: เพิ่มคอลัมน์ด้วย `ALTER TABLE ... ADD COLUMN` เท่านั้น (แอปเดิมต้องรันได้ไม่พัง) ตามแบบเดียวกับ `api/db.js` และ `api/scripts/migrate.js` ที่มีอยู่
3. **Idle-safe / ECO-safe**: service ใหม่ต้องไม่กระตุ้นคำสั่ง ECO (ตัดไฟ) ด้วยตนเอง — โดยเฉพาะใน MVP
4. **ห้ามแตะของเดิม**: `api/services/mqtt_connector.js` และ `pbx/safety/StateVerifier.js` (รวม mirror `ops/edge-agent/safety/StateVerifier.js`) ถือเป็น frozen — ก้อน A/B/C แก้เฉพาะไฟล์ใหม่ + จุดต่อ (`server.js`) แบบ minimal wiring

---

## 2. presence_subscriber service ใหม่

### 2.1 ที่อยู่ไฟล์ที่เสนอ
- `api/services/presence_subscriber.js` (service ใหม่ — ไม่ทับของเดิม)

### 2.2 บทบาท
สมัครรับสถานะ **การมีอยู่ (presence)** ของแขกในห้อง จาก Edge Agent ผ่าน MQTT broker ตัวเดียวกับที่ `mqtt_connector.js` ใช้ (`MQTT_BROKER_URL`) โดย:

- **Subscribe**: `shc/room/+/presence` (ตามบรีฟ) — payload เสนอ `{ "room": "101", "present": true|false, "ts": 1690000000000, "source": "edge-agent" }`
- **QoS**: 1 (at-least-once)

> **⚠️ ข้อเท็จจริงจากโค้ด local (ต้อง reconcile ก่อน implement):**
> - Cloud `api/services/mqtt_connector.js` ใช้: `hotel/<branchId>/room/<room>/command`, `hotel/<branchId>/room/+/result`, `hotel/<branchId>/status`
> - Edge `ops/edge-agent/mqtt_agent.js` ใช้: `hotel/<BRANCH_ID>/room/+/command`, **publish `/state` (topic หลัก)** + `/result` (backward-compat), และ `hotel/<BRANCH_ID>/edge/status`
> - **ความไม่ตรงกันที่มีอยู่แล้ว**: connector subscribe `/status` แต่ edge publish `/edge/status` → heartbeat/offline signal อาจไม่ถึง cloud (ต้องให้ DS/Mnemo ยืนยัน — นอกขอบเขตก้อน A ที่ audited)
> - topic `shc/room/+/presence` ที่บรีฟระบุเป็น **namespace ใหม่แยกจาก `hotel/`** → ต้องให้ Mnemo ตัดสินว่าจะย้ายทั้งระบบเป็น `shc/` หรือใช้ `hotel/<branchId>/room/+/presence` (ดู §7 ข้อ 1)

### 2.3 Idle-safe design
- ใช้ **MQTT client แยก instance** ของตัวเอง (ไม่ reuse client ของ `mqtt_connector.js` — เพื่อไม่แตะ frozen file)
- Read-only: subscribe + อัปเดต DB/cache เท่านั้น **ไม่ publish คำสั่งใดๆ**
- **ห้ามสั่ง ECO เองใน MVP**: เมื่อ `present=false` ครบเงื่อนไข idle ระบบต้อง**ส่ง event/สัญญาณให้ policy verifier ตัดสิน** ไม่ใช่ยิง `checkOut`/`OFF` ตรงๆ
- ถ้า broker ขาด: reconnect ด้วย backoff + log ลง `D:\_scripts\logs\` ตามนโยบาย workspace (ห้าม pop-up console)

### 2.4 การเก็บสถานะ (persistence)
- เขียนค่าลงตาราง `rooms` ผ่านคอลัมน์ใหม่ (ดู §4) ไม่สร้างตารางซ้อน ถ้าไม่จำเป็น
- คง `last_presence_at` เป็น timestamp ล่าสุดที่ได้รับ event (ใช้คำนวณ idle)

---

## 3. Policy Verifier เหนือ Hardware StateVerifier

### 3.1 การแยกชั้น (ยืนยันจากโค้ด local)
| ชั้น | ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|---|
| **Hardware Verifier** | `pbx/safety/StateVerifier.js` (+ mirror `ops/edge-agent/safety/StateVerifier.js`) | Pre-Flight → Execute → Post-Flight (ACK/NACK, state match), retry 3 ครั้ง exponential backoff | **มีอยู่แล้ว — frozen** |
| **Policy Verifier** | `api/services/policy_verifier.js` (ใหม่) | ตัดสินตามนโยบายธุรกิจ 5 ข้อ (สเปก §5) **ก่อน/หลัง** เรียก hardware verify | **ชั้นใหม่แยก** |

### 3.2 ตำแหน่งในสายพานคำสั่ง
```
[คำสั่งจาก API/cron/presence]
        │
        ▼
┌──────────────────────────┐
│  Policy Verifier (ใหม่)   │  ← ตรวจนโยบาย 5 ข้อ (สเปก §5)
│  - allow / deny / defer   │
└──────────────────────────┘
        │ (ผ่านนโยบายเท่านั้น)
        ▼
┌──────────────────────────┐
│ Hardware StateVerifier    │  ← ของเดิม (frozen) — ตรวจ ACK/state จริง
└──────────────────────────┘
        │
        ▼
      [PBX / Edge Agent]
```

### 3.3 หลักการสำคัญ
- Policy verifier **ห่อ (wrap)** hardware verifier — ไม่แก้ внутриของ hardware verifier
- ถ้า policy = deny → **ไม่เรียก hardware verifier เลย** (ประหยัดคำสั่ง, ลดความเสี่ยง hardware)
- ถ้า policy = defer (เช่น pending approval) → ส่งเข้า approval gate เดิม (`api/services/approval_gate.js` มีอยู่แล้ว)
- นโยบาย 5 ข้อ (§5 ของสเปก) ต้อง implement เป็น **rule set แยก**, ไม่ hardcode ใน `server.js`

### 3.4 หมายเหตุการเชื่อมกับสี/สถานะ (ตามสเปก §5)
รายละเอียดเงื่อนไข 5 ข้อต้องอ้างจากสเปกต้นฉบับ — **ก้อน A นี้ยังไม่มีสำเนาสเปกใน repo** จึงไม่ยืนยันตัวเลข/เงื่อนไขรายข้อ (ดู §5 doc-rot + §7 ข้อ 2)

---

## 4. Migration เพิ่มคอลัมน์แบบ additive

### 4.1 คอลัมน์ที่ขาด (ยืนยันจากโค้ด local — grep ทั้ง repo ไม่พบ)
ตาราง `rooms` ปัจจุบันมี: `id, status, power, guest_name, guest_email, consent_given_at, consent_ip, checkout_date, branch_id`
(นิยามที่ `api/db.js:initDb` และ `api/scripts/migrate.js` migration 001/003)

**คอลัมน์ที่ยังไม่มี และต้องเพิ่ม (additive):**

| คอลัมน์ | ชนิด | ใช้ทำอะไร |
|---|---|---|
| `last_door_open_at` | TEXT (ISO8601) | เวลาเปิดประตูล่าสุด (door event) |
| `door_closed` | BOOLEAN DEFAULT 0 | สถานะประตูปิด/เปิดล่าสุด |
| `override_locked` | BOOLEAN DEFAULT 0 | ล็อก override (ห้ามคำสั่ง manual ทับ) |
| `warned` | BOOLEAN DEFAULT 0 | ทำเครื่องหมายว่าแจ้งเตือนแล้ว (กันแจ้งซ้ำ) |

> ข้อสังเกต: `api/db.js` มีคอลัมน์ migration list แบบ idempotent อยู่แล้ว — ให้**เพิ่มรายการใหม่เข้า list นั้น + `migrate.js` migration 003** โดยไม่ลบคอลัมน์เดิม (ดูจุดตัดสินใจ §7 ข้อ 3 ว่าจะรวมเป็น migration 004 แยกหรือ append)

### 4.2 รูปแบบ SQL (เสนอ)
```sql
-- idempotent: SQLite จะ error 'duplicate column name' ถ้ามีอยู่แล้ว — ให้ ignore
ALTER TABLE rooms ADD COLUMN last_door_open_at TEXT;
ALTER TABLE rooms ADD COLUMN door_closed BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN override_locked BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN warned BOOLEAN NOT NULL DEFAULT 0;
```

---

## 5. ตัวตรวจ 60 วิ / dim / sleep guard (สถานะจากโค้ด local)

**ผลตรวจจากโค้ด local (HEAD 5f4b383):**

| กลไก | สถานะ | หลักฐาน |
|---|---|---|
| ตัวตรวจ 60 วิ (approval window) | **มี — แต่เป็นระดับ approval gate** | `ADR-001-safety-pipeline.md` ระบุ High-Risk รออนุมัติ 60 วิ; `api/services/approval_gate.js` |
| dim (หรี่ไฟ) | **ไม่มี** | grep ทั้ง repo ไม่พบ logic dim/หรี่ไฟใน hardware path |
| sleep guard | **ไม่มีในความหมาย policy** | มีแค่ `_sleep()` ใน `StateVerifier.js` (หน่วง retry) และ `loop_agent.js` (simulation sleep) — ไม่ใช่ idle/sleep policy guard |
| ตัวตรวจ idle จาก presence | **ไม่มี** | ไม่พบ `presence_subscriber` / idle logic ใดๆ |

> ต้องชี้แจงกับ Mnemo: "ตัวตรวจ 60 วิ" ในบริบทสเปกอาจหมายถึง approval timeout เดิม หรือตัวตรวจ idle 60 วิคนละตัว (ดู §7 ข้อ 5)

---

## 6. route ใหม่ที่เสนอสำหรับก้อน B

| Method | Path | หน้าที่ | สถานะ security |
|---|---|---|---|
| `GET` | `/api/presence/:room` | อ่านสถานะ presence ปัจจุบันของห้อง | ต้องมี `verifyStaffToken` |
| `GET` | `/api/rooms/:id/presence-history` | ประวัติ presence/door ล่าสุด | ต้องมี `verifyStaffToken` |
| `POST` | `/api/rooms/override` | ตั้ง/ปลด `override_locked` | **ต้องมี `verifyOwnerToken` + audit log + policy verifier** |
| `GET` | `/api/policy/decisions` | ดูผลตัดสินของ policy verifier (audit) | `verifyOwnerToken` |

- ทุก route ใหม่ต้องผ่าน **policy verifier** ก่อนแตะ hardware
- route ที่เขียน state ต้องลง `approval_audit_events` (audit log เดิม — immutable) เสมอ
- **ห้าม route ใหม่คุยกับ PBX ตรง** — ผ่าน `pbx` facade (`mqtt_connector.js`) เท่านั้น
- ให้สอดคล้อง middleware เดิมใน `api/server.js` (`verifyStaffToken`, `verifyOwnerToken`)

---

## 7. จุดที่ต้องให้ Mnemo ตัดสิน (Decision Points)

สั้นๆ → ดูรายละเอียดในรายงานก้อน A (§7 หัวข้อตัดสิน)
1. Topic namespace: คง `hotel/<branchId>/...` หรือย้ายเป็น `shc/room/+/presence`?
2. สเปกต้นฉบับ §5 (นโยบาย 5 ข้อ) อยู่ที่ไหน — ต้องได้สำเนาเข้า repo ก่อนออกแบบ policy verifier ให้ครบ
3. Migration: แยกเป็น migration 004 ใหม่ หรือ append เข้า list เดิมใน `db.js`/`migrate.js`?
4. Cron base: ใช้ `cron_scheduler.js` เป็นฐาน (ดู §8) — ยืนยันได้ไหม
5. "ตัวตรวจ 60 วิ" ในสเปก = approval timeout เดิม หรือ idle check คนละตัว?
6. `cron_scheduler.js` ยิง `googleNotifier` จริง — simulator MVP จะให้ยังยิง notification จริงหรือ stub?

---

## 8. ประเมิน cron_scheduler.js ใช้เป็นฐานได้ไหม

**結論: ใช้เป็นฐานได้ (แนะนำ)** โดยมีข้อควรระวัง

| เกณฑ์ | ผล |
|---|---|
| โครงสร้าง | ดี — `startCronJobs(db, notifier, pbx)` แยกงานชัด (`generateAndSendReport`, `runAutoEviction`) |
| Timezone | ตั้ง `Asia/Bangkok` ถูกต้อง |
| การเรียก hardware | ผ่าน `pbx.checkOut()` facade — ถูกต้องตาม pattern (แต่ต้องย้ายไปผ่าน policy verifier ก่อน) |
| Dependency | `node-cron@^4.6.0` มีใน `api/package.json` แล้ว |
| จุดเสี่ยง | (1) `runAutoEviction` ยิง notification จริงผ่าน `googleNotifier`; (2) ใช้ `db.getAllRooms` callback style; (3) auto-eviction เป็นงาน **ตัดไฟ** ซึ่งใน MVP simulator ต้อง dry-run |

**ข้อเสนอ:** ตั้ง `presence_idle_check` เป็น cron ใหม่ในไฟล์ scheduler เดียวกัน แต่ให้ **เรียก policy verifier** ก่อน แล้วใน MVP ให้เป็น **dry-run / simulate mode** (ไม่ยิงตัดไฟจริง)

---

## References
- โค้ด local HEAD `5f4b383` (`api/services/cron_scheduler.js`, `api/services/mqtt_connector.js`, `api/db.js`, `api/scripts/migrate.js`, `pbx/safety/StateVerifier.js`, `api/server.js`)
- `doc/wiki/decision_records/ADR-001-safety-pipeline.md` (ADR, approved)
- สเปก SHC API MVP §5 (นโยบาย 5 ข้อ) — **ได้รับสำเนาแล้ว (Mnemo แนบให้ 2026-10-20)** ดูหัว §9
- สเปก SHC API MVP §4 (timestamp) — อ้างอิงสำหรับตัวตรวจ 60 วิ รอบก้อน B

---

## 9. Errata & Mnemo Decision Log (2026-10-20)

### 9.1 Errata — Known Defect: MQTT Topic Mismatch
- **รายละเอียด:** cloud `api/services/mqtt_connector.js` subscribe `hotel/<branchId>/status` แต่ edge `ops/edge-agent/mqtt_agent.js` publish `hotel/<BRANCH_ID>/edge/status` (พร้อม `/state` เป็น topic หลัก + `/result` backward-compat) → **heartbeat/offline signal ของ cloud อาจไม่ได้รับ**
- **การตัดสิน:** บันทึกไว้เป็น **งานเฟส hybrid** — **ไม่แก้ใน MVP** (เนื่องจาก MVP ไม่แตะ broker จริง/ตู้จริง)
- **สถานะ:** known defect (accepted, deferred)

### 9.2 Mnemo Decision Log (ล็อกแล้ว — ห้ามเปิดประเด็นซ้ำ)
| # | ประเด็น | คำตัดสิน |
|---|---|---|
| 1 | Topic namespace | ใช้ `shc/room/{room_id}/presence` QoS1 + retain ตาม event contract เดิม |
| 2 | Policy verifier | ออกแบบตามสเปก §5 ต้นฉบับ (สำเนาใน §5) |
| 3 | Migration | additive ตาม pattern `db.js` เดิมเท่านั้น |
| 4 | Cron base | ใช้ `cron_scheduler.js` เป็นฐานได้ — **บังคับ dry-run ตลอด MVP** (auto-eviction/notifier จริงต้อง gate ด้วย dry-run flag) |
| 5 | "ตัวตรวจ 60 วิ" | timestamp-based: ตัวตรวจตื่นทุก 60 วิ คำนวณเวลาผ่านจาก timestamp ที่เก็บ (สเปก §4) — ไม่ใช่นาฬิกานับถอยหลังรายห้อง |
| 6 | Notifier | stub (log อย่างเดียว) ตลอด MVP |
| 7 | Deployment | สร้างลง Pi monolith เท่านั้น — **ห้ามลง `api/cloudrun/`** |

### 9.3 Gate 2 Review Corrections (2026-10-20 — Muse re-review, ก้อน B)
บันทึกหลัง commit ก้อน B (`dd8f144`) — แก้ 5 จุด ความปลอดภัยเป็นหลัก (follow-up commit):

| # | ประเด็น | คำตัดสิน/แก้ |
|---|---|---|
| 1 | นาฬิกา idle | **idle = now − `last_door_open_at`** (door = พยานหลัก) — presence อย่างเดียวห้ามขับ ECO ใน MVP |
| 2 | ตัวตรวจ 60 วิ | ต้องเช็ก sleep guard + `door_closed` (ประตูเปิดค้าง → alert พนักงาน + ห้าม ECO) — แก้ทั้ง `policy_verifier.evaluateIdle` และ `cron_scheduler.runPresenceIdleRound` |
| 3 | ความหมายคำสั่ง | **`eco_on` = เข้าโหมด ECO (ตัดไฟ)** · **`eco_off` = คืนไฟ** — ด่านกลางคืน (§5 rule 4) ต้องบล็อก `eco_on` ใน verifier |
| 4 | ชื่อกฎ R4 | R4 = **door open too long** (ไม่ใช่ sensor silent/heartbeat) — เปลี่ยนชื่อเป็น `rule4_night_no_eco_on` / `rule4_door_open_too_long`; heartbeat จริงเป็นงานเฟิร์มแวร์โหนด (ก้อน C) |
| 5 | เทสต์ | เขียนใหม่แบบ spec-based (§4/§5/§8) ไม่ใช่ code-based — เพิ่มเคส 23:00 door idle 2 ชม. → ไม่ ECO · ประตูแง้ม → alert ไม่ ECO · ไม่มี presence data + door idle 30 นาที → ECO · presence empty แต่ประตูเพิ่งเปิด → ไม่ ECO · override → ไม่ ECO |

**ก้อน C (non-blocking):** `presence_subscriber` fail-closed หาก `MQTT_BROKER_URL` ว่าง (ห้าม public HiveMQ default ตอน deploy) + credential แยกต่อ service
