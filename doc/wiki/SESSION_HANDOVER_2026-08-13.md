# 📦 Session Handover — 13 ส.ค. 2569 (SNC Pre-Release สู่ Go-Live)

> เอกสารส่งต่อสำหรับ session ถัดไป — สรุปงานที่ทำแล้ว, สถานะระบบปัจจุบัน, สิ่งที่ห้ามทำระหว่าง Burn-in, และขั้นตอนถัดไป

---

## 1. สรุปงานที่ทำสำเร็จใน session นี้

### 1.1 Dashboard v2.0 + Backend Fix (deploy ขึ้น production แล้ว)
- **Nurse Dashboard v2.0** เขียนใหม่ทั้งหลัง: protocol-aware (relative URL + `wss://`), Settings Modal + API Key, room states อิงเซิร์ฟเวอร์, KPI เต็มรูปแบบ, ประวัติ (ค้นหา/กรอง/Export CSV/ป้าย SLA breach), เสียงเตือน + ปุ่มปิดเสียง, แบนเนอร์ฉุกเฉิน, i18n ไทย/อังกฤษ, a11y, โหมด demo
  - ไฟล์: `snc-poc/backend/public/index.html` (= mirror `snc-poc/frontend/index.html`) — **main dashboard เสิร์ฟที่ `/`**
- **`sourceEventType`** ใน `server.py` → DB/KPI เก็บ `CALL_BEDSIDE` / `CALL_BATHROOM_EMERGENCY` ตรงจริง (เดิมถูกกลืนเป็น `CALL_TRIGGERED`)
- **WS resilience**: exponential backoff + jitter (→30s cap), สถานะ 4 ระดับ 🟢🟡🔴, กัน WS ซ้อน (fix critical bug), auto-reconnect เมื่อกลับแท็บ

### 1.2 Tooling (scripts ใหม่ทั้งหมด)
| Script | หน้าที่ | หมายเหตุ |
|---|---|---|
| `snc-poc/deploy-snc-one-shot.sh` | Deploy ครบวงจร (backup→scp→md5→restart→verify→tunnel) | flags: `--dry-run`, `--check-tunnel`, `--help` |
| `snc-poc/backup-snc-db.sh` | Backup SQLite ปลอดภัย WAL, เก็บ 14 วัน | cron **03:00 ทุกวัน** บน Pi, chmod 600 |
| `snc-poc/burnin-monitor.sh` | ตรวจ health/services/DB/disk/mem ทุก 60s | `--report` สรุปผล, `--background 48` |
| `snc-poc/burnin-reminder.sh` | cron เตือนทุก 1 ชม.: สถานะทุก 6 ชม. + แจ้งครบ 48 ชม. ครั้งเดียว | cron `7 * * * *`, read-only 100% |

### 1.3 เอกสารครบชุด (UTF-8 ไทยทุกฉบับ)
| เอกสาร | สำหรับใคร |
|---|---|
| `snc-poc/STAFF_GUIDE_TH.md` | พยาบาล/พนักงาน (ใช้งาน dashboard) |
| `snc-poc/PBX_POWER_CYCLE_SOP.md` | ช่างเทคนิค (ปิด-เปิดตู้แก้ session ค้าง) |
| `snc-poc/FIELD_TEST_CHECKLIST.md` | ทีมทดสอบ (4 ช่วง ~1 ชม.) |
| `snc-poc/FIELD_TEST_DAY_PLAN.md` | แผนนัดวันทดสอบหน้างาน (09:00-10:30) |
| `docs/wiki/SYSTEMD_SERVICES_SUMMARY.md` / `CLOUDFLARE_TUNNEL_SUMMARY.md` / `PBX_CONNECTIVITY_TROUBLESHOOTING.md` | ฐานความรู้ OKF |

### 1.4 การทดสอบที่ผ่าน (บน production จริง)
- End-to-end ผ่าน tunnel: auth 401 ✅ trigger 2 ประเภท ✅ ack/clear + SLA ✅ KPI แยกประเภท ✅
- WS real-time: 2 แท็บเห็นเหตุการณ์พร้อมกันผ่าน broadcast ✅
- **Field-test 3.2-3.4**: restart backend กลางอากาศ → auto-recover ✅ / ตัดเน็ต client → recover ✅ / 2 แท็บเห็นพร้อมกัน ✅
- **Rollback drill**: backup→คืนค่า→restart→verify→undo ใช้เวลา ~10s ✅
- **Burn-in 48 ชม.**: เริ่ม 03:03 น. 13 ส.ค. → ครบ **15 ส.ค. 03:03** (ดูสถานะล่าสุด: 41 รอบ 0 FAIL)

### 1.5 Git & ความปลอดภัย
- Branch `docs/move-snc-analysis-report` — **12 commits ใหม่ push ขึ้น origin แล้ว** (`github.com/nithep/hotel-ecs-checkin`), working tree สะอาด
- `.env` บน Pi → `chmod 600` (เดิม 755!), backend dir `700`
- Stale rebase state ถูกเก็บ/ล้าง, เพิ่ม `__pycache__/` `.freebuff/` `.grok/` ใน .gitignore
- Secret scan ผ่าน ไม่พบ secret ในไฟล์ที่ commit

---

## 2. สถานะระบบปัจจุบัน (Live)

| รายการ | ค่า |
|---|---|
| Public dashboard | https://nursecall.nithep.com (health: `/health`, API docs: `/docs`) |
| Hotel main (เดิม) | https://hotel.nithep.com → Docker `hotel-app:3000` |
| Pi 4 | `192.168.1.94` (LAN) / SSH alias **`pi4`** (user `ecs-agent`) |
| Services | `snc-backend.service` + `snc-pbx-listener.service` = **active ทั้งคู่** |
| PBX | `192.168.1.91:23` (SMDR), password `PBX_PASS` ใน `.env` (บน Pi) |
| TCP proxy | Pi `:2323` — Room Manager ดูประวัติได้โดยไม่แย่ง session |
| Event DB | `/home/ecs-agent/snc-poc/backend/nurse_call_events.db` (23 events ข้อมูลจริง, 6 สายค้าง) |
| Burn-in | **RUNNING** (41+ รอบ, 0 FAIL) — ครบ 15 ส.ค. 03:03 |
| Cron (Pi) | `*/5` pbx_watchdog / `0 3` backup DB / `7 * * * *` burnin-reminder |
| Backups | `/home/ecs-agent/snc-poc/server.py.bak.*` + `backups/` (DB) — ย้อนกลับได้ทุกจุด |

---

## 3. ⛔ สิ่งที่ห้ามทำกับ Pi 4 ระหว่าง Burn-in (จนถึง 15 ส.ค. 03:03)

1. ห้าม restart/stop services (snc-backend, snc-pbx-listener)
2. ห้าม reboot / ปิด-เปิดเครื่อง Pi
3. ห้าม deploy / scp ไฟล์โค้ดหรือ config ใหม่ขึ้น Pi
4. ห้ามปิด-เปิดตู้ Phonik PBX (power cycle) เว้นจำเป็นจริง ๆ (SOP อยู่ใน `PBX_POWER_CYCLE_SOP.md`)
5. ห้ามรันงานหนัก (apt upgrade, stress test, ขนไฟล์ใหญ่)
6. ห้ามถอดสาย LAN / สายไฟ / ย้ายตำแหน่ง Pi
7. ห้ามแก้ `.env` / เปลี่ยน API key / config
8. ห้ามลบ-ย้าย `burnin.log` หรือ `nurse_call_events.db`

✅ อนุญาต: เปิด dashboard ดูผล, อ่าน log (read-only)

---

## 4. คำสั่งที่ใช้บ่อย (cheat-sheet)

```bash
# SSH
ssh pi4

# ตรวจสถานะระบบ
ssh pi4 'systemctl is-active snc-backend.service snc-pbx-listener.service'
ssh pi4 'curl -s http://localhost:8000/health'
curl -s https://nursecall.nithep.com/health

# Burn-in
ssh pi4 '/home/ecs-agent/snc-poc/burnin-monitor.sh --report'       # สรุปผล burn-in
ssh pi4 '/home/ecs-agent/snc-poc/burnin-reminder.sh --check'       # สถานะ/เวลาที่เหลือ
ssh pi4 'tail -20 /home/ecs-agent/snc-poc/burnin_reminder.log'     # ประวัติเตือน

# Deploy (หลัง burn-in ผ่านเท่านั้น!)
./snc-poc/deploy-snc-one-shot.sh
./snc-poc/deploy-snc-one-shot.sh --check-tunnel

# ทดสอบ trigger ผ่าน tunnel (ห้ามใช้ห้อง 999 จริงซ้ำ — ใช้ scratch ได้)
curl -s -X POST https://nursecall.nithep.com/api/events/trigger \
  -H 'Content-Type: application/json' -H "X-API-Key: <key>" \
  -d '{"room_id":"999","event_type":"CALL_BEDSIDE"}'

# Backup DB ด้วยมือ
ssh pi4 '/home/ecs-agent/snc-poc/backup-snc-db.sh --pi'
```

---

## 5. ขั้นตอนถัดไป (Go-Live Checklist — เหลืออีก 3 ข้อ)

- [ ] **สรุปผล burn-in ฉบับเต็ม** หลังครบ 48 ชม. (15 ส.ค. 03:03) — ใช้ `burnin-monitor.sh --report`, เกณฑ์ผ่าน: 0 FAIL + services active ตลอด + ตรวจ KPI (SLA compliance)
- [ ] **นัดวันทดสอบหน้างานจริงร่วมทีม** ตาม `FIELD_TEST_DAY_PLAN.md` (~1.5 ชม., เน้นข้อที่ต้องใช้สายจริง: 1.x, 2.x, 3.1)
- [ ] **ปิดโปรเจกต์**: ผ่านครบ → แจ้งพร้อมวางจำหน่าย + แจก `STAFF_GUIDE_TH.md` + นัดวันเริ่มใช้งานจริง

### ทางเลือกเพิ่มเติม (deferred)
- เปลี่ยนค่าเริ่มต้น `PBX_PASS` (ถ้ายังเป็นค่า default)
- เพิ่มการแจ้งเตือน Telegram เมื่อ burn-in ครบ (ยังไม่มี token ในระบบ)
- ทดสอบ rollback เพิ่มเติม / เพิ่ม backup ให้มากขึ้น

---

*บันทึกโดย: Senior Software Engineer (Antigravity Agent) — 13 ส.ค. 2569, branch `docs/move-snc-analysis-report`, commit HEAD: `577ac76`*
