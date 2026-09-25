---
name: snc
description: >
  Pointer to the canonical Smart Nurse Call (SNC) orchestrator skill.
  Use when the user mentions snc, Smart Nurse Call, nurse call, EMER,
  CALL_BEDSIDE, nurse_call_events, snc_pbx_listener, Room Manager 2323
  proxy, or runs /snc. Load the canonical file below for full content.
user-invocable: true
argument-hint: "[diagnose|start|test|deploy|kpi|proxy|rotate|fix <topic>]"
when-to-use: >
  snc-poc, Smart Nurse Call, nurse call dashboard, EMER pull switch, SMDR
  listener, PBX port 23 nurse events, Room Manager 2323 proxy mirror, SLA
  ack/resolution time
---

# SNC — pointer (canonical lives in the `snc` repo)

> **สำเนานี้ไม่ใช่ต้นฉบับ** — ต้นฉบับ (canonical, อัปเดตล่าสุด):
> `D:\nithep-platform\snc\.opencode\skills\snc\SKILL.md`
> (mirror เดียวกันที่ `snc/.agents/skills/snc/SKILL.md`)
>
> สำเนาเก่าในโฟลเดอร์นี้ถูกลบเมื่อ 2026-09-26 เพราะ drift
> (path `snc-poc/`, domain `nursecall.*` เก่า) — ให้โหลดไฟล์ canonical
> เสมอ ห้ามอ้าง path/domain จากสำเนาเก่า

 specialist skills ที่เกี่ยวข้อง (อยู่ใน `shc/.agents/skills/`):
 `Phonik_SNC_Hardware_Spec`, `PBX_Protocol_Handler`,
 `State_Verifier`, `Cloudflare_Tunnel_Setup`
