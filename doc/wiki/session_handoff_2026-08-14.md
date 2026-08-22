# 📋 Session Handoff — Smart Hotel Check-in (SHC) วันที่ 2026-08-14

> เอกสารนี้สรุปสถานะระบบทั้งหมด เพื่อให้เปิดแชตใหม่แล้วทำงานต่อได้ทันที
> อ่านไฟล์นี้ก่อน แล้วตามด้วย `doc/wiki/mqtt_sse_cloud_edge_bridge.md` (สถาปัตยกรรม) และ `doc/wiki/project_timeline.md` (ประวัติ)

---

## 1. ภาพรวมสถาปัตยกรรมปัจจุบัน (ทำงานแล้วจริง)

```
Guest (LINE LIFF) → Cloud API (Node/Express) → MQTT Broker (Mosquitto, Auth+TLS)
                                                    ↓
                                            Edge Agent (Pi / mock)
                                                    ↓
                                            Phonik PBX (CCH2) → ECS-103R relay
```

- **Cloud API**: `api/cloudrun/index.js` — session state machine (`PENDING_RELAY → SUCCESS/FAILED/TIMEOUT`) + SSE push ไป LINE LIFF
- **Broker**: Mosquitto 2.1.2 (Windows service) — **auth บังคับทุก listener** + TLS ที่ 8883
- **Edge**: `ops/edge-agent/mqtt_agent.js` — `clean:false` (offline queue), QoS 1, read-back verify (`..PWER=ALL`), retry

## 2. สถานะระบบบนเครื่องตอนนี้ (สำคัญ!)

| รายการ | สถานะ | รายละเอียด |
|---|---|---|
| Mosquitto service | ✅ **RUNNING** | listener `0.0.0.0:1883` (auth) + `0.0.0.0:8883` (TLS) |
| Credentials broker | `hotel` / `HotelEcs@2026` | เปลี่ยนได้: `powershell -File ops/mosquitto/setup-auth-tls.ps1 -MqttUser x -MqttPass y` (Admin) |
| TLS cert | self-signed 825 วัน | `CN=hotel.nithep.com`, SAN: localhost/LAN IP — ผลิตภัณฑ์จริงควรเปลี่ยนเป็น CA-signed |
| `api/cloudrun/.env` | ✅ สร้างแล้ว (gitignored) | `mqtts://127.0.0.1:8883` + auth, `BRANCH_ID=branch-a` |
| `ops/edge-agent/.env` | ✅ สร้างแล้ว (gitignored) | เดียวกัน + `PBX_MODE=mock` (Digital Twin) |
| Cloud API บนพอร์ต 8080 | ⚠️ **มี process เก่าค้างอยู่** (node PID เดิม) | ก่อนรัน Cloud ใหม่ต้อง kill ตัวเก่า หรือใช้พอร์ตอื่น |
| PBX Simulator | ⚠️ อาจมีรันค้างที่ `127.0.0.1:10001` (PID 14284) | ใช้ทดสอบ `PBX_MODE=tcp` ได้ |

## 3. วิธีรัน + ทดสอบ (คำสั่ง)

```bash
# 1) Edge Agent (mock / Digital Twin) — ต้องมี node_modules ของ api (ยังไม่ได้ npm install ในโฟลเดอร์ edge)
NODE_PATH=api/node_modules node ops/edge-agent/mqtt_agent.js

# 2) Cloud API (ถ้า 8080 ชน ให้ PORT=8082)
PORT=8082 node api/cloudrun/index.js

# 3) ทดสอบ E2E ผ่าน HTTP
curl -X POST localhost:8082/api/guest/checkin -H 'Content-Type: application/json' \
  -d '{"roomNumber":"0101","guestName":"Test"}'
curl localhost:8082/api/guest/session/<session_id>   # รอจน status=SUCCESS
```

**หมายเหตุ**: shell/terminal ของเครื่อง dev มี env ค้าง `MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883` (ค่าจาก harness, ไม่ได้อยู่ใน registry) — dotenv ตั้งใจให้ env จริงชนะ `.env` เสมอ ดังนั้นก่อนรันให้:
```bash
unset MQTT_BROKER_URL MQTT_USERNAME MQTT_PASSWORD   # หรือเปิด terminal ใหม่
```

## 4. ผลงานทั้งหมดที่ทำในเซสชันนี้ (2026-08-14)

1. **MQTT & SSE Cloud-to-Edge Bridge ครบ 4 เฟส** (จากแผน implementation_plan.md)
   - `api/cloudrun/state_store.js` + `sse_broker.js` (ใหม่) — async session flow + SSE
   - `api/cloudrun/index.js` — session_id, QoS 1, subscribe `/state`+`/result`, `GET /api/guest/stream` (SSE), `GET /api/guest/session/:id`
   - `ops/edge-agent/mqtt_agent.js` — `clean:false` + Client ID คงที่ + read-back verify + publish `/state`+`/result`
   - `app/liff/src/CheckIn.jsx` + `index.css` — SSE + polling fallback, แอนิเมชัน "ไฟสว่างวาบ" (`power-flash`), haptic (`navigator.vibrate`)
   - `doc/wiki/mqtt_sse_cloud_edge_bridge.md` (ใหม่) — เอกสารสถาปัตยกรรม Topic Contract
2. **Mosquitto Auth + TLS** (`ops/mosquitto/`)
   - `mosquitto.conf` (1883+8883, `allow_anonymous false`), certs, pwfile
   - `setup-auth-tls.ps1` — ติดตั้งอัตโนมัติแบบ Admin **รวม ACL fix แล้ว**
   - Apply จริง + แก้บั๊ก service start ไม่ขึ้น (ดูข้อ 5)
3. **`.env` จริง + แก้ dotenv**
   - เพิ่ม dotenv ให้ Cloud (`index.js` + `package.json`)
   - แก้บั๊ก dotenv path ของ Edge (`path.join(__dirname, '.env')`)
4. **E2E ผ่านทั้งหมด** (exit 0 ทุกครั้ง): กับ public broker, กับ local Mosquitto auth+TLS (`mqtts://127.0.0.1:8883`), และด้วยค่า `.env` ล้วน

## 5. ปัญหาที่เจอและวิธีแก้ (สำคัญอ้างอิง)

| ปัญหา | สาเหตุ | วิธีแก้ |
|---|---|---|
| Mosquitto service start ไม่ขึ้น | `mosquitto_passwd` สร้าง `pwfile` ด้วย ACL เฉพาะเจ้าของ (mode 0600) → SYSTEM อ่านไม่ได้ | `icacls "C:\Program Files\Mosquitto\pwfile" /grant "*S-1-5-18:(R)" "*S-1-5-32-544:(R)"` — สคริปต์รวม fix นี้แล้ว |
| `mosquitto.log` ACL ค้างอ่านไม่ได้ | ไฟล์ log ถูกสร้างด้วย ACL จำกัด | `icacls "C:\Program Files\Mosquitto\mosquitto.log" /grant "*S-1-5-18:(F)" "*S-1-5-32-544:(F)"` |
| Edge โหลด `.env` ไม่ได้ (injected 0) | `dotenv.config()` ไม่ระบุ path → อ่านจาก cwd | แก้เป็น `require('dotenv').config({ path: path.join(__dirname, '.env') })` |
| Cloud API EADDRINUSE 8080 | process เก่าค้าง | kill PID ที่ครอบ 8080 หรือรันพอร์ตอื่น |
| SSE room number ไม่ตรง | endpoint เคย strip ศูนย์หน้า (`0101`→`101`) | แก้แล้ว (ใช้ roomNo ตามที่ส่งมา) |
| check-in request hang ตอน MQTT หลุด | `await publishToEdge()` | แก้เป็น fire-and-forget + sweeper จัดการ TIMEOUT |

## 6. งานค้าง/ขั้นถัดไป (Todo สำหรับแชตใหม่)

- [ ] **ติดตั้ง dependencies ของ edge agent**: `cd ops/edge-agent && npm install` (ตอนนี้ใช้ `NODE_PATH=api/node_modules` แทน)
- [ ] **Deploy Pi Zero 2 W**: `PBX_MODE=tcp`, `PBX_HOST=<IP ตู้>`, `PBX_PORT=23` + systemd service (`ops/edge-agent/`)
- [ ] **Production broker**: HiveMQ Cloud/EMQX (`mqtts://<cluster>.s1.eu.hivemq.cloud:8883`) — ต้องใช้ credentials จริงจากผู้ใช้ (ค้นแล้วไม่พบในโปรเจกต์)
- [ ] **CA-signed cert** สำหรับ TLS ผ่านอินเทอร์เน็ต (ปัจจุบัน self-signed ใช้ได้เฉพาะ LAN/dev)
- [ ] **npm install ใน `api/cloudrun/`** เพื่อให้ Docker build ไม่เจอ dependency ขาด (ตรวจ Dockerfile ใช้ `package.json` ที่มี dotenv แล้ว)
- [ ] Kill process เก่าที่ค้างพอร์ต 8080 (Cloud API รุ่นเก่า) ก่อน deploy จริง

## 7. ไฟล์สำคัญ (ด่านแรกที่ควรเปิด)

| ไฟล์ | เนื้อหา |
|---|---|
| `doc/wiki/mqtt_sse_cloud_edge_bridge.md` | สถาปัตยกรรม MQTT+SSE, Topic Contract, Resilience |
| `doc/wiki/project_timeline.md` | ประวัติการพัฒนา (3 entries ของวันนี้) |
| `api/cloudrun/index.js` | API Gateway หลัก (session + SSE + MQTT) |
| `ops/edge-agent/mqtt_agent.js` | Edge Agent (MQTT + PBX + verify) |
| `ops/mosquitto/setup-auth-tls.ps1` | สคริปต์ติดตั้ง broker auth+TLS (Admin) |
| `ops/mosquitto/README.md` | คู่มือ + Troubleshooting broker |
| `api/cloudrun/.env` + `ops/edge-agent/.env` | Config จริง (gitignored — อย่า commit) |

## 8. สิ่งที่ยังไม่ได้ทำในเซสชันนี้

- ยังไม่ได้รันเทสต์ suite เดิม (`pbx/test/*`) หลังแก้โค้ด — ควรตรวจก่อน commit
- ยังไม่ได้ `npm install` ใน `ops/edge-agent/` และ `api/cloudrun/` (มี node_modules แค่ใน `api/`)
- Docker ยังไม่ได้ติดตั้งบนเครื่องนี้ (ถ้าจะรัน HiveMQ CE ต้องติดตั้งก่อน)
