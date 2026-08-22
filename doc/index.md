---
title: Hotel ECS Knowledge Base Index
type: index
description: ดัชนีสารบัญฐานความรู้และแผนผัง Knowledge Graph ของโปรเจกต์ Hotel-ECS
tags: [hub, documentation, architecture, okf]
updated: "2026-08-02T01:05:39+07:00"
---

# 📚 Hotel ECS Knowledge Base Index

ยินดีต้อนรับสู่คลังความรู้และดัชนีระบบ **Hotel ECS (Smart Check-in & Healthcare IoT)**
เอกสารทั้งหมดถูกจัดเก็บด้วยมาตรฐาน **OKF (Open Knowledge Format)** เพื่อให้เชื่อมโยงเป็น **Knowledge Graph** บน Obsidian และให้ AI Agents สามารถทำความเข้าใจระบบได้อย่างเที่ยงตรง

---

## 📌 สถาปัตยกรรมและ Agentic AI (Architecture & Harness)

- [[wiki/2026-07-05T223922_digital_twin_harness|digital twin, repository เป็น persistent world, multi-agent role specialization, และ test-gated convergence : arXiv 2605.18747 และ repo Awesome-Code-as-Agent-Harness-Papers --- อธิบายความหมายในบริบทเดียวกัน]]
- [[wiki/Code as Agent Harness|Codex Code as Agent Harness]]
- [[wiki/agent-harness-framework|คู่มือสถาปัตยกรรม Code as Agent Harness สำหรับระบบ Hotel ECS]]
- [[wiki/smart-hotel-comparison|การเปรียบเทียบโมเดลระบบ Smart Hotel Check-in/Check-out]]
- [[wiki/แนวทางออกแบบ agentic AI harness|Agent Harness Design for Hotel ECS]]

## 🏨 การควบคุมตู้ PBX และระบบเช็คอิน (PBX & Check-in Operations)

- [[wiki/PBX_Relay_Config|🛠️ คู่มือการตั้งค่าตู้สาขา PBX (Phonik Config Builder)]]
- [[wiki/liff-checkin-process|สรุปกระบวนการทำงาน LINE LIFF Smart Check-in]]
- [[wiki/phonik-pbx-protocol|โปรโตคอลตู้สาขา Phonik ECS และการจำลอง]]
- [[wiki/smart_checkin_qr_setup|การจัดทำ QR Code ประจำห้องพักและการเข้าถึง LINE LIFF]]
- [[wiki/system_monitoring_guide|คู่มือการตรวจสอบสถานะระบบและตู้สาขา (System Monitoring & PBX Health Check)]]
- [[wiki/technician_pbx_manual|🔧 คู่มือช่าง: การเชื่อมต่อตู้สาขา Phonik PBX และระบบ Webhook (Technician Manual)]]

## 🚀 การติดตั้ง โครงสร้างพื้นฐาน และ Cloud/Edge (Infrastructure, Cloud & Edge)

- [[wiki/CLOUDFLARE_SETUP_SUMMARY|Cloudflare Tunnel Setup - Completion Summary]]
- [[wiki/DEPLOYMENT_GUIDE_PI|Hotel-ECS Raspberry Pi Deployment Guide]]
- [[wiki/SETUP|การติดตั้งและการตั้งค่าระบบ (Setup Guide)]]
- [[wiki/architecture_overview|สถาปัตยกรรม HECS Hybrid Cloud-Native Edge (Current Architecture)]]
- [[wiki/cloudflare_tunnel_setup|🌐 คู่มือการตั้งค่าโดเมน www.nithep.com เข้าสู่ตู้ควบคุม Pi 4 (ผ่าน Cloudflare Tunnel)]]
- [[wiki/cloudflare_warp_ncsi_issue|การแก้ไขปัญหา Windows NCSI กับ Cloudflare WARP และพฤติกรรม VPN]]
- [[wiki/dashboard_network_setup|SOP มาตรฐานการตั้งค่าเครือข่ายและระบบป้องกันปัญหาการชนกันบนเครื่อง Dashboard]]
- [[wiki/google_apps_script_setup|📊 คู่มือการตั้งค่า Google Sheets & Apps Script (สำหรับ Owner)]]
- [[wiki/https_ssl_setup|การตั้งค่า HTTPS (SSL Certificate) บน Raspberry Pi สำหรับระบบกล้องสแกน QR]]
- [[wiki/hybrid_cloud_edge_manual|คู่มือแยกระบบ "บนฟ้า" (Cloud) และ "บนบก" (Edge/Pi) - Hybrid Architecture]]
- [[wiki/infrastructure_setup|🏗️ คู่มือสรุปโครงสร้างพื้นฐานและการติดตั้ง (Infrastructure & Hosting Setup)]]
- [[wiki/network-setup|มาตรฐานการจัดเตรียมระบบเครือข่ายสำหรับ Gateway (Network Bootstrapping & Failover Standard)]]
- [[wiki/network_access_guideline|คู่มือแนวทางการเข้าถึงอุปกรณ์และระบบเครือข่าย (Network Access & Architecture Guideline)]]
- [[wiki/obsidian-web-clipper-setup|คู่มือการตั้งค่า Obsidian Web Clipper และ Templates (OKF)]]
- [[wiki/raspberry-pi-setup|การติดตั้ง Raspberry Pi สำหรับระบบ Smart Hotel (Production Docker)]]
- [[wiki/setup_quickstart|คู่มือการติดตั้งและเริ่มต้นใช้งานด่วน (HECS Quick Start Guide)]]
- [[wiki/system_cost_and_maintenance|💰 ทะเบียนค่าใช้จ่ายและการบำรุงรักษาระบบ (System Cost & Maintenance Ledger)]]

## 🚑 ระบบ Smart Nurse Call (Healthcare IoT - Standalone Sibling Repo)

* *ระบบ Smart Nurse Call (SNC) ได้รับการโอนย้ายสถาปัตยกรรมและซอร์สโค้ดแยกเป็นคลังอิสระอย่างเป็นทางการที่ Repository: `nithep/snc`*

## 💎 ดีไซน์ UI/UX, LINE LIFF & Mobile App (Frontend & Social Integration)

- [[wiki/DEPLOYMENT_TESTING_GUIDE|Hotel-ECS Deployment Testing Guide]]
- [[wiki/DEPLOYMENT_TROUBLESHOOTING|Hotel-ECS Deployment Troubleshooting Guide]]
- [[wiki/HOTFIX_DEPLOYMENT_GUIDE|🚀 Hotfix Deployment Guide: Deadlock & Black Screen Prevention]]
- [[wiki/QUICK_DEPLOY_REFERENCE|Hotel-ECS Quick Deployment Reference Card]]
- [[wiki/QUICK_REFERENCE|Hotel-ECS Quick Reference Card]]
- [[wiki/build-in-public-content-strategy|พิมพ์เขียวระบบสื่อสาร 3 ช่องทางหลัก (Build in Public Content Strategy)]]
- [[wiki/deployment_guide|Deployment Guide (คู่มือการติดตั้งขึ้นเซิร์ฟเวอร์จริง)]]
- [[wiki/google_workspace_security_and_iot|🛡️ Google Workspace Security Policy & IoT Server Binding Guide]]
- [[wiki/line-mini-app-iap-terms|การวิเคราะห์ข้อกำหนดการใช้งานและการซื้อภายในแอป LINE MINI App (IAP Update 2026)]]
- [[wiki/new_site_commissioning_guide|🌐 คู่มือการตรวจสอบความสมบูรณ์และการติดตั้งสถานที่ใหม่ (New Site Commissioning Guide)]]
- [[wiki/obsidian-sync-and-graph-optimization|คู่มือการตั้งค่า Obsidian Sync และการปรับแต่ง Graph View ให้สวยงาม]]
- [[wiki/phase5-line-integration|Phase 5: LINE Ecosystem Integration (Smart Check-in)]]
- [[wiki/project_timeline|📅 TimeLine ประวัติการก่อสร้างโครงการ Hotel-ECS (Smart Check-in)]]
- [[wiki/wifi-only-guide|คู่มือการปฏิบัติงานเปลี่ยนเครือข่าย Wi-Fi สำหรับโหมด Wi-Fi Only]]

## 🛡️ ความปลอดภัย, RBAC, Google Workspace & Compliance (Security & Operations)

- [[wiki/SECURITY|นโยบายความปลอดภัยและการปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (Security & PDPA Compliance)]]
- [[wiki/content_draft_google_workspace_and_ascii|📝 บันทึกคอนเซปต์ทำเนื้อหา (Content Blueprint): X / Medium / Google Dev]]
- [[wiki/gemini-3-6-flash-antigravity|Gemini 3.6 Flash ใน Google Antigravity]]
- [[wiki/google-workspace-compliance-hipaa|Google Workspace Security Compliance และ HIPAA BAA]]
- [[wiki/google_workspace_integration|💼 คู่มือการบูรณาการระบบ Hotel-ECS ร่วมกับ Google Workspace]]
- [[wiki/role_based_security_design|🔒 สถาปัตยกรรมการรักษาความปลอดภัยแบบอิงบทบาท (Role-Based Security Design)]]

## 📅 ประวัติโครงการและคู่มืออ้างอิง (Timeline & Quick References)

- [[wiki/2026-07-05T233255+0700 การบูรณาการและการนำไปใช้  infrastructure category|การบูรณาการและการนำไปใช้]]
- [[wiki/ARCHITECTURE|สถาปัตยกรรมระบบ (Architecture)]]
- [[wiki/DEPLOYMENT_FIX_SUMMARY_2026-07-21|Hotel-ECS Deployment Fix Summary - 2026-07-21]]
- [[wiki/ai_control_and_daily_reports_plan|🛠️ แผนการพัฒนาฟีเจอร์ AI Control (สั่งงานผ่านแชท) & Daily Operations Report (สรุปยอดประจำวัน)]]
- [[wiki/core_services_architecture|สถาปัตยกรรมบริการหลักและการแก้ไขปัญหาเชิงลึก (Core Services Architecture & Deep Troubleshooting)]]
- [[wiki/deadlock_prevention|Deadlock Prevention Architecture]]
- [[wiki/fullstack_integration_walkthrough|HECS Full-Stack Integration — Walkthrough]]
- [[wiki/milestones-and-testing|บันทึกความสำเร็จและการทดสอบระบบ (Milestones & Testing)]]
- [[wiki/operational_scenarios|📘 ฉากทัศน์การปฏิบัติงานหลัก 3 รูปแบบ (Core Operational Scenarios)]]
- [[wiki/phase2-hardware-integration|การเชื่อมต่อตู้สาขาฮาร์ดแวร์จริง (Real Hardware Integration)]]
- [[wiki/phase6-system-blueprint|Phase 6 - System Blueprint & Architecture]]
- [[wiki/simulation_report|📊 รายงานผลการจำลองการติดตั้งและการทดสอบระบบ (Simulation Report)]]
- [[wiki/solo_dev_business_strategy|กลยุทธ์การตลาดและการวางตำแหน่ง (Solo Dev Strategy)]]
- [[wiki/squarespace-domain-verification|การยืนยันโดเมนที่จัดการโดย Squarespace (Domain Verification)]]
- [[wiki/troubleshooting|การแก้ไขปัญหาและการกู้คืนระบบ (Troubleshooting & Recovery)]]
- [[wiki/user_operation_manual|📖 คู่มือการใช้งานระบบ Smart Hotel Self Check-in (ฉบับผู้ใช้งานและผู้ดูแลระบบ)]]
- [[wiki/xai_grok_integration|🤖 การเชื่อมต่อบัญชี SpaceX AI & Grok (xAI Integration)]]
- [[wiki/youtube_storytelling|📺 แผนการทำเนื้อหา YouTube: เรื่องเล่าการก่อสร้างระบบ Smart Hotel (Storytelling & Tutorials)]]

---
*ปรับปรุงดัชนีล่าสุดโดย: Librarian Agent (Antigravity) ตามมาตรฐาน OKF Protocol*
