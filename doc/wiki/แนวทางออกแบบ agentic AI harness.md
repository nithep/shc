---
title: "Agent Harness Design for Hotel ECS"
status: "verified"
original_file: "docs/raw/แนวทางออกแบบ agentic AI harness.md"
original_source: "https://github.com/YennNing/Awesome-Code-as-Agent-Harness-Papers"
original_author: "Unknown"
verified_at: "2026-07-05T18:33:35.196Z"
verified_by: "verification_agent"
---

# 🌲 Agent Harness Design for Hotel ECS (Evergreen Note - Draft)

## 📌 บทสรุป (Summary)
เอกสารนี้อธิบายเกี่ยวกับหัวข้อ **Agent Harness Design for Hotel ECS** ซึ่งมีสาระสำคัญที่เกี่ยวกับการพัฒนาและบูรณาการระบบควบคุมของโปรเจกต์ Hotel ECS และสถาปัตยกรรม Agentic AI Harness

## 🔑 ประเด็นสำคัญ (Key Takeaways)
- กำหนด schema ของ state (เช่น `room_id`, `power_state`, `last_command`, `timestamp`) ให้ agent อื่นอ่านค่าปัจจุบันของระบบได้แบบ query ได้ ไม่ต้อง parse log
- เก็บ state history ไว้เป็น trace file (เช่น JSONL) เพื่อให้ agent ตรวจสอบย้อนหลังได้ว่าคำสั่งไหน fail/success
- **Phase 0 → 1** (Mock PBX → Sandbox Room จริง): ต้องผ่านคำสั่งเปิด/ปิดไฟถูกต้อง N ครั้งติดต่อกันโดยไม่มี error บน พอร์ต LAN ของPBX
- **Phase 1 → 2** (Sandbox Room → หลายห้อง): ต้องไม่มี state mismatch ระหว่าง Digital Twin กับฮาร์ดแวร์จริงในการทดสอบต่อเนื่อง (ดูรายละเอียดการทดสอบใน [[wiki/milestones-and-testing|milestones-and-testing]])
- [ ] กำหนด schema ของ Digital Twin state ให้ query ได้ ไม่ใช่แค่ text log
- [ ] แยก Librarian Agent ออกเป็น 3 role (Extraction / Verification / Synthesis) ตามข้อ 3
- [ ] เขียนเกณฑ์ test-gate ของแต่ละ phase ให้เป็นตัวเลขวัดผลได้ ผูกกับ [[wiki/milestones-and-testing|milestones-and-testing]]
- [ ] เพิ่มลิงก์เอกสารนี้เข้า [[index|Hotel ECS Knowledge Base]] ในหมวด Core Concepts
- --
- อ้างอิงแนวคิดจาก: Awesome-Code-as-Agent-Harness-Papers (survey), ประยุกต์ใช้กับสถาปัตยกรรมที่มีอยู่ใน prototype-strategy และ index.md*



## 📝 บันทึกประวัติ
- บันทึกการสังเคราะห์โดย: `synthesis_agent.js`
- แหล่งอิมพอร์ตต้นฉบับ: https://github.com/YennNing/Awesome-Code-as-Agent-Harness-Papers (2026-07-05T18:33:29.082Z)
