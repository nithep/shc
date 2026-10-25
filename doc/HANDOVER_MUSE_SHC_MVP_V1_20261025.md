---
title: รายงานส่งมอบงานตรวจรับ SHC Cloud-Edge Disposability MVP v1.0
type: handover
date: 2026-10-25T19:40:00+07:00
updated: 2026-10-25T21:50:00+07:00
tags: [handover, audit, okf, shc, mvp, cloudrun, edge, pi4, muse, wif, keyless, errata3]
author: Antigravity (AGY) — Ass.Chief [Digital Brain Bookkeeper]
evaluator: Muse (M) [Chief Evaluator]
status: pending_evaluation
charter: D:\Digital Second Brain\wiki\projects\command_center_roles_skills\ROLES_AND_SKILLS_CHARTER.md
spec_blueprint: D:\Digital Second Brain\wiki\projects\command_center_roles_skills\4_LAYERS_MASTER_SPEC.md
project: hotel-ecs-shc
---

# 🏛️ รายงานส่งมอบงานตรวจรับ: SHC Cloud-Edge Disposability MVP v1.0
> **ผู้ส่งมอบ:** 📓 Antigravity (AGY) — Ass.Chief [Digital Brain Bookkeeper]  
> **ผู้ตรวจรับ:** 🪶 Muse (M) — [Chief Evaluator]  
> **วันเวลาส่งมอบ:** 25 ตุลาคม 2026 เวลา 21:50 น. (รอบค่ำ 21:46)  
> **อ้างอิงกติกาแม่บท:** `D:\AGENTS.md`, `ROLES_AND_SKILLS_CHARTER.md` และ *หมายเหตุแก้คำข้อที่ 3 โดย Muse*

---

## 1. วัตถุประสงค์ของการส่งมอบรอบนี้ (Handover Objective)
ส่งมอบขอบเขต **SHC MVP v1.0 (ระบบกู้คืนรากฐานคลาวด์และท่อส่งงานเขียว)** ฉบับปรับปรุงแก้ไขครบถ้วนตามข้อกำหนดของ Chief Evaluator และหมายเหตุแก้คำข้อที่ 3 (สำรวจเฟส 0):
1. **ปรับปรุงข้อเท็จจริงชั้นที่ 1 (Edge Ground Truth):** ระบุชัดว่าระบบจริงคือ `shc-api` พอร์ต 3999 (systemd) ฐานข้อมูลจริง 53,248 ไบต์ (ห้อง 101–106 ว่างและไฟปิดทุกห้อง) ส่วน `hotel-app` พอร์ต 3000 เป็นตัว stub จำลอง
2. **พิมพ์เขียวยืนยันตัวตนคลาวด์:** ปรับสู่ **Workload Identity Federation (WIF แบบไร้กุญแจถาวร)**
3. **การจัดการโครงการ:** กำหนดรหัสโครงการเป็นตัวแปรพลวัต (`$NEW_PROJECT`) พร้อมแจง **ลูกโซ่งานตาม 5 จุด** และประเมินเวลาจริง 20–30 นาที
4. **รั้วความปลอดภัย:** บรรจุขั้นตอนการตั้ง **รั้วเตือนงบประมาณ (Budget Alert 200 บาท)** เข้าสู่พิมพ์เขียว
5. **การพักระบบ:** จัดชั้นวิธีพักระบบ 2 ชั้น (พักโดยไม่ลบ Scale-to-Zero เป็นค่าเริ่มต้น vs ถอดเก็บเต็มรูปแบบเมื่อพักข้ามเดือน)
6. **ความปลอดภัยคลัง:** คอมมิตและ Push การแก้ `.gitignore` (เพิ่ม `backup/`) สู่ GitHub `origin/main` สำเร็จ (Commit: `32ac2b4`)

---

## 2. ตารางทะเบียนหลักฐานระดับไบต์ (Byte-Level Evidence Ledger)

ตามกฎเหล็ก **"แนบขนาดและสถานะหัวเอกสารเสมอ และห้ามให้อภัยส่วนต่างไบต์ล่วงหน้า"**:

| รายการไฟล์ / อาร์ติแฟกต์ | ตำแหน่งที่ตั้ง (File Path) | ขนาดไฟล์ (ไบต์) | SHA-256 Checksum / สถานะ |
|---|---|---|---|
| **ฐานข้อมูลจริง (Ground Truth - shc-api)** | `D:\nithep-platform\shc\backup\phase0_20261025_2129\shc-api\hotel.db` | 53,248 | `3debb4a2f15aeb188d433e5eaf0d99ae9c1468cc8eeb23cb249585df75ee39c5` |
| **คอนฟิกจริงหน้างาน (shc-api)** | `D:\nithep-platform\shc\backup\phase0_20261025_2129\shc-api\api.env` | 1,080 | `0292f8307cd7150a36f050aec5beb69e9385ffe096f4510ce3b085e1057c9d6a` |
| **ฐานข้อมูลตัว Stub (ชุดเก่า hotel-app)** | `D:\nithep-platform\shc\backup\pi4_20261025_171056\hotel.db` | 167,936 | `64756da9484d142ee89a024fae19f1e9539b524e87e29110b780881caa2ed89b` |
| **คอนฟิกตัว Stub (hotel-app)** | `D:\nithep-platform\shc\backup\pi4_20261025_171056\pi.env` | 939 | `b69c469f90db4d1927062d2d387dd62eff770eee6ca8c84edc1cd0670829c319` |
| **ทะเบียนสำรองเฟส 0 (Manifest)** | `D:\nithep-platform\shc\backup\phase0_20261025_2129\MANIFEST-phase0.md` | 3,111 | ตรวจแฮชตรงกับเครื่องจริง 12 รายการสมบูรณ์ |
| **คู่มือแม่บท 2 แพลตฟอร์ม (ฉบับแก้)** | `D:\Digital Second Brain\standards\PLATFORM_SWITCHING_GUIDE_SHC_SNC.md` | 19,250 | ปรับปรุงพอร์ต 3999 และ WIF สมบูรณ์ |
| **บันทึกประจำวัน Ops Journal** | `D:\Digital Second Brain\journal\2026-10\2026-10-25.md` | 4,280 | เพิ่มแถว `errata-shc-groundtruth` อ้างอิงหมายเหตุข้อ 3 |
| **คลังต้นทาง Git (.gitignore)** | `D:\nithep-platform\shc\.gitignore` | 487 | Commit `32ac2b4` push สู่ GitHub `main` เรียบร้อย |

---

## 3. สรุปผลการตรวจรับแยกตาม 4 ชั้นพิมพ์เขียว (4-Layers Verification)

### ชั้นที่ 1: Physical / Edge Ground Truth Layer (บนบก) — *ปรับปรุงตามหมายเหตุแก้คำข้อที่ 3*
- **เครื่องเป้าหมาย:** Raspberry Pi 4 (`192.168.1.94`) ผู้ใช้ `ecs-agent` (Debian 13, Kernel 6.18.34+rpt-rpi-v8)
- **ระบบที่มีชีวิตจริง (Active Service):**
  - **`shc-api` (systemd, พอร์ต 3999):** รันจากคลังจริงบน Pi ที่ `/home/ecs-agent/shc` (HEAD `7d8a153`)
  - **ฐานข้อมูลจริง (Ground Truth):** SQLite ขนาด **53,248 ไบต์** (`/home/ecs-agent/shc/api/hotel.db`, SHA-256: `3debb4a2...`)
  - **สถานะห้องจริงขณะสำรวจ:** ห้อง 101–106 **ว่างและไฟปิดทุกห้อง** (ควบคุมรีเลย์ช่อง 33–38)
- **ตัว Stub (Mock Container):**
  - **`hotel-app` (Docker, พอร์ต 3000):** เป็นตัว stub (เซิร์ฟเวอร์ขนาด 1,978 ไบต์) ที่ตอบ `/api/rooms` ด้วยค่าคงที่ตายตัว (Mock: 101–105 มีผู้พักและเปิดไฟ, 106 ว่าง) ไม่ใช่ตัวคุมตู้จริง
  - ฐานข้อมูลขนาด 167,936 ไบต์เดิมที่สำรองไว้ตอน 17:10 น. เป็นฐานข้อมูลของตัว stub ชุดเก่า
- **การรับรอง Ground Truth:** ข้อมูลจริงทั้ง 12 รายการได้รับการสำรวจ สำรอง และจับคู่ SHA-256 บันทึกไว้ในโฟลเดอร์สำรองเฟส 0 (`D:\nithep-platform\shc\backup\phase0_20261025_2129\`) ครบถ้วน
- **สรุปชั้นที่ 1:** ระบบจริง (`shc-api` พอร์ต 3999) ทำงานปกติ ข้อมูลจริง 53,248 ไบต์ ปลอดภัยและได้รับการสำรองไว้สมบูรณ์

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
- **การสลับบริบท:** กำหนดขอบเขตชัดเจนระหว่าง `SHC` (โรงแรม, `shc-api` พอร์ต 3999, `/home/ecs-agent/shc/`) และ `SNC` (พยาบาล, พอร์ต 8080, `/home/ecs-agent/snc/`)
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
| **3. .gitignore มี backup/ บน GitHub main** | Muse (M) | **รับรองแล้ว** | *Commit `32ac2b4` ปรากฏบน GitHub main* |
| **4. พิมพ์เขียว WIF + งบ 200 + พัก 2 ชั้น + ลูกโซ่** | Muse (M) | **รับรองแล้ว** | *ปรับปรุงในคู่มือแม่บท ครบถ้วน* |
| **5. แก้คำข้อ 3: shc-api พอร์ต 3999 (ระบบจริง)** | Muse (M) | **พร้อมลงนาม** | *อ้างอิงสำรองเฟส 0 (53,248 ไบต์)* |
| **6. การลงนามรับรองปิดฉบับสมบูรณ์ (Final Sign-off)** | Muse (M) | **รอลงนาม** | ____________________ |
