---
title: คู่มือแยกระบบ "บนฟ้า" (Cloud) และ "บนบก" (Edge/Pi) - Hybrid Architecture
date: 2026-07-28T04:10:00+07:00
tags: [deployment, architecture, cloud, edge, vertex-ai, raspberry-pi]
---

# ☁️🌱 คู่มือแยกระบบ "บนฟ้า" (Cloud) และ "บนบก" (Edge/Pi)

แม้สถาปัตยกรรมจะพัฒนาไปสู่ **HECS Hybrid Cloud-Native Edge** แต่ซอร์สโค้ดทั้งหมด (Monorepo) ยังคงถูกเก็บรวมไว้ที่ Git Repository เดียวกัน คุณสามารถเข้าถึงและโหลดโค้ดลงมาติดตั้งบน Raspberry Pi 4 ได้เหมือนเดิมทุกประการ 

การแบ่งแยกระบบเพื่อ Deploy จะใช้โครงสร้างโฟลเดอร์แยกส่วนกันอย่างชัดเจน เพื่อให้ช่างเทคนิคเข้าใจง่ายว่าโฟลเดอร์ไหนสำหรับ "บนฟ้า" และโฟลเดอร์ไหนสำหรับ "บนบก"

---

## ☁️ ส่วนที่ 1: ระบบ "บนฟ้า" (Cloud / GCP / Vertex AI)
ส่วนนี้คือ "สมองส่วนกลาง" ทำหน้าที่ประมวลผลหนัก, บริหารจัดการข้อมูลส่วนกลาง, และประมวลผล AI/Machine Learning

**โฟลเดอร์ที่เกี่ยวข้องใน Git:**
- `/backend-cloudrun`: API Server หลักที่นำไป Deploy ขึ้น Google Cloud Run
- `/frontend`: Web Application สำหรับแขกและแอดมิน (สามารถโฮสต์บน Cloud เช่น Vercel, Firebase หรือ Cloud Run)
- *(อนาคต)* `/ai-models`: สคริปต์สำหรับเทรนโมเดลบน Vertex AI 

**วิธีการ Deploy (สำหรับบนฟ้า):**
1. **Pull Code:** ใช้ Git pull โค้ดลงเครื่องคอมพิวเตอร์นักพัฒนา
2. **Build & Push:** โค้ดใน `/backend-cloudrun` จะถูก Build เป็น Docker Image และส่งขึ้น Google Cloud Registry
3. **Deploy:** นำ Image ขึ้นรันบน Google Cloud Run เป็นอันเสร็จสิ้น

---

## 🌱 ส่วนที่ 2: ระบบ "บนบก" (Edge / Raspberry Pi 4)
ส่วนนี้คือ "สมองส่วนปลายและแขนขา" ติดตั้งอยู่ที่โรงแรม (Local) ทำหน้าที่เชื่อมต่อกับตู้สาขา (PBX) และประมวลผล Edge AI แบบออฟไลน์

**โฟลเดอร์ที่เกี่ยวข้องใน Git:**
- `/edge-agent` หรือ `/worker`: สคริปต์ Python/Node สำหรับรันเป็น Background Service รับคำสั่งจาก Cloud
- `/pbx-connector`: สคริปต์เชื่อมต่อและถอดรหัส Protocol CCH2 เพื่อสั่งเปิด/ปิดไฟผ่าน RS-232 หรือ LAN ของตู้ Phonik PBX
- `docker-compose.yml`: ไฟล์สำหรับรัน Services บน Pi 4 แบบ Local

**วิธีการเข้าถึงและโหลดโค้ดลง Pi 4 (แบบ Local):**
โค้ดสำหรับ Pi 4 ยังคงอยู่บน Git เหมือนเดิม คุณสามารถดึงโค้ดลงมาติดตั้งบนบกได้ตามขั้นตอนดังนี้:

1. **SSH เข้าสู่ Raspberry Pi 4**
   ```bash
   ssh pi@<IP_ADDRESS>
   ```

2. **Clone หรือ Pull ซอร์สโค้ดล่าสุดจาก Git**
   ```bash
   cd ~/Hotel-ECS
   git pull origin main
   ```

3. **อัปเดตระบบแบบ Local ด้วย Docker**
   บนเครื่อง Pi เราจะใช้ `docker-compose` ตัวเดิมในการควบคุม Services ฝั่ง Local (ระบบบนบก):
   ```bash
   docker-compose down
   docker-compose build   # กรณีที่มีการแก้ไขโค้ดฝั่ง pbx-connector หรือ edge-agent
   docker-compose up -d
   ```

4. **การรันโมเดล AI บนเครื่อง Pi (Edge AI)**
   ในอนาคต โมเดลที่ถูกเทรนจาก Vertex AI (บนฟ้า) จะถูกโหลดลงมาเก็บไว้ในโฟลเดอร์บน Pi 4 เป็นไฟล์ `.tflite` และตัว Edge Agent จะทำหน้าที่รันโมเดลนั้นแบบออฟไลน์

---

## 🔄 บทสรุปความสัมพันธ์ (ฟ้าสั่งการ ➡️ บกลงมือทำ)
1. **บนฟ้า (Cloud Run/Vertex AI):** คำนวณเสร็จแล้วว่าห้อง 201 ควรเปิดไฟ 
2. **สะพานเชื่อม:** Cloud ส่งข้อความผ่าน Message Broker (เช่น MQTT หรือ WebSocket) ลงมาที่โรงแรม
3. **บนบก (Pi 4):** `/edge-agent` รับข้อความ และส่งต่อให้ `/pbx-connector` คุยกับตู้สาขา 
4. ตู้สาขาสับรีเลย์ไฟห้อง 201 ทำงานสำเร็จ! (แม้เน็ตโรงแรมจะล่มชั่วขณะ `/edge-agent` ที่มี AI ในตัวก็สามารถตัดสินใจแทนตาม Cache/Model ที่โหลดไว้ได้)
