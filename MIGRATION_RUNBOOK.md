# 🔀 SHC — Migration Runbook (nithep 5-Core Restructure)

> เอกสารนี้บันทึกการย้ายโครงสร้าง SHC (Smart Hotel Check-in) จาก monorepo `hotel-ecs-checkin`
> มาอยู่ในโครงสร้าง 5-Core มาตรฐานของ `nithep/shc` — ใช้เป็นคู่มือสำหรับการอ้างอิง
> path ใหม่ และการ Deploy บน Raspberry Pi 4 (เซิร์ฟเวอร์ `/opt/hotel-ecs` → `nithep/shc`)

---

## 1. ภาพรวมการเปลี่ยนแปลง (Overview)

| เดิม (monorepo) | ใหม่ (nithep/shc) | รายละเอียด |
|---|---|---|
| `frontend/` | `app/` | React/Vite Dashboard + Self Check-in UI |
| `frontend-liff/` | `app/liff/` | LINE MINI App (LIFF) |
| `backend/` | `api/` | Node.js API Server (JWT/RBAC/PBX Control) |
| `backend-cloudrun/` | `api/cloudrun/` | GCP Cloud Run API Gateway (MQTT) |
| `pbx-connector/` | `pbx/` | PBX Protocol Driver + Simulator + Tests |
| `scripts/`, `edge-agent/`, `worker/`, `vpn-setup/`, `ai-models/`, `edge-agent-deploy/` | `ops/` (ย่อย) | DevOps & Agentic tooling |
| `docker-compose*.yml`, `ecosystem.config.js`, `install.sh`, deploy scripts | `ops/` | Deploy/Infra config |
| `.github/workflows/` | `ops/workflows/` | GitHub Actions (GCP Deploy) |
| `docs/` (OKF Vault) | `doc/` | Knowledge Base (ครบ 124/124 ไฟล์) |
| `snc-poc/` | **ลบ** | แยกไปอยู่ `nithep/snc` |

## 2. Path บน Pi (Server) — ใหม่

| รายการ | เดิม | ใหม่ |
|---|---|---|
| Root โครงการ | `/opt/hotel-ecs` | `/home/ecs-agent/nithep/shc` |
| API Server | `/opt/hotel-ecs/app/backend` | `.../nithep/shc/api` |
| UI | `/opt/hotel-ecs/app/frontend` | `.../nithep/shc/app` |
| PBX Driver | `/opt/hotel-ecs/app/pbx-connector` | `.../nithep/shc/pbx` |
| config/.env | `/opt/hotel-ecs/config/.env` | `.../nithep/shc/config/.env` |
| data (hotel.db) | `/opt/hotel-ecs/data/hotel.db` | `.../nithep/shc/data/hotel.db` |
| logs | `/opt/hotel-ecs/logs` | `.../nithep/shc/logs` |

## 3. ไฟล์ที่อัปเดต path แล้ว (ใน branch นี้)

| ไฟล์ | การแก้ไข |
|---|---|
| `api/master_process_test.js` / `test_power_recovery.js` / `virtual_checkin_test.js` | `require('../pbx-connector')` → `'../pbx'` |
| `ops/worker/simulate_cloud_edge.js` | `require('../backend/...')` → `'../api/...'` |
| `ops/scripts/e2e_loop_test.js` | `require('../backend/db')` → `'../api/db'` |
| `ops/scripts/agents/*.js` | `../../docs` → `../../doc` |
| `ops/ecosystem.config.js` | `./backend/server.js` → `./api/server.js` |
| `ops/docker-compose.yml` / `ops/docker-compose.prod.yml` | volumes/command → `api/`, `app/`, `pbx/`, `nithep/shc` |
| `ops/edge-agent/test/e2e/flow.test.js` / `pbx/test/e2e/flow.test.js` | require `../../simulator/pbx-simulator` — path สัมพัทธ์ถูกต้องอยู่แล้ว (ตรวจแล้ว ไม่ต้องแก้) |
| `ops/install.sh`, `bootstrap-pi.sh`, `fix-cloudflare.sh`, `deploy-to-pi.ps1`, `check-pi-status.sh` ฯลฯ | `/opt/hotel-ecs` → `/home/ecs-agent/nithep/shc` |
| `ops/workflows/deploy-*.yml` | `backend/` → `api/`, `frontend/` → `app/` |

## 4. 🚧 Deploy บน Pi (หลังตรวจสอบระบบ)

```bash
# 1. เตรียมโครงสร้าง (ปรับ bootstrap-pi.sh ให้เป็น path ใหม่แล้ว)
ssh pi4
sudo mkdir -p /home/ecs-agent/nithep/shc/{api,app,pbx,ops,config,data,logs}
sudo chown -R ecs-agent:ecs-agent /home/ecs-agent/nithep

# 2. อัปเดต docker-compose.prod.yml path และ .env
#    (ไฟล์อยู่ใน ops/docker-compose.prod.yml)

# 3. รันระบบ
cd /home/ecs-agent/nithep/shc
docker compose -f ops/docker-compose.prod.yml up -d
docker compose -f ops/docker-compose.prod.yml ps
```

## 5. Rollback

```bash
# Backup ก่อนย้ายเสมอ
sudo cp -r /opt/hotel-ecs /opt/hotel-ecs.bak.$(date +%Y%m%d)
# คืนค่า: รัน docker-compose เดิมจาก /opt/hotel-ecs/app
```

## 6. Git History (การแยก repo ในอนาคต)

เมื่อพร้อม push เป็น repo แยก (`github.com/nithep/shc`):
```bash
# จาก repo hotel-ecs-checkin (branch split/shc)
git filter-repo --path api --path app --path pbx --path ops --path doc \
                --path README.md --path AGENTS.md --path Program.md --path LICENSE \
                --path package.json --path package-lock.json --path .gitignore \
                --path .env.example --path .env.production.template \
                --path .agents --path .lingma --path .freebuff --force
git remote add origin https://github.com/nithep/shc.git
git push -u origin main
```
> หมายเหตุ: `git filter-repo` ต้องรันใน clone สำรอง ไม่ใช่ repo หลัก

---
*บันทึกโดย: Senior Software Engineer — 13 ส.ค. 2569, branch `split/shc`*
