---
title: "คู่มือการตั้งค่า Obsidian Web Clipper และ Templates (OKF)"
type: evergreen
tags: [obsidian, setup, knowledge-management, web-clipper, okf]
timestamp: "2026-07-05T21:40:00+07:00"
---

# 📚 คู่มือการตั้งค่า Obsidian Web Clipper และ OKF Capture Templates

เอกสารนี้รวบรวมบันทึกการตั้งค่าเริ่มต้นสำหรับระบบ Web Clipper และการดักจับข้อมูลดิบ (Capture) เข้าสู่ฐานข้อมูล OKF เพื่อให้เป็นมาตรฐานสากลและป้องกันการปะปนของข้อมูลข้ามโปรเจกต์

---

## 1. การตั้งค่า Core Plugins (บน PC และ Mobile)

เพื่อรองรับการใช้งาน Templates เบื้องต้นสำหรับโน้ตและแคปเจอร์ ให้ตั้งค่าที่ **Settings > Core plugins > Templates**:
- **Template folder location**: `docs/Templates`
- **Date format**: `YYYY-MM-DD`
- **Time format**: `HH:mm:ss+07:00` (หรือ `HH:mm`)

*หมายเหตุ: สำหรับมือถือและแท็บเล็ต การตั้งค่าเหล่านี้จะถูกซิงค์ผ่าน Obsidian Sync หรือโฟลเดอร์คลาวด์ หรือหากไม่ซิงค์ก็ให้ตั้งค่าตามด้านบนเช่นเดียวกัน*

---

## 2. การตั้งค่าส่วนขยายเบราว์เซอร์ (Obsidian Web Clipper)

เมื่อทำการตั้งค่า Web Clipper ให้กำหนดกฎและคุณสมบัติดังนี้:

### ก. การตั้งชื่อเทมเพลตและตำแหน่ง (เพื่อป้องกันโฟลเดอร์ซ้ำซ้อน)
เพื่อหลีกเลี่ยงไม่ให้การแคปเจอร์ไปสร้างโฟลเดอร์ `raw` อยู่ที่ Root หรือสลับคลัง (Vault) กัน ควรสร้างเทมเพลตใน Clipper แยกตามโปรเจกต์:
- **ชื่อเทมเพลต**: `Capture -> Hotel-ECS`
- **ตำแหน่งบันทึก (Save Location)**: `docs/raw` *(ต้องระบุ path เต็มเพื่อไม่ให้ไฟล์เด้งไปหน้าบ้าน)*
- **คลัง (Vault)**: เลือกเป็น `Hotel-ECS`

*เวลาแคปเจอร์หน้าเว็บ จะสามารถกดเลือกชื่อเทมเพลตใน Dropdown ด้านบนของป๊อปอัปแคปเจอร์ เพื่อระบุปลายทางได้อย่างแม่นยำ*

### ข. การตั้งค่า Properties (คุณสมบัติ) ใน Web Clipper
แนะนำให้ตั้งค่า YAML Frontmatter Properties ดึงข้อมูลตัวแปรจากหน้าเว็บดังนี้:

| คุณสมบัติ (Property) | ค่าตัวแปร (Value) | รายละเอียด |
| :--- | :--- | :--- |
| **type** | `raw-capture` | ชนิดของโน้ตว่าเป็นข้อมูลดิบรอการประมวลผล |
| **title** | `{{title}}` | ชื่อหน้าเว็บ |
| **source** | `{{url}}` | แหล่งที่มา (URL) |
| **author** | `{{author\|split:", "\|wikilink\|join}}` | ดึงชื่อผู้แต่ง ตัดด้วยจุลภาค ทำเป็น Link `[[Name]]` และนำมารวมกัน |
| **published** | `{{published}}` | วันที่ตีพิมพ์ของบทความ |
| **created** | `{{date}}` | วันที่แคปเจอร์ข้อมูล |
| **description** | `{{description}}` | สรุปจากหน้าเว็บ (Meta description) |
| **status** | `inbox` | สถานะรอการประมวลผล (Distill) |
| **tags** | `clippings, raw-capture` | ป้ายกำกับอัตโนมัติ |

---

## 3. รูปแบบของไฟล์ Template (OKF-Capture-Template)

โครงสร้างแม่แบบมาตรฐาน (จัดเก็บใน `docs/Templates/OKF-Capture-Template.md`) สำหรับใช้งานแบบ Manual ในกรณีที่ไม่ได้แคปเจอร์ผ่านเบราว์เซอร์:

```markdown
---
type: raw-capture
title: "{{title}}"
source: "{{url}}"
author: 
published: 
created: {{date}}T{{time}}
description: 
status: inbox
tags: [capture]
---

# {{title}}

## Summary
- **One-line summary**: 

---

## 📝 Captured Content
```

---
*บทสรุป: การใช้เทมเพลตเดียวในการ Capture เข้าสู่ Inbox (`docs/raw`) เป็นหลักปฏิบัติที่เป็นสากลและช่วยลดภาระสมอง (Frictionless) ก่อนที่จะให้ AI ประมวลผลและแยกแยะ (Distill) เข้าสู่โฟลเดอร์ `/wiki` ต่อไป*
