# โปรเจกต์เชื่อมต่อระบบ Hotel ECS

## 🏨 บริบทและเป้าหมาย
โปรเจกต์นี้คือ **ระบบ Smart Hotel Self Check-in/Check-out**
ซึ่งจะมาแทนที่ซอฟต์แวร์ "Room Manager" เดิมที่รันบน PC ด้วย Web Application ที่ทันสมัย ระบบนี้ทำงานบน **Raspberry Pi 4** และเชื่อมต่อกับตู้สาขาของโรงแรม (Phonik ECS-103R V.5) เพื่อควบคุมรีเลย์ไฟฟ้าในแต่ละห้องพัก

## 🔄 ขั้นตอนการทำงานหลัก (Core Workflow)
1. **Check-in**: แขกสแกน QR Code ผ่านหน้าเว็บ Frontend เพื่อเช็คอินเข้าห้องพัก
2. **เปิดระบบไฟ (ON)**: Backend รับคำสั่งเช็คอินและสั่งให้ PBX Connector ส่งคำสั่ง "ON" ไปที่ตู้สาขา PBX จากนั้นตู้จะส่งสัญญาณไปยังบอร์ด ECS-103R ในห้องเพื่อจ่ายไฟเข้าวงจร (ไฟจะสว่างขึ้นเมื่อแขกเสียบคีย์การ์ด)
3. **Check-out**: แขกกดทำรายการเช็คเอาท์ผ่านหน้าเว็บ
4. **ตัดระบบไฟ (OFF)**: Backend ส่งคำสั่ง "OFF" ไปที่ PBX ไฟในห้องจะถูกตัดทันที ไม่ว่าแขกจะเสียบคีย์การ์ดคาไว้หรือไม่ก็ตาม

## 🖥️ สถาปัตยกรรมระบบ (System Architecture)
- **เซิร์ฟเวอร์หลัก**: Raspberry Pi 4
- **ฮาร์ดแวร์ในห้อง**: บอร์ด Phonik ECS-103R V.5 (สำหรับควบคุมรีเลย์ 220V)
- **ศูนย์กลางการสื่อสาร**: ตู้สาขา Phonik PBX ตัว Pi 4 จะเชื่อมต่อกับตู้ผ่านพอร์ต LAN ของPBX

## 📁 โครงสร้างโฟลเดอร์ (Directory Structure)
- `/frontend`: Web Dashboard สำหรับพนักงานและหน้า Self Check-in สำหรับแขก (สร้างด้วย React/Vite) **หน้าตาต้องสวยงามและดูพรีเมียมขั้นสุด**
- `/backend`: API Server (Node.js/Python) สำหรับจัดการ Business Logic, ฐานข้อมูล, และ REST endpoints
- `/pbx-connector`: สคริปต์ระดับล่างสำหรับถอดรหัส Protocol และการสื่อสารผ่าน Serial/TCP กับตู้ Phonik PBX
- `/docs`: ฐานความรู้หลัก (Knowledge Base) รูปแบบ OKF (Open Knowledge Format) ทำหน้าที่เป็น World Model ถาวรของระบบ ประกอบด้วยโฟลเดอร์ `/raw` (Inbox) และ `/wiki` (Evergreen notes)
- `/worker`: โมดูลสำหรับการประมวลผล Agentic tasks และการทดสอบเชื่อมต่อฮาร์ดแวร์ (Python)

## 🤖 กฎการปฏิบัติตามของ AI Agent (Hotel ECS Project Rules)

1. **บทบาทหลัก (Role)**: คุณคือ Senior Software Engineer ผู้เชี่ยวชาญระบบ Digital Twin และ Industrial IoT
2. **การสื่อสาร (Communication)**: ใช้ภาษาไทยในการสื่อสารอย่างเป็นทางการ (Professional & Senior Tone) รวมถึงเอกสาร (Documentation), คู่มือ (READMEs), การตั้งค่าทักษะ (Skills), Artifacts และโน้ตต่างๆ
3. **การออกแบบโค้ด (Modularity)**: ต้องเขียนโค้ดแยกเป็น Module/Class เสมอ มีความชัดเจนและยืดหยุ่น เช่น `PBXProtocolHandler` (แปลโปรโตคอล), `ConnectionManager` (ควบคุมการเชื่อมต่อ), `StateVerifier` (ยืนยันผลลัพธ์)
4. **ความปลอดภัยสูงสูด (Safety First)**: ห้ามแก้ไขคำสั่ง Hardware หรือส่งคำสั่งควบคุมโดยไม่มีการเขียน Unit Test หรือระบบ Verifier กำกับไว้
5. **ระบบจัดการปัญหาตัวเอง (Self-Healing)**: ในทุก Loop ของการพัฒนาและทำงาน ให้ Agent ตรวจสอบ Log และจัดการ Error โดยอัตโนมัติ (เช่น นโยบาย Retry ในกรณีเกิดข้อผิดพลาดทางเครือข่ายชั่วคราว)
6. **กฎการออกแบบ Frontend (Frontend Design Rules)**: ให้ความสำคัญกับความสวยงามเป็นอันดับหนึ่ง ใช้สีสันที่ดูแพง, ฟอนต์สมัยใหม่ (เช่น Google Fonts), โหมดดาร์กโหมดที่ดูโฉบเฉี่ยว และแอนิเมชันเพื่อมอบประสบการณ์แบบพรีเมียม ห้ามทำแค่ MVP พื้นๆ
7. **ระบบ Multi-Agent และเอกสาร (Multi-Agent System & Documentation)**: ระบบใช้โครงสร้าง Code as Agent Harness
   - **Librarian / Synthesis Agent**: มีหน้าที่สกัดข้อมูลจาก `docs/raw` ย่อยและเขียนสรุปเป็น Evergreen Note ใน `docs/wiki`
   - **Verification Agent**: มีหน้าที่ตรวจสอบความถูกต้อง Fact-check และตรวจสอบแหล่งอ้างอิงก่อนยืนยันเอกสาร
   - **การบันทึกความรู้ (Documentation)**: ทุกครั้งที่สร้าง Feature ใหม่ ให้บันทึกความเข้าใจลงในไฟล์สรุปใน `/wiki` เสมอ
8. **สไตล์การแก้ปัญหา (Troubleshooting Style)**: เมื่อเจอปัญหา (Error) หรือบั๊ก ต้องใช้วิธีคิดวิเคราะห์เป็นขั้นเป็นตอน (Step-by-step analytical approach) โดยสรุปปัญหาให้ผู้ใช้ฟังแบบเข้าใจง่าย (ระบุสาเหตุหลัก และบอกวิธีแก้เป็นข้อๆ ที่สามารถนำไปใช้ได้ทันที) หลีกเลี่ยงการตอบแบบกำกวม
9. **ระบบบันทึก Timeline อัตโนมัติ (Automated Changelog)**: เมื่อพัฒนา Feature สำคัญเสร็จสิ้น หรือแก้ปัญหา (Bug/Issue) หลักสำเร็จลุล่วง Agent **ต้อง** ทำการอัปเดตและบันทึกประวัติลงในไฟล์ `/docs/wiki/project_timeline.md` โดยอัตโนมัติทุกครั้ง เพื่อเก็บบันทึกประวัติการก่อสร้างโครงการไว้เป็นคู่มือและคลิปสอนช่าง
