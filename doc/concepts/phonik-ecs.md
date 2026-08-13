---
title: Phonik ECS-103R Hardware
type: concept
description: Technical details about the Phonik ECS-103R V.5 relay board used in hotel rooms.
tags: [hardware, relay, ecs]
timestamp: "2026-06-28T02:00:00+07:00"
---

# 🔌 Phonik ECS-103R V.5

## ภาพรวม (Overview)
บอร์ด **Phonik ECS-103R V.5** เป็นแผงวงจรควบคุมรีเลย์ (Relay Board) ที่ติดตั้งอยู่ในห้องพักโรงแรม ทำหน้าที่รับสัญญานเพื่อเปิด-ปิดกระแสไฟฟ้า 220V ที่จ่ายให้กับเครื่องใช้ไฟฟ้าและหลอดไฟในห้อง

## การเชื่อมต่อ (Wiring & Interface)
- **A, B, C, D Terminals**: จุดเชื่อมต่อสายไฟ 4 เส้น (ดำ, เขียว, แดง, เหลือง)
- **Keycard Reader**: เต้าเสียบคีย์การ์ดในห้อง จะต่อเข้ากับ Terminal A,B,C,D เพื่อส่งสถานะการเสียบบัตร
- **MDF/PBX Link**: สายสัญญาณ (ปกติใช้สายสีแดงและเขียว) จะถูกลากจากบอร์ดนี้ไปที่ตู้ MDF และเข้าตู้ PBX ส่วนกลาง เพื่อให้ระบบกลางรู้ว่ามีคนเสียบบัตรหรือไม่

## การทำงานร่วมกับระบบของเรา
ระบบ Smart Check-in (Pi 4) จะไม่ยุ่งกับบอร์ดนี้โดยตรง แต่จะสั่งงานผ่านตู้สาขา ([[pbx-integration]]) แทน เพื่อหลีกเลี่ยงการเดินสายไฟใหม่ทั้งหมด
