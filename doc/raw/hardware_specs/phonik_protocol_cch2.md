---
type: hardware-spec
title: Phonik Protocol CCH2 (ต้นฉบับจากคู่มือผู้ผลิต)
source: "G:\Phonik\Phonik Protocol CCH2.pdf"
device_model: "Phonik PABX Telnet system (DX/DXE/JSD/CIX/DX-Compact Super Diamond)"
device_serial: PHONIK-ECS-103R-V5-001
capture_method: manufacturer_manual_pdf
extracted_at: 2026-08-14T00:00:00+07:00
status: ground-truth
tags:
  - phonik
  - cch2
  - protocol
  - hardware-spec
---

# Phonik Protocol CCH2 — สเปกต้นฉบับจากคู่มือผู้ผลิต

> ⚠️ **Ground Truth:** เอกสารนี้เป็นสเปกต้นฉบับจาก PDF ของผู้ผลิต (`Phonik Protocol CCH2.pdf`)
> ห้ามแก้ไขโดยไม่ผ่านความเห็นชอบจากแอดมินหรือผ่านระบบ checksum ใน `MANIFEST.sha256`

---

## 1. ภาพรวมการเชื่อมต่อ (Connection Overview)

- ระบบเปิดรับการเชื่อมต่อแบบ **Telnet** (`Phonik PABX Telnet system`)
- เมื่อเชื่อมต่อแล้วเครื่องจะส่งข้อความต้อนรับ และต้องรอรับคำสั่งต่อจากไคลเอนต์
- การกด Enter เปล่า ๆ จะได้การตอบกลับ `==NACK`

## 2. คำสั่งอ่านเวอร์ชัน (Version Query)

```
..VERS=           => Read Version
==VERS=DX-SERIES V3.
==VERS=DXE-SERIES V3.
==VERS=JSD-SERIES V3.
==VERS=CIX-SERIES V3.
==VERS=DX-COMPACT V5.Super Diamond-32C
==VERS=DX-COMPACT V5.Super Diamond-80C
==VERS=DX-COMPACT V5.Super Diamond-144C
==VERS=DX-Super Diamond V5.Super D-64
==VERS=DX-Super Diamond V5.Super D-128
==VERS=DX-Super Diamond V5.Super D-256
==VERS=DX-Super Diamond V5.Super D-512
```

## 3. คำสั่ง ASCII Protocol ทั่วไป (Common ASCII Commands)

| คำสั่ง | ความหมาย | การตอบกลับ |
|---|---|---|
| `..DATE=` | อ่านวันที่ | `==DATE=yy/mm/dd-w` |
| `..TIME=` | อ่านเวลา | `==TIME=hh:mm:ss` |
| `..STOP` | ตัดการเชื่อมต่อ | `==STOP` |

## 4. หมวด Check-In / Check-Out

> **หมายเหตุ:** `numb` = หมายเลข Extension เช่น `1001, 1002, 101, 102, xxx, xx, ..`

| คำสั่ง | ความหมาย | การตอบกลับ |
|---|---|---|
| `..ROOMnumb=` | อ่านสถานะห้อง | `==ROOMnumb=r` (r=0-9) |
| `..ROOMnumb=r` | ตั้งสถานะห้อง | `==ROOMnumb=r` |
| `..NAMEnumb=` | อ่านชื่อผู้เข้าพัก | `==NAMEnumb=name` |
| `..NAMEnumb=name` | ตั้งชื่อผู้เข้าพัก | `==NAMEnumb=name` (name=text 16 ตัวอักษร) |

## 5. หมวดบริการเสริม (EXT. SERVICE)

### 5.1 Wake Up Call (ปลุกเรียกห้อง)

| คำสั่ง | ความหมาย | การตอบกลับ |
|---|---|---|
| `..WAKEnumb=` | อ่านเวลาปลุก | `==WAKEnumb=hhmm` |
| `..WAKEnumb=hhmm` | ตั้งเวลาปลุก | `==WAKEnumb=hhmm` |
| `..WAKEnumb=0` | ล้างเวลาปลุก | `==WAKEnumb=0` |

> `hhmm` = ชั่วโมง+นาที รูปแบบ 0000-2359

### 5.2 Lock Status (ล็อกห้อง)

| คำสั่ง | ความหมาย | การตอบกลับ |
|---|---|---|
| `..LOCKnumb=` | อ่านสถานะล็อก | `==LOCKnumb=k` |
| `..LOCKnumb=k` | ตั้งสถานะล็อก | `==LOCKnumb=k` |

> `k` = 0 (Clear) หรือ 1 (Set)

### 5.3 Language (ภาษา)

| คำสั่ง | ความหมาย | การตอบกลับ |
|---|---|---|
| `..LANGnumb=` | อ่านภาษา | `==LANGnumb=l` |
| `..LANGnumb=l` | ตั้งภาษา | `==LANGnumb=l` |

> `l` = 1-4 (Language 1-4)

---

## 6. การนำไปประยุกต์ใช้กับระบบ SHC (Implementation Notes)

สเปกต้นฉบับนี้เป็นพื้นฐานของ `pbx/protocol.js` โดยทีมพัฒนาได้ทำการขยาย (จาก reverse-engineering ตู้จริง ECS-103R V.5) เพิ่มเติมดังนี้:

| ฟีเจอร์ | สเปกต้นฉบับ (PDF) | โปรโตคอลที่ใช้จริงใน SHC |
|---|---|---|
| เปิด/ปิดไฟห้อง (Check-in/Out) | `..ROOMnumb=r` (r=0-9) | `..PWER{room}=1|0` (ค้นพบจากตู้จริง — ควบคุมจำนวนวันไฟ) |
| ตั้งชื่อผู้เข้าพัก | `..NAMEnumb=name` | `..ROOM{ext}=name` (ผ่าน Extension mapping +916) |
| Wake Up | `..WAKEnumb=hhmm` | รองรับใน `protocol.js` (buildSetWake) |
| Lock | `..LOCKnumb=k` | รองรับใน `protocol.js` (buildSetLock) |
| Auth (tcmd/PASS) | ไม่ปรากฏใน PDF ฉบับนี้ | `..tcmd=1` + `..PASS=<password>` (ค้นพบจาก reverse-engineering) |

> 📌 เอกสารอ้างอิงเพิ่มเติม: `pbx/cch2_extracted.txt` (ไฟล์ PDF ดิบ), `pbx/protocol.js` (ตัวถอดรหัส), `doc/wiki/phonik-pbx-protocol.md`
