---
title: "คู่มือการตั้งค่า Obsidian Sync และการปรับแต่ง Graph View ให้สวยงาม"
type: evergreen
tags: [obsidian, sync, graph-view, setup, knowledge-management]
timestamp: "2026-07-09T04:30:00+07:00"
---

# 🎨 คู่มือการตั้งค่า Obsidian Sync และการปรับแต่ง Graph View ให้สวยงาม

เอกสารนี้เป็นคู่มือแนะนำวิธีปรับแต่ง **Obsidian** และการบริหารจัดการไฟล์เพื่อรองรับการ **Sync (ผ่าน Google Drive/Obsidian Sync)** รวมถึงการปรับปรุง **Graph View** เพื่อกรองและจัดกลุ่มสีข้อมูลความรู้ในโปรเจกต์ **Hotel-ECS** ให้สวยงาม เป็นระบบ และนำเสนอได้อย่างพรีเมียมที่สุด

---

## 🔄 1. การตั้งค่าและจัดการการซิงค์ (Sync Optimization)

เนื่องจากคลังความรู้ของโปรเจกต์นี้ตั้งอยู่บน **Google Drive** (`ไดรฟ์ของฉัน`) และอาจมีการใช้งานร่วมกับ **Obsidian Sync** เพื่อความเสถียรและหลีกเลี่ยงความขัดแย้งของไฟล์ (File Conflict) ควรปฏิบัติตามคำแนะนำต่อไปนี้:

### ก. การตั้งค่า Git และการซิงค์ผ่าน Google Drive (`.gitignore`)
ไฟล์บางประเภทใน `.obsidian` มีการอัปเดตทุกวินาทีที่ใช้งานแอปพลิเคชัน (เช่น สถานะเคอร์เซอร์ ขนาดหน้าจอ หรือไฟล์ที่เปิดค้างไว้) ซึ่งไม่จำเป็นต้องบันทึกลง Git หรือซิงค์ขึ้นระบบ ควรรวมไว้ใน `.gitignore` ของโปรเจกต์:

```text
# ละเว้นไฟล์สถานะเฉพาะที่เปลี่ยนแปลงบ่อยของ Obsidian
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache/
.obsidian/backups/
```

### ข. การตั้งค่าโฟลเดอร์แนบไฟล์ (Attachment Folder Location)
เมื่อมีการลากรูปภาพหรือบันทึกไฟล์ภาพประกอบเข้ามาใน Obsidian ควรตั้งค่าให้บันทึกเก็บไว้ในโฟลเดอร์ส่วนกลางของเอกสารโดยอัตโนมัติ เพื่อความเป็นระเบียบและไม่กระจายตัวตาม Root:
1. ไปที่ **Settings (การตั้งค่า) > Files and links (ไฟล์และลิงก์)**
2. ในหัวข้อ **Default location for new attachments (ตำแหน่งเริ่มต้นสำหรับไฟล์แนบใหม่)**:
   - เลือก: `In the folder specified below` (ในโฟลเดอร์ที่กำหนดด้านล่าง)
3. ในหัวข้อ **Attachment folder path (พาธโฟลเดอร์ไฟล์แนบ)**:
   - กำหนดเป็น: `docs/assets`

### ค. การแก้ปัญหาถาวรด้วย Directory Junction (สำหรับ Windows)
หากเส้นทางโฟลเดอร์มีภาษาไทย, วงเล็บ, หรือเว้นวรรค (เช่น พาธของ Google Drive Desktop) อาจทำให้การเปิดลิงก์ `file:///` หรือการเขียนสคริปต์หลังบ้านขัดข้อง เพื่อความราบรื่นและแก้ไขถาวร ให้ทำ Directory Junction (Symlink) เพื่อเชื่อมโยงมายังพาธภาษาอังกฤษล้วนดังนี้:
1. เปิด Command Prompt (CMD) หรือ PowerShell 
2. รันคำสั่งเชื่อมโยง:
   ```cmd
   mklink /J "C:\Users\Nithep\Hotel-ECS" "C:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS"
   ```
3. เมื่อเชื่อมโยงเสร็จสิ้น แนะนำให้เปิดคลัง (Vault) ใน Obsidian และเปิดโฟลเดอร์งานใน IDE ผ่านทาง `C:\Users\Nithep\Hotel-ECS` แทนพาธ Google Drive โดยตรง เพื่อป้องกันลิงก์อ้างอิงเสียและป้องกันบั๊กจากช่องว่าง/อักษรพิเศษอย่างถาวร

---

## 📊 2. การปรับปรุงความสวยงามของ Graph View (Graph View Settings)

เพื่อให้การเปิดใช้งาน **Graph View** ใน Obsidian แสดงผลความเชื่อมโยงเฉพาะเนื้อหาความรู้ในส่วนของคู่มือการพัฒนาและสถาปัตยกรรม (หลีกเลี่ยงการรวมโฟลเดอร์เขียนโค้ดอย่าง `node_modules`, `frontend`, หรือ `backend` จนรกเกินไป) ให้ตั้งค่าดังนี้:

### ก. การตั้งฟิลเตอร์กรองข้อมูล (Filters)
เปิดบอร์ด Graph View ขึ้นมา และคลิกปุ่มเฟือง (Settings) ของ Graph View จากนั้นตั้งค่าฟิลเตอร์ตามคำแนะนำ:
- **Search (การค้นหา / กรองแสดงผล)**:
  `path:docs`
  *(คำสั่งนี้จะกรองเฉพาะไฟล์ที่อยู่ภายใต้โฟลเดอร์ `docs` เท่านั้น ทำให้ Graph View แสดงเฉพาะแผนภาพความรู้และเอกสารคู่มือการติดตั้ง)*
- **ซ่อนไฟล์ที่ไม่เกี่ยวข้อง**:
  - เปิดการใช้งาน **Tags** (เพื่อให้เห็นจุดเชื่อมป้ายกำกับ)
  - ปิดการใช้งาน **Attachments** (หากต้องการซ่อนไอคอนรูปภาพไม่ให้รกกราฟ)

### ข. การจัดกลุ่มและระบุสีโหนด (Groups)
ในเมนูตั้งค่า Graph View ให้ไปที่หัวข้อ **Groups** แล้วกด **New Group** เพื่อสร้างสีแยกตามหมวดหมู่โฟลเดอร์ ช่วยให้ดูหรูหราพรีเมียมขึ้น:

| คำสั่ง Query สำหรับจัดกลุ่ม | สีที่แนะนำ (HEX) | วัตถุประสงค์ / ความหมาย |
| :--- | :--- | :--- |
| `path:docs/wiki` | `#4caf50` (สีเขียว) | **Evergreen Notes**: ไฟล์ความรู้ถาวรและคู่มือระบบที่ผ่านการสกัดแล้ว |
| `path:docs/raw` | `#ff9800` (สีส้ม/เหลือง) | **Inbox / Raw Capture**: ข้อมูลดิบที่รอการสกัดและจัดระเบียบ |
| `path:docs/concepts` | `#2196f3` (สีน้ำเงิน) | **System Architecture**: เอกสารหลักการและสถาปัตยกรรมระบบ |
| `path:docs/Templates` | `#9c27b0` (สีม่วง) | **Templates**: แม่แบบสำหรับสร้างเอกสาร |
| `path:docs/index.md` | `#e91e63` (สีชมพู/แดง) | **Main Index**: จุดเริ่มต้นหรือสารบัญหลักของระบบคลังความรู้ |

---

## 🗺️ 3. แผนภาพความเชื่อมโยงความรู้ของ Hotel-ECS (MOC)

แผนภาพด้านล่างแสดงถึงโครงสร้าง **Map of Content (MOC)** การไหลและจุดเชื่อมต่อของไฟล์ความรู้ทั้งหมดในโปรเจกต์นี้ เมื่อเปิดใช้งาน Graph View โหนดสีต่างๆ จะวิ่งเข้ามาเกาะกลุ่มเชื่อมต่อกันในลักษณะเดียวกันนี้:

```mermaid
graph TD
    %% Main Hub
    Index[docs/index.md <br> Hub สารบัญหลัก] :::index
    
    %% Raw Inputs
    Raw1[docs/raw/archive/Smart Hotel...md <br> ข้อมูลดิบประมวลผลแล้ว] :::raw
    
    %% Wiki - System & Protocols
    W_Comparison[wiki/smart-hotel-comparison.md <br> เปรียบเทียบ 3 โมเดลการใช้งาน] :::wiki
    W_LIFF[wiki/liff-checkin-process.md <br> กระบวนการเช็คอิน LINE LIFF] :::wiki
    W_PBX[wiki/phonik-pbx-protocol.md <br> โปรโตคอล Phonik PBX] :::wiki
    W_Harness[wiki/agent-harness-framework.md <br> Agentic AI Harness Framework] :::wiki
    W_Pi[wiki/raspberry-pi-setup.md <br> การเตรียมความพร้อม Pi 4] :::wiki
    W_Trouble[wiki/troubleshooting.md <br> วิธีแก้ปัญหาและประวัติซ่อมบำรุง] :::wiki
    W_Timeline[wiki/project_timeline.md <br> ประวัติการก่อสร้างโครงการ] :::wiki
    
    %% Concepts
    C_Design[concepts/agent-harness-design.md <br> สถาปัตยกรรม Multi-Agent Design] :::concept
    C_Backend[concepts/backend-architecture.md <br> โครงสร้าง API & SQLite DB] :::concept
    
    %% Links
    Index --> W_Comparison
    Index --> W_LIFF
    Index --> W_PBX
    Index --> W_Harness
    Index --> W_Pi
    Index --> W_Trouble
    Index --> W_Timeline
    
    W_Comparison --> W_LIFF
    W_Comparison --> W_PBX
    W_Comparison --> C_Backend
    W_Harness --> C_Design
    W_Pi --> W_PBX
    
    %% Formatting
    classDef index fill:#e91e63,stroke:#c2185b,stroke-width:2px,color:#fff;
    classDef raw fill:#795548,stroke:#5d4037,stroke-width:1px,color:#fff;
    classDef wiki fill:#113f15,stroke:#4caf50,stroke-width:2px,color:#fff;
    classDef concept fill:#112a3f,stroke:#2196f3,stroke-width:2px,color:#fff;
```

---
*ความรู้และคู่มือการตั้งค่าอื่นที่เกี่ยวข้อง:*
- [[wiki/obsidian-web-clipper-setup|คู่มือการตั้งค่า Obsidian Web Clipper และ Templates (OKF)]]
- [[wiki/smart-hotel-comparison|การเปรียบเทียบโมเดลระบบ Smart Hotel Check-in/Check-out]]
