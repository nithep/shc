---
title: Frontend UI Architecture
type: concept
description: Technical structure and stack of the Frontend Web Application.
tags: [frontend, react, ui, architecture]
timestamp: "2026-06-28T02:35:00+07:00"
---

# 🖥️ Frontend Architecture

## ภาพรวม (Overview)
หน้าจอของระบบ Smart Hotel Check-in ถูกสร้างขึ้นด้วยเทคโนโลยีที่ทันสมัย เพื่อให้มีดีไซน์พรีเมียม (Premium Dark Mode) รองรับการใช้งานทั้งบนมือถือของลูกค้า (Self Check-in) และหน้าจอของพนักงาน (Room Manager Dashboard)

## เทคโนโลยีหลัก (Tech Stack)
- **Framework**: React + Vite (ประมวลผลรวดเร็ว)
- **Styling**: Tailwind CSS
- **Language**: TypeScript (`.tsx`)

## ไฟล์โครงสร้างสำคัญ (Key Files & Pages)
- **Dashboard (`src/pages/Dashboard.tsx`)**: หน้าจอสำหรับพนักงาน แสดงสถานะของทุกห้องพักในโรงแรมแบบรวมศูนย์
- **Scan (`src/pages/Scan.tsx`)**: หน้าจอสำหรับสแกน QR Code เพื่อให้ลูกค้ายืนยันตัวตนตอน Check-in
- **Layout (`src/components/Layout.tsx`)**: โครงสร้างหลักของหน้าเว็บที่คงอยู่ทุกหน้า
