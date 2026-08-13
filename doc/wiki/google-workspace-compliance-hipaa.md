---
title: Google Workspace Security Compliance และ HIPAA BAA
type: wiki
tags: [security, compliance, hipaa, pdpa, google-workspace, okf]
created: "2026-07-23"
updated: "2026-07-23"
---

# 🛡️ Google Workspace Security Compliance & HIPAA BAA (nithep.com)

เอกสารฉบับนี้สรุปมาตรฐานความปลอดภัย การปฏิบัติตามข้อกำหนดทางกฎหมาย (Compliance), สัญญา **HIPAA Business Associate Addendum (BAA)**, และการกำหนดสิทธิ์แอปพลิเคชัน Google Workspace สำหรับโดเมนองค์กร **`nithep.com`** เพื่อรองรับการคุ้มครองข้อมูลส่วนบุคคลของแขกผู้เข้าพักตามกฎหมาย PDPA ร่วมกับระบบ [[wiki/liff-checkin-process|LINE Self Check-in]] และ [[wiki/google_workspace_integration|การบูรณาการ Google Workspace]] ในระบบ Hotel-ECS

---

## ⚖️ ข้อตกลงความปลอดภัย HIPAA BAA (nithep.com)

องค์กร `nithep.com` ได้ทำสัญญาผูกพัน BAA ร่วมกับ Google LLC เพื่อการประมวลผลข้อมูลที่มีความมั่นคงปลอดภัยสูงสุด โดยมีขอบเขตบริการที่รองรับ ได้แก่:

1. **Covered Services**:
   - **Gmail** (ส่งอีเมลต้อนรับและใบเสร็จให้แขก)
   - **Google Calendar** (จองเวลาและจัดการตารางเข้าพัก)
   - **Google Drive** (Docs, Sheets, Slides, Forms บันทึก Audit Logs)
   - **Google Sites** & **Google Vault** (การจัดเก็บและกำกับดูแลข้อมูลถาวร)
2. **นโยบายการควบคุมของผู้ดูแลระบบ (Admin Duties)**:
   - เปิดใช้งาน **2-Step Verification (2FA)** สำหรับบัญชีผู้ดูแลระบบและพนักงานทั้งหมด
   - กำหนดสิทธิ์การแชร์ไฟล์ภายนอกอย่างเคร่งครัด
   - ปิดการใช้งานบริการเพิ่มเติม (Additional Services) ที่ไม่อยู่ในกลุ่มคุ้มครอง สำหรับผู้จัดการข้อมูลสำคัญ

---

## 🔒 การกำหนดสิทธิ์ Gemini App & Workspace Controls

ตามการตั้งค่าบน **Google Workspace Admin Console (`admin.google.com`)**:

- **Google Workspace Apps Extension for Gemini**:
  - เปิดสิทธิ์ให้แอป Gemini เชื่อมโยงข้อมูลกับ Workspace (Drive, Gmail, Docs) สำหรับบัญชีองค์กร `admin@nithep.com`
  - ข้อมูลและข้อความแชทของผู้ใช้จะ **ไม่ถูกตรวจสอบโดยมนุษย์** และ **ไม่นำไปใช้ฝึก Generative AI Models** ภายนอก ทำให้ปลอดภัยต่อข้อมูลความลับของโรงแรม 100%
- **Google Classroom Extension**:
  - เปิดสิทธิ์การเข้าถึงสำหรับการฝึกอบรมบุคลากรและทีมช่างโรงแรม

---

## 🏨 การสอดรับกับนโยบาย PDPA ของระบบ Hotel-ECS

- **Auto-Eviction Data Policy**: ข้อมูลส่วนบุคคลของแขกผู้เข้าพัก (เช่น ชื่อ, อีเมล, เบอร์โทร) ที่บันทึกผ่านหน้า [[wiki/liff-checkin-process|LINE Self Check-in]] จะถูกลบ/ทำลายออกจากหน่วยความจำและ SQLite หลังการเช็คเอาท์ ตามมาตรฐาน [[wiki/role_based_security_design|การออกแบบความปลอดภัยตามบทบาท (RBAC)]]
- **Audit Logs in Google Sheets**: ประวัติการเข้าออกห้องพักและการอนุมัติจะส่งผ่าน Webhook ไปยัง Google Sheets (`nithep.com`) ภายใต้สัญญา BAA ป้องกันข้อมูลรั่วไหล

---

## 🔗 โน้ตที่เกี่ยวข้อง (Related Notes)
- [[wiki/google_workspace_integration|คู่มือการบูรณาการ Google Workspace]]
- [[wiki/role_based_security_design|การออกแบบความปลอดภัยแบบอิงบทบาท (RBAC)]]
- [[wiki/line-mini-app-iap-terms|การวิเคราะห์ข้อกำหนด LINE MINI App]]
- [[wiki/system_cost_and_maintenance|ทะเบียนค่าใช้จ่ายและการบำรุงรักษาระบบ]]
