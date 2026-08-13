# 🏥 เอกสารนำเสนอสาธิต และคู่มือเปิดใช้งานจริง (Executive Demonstration & Go-Live Guide)
## ระบบ Smart Nurse Call (SNC) - Hybrid Cloud-Native Edge Architecture

---

## 🟢 ส่วนที่ 1: สไลด์นำเสนอผู้บริหาร (Executive Demonstration Deck)

### Slide 1: บทสรุปผู้บริหาร (Executive Summary)
* **โจทย์และความท้าทาย (Pain Points)**: ระบบเรียกพยาบาลเดิมใช้สัญญาณอนาล็อก ไม่บันทึกเวลาตอบรับ (Ack Time) ของพยาบาล ไม่สามารถวัดผล KPI/SLA ได้ และฮาร์ดแวร์ใหม่มีราคาแพง
* **นวัตกรรมระบบ Smart Nurse Call (SNC)**:
  * **Zero-Hardware Replacement**: ดึงข้อมูลสายเรียกอินเตอร์คอมโดยตรงจากตู้ **Phonik PBX** เดิมผ่าน Telnet/SMDR Log (Port 23)
  * **Edge-First Latency**: **Raspberry Pi Zero 2 W / Pi 4** ประมวลผลและส่งสัญญาณแจ้งเตือนต่ำกว่า 0.1 วินาที (Sub-second Alert)
  * **Hybrid GCP Cloud-Native**: ประมวลผลและบันทึกสถิติ SLA ขึ้น **Google Cloud Run** (`hotel-ecs-nithep`) ดูภาพรวมและแจ้งเตือนเข้า Google Chat ได้แบบ 24/7

---

### Slide 2: วงจรการทำงานและมาตรฐานทางการแพทย์ (Medical Call Lifecycle)

```text
  [1. คนไข้กด STA / EMER] ──► [2. ตู้ Phonik PBX พ่น Log] ──► [3. Pi Zero 2 W แปลงเป็น HL7 FHIR]
                                                                        │
  [5. คำนวณ SLA Compliance %] ◄── [4. GCP Cloud Run + Live Dashboard] ◄─┘
```

1. **🚨 สัญญาณเรียกฉุกเฉิน (Emergency Trigger)**:
   * คนไข้กดปุ่ม STA หรือดึงสายห้องน้ำ (EMER) ➔ ตู้ PBX พ่น SMDR Log ➔ Pi Zero 2 W สกัดข้อมูลแปลงเป็น **HL7 FHIR Medical Data Standard**
   * **Dashboard**: การ์ดห้องเปลี่ยนเป็น **สีแดงกะพริบ** + เสียง Siren เตือน + ตัวนับเวลาถอยหลัง Ack Time (เป้าหมาย $\le 30$ วินาที)
2. **🟧 พยาบาลตอบรับสาย (Nurse Ack)**:
   * พยาบาลยกหูโทรศัพท์ตอบรับ ➔ ตู้ PBX ส่งสัญญาณ `onM / onto` ➔ ระบบสลับเป็นสถานะ **NURSE_TALKING**
   * **Dashboard**: การ์ดเปลี่ยนเป็น **สีส้ม (ACK)** + บันทึกเวลา **Ack Time (วินาที)** ลงฐานข้อมูล
3. **🟢 ล้างสายและบันทึก SLA (Call Resolution)**:
   * พยาบาลวางสาย ➔ ตู้ PBX ส่งสัญญาณ `offM / offx` ➔ เปลี่ยนสถานะเป็น **CALL_CLEARED**
   * **Dashboard**: การ์ดเปลี่ยนกลับเป็น **สีเขียว (ปกติ)** + คำนวณสรุปค่า **SLA Compliance Rate (%)** เรียลไทม์

---

### Slide 3: จุดเด่นด้านความคุ้มค่าและผลตอบแทน (Cost & ROI Analysis)

* **ประหยัดค่าอุปกรณ์ฮาร์ดแวร์ 85%**: ไม่ต้องเดินสายใหม่ ไม่ต้องเปลี่ยนตู้ PBX ใช้โครงสร้างสายเดิม 100%
* **ค่าใช้จ่ายระบบคลาวด์ต่ำ (Pay-per-Use)**: รันบน Google Cloud Run แบบ Serverless (ฟรีใน Free Tier หรือจ่ายไม่กี่สิบบาท/เดือน)
* **ยกระดับมาตรฐานโรงพยาบาล**: รองรับเกณฑ์คุณภาพ HA (Hospital Accreditation) ด้วยรายงานสถิติ SLA แม่นยำ 100%

---

## 🚀 ส่วนที่ 2: คู่มือเปิดใช้งานจริงภาคสนาม (Go-Live Operational Manual)

### 1. ลิงก์จุดเชื่อมต่อระบบคลาวด์ (Production Live Cloud Endpoints)
* **GCP Cloud Run Service URL**: [https://snc-cloud-backend-59781590359.asia-southeast1.run.app](https://snc-cloud-backend-59781590359.asia-southeast1.run.app)
* **Health Check Status**: [https://snc-cloud-backend-59781590359.asia-southeast1.run.app/health](https://snc-cloud-backend-59781590359.asia-southeast1.run.app/health)
* **Interactive API Documentation**: [https://snc-cloud-backend-59781590359.asia-southeast1.run.app/docs](https://snc-cloud-backend-59781590359.asia-southeast1.run.app/docs)

### 2. ขั้นตอนรันเปิดบริการหน้างาน (Edge On-Premise Start)

#### บน Raspberry Pi Zero 2 W / Pi 4 (เคาน์เตอร์พยาบาล):
```bash
# 1. เข้าสู่โฟลเดอร์โครงการ
cd ~/snc-poc

# 2. เรียกรันชุดบริการทั้งหมด (Backend, Listener, Dashboard)
./quick_start.sh
```

#### บนเครื่องคอมพิวเตอร์พนักงาน / Windows:
```powershell
# รันไฟล์ Quick Start Script ผ่าน PowerShell
.\snc-poc\quick_start.ps1
```

---

## 🎬 ขั้นตอนการสาธิตระบบสด (Live Demo Script for Chief/Executive)

1. **เปิดหน้าจอ Nurse Monitor**: เข้าที่หน้าจอหลัก Glassmorphic Dark Mode Nurse Monitor
2. **กดปุ่มเรียกจากห้องพักจริง / จำลอง**: กดปุ่มกดเรียกข้างเตียง
   * *สังเกต*: หน้าจอเปลี่ยนเป็น **การ์ดสีแดงกะพริบ** สัญญาณเสียงเตือนทำงาน Sub-second Latency
3. **พยาบาลยกหูรับสาย**: 
   * *สังเกต*: การ์ดเปลี่ยนเป็น **สีส้ม (ACK)** บันทึกเวลาตอบรับ
4. **พยาบาลวางสาย**:
   * *สังเกต*: การ์ดเปลี่ยนเป็น **สีเขียว (ปกติ)** ตัวเลข SLA Compliance % อัปเดตทันที
5. **ตรวจสอบข้อมูลบน Cloud**:
   * เปิดลิงก์ GCP Cloud Run Health Check แสดงสถานะ Healthy ข้อมูลถูก Sync ขึ้นคลาวด์เรียบร้อย
