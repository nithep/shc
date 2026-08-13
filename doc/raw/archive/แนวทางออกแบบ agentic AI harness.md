---
title: Agent Harness Design for Hotel ECS
type: concept
description: แนวทางออกแบบ agentic AI harness สำหรับโปรเจ็ค Hotel ECS โดยประยุกต์กรอบแนวคิด "Code as Agent Harness" เข้ากับ Digital Twin, OKF knowledge base และ Production Roadmap ที่มีอยู่
tags: [hub, agentic-ai, edge-ai, agent-harness, digital-twin, architecture]
source: https://github.com/YennNing/Awesome-Code-as-Agent-Harness-Papers
related:
  - "[[concepts/prototype-strategy|prototype-strategy]]"
  - "[[wiki/milestones-and-testing|milestones-and-testing]]"
  - "[[wiki/phase2-hardware-integration|phase2-hardware-integration]]"
timestamp: "2026-07-05T00:00:00+07:00"
---

# 🧩 Agent Harness Design for Hotel ECS

เอกสารนี้เชื่อมกรอบแนวคิดจาก survey **"Code as Agent Harness"** เข้ากับสถาปัตยกรรมที่มีอยู่แล้วของโปรเจ็ค Hotel ECS โดยเฉพาะส่วน [[concepts/prototype-strategy|prototype-strategy]] เป้าหมายคือทำให้ agent ที่เกี่ยวข้องกับโปรเจ็ค (Librarian Agent และ agent อื่น ๆ ที่จะเพิ่มในอนาคต) ทำงานบน harness ที่ inspectable, verifiable และขยายเป็น multi-agent ได้อย่างมีโครงสร้าง แทนที่จะเป็น agent เดี่ยวที่ทำทุกอย่างในขั้นตอนเดียว

## 1. Digital Twin คือ "Code for Environment Modeling"

Mock PBX Server และ Virtual Relays ที่ออกแบบไว้ใน prototype-strategy คือการนำ code มาใช้จำลอง state และ dynamics ของฮาร์ดแวร์จริง (execution-trace world modeling) นี่คือรากฐานของ harness อยู่แล้ว — สิ่งที่ควรเพิ่มคือทำให้ world model นี้ **inspectable แบบมีโครงสร้าง** ไม่ใช่แค่ print log ออก terminal:

- กำหนด schema ของ state (เช่น `room_id`, `power_state`, `last_command`, `timestamp`) ให้ agent อื่นอ่านค่าปัจจุบันของระบบได้แบบ query ได้ ไม่ต้อง parse log
- เก็บ state history ไว้เป็น trace file (เช่น JSONL) เพื่อให้ agent ตรวจสอบย้อนหลังได้ว่าคำสั่งไหน fail/success

## 2. `docs/` (OKF) คือ "Repository as a Persistent Program World"

แผน Manual Generation ใน prototype-strategy ระบุว่า `docs/` จะเป็นฐานข้อมูลหลัก (World Model) ให้ AI ดึงไปสร้างคู่มือ — นี่ตรงกับแนวคิด repository-based shared state ที่ agent หลายตัวอ่าน/เขียนร่วมกัน สิ่งที่ควรทำให้ชัดเจนขึ้น:

| ชั้นความจำ | เนื้อหา | ตัวอย่าง |
|---|---|---|
| Working memory (ชั่วคราว, ต่อ session) | context ที่ agent ใช้ตอนสร้างเอกสาร 1 ชิ้น | draft ที่ยังไม่ผ่าน verification |
| Persistent memory (ถาวร, ทุก agent อ่านได้) | เอกสาร OKF ที่ผ่านการ verify แล้ว | `docs/wiki/*.md`, `docs/concepts/*.md` |

กติกา: agent ตัวไหนจะ "จำ" อะไรถาวร ต้องเขียนผ่านขั้นตอน verification ก่อน (ดูข้อ 3) ไม่ commit ตรงเข้า persistent memory

## 3. Functional Role Specialization — แก้ปัญหา misattribution ที่เคยเจอ

ก่อนหน้านี้เคยเจอปัญหาเอกสารระบุ attribution ผิด (สับสนระหว่าง "Loop Engineering" กับผลงานจริงของ Karpathy เรื่อง CLAUDE.md self-verification) ต้นตอคือ agent ตัวเดียวทำทั้งดึงข้อมูลและสรุปในขั้นตอนเดียว โครงสร้างที่แนะนำจาก harness paper คือแยก role ชัดเจน:

1. **Extraction Agent** — อ่าน docs/ ดึง fact ที่เกี่ยวข้องมาตั้งเป็น draft เท่านั้น ห้ามสรุป/ตีความ
2. **Verification Agent** — เช็ค fact/citation ของ draft กับแหล่งที่ตรวจสอบได้ (source doc, external reference) ก่อนอนุมัติ
3. **Synthesis Agent** — เขียนเอกสารสุดท้าย (Wiring Diagram, User Manual) จาก draft ที่ verify แล้วเท่านั้น

Librarian Agent (Antigravity) ที่มีอยู่แล้ว สามารถทำหน้าที่เป็น orchestrator ที่เรียกใช้ทั้ง 3 role นี้ตามลำดับ แทนที่จะทำทุกอย่างเอง

## 4. Test-Gated Convergence สำหรับ Production Roadmap

แผนข้อ 3 ใน prototype-strategy (ทดสอบ Sandbox Room 1 ห้อง → ค่อยขยายไปฮาร์ดแวร์จริง) ควรกำหนดเงื่อนไข gate ให้ชัดเจนแบบวัดผลได้ ก่อนอนุญาตให้ขยับเฟส:

- **Phase 0 → 1** (Mock PBX → Sandbox Room จริง): ต้องผ่านคำสั่งเปิด/ปิดไฟถูกต้อง N ครั้งติดต่อกันโดยไม่มี error บน พอร์ต LAN ของPBX
- **Phase 1 → 2** (Sandbox Room → หลายห้อง): ต้องไม่มี state mismatch ระหว่าง Digital Twin กับฮาร์ดแวร์จริงในการทดสอบต่อเนื่อง (ดูรายละเอียดการทดสอบใน [[wiki/milestones-and-testing|milestones-and-testing]])

เกณฑ์เหล่านี้ทำหน้าที่เป็น "test signal" ที่ agent orchestrator ใช้ตัดสินใจอัตโนมัติว่าเสร็จพอจะไปต่อหรือยัง แทนการตัดสินใจด้วยความรู้สึก

## 5. Shared Harness Representation ในการนำเสนอ

Terminal View ที่โชว์ log ของ Mock PBX แบบ real-time ในแผน Split-screen presentation คือการทำให้ execution state ของ harness "มองเห็นได้" ต่อผู้ชม — เป็นจุดขายที่ดีเพราะแปลง concept ที่เป็นนามธรรม (agent-harness state) ให้เป็นภาพที่คนทั่วไปเข้าใจได้ทันทีว่า "ระบบกำลังทำงานอยู่จริง"

## สรุปสิ่งที่ควรทำต่อ

- [ ] กำหนด schema ของ Digital Twin state ให้ query ได้ ไม่ใช่แค่ text log
- [ ] แยก Librarian Agent ออกเป็น 3 role (Extraction / Verification / Synthesis) ตามข้อ 3
- [ ] เขียนเกณฑ์ test-gate ของแต่ละ phase ให้เป็นตัวเลขวัดผลได้ ผูกกับ [[wiki/milestones-and-testing|milestones-and-testing]]
- [ ] เพิ่มลิงก์เอกสารนี้เข้า [[index|Hotel ECS Knowledge Base]] ในหมวด Core Concepts

---
*อ้างอิงแนวคิดจาก: Awesome-Code-as-Agent-Harness-Papers (survey), ประยุกต์ใช้กับสถาปัตยกรรมที่มีอยู่ใน prototype-strategy และ index.md*
