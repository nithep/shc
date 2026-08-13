# ช่องทางข้อมูล Real-time ของตู้ Phonik: RDSS (Room Display Status)

> **สถานะ:** Verified (2026-08-12) — ใช้ได้จริงกับตู้ DX-COMPACT V5.4r1 (V5.1r0) หน้างาน

## สรุปสำคัญ (TL;DR)

ตู้ Phonik **ไม่ Push ข้อมูลสด (SMDR/RDSS) ให้ใครทั้งสิ้น** — มัน:
1. บันทึก **SMDR record** (ประวัติ Call Accounting `==SMDX...`) ลงคิวภายใน (`..SMDXpend=` ใช้ดูจำนวนค้าง)
2. **Buffer สถานะห้อง (RDSS)** และ **Dump ออกมาเมื่อถูกขอเท่านั้น** (`..EVNT=ALL` → หลายบรรทัด + ปิดท้าย `==EVNT=END`)

ระบบ Nurse Call ต้อง **Poll `..EVNT=ALL` ทุก 2-3 วินาที** แล้ว Parse `==RDSS` เพื่อให้ได้สถานะแบบ near-real-time

## เงื่อนไข Session Lock (สำคัญที่สุด)

- ตู้ Phonik DX-COMPACT ใช้ **พอร์ต LAN เดียวกัน (Telnet :23) สำหรับ Config และส่ง SMDR Stream**
- **Session LAN ถูกล็อกค้างจาก Config Builder / PC Operator** (หรือโปรแกรม Phonik ใดๆ ที่ต่อตรง `.91:23`) → SMDR/RDSS จะไม่ไหลไปหา client อื่น
- **ตรวจบน PC:** `netstat -ano | findstr 192.168.1.91` → ถ้ามี `ESTABLISHED ... :23` = มีคนครอบ session อยู่
- **วิธีปลดล็อก:** `taskkill /PID <pid> /F` (หรือปิดโปรแกรม Phonik ทุกตัวบน PC) แล้วให้ Listener บน Pi Reconnect — สัญญาณ healthy คือ handshake `..EVNT=ALL` ตอบ `==EVNT=END`
- หมายเหตุ: **โปรแกรม PC ทั้งหมดควรชี้ไปที่ Proxy 2323 ของ Pi** (`192.168.1.94:2323`) ไม่ใช่ชี้ตรง `.91` — เพื่อไม่ให้แย่ง session กับระบบ nurse call

## รูปแบบข้อมูล RDSS

```
..EVNT=ALL
-> ==RDSS401=1        ห้อง 401 เริ่มเรียก (สถานะ != 0 = มีการเรียก/คุยอยู่)
-> ==RDSS400=4>401    สถานีกลาง 400 กำลังรับจาก 401 (สถานีกลางชี้ peer)
-> ==RDSS401=2>400    ห้อง 401 คุยกับ 400
-> ==RDSS401=0        ห้อง 401 เคลียร์ (สถานะ 0 = ว่าง)
-> ==EVNT=END         จบรอบ dump
```

**การแมปห้อง (Room Mapping):**

| สถานี | ความหมาย |
|-------|---------|
| `400` (มี `>peer`) | สถานีกลาง → เหตุการณ์เป็นของ **peer** (ห้องผู้ป่วย) |
| `401+` | ห้องผู้ป่วย (เช่น 401 = ห้อง 0401) |
| `1xx` / อื่นๆ | กลุ่มโรงแรม/ไม่ใช่ nurse call → ข้าม |

**การตรวจจับ transition (ใน `snc_pbx_listener.py`):**
- `0 → ไม่ใช่ 0` = เริ่มการเรียก → ยิง `CALL_BEDSIDE` (สถานะ active)
- `ไม่ใช่ 0 → 0` = เคลียร์ → ยิง `CALL_CLEARED` (backend resolve + คำนวณ SLA)
- ใช้ **last-wins ต่อรอบ dump** (กัน false alarm ถ้า dump replay ประวัติ) + กัน event ซ้ำเมื่อสถานะไม่เปลี่ยน

## การตั้งค่าในโค้ด

- `RDSS_PATTERN = re.compile(r"==RDSS(\d{3,4})=(\d+)(?:>(\d{3,4}))?")`
- `RDSS_POLL_INTERVAL` (env, วินาที) — ค่าเริ่มต้น `3`
- Loops: `_heartbeat_loop` (VERS= ทุก 30s กัน idle-cut) + `_rdss_poll_loop` (EVNT=ALL ทุก 3s รับสถานะ)
- ดูเพิ่ม: `_queue_rdss_state()` / `_flush_rdss_transitions()` / `TestRDSSParser` (unit tests 15/15)

## Self-Healing Watchdog (กัน Session เงียบ/ค้าง)

> **เพิ่ม 2026-08-12** — แก้จุดอ่อนที่พบหน้างานจริง: session ค้างเงียบ 16 นาที (18:39–18:55) โดยไม่รู้ตัว

- `_last_data_time` อัปเดตทุกครั้งที่ได้รับข้อมูลจากตู้ (รวม RDSS poll response ทุก 3 วิ)
- `_watchdog_loop` ตรวจทุก `WATCHDOG_CHECK_INTERVAL` (default `10`) วิ: ถ้าไม่ได้รับข้อมูลเกิน `WATCHDOG_SILENCE_TIMEOUT` (default `60`) วิ → **ปิด connection ให้ main loop Force-reconnect อัตโนมัติ** พร้อม log `⚠️ Watchdog: ไม่ได้รับข้อมูลจาก PBX...`
- **Heartbeat/Poll resilience:** ถ้า `writer.write/drain()` พัง (สายขาดจริง) → ปิด connection ให้ reconnect ทันที แทนรอเงียบๆ
- ตรวจใน log หลัง deploy: `Watchdog loop started (silence timeout=60s, check every 10s)`
- Unit tests: `TestWatchdog` 3 รายการ (ใน `test_smdr_parser.py`, รวม 18/18 ผ่าน)

## PC Proxy 2323 — Emulation ให้ตรงกับตู้จริง (Room Manager Proxy Fix)

> **เพิ่ม 2026-08-12** — แก้ปัญหาโปรแกรม Phonik บน PC ต่อ Proxy แล้วตัดการเชื่อมต่อ ("ตั้งไม่ได้")

**สาเหตุ:** โปรแกรม PC เชื่อม 2323 ได้จริง (ผ่าน `..PASS=1234 → ==ACKW`) แต่ไปค้างที่ `..RDSS=all` เพราะโค้ดเดิมตอบห้อง `1001-1024` (ค่าจาก simulator) ไม่ตรงกับตู้จริง → โปรแกรมไม่ยอมรับรูปแบบและตัดสาย

**รูปแบบ `..RDSS=all` ที่ตู้จริงตอบ (captured หน้างาน):**

```
..RDSS=all
-> ==RDSS401=0   (401..409 ตามสถานะจริง)
-> ==RDSS402=0
   ...
-> ==RDSS409=0
-> ==RDSS=0      (×6 — สถานีที่ไม่ได้ config)
-> ==RDSS400=0   (สถานีกลาง)
-> ==ACKW        (ปิดท้าย)
```

**คำสั่งข้อมูลอื่น (lowercase ตามตู้จริง):**

| คำสั่ง PC | Response จริงของตู้ |
|-----------|-------------------|
| `..name=` | `==name=   ` |
| `..date=` | `==date=YY/MM/DD-<isoweekday>` |
| `..time=` | `==time=HH:MM:SS` |
| `..ssid=` | `==ssid=136375` (เลขเครื่องของตู้ตัวนี้) |
| `..data6=` | `==data6=` + บล็อกหน่วยความจำ `==:40000070:...` |
| `..data0=` | `==data0=` + บล็อกหน่วยความจำ `==:81028000:...` |

**ในโค้ด:** `_build_proxy_response()` ใน `snc_pbx_listener.py` — ตอบ `..RDSS=all` ด้วยรูปแบบจริงของตู้ + **สถานะสดจาก `rdss_states`** (อัปเดตโดย RDSS poll ทุก 3 วิ) → Room Manager บน PC เห็นสถานะห้องแบบเรียลไทม์ ไม่ต้องต่อตรงตู้ `.91` อีกต่อไป (กัน Session Lock)

### ⏸️ ข้อจำกัดที่เหลือ (Parked — ไม่สำคัญต่อระบบหลัก, 2026-08-12)

- **อาการ:** โปรแกรม PC เชื่อม Proxy 2323 ครบทุกขั้น (PASS → `..=` → `..RDSS=all`) และได้รับ response รูปแบบถูกต้อง 100% แต่**ยังปิดการเชื่อมต่อเองหลัง ~3 วิ** (เช่น log `21:41:35 Proxy client disconnected`) — ไม่เห็นการตั้งค่าผ่านสมบูรณ์
- **คาดว่า:** โปรแกรม PC ต้องการองค์ประกอบเพิ่มที่เรายังไม่รู้ (เช่น banner/ลำดับเริ่มต้นเฉพาะ, การตรวจสอบ memory dump เต็มรูปแบบ, หรือรอข้อมูลจากคำสั่งอื่น) — ต้องไล่กับตัวโปรแกรมจริง (จับ traffic/ดูข้อความ error หน้างาน)
- **ทางเลือกที่ลองได้ทีหลัง:** (1) จับ banner/ลำดับจริงของตู้ขณะ PC ต่อตรง `.91` มาลอกแบบ (2) ให้ Proxy ฟังพอร์ต 23 เพิ่ม เผื่อโปรแกรมยอมรับพอร์ตอื่นไม่ได้ (3) ใช้โหมด relay ส่งคำสั่งผ่าน session ของ Listener ไปยังตู้จริง
- **สถานะ:** ระบบ Nurse Call หลัก (RDSS polling → Dashboard) **ไม่เกี่ยวข้องและทำงานปกติ 100%** — งานนี้คือการให้ PC ดูสถานะผ่าน proxy เท่านั้น

## SMDR vs RDSS (อย่าสับสน)

| | SMDR (`==SMDX...`) | RDSS (`==RDSS...`) |
|---|---|---|
| ความหมาย | ประวัติ Call Accounting (timestamp, duration) | สถานะห้องเรียลไทม์ |
| การส่ง | Push ไปยังปลายทางที่ตั้งค่า (Target IP) / เก็บในคิว | Buffer แล้ว Dump เมื่อถูกขอ |
| การใช้ | ประวัติ/SLA ย้อนหลัง (รอตั้งค่า SMDR Output ที่ตู้) | **ช่องทางเรียลไทม์หลักของ Dashboard** |

## Troubleshooting Quick Reference

| อาการ | สาเหตุ | แก้ |
|-------|--------|-----|
| Connected แต่ไม่มี event หลังกดปุ่ม | Session Lock (Config Builder บน PC ครอบอยู่) | `netstat -ano | findstr 192.168.1.91` → kill PID → restart listener |
| Handshake `..EVNT=ALL` → `PWER/RDSS dump` แทน `EVNT=END` | มีเหตุการณ์ค้าง/สถานะ active อยู่ (dump = ปกติ) | ตรวจสอบว่า dump จบด้วย `==EVNT=END` = healthy |
| `..SMDXpend=` ค่าโตขึ้นเรื่อยๆ | SMDR record ถูกบันทึกแต่ไม่ถูกส่งออก (ปลายทางไม่รับ) | ตั้ง SMDR Output=ON + Target IP=192.168.1.94 ที่ตู้ หรือ Power Cycle จริง |
| ตู้ตอบ `Not have free PABX telnet port` | session ค้างเต็ม RAM ตู้ | Power Cycle ตู้ (ปิด ~15s) |
