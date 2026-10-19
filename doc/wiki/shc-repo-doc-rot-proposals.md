---
title: SHC Repo Doc-Rot Proposals (ก้อน A) — License & Spec/ADR Intake
type: proposal
description: ข้อเสนอแก้ไข doc-rot สำหรับ repo nithep/shc — license mismatch (ISC vs proprietary) และวิธีนำสเปก/ADR เข้า doc/ ของ repo (เสนอเท่านั้น ยังไม่แก้ไข)
tags: [doc-rot, license, governance, proposal, shc]
timestamp: "2026-10-20T00:00:00+07:00"
status: proposed-only
---

# SHC Repo Doc-Rot Proposals (ก้อน A)

> **สถานะ: เสนออย่างเดียว — ยังไม่แก้ไขไฟล์ใดๆ ตามกฎบรีฟ**
> หาก Mnemo อนุมัติ จึงจะดำเนินการแก้ในก้อนถัดไป

---

## 1. License mismatch

| ไฟล์ | ค่าปัจจุบัน | ปัญหา |
|---|---|---|
| `LICENSE` (root) | proprietary — "All rights reserved", ห้ามคัดลอก/เผยแพร่ | — |
| `api/package.json` | `"license": "ISC"` | ขัดกับ root LICENSE ที่เป็น proprietary → ISC เป็น permissive open-source license ที่อนุญาตให้ใช้/ดัดแปลง/แจกจ่าย อย่างเสรี ซึ่ง**ขัดกับเจตนา proprietary** |
| `package.json` (root) | ไม่มี key `license` | ไม่ระบุชัดเจน |

### ข้อเสนอ
1. `api/package.json` → เปลี่ยน `"license": "ISC"` เป็น `"license": "UNLICENSED"` และเพิ่ม `"private": true`
2. `package.json` (root) → เพิ่ม `"private": true` (และใส่ `"license": "UNLICENSED"` หากต้องการชัดเจน)
3. ตรวจ `app/package.json`, `pbx/package.json`, `ops/edge-agent/package.json`, `api/cloudrun/package.json` ว่ามี license key ขัดกันหรือไม่ (ยังไม่ได้ตรวจในก้อน A — เสนอให้ตรวจในก้อน pool)

> **UNLICENSED** เป็นค่ามาตรฐานของ npm ที่หมายถึง "ไม่เผยแพร่ภายใต้ license ใด — proprietary" ตรงกับเจตนาของ root LICENSE

---

## 2. วิธีนำสเปกและ ADR เข้า `doc/` ของ repo

### 2.1 ADR (Architecture Decision Records)
- **ที่วาง:** `doc/wiki/decision_records/`
- **Template:** `doc/Templates/ADR-Template.md`
- **ชื่อไฟล์:** `ADR-NNN-<slug>.md` (ถัดจาก `ADR-001-safety-pipeline.md`)
- **Frontmatter:** ตาม template — มี `Status` (draft/proposed/approved/rejected/deprecated/superseded-by)

### 2.2 สเปก (Specs)
- **ที่วาง:** `doc/raw/hardware_specs/` (spec ฮาร์ดแวร์) หรือสร้าง `doc/raw/specs/` ใหม่ (spec ซอฟต์แวร์/API)
- **Pattern อ้างอิง:** `doc/raw/hardware_specs/phonik_protocol_cch2.md` — มี frontmatter `type`, `source`, `status: ground-truth`, `capture_method`, `extracted_at`
- **ขั้นตอน intake (ตามแบบ Ingest test ที่ DSB ใช้):**
  1. Copy ต้นฉบับ → `doc/raw/...`
  2. คำนวณ SHA256 → บันทึกใน `doc/raw/MANIFEST.sha256`
  3. Verify checksum ตรง
  4. อัปเดต `doc/index.md`

### 2.3 Design / Proposed
- **ที่วาง:** `doc/wiki/` (ตามที่ก้อน A นี้ทำ — `shc-api-mvp-presence-policy-design.md`)

### 2.4 กฎบังคับทุกไฟล์
- **UTF-8 ไม่มี BOM** (กฎ workspace ข้อ 11)
- มี **frontmatter** ครบ
- อัปเดต `doc/index.md` ทุกครั้ง (กฎ repo ข้อ 7)
- บันทึก timeline เมื่อเป็น milestone (กฎ repo ข้อ 9)

---

## 3. Blocker ที่เกี่ยวข้อง
- **สเปก SHC API MVP §5 (นโยบาย 5 ข้อ)** ยังไม่มีสำเนาใน repo → วิธี intake ตามข้อ 2.2 ต้องใช้ก่อนออกแบบ `policy_verifier.js` รายละเอียดครบ (จุดตัดสิน Mnemo ข้อ 2)
