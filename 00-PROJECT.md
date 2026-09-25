# SHC / SNC — Projects Layer (monorepo: mapping อย่างเดียว)

> monorepo ใหญ่ (หมื่นไฟล์) ห้ามรื้อโครง ใช้ mapping นี้แทน

| Layer | โฟลเดอร์เดิม |
|---|---|
| Inputs | `doc/raw/` (ข้อมูลดิบ), requirements/issues |
| Process | `api/`, `app/`, `core/`, `ops/` (งานระหว่างทำ), `doc/` (draft) |
| Outputs | `packaging/`, `doc/` (final: `ARCHITECTURE_*.md`, `DEPLOYMENT_CHECKLIST.md`), `ops/terraform`, `ops/monitoring` |
| Feedback | `logs/`, `ops/monitoring`, issues |

## กฎ
- ห้ามเปลี่ยนชื่อ/ย้ายโฟลเดอร์เดิมเด็ดขาด (มีโค้ด + `.env` อ้าง path)
- ความรู้ที่เป็น evergreen (สรุปสถาปัตย์, ADR) สกัดเข้า `Digital Second Brain/wiki/notes/` ได้ แต่โค้ดอยู่กับที่
