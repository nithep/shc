---
title: Backend & PBX Architecture
type: concept
description: Technical structure of the Node.js API and Mock PBX Simulator.
tags: [backend, api, nodejs, pbx, digital-twin]
timestamp: "2026-06-28T04:05:00+07:00"
---

# ⚙️ Backend & PBX Architecture (Digital Twin)

## ภาพรวม (Overview)
ระบบ Backend ถูกสร้างด้วย Node.js (Express) ทำหน้าที่เป็นตัวกลางรับคำสั่งจาก Web Frontend และส่งต่อไปยัง Hardware (PBX) 
ในเวอร์ชัน Sandbox นี้ เราได้สร้าง "Mock PBX" เพื่อจำลองการทำงานของฮาร์ดแวร์จริง

## เทคโนโลยีหลัก (Tech Stack)
- **Server**: Node.js + Express
- **Middleware**: CORS (สำหรับการเชื่อมต่อข้ามพอร์ตกับ Vite), express.json

## API Endpoints
- `POST /api/checkin`: รับค่า `roomNumber` และส่งคำสั่ง **Type 9 (ON)** ไปยังตู้ PBX เพื่อเปิดรีเลย์ห้องพัก
- `POST /api/checkout`: รับค่า `roomNumber` และส่งคำสั่ง **OFF** ไปยังตู้ PBX เพื่อตัดไฟห้องพัก

## PBX Simulator (Mock PBX)
ไฟล์ `pbx-connector/mock_pbx.js` ทำหน้าที่จำลองการทำงานของฮาร์ดแวร์ เมื่อมีการเรียกใช้ฟังก์ชัน `turnOnRelay()` หรือ `turnOffRelay()` ระบบจะทำการแสดง Log บนหน้าจอ Terminal คล้ายกับการตอบสนองของฮาร์ดแวร์จริง เหมาะสำหรับการนำเสนอผ่านวิดีโอ (Digital Twin Presentation)
