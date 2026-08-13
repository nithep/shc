---
title: PBX Integration Architecture
type: concept
description: How the Pi 4 communicates with the existing Phonik PBX system.
tags: [pbx, networking, architecture]
timestamp: "2026-06-28T02:00:00+07:00"
---

# ☎️ PBX Integration

## ภาพรวม (Overview)
แทนที่เราจะเดินสายคุมรีเลย์ในห้องใหม่ทุกห้อง ระบบของเราจะใช้ **Raspberry Pi 4** สวมบทบาทเป็น "Room Manager" (PC เดิม) แล้วสั่งงานตรงเข้า **ตู้สาขา (PBX)**

## รูปแบบคำสั่งที่ใช้งานได้
อ้างอิงจากคู่มือของระบบ Phonik ตู้ PBX สามารถรับคำสั่งควบคุมไฟฟ้าได้หลาย Type เช่น:
- `Type 9 (On)`: เปิดจนกว่าจะสั่งปิด (เหมาะสำหรับตอนลูกค้า Check-in รับกุญแจแล้ว)
- `Off`: สั่งปิดไฟฟ้าทันที (ใช้ตอนลูกค้า Check-out)

## แผนการเชื่อมต่อ
- **Physical Layer**: Pi 4 -> สาย LAN / USB / LAN -> ตู้ PBX
- **Software Layer**: โฟลเดอร์ `pbx-connector` ในโค้ดเบส จะทำหน้าที่เป็น Service คอยดักฟัง (Listen) และแปลงคำสั่ง (Encode/Decode) ระหว่าง API ของเรากับโปรโตคอลของตู้สาขา
