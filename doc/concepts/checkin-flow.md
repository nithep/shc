---
title: Application Flow
type: concept
description: Business logic flow for Check-in and Check-out processes.
tags: [flow, business-logic, software]
timestamp: "2026-06-28T02:00:00+07:00"
---

# 🔄 Application Flow (Check-in / Check-out)

ระบบนี้ออกแบบมาให้ทำงานแบบ Self-service ผ่าน Web Application 

## 1. Flow การ Check-in
1. ลูกค้าสแกน QR Code หน้าเคาน์เตอร์ด้วยมือถือตัวเอง
2. Web App (Frontend) ตรวจสอบ Booking และส่ง Request ไปที่ API (Backend)
3. Backend ตรวจสอบสถานะห้องว่าว่างหรือไม่ หากว่าง จะส่งคำสั่งไปที่ `pbx-connector`
4. PBX Connector ยิงสัญญาณ `ON` (เปิดระบบไฟ) ไปที่ตู้สาขา
5. ตู้สาขาสั่งปลดล็อกรีเลย์ที่บอร์ด [[phonik-ecs]] ในห้อง
6. ลูกค้าเดินเข้าห้อง เสียบคีย์การ์ด ไฟติดสว่าง

## 2. Flow การ Check-out
1. ลูกค้ากด Check-out บน Web App หรือคืนการ์ดที่จุดคืน
2. Backend ส่งคำสั่งไปที่ `pbx-connector`
3. PBX Connector ยิงสัญญาณ `OFF` (ตัดไฟ) ไปที่ตู้สาขา
4. ไฟฟ้าในห้องถูกตัดทันที 100% (เพื่อประหยัดพลังงานและป้องกันการลักลอบใช้ห้อง)
