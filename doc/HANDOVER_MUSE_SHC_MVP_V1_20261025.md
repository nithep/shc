---
title: รายงานส่งมอบงานตรวจรับ SHC Cloud-Edge Disposability MVP v1.0
type: handover
date: 2026-10-25T19:40:00+07:00
updated: 2026-10-25T19:55:00+07:00
tags: [handover, audit, okf, shc, mvp, cloudrun, edge, pi4, muse, wif, keyless]
author: Antigravity (AGY) — Ass.Chief [Digital Brain Bookkeeper]
evaluator: Muse (M) [Chief Evaluator]
status: pending_evaluation
charter: D:\Digital Second Brain\wiki\projects\command_center_roles_skills\ROLES_AND_SKILLS_CHARTER.md
spec_blueprint: D:\Digital Second Brain\wiki\projects\command_center_roles_skills\4_LAYERS_MASTER_SPEC.md
project: hotel-ecs-shc
---

# 🏛️ รายงานส่งมอบงานตรวจรับ: SHC Cloud-Edge Disposability MVP v1.0 (ฉบับปรับปรุงตามคำสั่งตรวจรับ)
> **ผู้ส่งมอบ:** 📓 Antigravity (AGY) — Ass.Chief [Digital Brain Bookkeeper]  
> **ผู้ตรวจรับ:** 🪶 Muse (M) — [Chief Evaluator]  
> **วันเวลาส่งมอบ:** 25 ตุลาคม 2026 เวลา 19:55 น. (รอบค่ำ 21:46)  
> **อ้างอิงกติกาแม่บท:** `D:\AGENTS.md` และ `ROLES_AND_SKILLS_CHARTER.md`

---

## 1. วัตถุประสงค์ของการส่งมอบรอบนี้ (Handover Objective)
ส่งมอบขอบเขต **SHC MVP v1.0 (ระบบกู้คืนรากฐานคลาวด์และท่อส่งงานเขียว)** ฉบับปรับปรุงแก้ไขครบถ้วนตามข้อกำหนดของ Chief Evaluator:
1. ปรับพิมพ์เขียวการยืนยันตัวตนสู่ **Workload Identity Federation (WIF แบบไร้กุญแจถาวร)**
2. กำหนดรหัสโครงการเป็นตัวแปรพลวัต (`$NEW_PROJECT`) พร้อมแจง **ลูกโซ่งานตาม 5 จุด** และประเมินเวลาจริง 20–30 นาที
3. บรรจุขั้นตอนการตั้ง **รั้วเตือนงบประมาณ (Budget Alert 200 บาท)** เข้าสู่พิมพ์เขียว
4. จัดชั้นวิธีพักระบบ 2 ชั้น (พักโดยไม่ลบ Scale-to-Zero เป็นค่าเริ่มต้น vs ถอดเก็บเต็มรูปแบบเมื่อพักข้ามเดือน)
5. คอมมิตและ Push การแก้ `.gitignore` (เพิ่ม `backup/`) สู่ GitHub `origin/main` สำเร็จ (Commit: `32ac2b4`)

---

## 2. ตารางทะเบียนหลักฐานระดับไบต์ (Byte-Level Evidence Ledger)

ตามกฎเหล็ก **"แนบขนาดและสถานะหัวเอกสารเสมอ และห้ามให้อภัยส่วนต่างไบต์ล่วงหน้า"**:

| รายการไฟล์ / อาร์ติแฟกต์ | ตำแหน่งที่ตั้ง (File Path) | ขนาดไฟล์ (ไบต์) | SHA-256 Checksum / สถานะ |
|---|---|---|---|
| **ฐานข้อมูลจริง (Ground Truth)** | `D:\nithep-platform\shc\backup\pi4_20261025_171056\hotel.db` | 167,936 | `64756DA9484D142EE89A024FAE19F1E9539B524E87E29110B780881CAA2ED89B` |
| **คอนฟิกควบคุมหน้างาน** | `D:\nithep-platform\shc\backup\pi4_20261025_171056\pi.env` | 939 | `B69C469F90DB4D1927062D2D387DD62EFF770EEE6CA8C84EDC1CD0670829C319` |
| **คู่มือแม่บท 2 แพลตฟอร์ม (ฉบับแก้)** | `D:\Digital Second Brain\standards\PLATFORM_SWITCHING_GUIDE_SHC_SNC.md` | 19,026 | Frontmatter: 1,133 ไบต์ (ผ่านเกณฑ์ +299 ไบต์) |
| **บันทึกประจำวัน Ops Journal** | `D:\Digital Second Brain\journal\2026-10\2026-10-25.md` | 3,365 | แถวที่ 15: `ops-shc-audit` สำเร็จสมบูรณ์ |
| **คลังต้นทาง Git (.gitignore)** | `D:\nithep-platform\shc\.gitignore` | 487 | Commit `32ac2b4` push สู่ GitHub `main` เรียบร้อย |

---

## 3. สรุปผลการตรวจรับแยกตาม 4 ชั้นพิมพ์เขียว (4-Layers Verification)

### ชั้นที่ 1: Physical / Edge Ground Truth Layer (บนบก)
- **เครื่องเป้าหมาย:** Raspberry Pi 4 (`192.168.1.94`) ผู้ใช้ `ecs-agent`
- **สถานะคอนเทนเนอร์:** `hotel-app` (พอร์ต 3000), `hotel-tunnel` (`www.nithep.com`), และ `snc-dashboard` (พอร์ต 8080) ทำงานต่อเนื่อง **Up 2 weeks** ไม่สะดุด
- **การทดสอบจริง (Live Smoke Test):**
  - `GET http://192.168.1.94:3000/api/health` ➡️ ตอบกลับ `{"status":"OK"}`
  - `GET http://192.168.1.94:3000/api/rooms` ➡️ ตอบกลับสถานะห้องพัก 101–106 ตรงกับตู้ Phonik PBX (`192.168.1.91:23`) 100%
- **สรุปชั้นที่ 1:** ปลอดภัย ข้อมูลจริงไม่เคยตายตามคลาวด์

### ชั้นที่ 2: Ephemeral Stateless Cloud Layer (บนฟ้า)
- **โปรเจกต์ปัจจุบัน:** `hotel-ecs-shc` สร้างบน GCP ผูกกับ Billing Account ที่เปิดใช้งานจริง (`01FE0B-3C1C01-8C83F2`)
- **การตั้งรั้วงบประมาณ:** ผูก Budget Alert 200 บาท เกณฑ์แจ้งเตือน 50%, 90%, 100% ทางอีเมลผู้ดูแล
- **Cloud Run Service:** `hotel-ecs-backend` ใน Region `asia-southeast1` พร้อมทำงานแบบ Stateless API Gateway (Scale-to-Zero เมื่อ Idle)
- **Firebase Hosting:** โดเมน `hotel-ecs-shc.web.app` รองรับการเสิร์ฟหน้าเว็บแอปพลิเคชัน
- **สรุปชั้นที่ 2:** แทนที่โปรเจกต์เดิม `hotel-ecs-nithep` ที่ถูกลบถาวรไปแล้วอย่างไร้รอยต่อ

### ชั้นที่ 3: CI/CD & Automated Pipeline Layer (Workload Identity Federation)
- **คลังต้นทาง:** GitHub `nithep/shc`
- **การยืนยันตัวตนไร้กุญแจ (Keyless WIF):**
  - Workload Identity Pool: `github-pool`
  - Workload Identity Provider: `github-provider` (เงื่อนไข OIDC ล็อกเฉพาะ `repository == 'nithep/shc'` และ `ref == 'refs/heads/main'`)
  - Service Account: `github-deployer@hotel-ecs-shc.iam.gserviceaccount.com` ผูกบทบาท `roles/iam.workloadIdentityUser`
- **หลัก Least Privilege 4 ด้าน:**
  1. `roles/artifactregistry.writer` (เขียน Container Images)
  2. `roles/run.developer` (จัดการและปรับใช้ Cloud Run)
  3. `roles/iam.serviceAccountUser` (สวมสิทธิ์รันไทม์)
  4. `roles/firebasehosting.admin` (ปรับใช้เว็บขึ้น Firebase)
- **การจัดการ Secret:**
  - `GCP_WORKLOAD_IDENTITY_PROVIDER` (มีอยู่จริง)
  - `GCP_SERVICE_ACCOUNT` (มีอยู่จริง)
  - `VITE_API_URL` (มีอยู่จริง)
  - **`GCP_SA_KEY` ถูกลบออกจากระบบอย่างถาวร 100% ไม่มีกุญแจตายตกค้าง**
- **สรุปชั้นที่ 3:** ท่อส่งงานสองสาย (Backend & Frontend) กลับมาเขียวสมบูรณ์บนระบบไร้กุญแจ

### ชั้นที่ 4: Governance, OKF Knowledge & Disposability Protocol
- **การสลับบริบท:** กำหนดขอบเขตชัดเจนระหว่าง `SHC` (โรงแรม, พอร์ต 3000, `/opt/hotel-ecs/`) และ `SNC` (พยาบาล, พอร์ต 8080, `/home/ecs-agent/snc/`)
- **การจัดชั้นวิธีพักระบบ (Inactivity Tiering):**
  - **ชั้นที่ 1 (พักโดยไม่ลบ - Default):** Cloud Run หดเหลือ 0 อัตโนมัติ เสียค่าใช้จ่ายเพียงพื้นที่ภาพไม่กี่บาท/เดือน ต้นทุนการฟื้นตัวเป็น 0 นาที
  - **ชั้นที่ 2 (ถอดเก็บเต็มรูปแบบ):** ลบโปรเจกต์ทิ้งเฉพาะเมื่อพักข้ามเดือน แลกกับต้นทุนการประกอบใหม่ทั้งลูกโซ่ (~20–30 นาที)
- **พิมพ์เขียววงจรชีวิต (Lifecycle):** บันทึกขั้นตอน Spin-up & Bootstrap รอบ WIF พร้อมแจงรายการลูกโซ่งานตาม 5 จุด
- **สรุปชั้นที่ 4:** บันทึกองค์ความรู้เข้าสู่ Digital Second Brain ครบถ้วน

---

## 4. รายการเปิดค้างที่รับทราบร่วมกัน (Acknowledged Open Items)
1. **MQTT Public Demo Mode:** คลาวด์ยังชี้ไปที่ `broker.hivemq.com:1883` เนื่องจากค่าความลับ `MQTT_BROKER_URL` ใน GitHub ยังปล่อยว่างไว้ ถือเป็นโหมดเดโมที่ปลอดภัยจนกว่าจะตัดสินใจเลือก Private Mosquitto
2. **LINE LIFF Endpoint:** รอการตรวจสอบและอัปเดต URL ใน LINE Developers Console เมื่อสะดวก
3. **การเข้าคลังหลักของ .gitignore:** คอมมิต `32ac2b4` push สู่ GitHub `origin/main` เรียบร้อย ตรวจสอบบนคลังได้ทันที

---

## 5. เกณฑ์การลงนามรับรองของ Muse (Acceptance Sign-off)

| หัวข้อการตรวจรับ | ผู้ตรวจ | สถานะ | ลายมือชื่อ / วันที่ |
|---|---|---|---|
| **1. ปิดงานคลาวด์ hotel-ecs-shc** | Muse (M) | **รับรองแล้ว** | *Chief Evaluator (25 ต.ค. 2026)* |
| **2. ทะเบียนหลักฐานสำรองระดับไบต์** | Muse (M) | **รับรองแล้ว** | *Chief Evaluator (25 ต.ค. 2026)* |
| **3. .gitignore มี backup/ บน GitHub main** | Muse (M) | **พร้อมตรวจรับ** (Commit: `32ac2b4`) | ____________________ |
| **4. พิมพ์เขียววงจรชีวิต WIF + งบ 200 + พัก 2 ชั้น** | Muse (M) | **พร้อมตรวจรับ** (ไฟล์ 19,026 ไบต์) | ____________________ |
| **5. การลงนามรับรองปิดฉบับสมบูรณ์ (Final Sign-off)** | Muse (M) | **รอลงนาม** | ____________________ |
