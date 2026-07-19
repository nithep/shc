# 🏨 Hotel ECS (Smart Hotel Self Check-in)

![Hotel ECS Banner](https://img.shields.io/badge/Status-In%20Development-blue) ![Platform](https://img.shields.io/badge/Platform-Raspberry%20Pi%204-red) ![Hardware](https://img.shields.io/badge/Hardware-Phonik%20PBX%20ECS--103R-green)

ระบบจัดการห้องพักโรงแรมสมัยใหม่ (Smart Hotel Self Check-in/Check-out) ที่ผสานระหว่าง Web Application และ Hardware Control เข้าด้วยกัน โดยมุ่งเน้นความน่าเชื่อถือ (Reliability) ความปลอดภัย (Security) และประสบการณ์ผู้ใช้ที่ยอดเยี่ยม (Premium UX)

## 📌 ภาพรวมโครงการ (Project Overview)
โปรเจกต์นี้ถูกสร้างขึ้นเพื่อทดแทนระบบ "Room Manager" เดิมที่ทำงานบน PC โดยเปลี่ยนผ่านสู่สถาปัตยกรรม Web Application และทำงานบน **Raspberry Pi 4** เพื่อเป็นศูนย์กลางเชื่อมต่อกับตู้สาขา **Phonik PBX (ECS-103R V.5)** 

ฟีเจอร์หลัก:
- **Self Check-in/Out:** ลูกค้าสแกน QR Code และทำรายการผ่านมือถือได้ด้วยตัวเอง (Premium UI/UX)
- **Hardware Integration:** เปิด/ปิด ระบบไฟฟ้าในห้องพัก (รีเลย์ 220V) อัตโนมัติเมื่อมีการ Check-in หรือ Check-out
- **AI-Powered Orchestration:** ระบบใช้สถาปัตยกรรม Agentic AI (นำโดย HECS - Master Agent) ในการบริหารจัดการ ตรวจสอบความถูกต้อง และจัดทำเอกสาร

## 🏗️ โครงสร้างสถาปัตยกรรม (Architecture)
ดูรายละเอียดเจาะลึกได้ที่ [ARCHITECTURE.md](ARCHITECTURE.md)

| โฟลเดอร์ | รายละเอียด |
|---------|-----------|
| `/frontend` | Web Dashboard & Kiosk สำหรับลูกค้าและพนักงาน (React/Vite) |
| `/backend` | API Server (Node.js/Python) สำหรับจัดการระบบฐานข้อมูลและ Business Logic |
| `/pbx-connector` | สคริปต์ระดับล่าง (Protocol Handler) สำหรับเชื่อมต่อตู้สาขาทาง Serial/TCP |
| `/worker` | โมดูลสำหรับการประมวลผล Agentic tasks และทดสอบฮาร์ดแวร์ |
| `/docs` | ฐานความรู้ (Knowledge Base) รูปแบบ OKF ที่บริหารจัดการโดย AI Agent |

## 🚀 เริ่มต้นใช้งาน (Quick Start)
ดูวิธีการติดตั้ง การเตรียม Raspberry Pi และการตั้งค่าระบบได้ที่ [SETUP.md](SETUP.md)

## 🛡️ ความปลอดภัย (Security & Safety)
ทุกคำสั่งควบคุมตู้สาขาและระบบไฟ จะต้องผ่านระบบ `StateVerifier` เสมอ เพื่อป้องกันอันตรายระดับฮาร์ดแวร์ ดูเพิ่มเติมที่ [SECURITY.md](SECURITY.md)

---
*ดำเนินการจัดทำเอกสารและดูแลสถาปัตยกรรมโดย HECS (Master Agent Orchestrator)*
