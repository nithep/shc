# ADR-001: ระบบ Safety Pipeline (Approval Gate + Rate Limiter + Audit Log)

## Status
approved

## Context & Problem
ตู้สาขาโทรศัพท์ (Phonik PBX) และบอร์ดควบคุม ECS-103R ทำงานเป็นระบบ Hardware-in-the-loop ที่ควบคุมไฟฟ้าแรงดันสูง (220V) ภายในห้องพักของโรงแรม หากผู้ใช้งานหรือ AI Agent ส่งคำสั่งผิดพลาด (เช่น ปิดไฟทุกห้องพักพร้อมกัน, ส่งคำสั่งถี่จนทำให้บอร์ดควบคุมเสียหาย หรือยิงคำสั่งนอกเวลาทำการปกติ) อาจส่งผลกระทบต่อความปลอดภัยและทรัพย์สินของโรงแรมได้เป็นวงกว้าง

เราต้องการระบบที่สามารถดักกรองคำสั่ง (Interception), จำกัดความเร็วของคำสั่ง (Rate Limiting), จัดแบ่งกลุ่มความเสี่ยง (Risk Classification), และบันทึกประวัติการตัดสินใจแบบแก้ไขไม่ได้ (Immutable Audit Trail) เพื่อให้ระบบทำงานได้อย่างปลอดภัยในลักษณะ Agent-Operable System

## Decision & Rationale
เราตัดสินใจเชื่อมต่อ 3 กลไกการป้องกัน (Defense-in-depth) เข้าเป็น **Safety Pipeline** ใน `server.js` ก่อนที่คำสั่งใดๆ จะถูกส่งไปยัง `pbx-connector`:

1. **Rate Limiter (Sliding Window Counter)**:
   - จำกัดความถี่ของคำสั่งไม่ให้เกิน `3 cmd/min/room` ป้องกัน runaway loop ของ Agent
2. **Approval Gate (Middleware)**:
   - จำแนกความเสี่ยงของคำสั่ง (HR-01 ถึง HR-07)
   - คำสั่งความเสี่ยงสูง (High-Risk/Critical) ต้องผ่านการกดปุ่มอนุมัติของ Admin ผ่าน Web Dashboard ภายใน 60 วินาที
   - หากคำสั่งใดเป็น Low-Risk จะจัดอยู่ในโหมด `AUTO_PASSED`
3. **Audit Log (SQLite - Append Only)**:
   - บันทึกทุกคำสั่งที่ไหลผ่านระบบ (รวมถึง `AUTO_PASSED`, `EXPIRED`, `REJECTED`, `APPROVED`) โดยห้ามไม่ให้มีคำสั่งแก้ไข/ลบข้อมูล (Immutable)

## Consequences
- **ผลกระทบด้านบวก**:
  - ยกระดับความปลอดภัยให้กับตัวบอร์ดควบคุมและระบบไฟฟ้าของโรงแรม
  - Agent สามารถตรวจสอบสถานะการอนุมัติและ log ประวัติผ่าน API ปิดช่องว่างของการทำงานชนกัน
- **ข้อพิจารณา (Trade-offs)**:
  - การเรียกใช้คำสั่งที่มีความเสี่ยงสูง (เช่น Emergency Override) จะเกิดความล่าช้า (Latency) เนื่องจากต้องรอการตอบสนองแบบ Human-in-the-loop
  - การบันทึก Log ลง SQLite เพิ่มภาระการอ่าน/เขียนดิสก์เล็กน้อย (แต่ได้รับการบรรเทาด้วยการใช้ Indexing บน `trace_id` และ `timestamp`)

## References
- arXiv 2605.18747 (preprint, 2026) - Awesome Code as Agent Harness Papers
- Awesome Code as Agent Harness GitHub Repository (industry blog / preprint compilation, 2026)
