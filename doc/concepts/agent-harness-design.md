---
title: "สถาปัตยกรรม Code as Agent Harness สำหรับ Hotel-ECS"
type: evergreen
tags: [architecture, agent-harness, digital-twin, workflow, ai]
timestamp: "2026-07-05T22:00:00+07:00"
source: "raw/archive/2026-07-05T202425+0700 การบูรณาการและการนำไปใช้.md"
related: ["[[prototype-strategy]]", "[[milestones-and-testing]]"]
---

# 🤖 สถาปัตยกรรม Code as Agent Harness สำหรับ Hotel-ECS

เอกสารฉบับนี้กำหนดสถาปัตยกรรมการทำงานของระบบและโครงสร้างการทำงานของ AI Agent ในโครงการ Hotel-ECS โดยประยุกต์ใช้กรอบแนวคิด **"Code as Agent Harness"** (อ้างอิงจากงานวิจัย Survey paper arXiv 2605.18747)

แนวคิดหลักคือการมอง Code และ Environment ของระบบ ไม่ได้เป็นแค่ผลลัพธ์ แต่เป็น **Harness** (โครงข่ายและสภาพแวดล้อมที่จับต้องได้ ตรวจสอบได้) ที่อนุญาตให้ AI Agent เข้ามาจำลอง (Model), รับมือ (Act) และประสานงานกันได้

## 📊 ผังอธิบายรูปแบบการทำงาน (System Architecture Diagram)

```mermaid
graph TD
    %% Users
    U["Guest / Staff"] -->|"Interact"| F["Frontend Dashboard / UI"]
    
    %% The Harness
    subgraph The Harness (Execution & State)
        F <-->|"API Calls"| B["Backend API"]
        B <-->|"RS-232 / TCP"| M["Mock PBX Simulator / Digital Twin"]
        M -.->|"Logs & State"| R[("Repository / docs/")]
        R -->|"Store"| OKF["OKF Knowledge Base"]
    end
    
    %% AI Agents
    subgraph Multi-Agent System
        L["Librarian Agent"] -->|"Extract & Synthesize"| OKF
        V["Verification Agent"] -->|"Fact-Check & Validate"| OKF
        L <.->|"Cooperate"| V
    end
    
    %% Connections
    B -.->|"Test-Gated (Phase 5)"| HW["Physical Phonik PBX"]
    style HW fill:#ff9999,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5
    style M fill:#99ccff,stroke:#333,stroke-width:2px
    style R fill:#ffcc99,stroke:#333,stroke-width:2px
```

---

## 1. การจำลองสภาพแวดล้อม (Execution-Trace World Modeling)

ใช้หลักการ **Digital Twin** ในการจำลองสภาพแวดล้อมจริงเพื่อตรวจสอบความถูกต้องก่อนทำงานกับฮาร์ดแวร์
- **Mock PBX Server**: เป็นตัวจำลองสถานะของฮาร์ดแวร์ (Relay State, PBX Signals)
- **ประโยชน์**: ช่วยให้ Agent (และนักพัฒนา) มีสภาพแวดล้อมที่สามารถทดสอบ ทดลอง และวิเคราะห์ log (Execution trace) ได้แบบเรียลไทม์ 

## 2. ฐานข้อมูลแบบโลกคู่ขนาน (Repository as a Persistent Program World)

แทนที่จะให้ AI จดจำข้อมูลเองทั้งหมด เราใช้โครงสร้างโฟลเดอร์ของโปรเจกต์เป็นพื้นที่ความจำระยะยาว (Persistent World)
- โฟลเดอร์ `docs/` (ระบบ OKF) ทำหน้าที่เป็น **World Model ถาวร**
- เป็นพื้นที่ที่ Agent สามารถอ่าน/เขียนข้อมูลร่วมกันได้ตลอดเวลา ทำให้ไม่สูญเสียบริบทเมื่อเริ่ม Session ใหม่

## 3. การแยกบทบาทเฉพาะทางของ Agent (Functional Role Specialization)

เพื่อแก้ปัญหาเดิมที่เกิดการอ้างอิงข้อมูลผิด (Misattribution) เมื่อทำคู่มือหรือวิเคราะห์ปัญหา จะมีการแยกหน้าที่ของ Agent อย่างชัดเจน (Multi-agent System):
- **Librarian / Synthesis Agent**: มีหน้าที่รับผิดชอบในการดึงข้อมูลจากเอกสาร และนำมาสังเคราะห์หรือเขียนสรุปเป็นโครงสร้าง
- **Verification Agent**: มีหน้าที่ตรวจทานความถูกต้อง (Fact-check), เช็คการอ้างอิง และยืนยันความแม่นยำก่อนผสาน (Merge) ข้อมูลเข้าสู่เอกสารตัวจริง

## 4. เงื่อนไขการบรรจบสู่เป้าหมาย (Test-Gated Convergence)

ใน Roadmap การพัฒนาสู่ Production จะต้องมีเกณฑ์การตัดสินใจที่ชัดเจน (Convergence Criteria)
- การทดสอบในห้อง Sandbox จะต้องมี **Gate** ดักไว้ (เช่น ระบบรับคำสั่งเปิด-ปิดไฟห้องพักต้องผ่าน Test cases N รูปแบบ)
- **เงื่อนไข**: หากการจำลองบน Digital Twin ยังให้ผลไม่สมบูรณ์ จะไม่มีการอนุญาตให้ขยับไป Phase ถัดไป (การต่อสาย Raspberry Pi เข้าตู้ PBX จริง) อย่างเด็ดขาด

---
*บันทึก: โครงสร้างนี้ใช้สำหรับการพัฒนาในขั้นถัดไป เพื่อรับประกันความแม่นยำของเอกสาร และความน่าเชื่อถือของระบบ Hotel-ECS ทั้งบนจำลองและฮาร์ดแวร์จริง*
