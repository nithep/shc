---
name: snc
description: >
  Smart Nurse Call (SNC) PoC orchestrator for Hotel-ECS — Phonik PBX SMDR edge
  capture, FastAPI/WebSocket nurse station, HL7 FHIR-like events, SLA timers,
  built-in TCP proxy (port 2323) for Room Manager mirroring, Pi deploy and
  field diagnostics. Use when the user mentions snc, snc-poc, Smart Nurse Call,
  nurse call, EMER, CALL_BEDSIDE, CALL_BATHROOM_EMERGENCY, nurse_call_events,
  snc_pbx_listener, Phonik Help Call nurse dashboard, Room Manager 2323 proxy,
  handshake emulation, or runs /snc. Complements Phonik_SNC_Hardware_Spec,
  PBX_Protocol_Handler, State_Verifier, and Cloudflare_Tunnel_Setup.
user-invocable: true
argument-hint: "[diagnose|start|test|deploy|kpi|proxy|fix <topic>]"
when-to-use: >
  snc-poc, Smart Nurse Call, nurse call dashboard, EMER pull switch, SMDR
  listener, PBX port 23 nurse events, Room Manager 2323 proxy mirror, SLA
  ack/resolution time
---

# SNC — Smart Nurse Call Orchestrator

**Role:** Healthcare IoT engineer for **Smart Nurse Call (SNC) PoC** on Hotel-ECS  
**Scope root:** `snc-poc/` under Hotel-ECS (prefer working directory = repo root)  
**Language:** Thai for operator-facing docs and status; code/identifiers stay English

Do **not** restate full hardware catalogs or CCH2 power-relay tables here. Load specialist skills when the task needs them:

| Concern | Skill |
|---------|--------|
| Phonik Help Call HW / SMDR line shapes / DX cabinets | `Phonik_SNC_Hardware_Spec` |
| CCH2 `..ROOM` / `..NAME` (hotel power, not nurse call) | `PBX_Protocol_Handler` |
| ACK/NACK/timeout self-healing | `State_Verifier` |
| Cloudflare Tunnel / 502 / Pi DHCP | `Cloudflare_Tunnel_Setup` |
| Docs vault distillation | `Librarian_OKF_Protocol` |

## Mission

Modernize legacy Phonik nurse-call signalling into a measurable Digital Twin:

1. Capture SMDR on Telnet → classify events → FHIR-like JSON  
2. Persist timestamps (`created_at`/`timestamp`, `acknowledged_at`, `cleared`/`resolved_at`)  
3. Broadcast to nurse station (live SLA count-up timer, WebSocket)  
4. Prove **Ack ≤ 30s**, **Resolution ≤ 180s**, field-demo ready  
5. Keep 24/7 capture (heartbeat + auto-reconnect) **and** let the PC Room Manager read history simultaneously (single-session PBX workaround via port 2323 proxy — never collides with the main session)

## Canonical paths

Resolve from Hotel-ECS repo root (or absolute `…/Hotel-ECS/`):

| Asset | Path |
|-------|------|
| PoC root | `snc-poc/` |
| Edge listener (incl. TCP proxy + heartbeat) | `snc-poc/pbx-connector/snc_pbx_listener.py` |
| Parser tests | `snc-poc/pbx-connector/test_smdr_parser.py` (currently 9/9 passing) |
| Backend | `snc-poc/backend/server.py` |
| Main nurse dashboard (served at `/`) | `snc-poc/backend/public/index.html` (**v2.0**: protocol-aware HTTPS/LAN, settings modal + API key, server-synced room states, real SLA count-up timers, KPI bars, search/filter/CSV export, TH/EN i18n, a11y; byte-identical mirror = `snc-poc/frontend/index.html`) |
| Status dashboard (legacy) | `snc-poc/dashboard-status.html` → deployed to `backend/public/dashboard-status.html` |
| Event DB | `snc-poc/backend/nurse_call_events.db` (SQLite, WAL mode) |
| Start / monitor | `snc-poc/start-snc-system.sh`, `monitor-snc-status.sh`, `verify-installation.sh` |
| Quick ops card | `snc-poc/QUICK_REFERENCE.md` |
| PoC agent rules | `snc-poc/AGENTS.md` |
| Deploy checklists | `snc-poc/DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_PI4.md` |
| systemd service SOP | `docs/wiki/SYSTEMD_SERVICES_SUMMARY.md` |
| Cloudflare tunnel SOP | `docs/wiki/CLOUDFLARE_TUNNEL_SUMMARY.md` |
| PBX connectivity troubleshooting | `docs/wiki/PBX_CONNECTIVITY_TROUBLESHOOTING.md` |
| Sibling PBX (hotel) | `pbx-connector/`, `edge-agent/` — do not mix nurse-call SMDR path with room-power relay path unless asked |

## Network defaults (override via env)

| Role | Default |
|------|---------|
| Phonik PBX SMDR | `192.168.1.91:23` (`PBX_IP`, `PBX_PORT`) |
| PBX password | env `PBX_PASS` only — never commit secrets |
| Backend | `http://localhost:8000` (`BACKEND_API_URL`) |
| **TCP SMDR proxy (Room Manager mirror)** | **`0.0.0.0:2323`** (`PROXY_PORT`) — built into the listener |
| Edge Pi (ops docs) | `192.168.1.94` (LAN primary) / `192.168.1.109` (WiFi OOB backup) — alias `ssh pi4`; WiFi kept as out-of-band with power-save disabled via systemd `wifi-power-save-off.service` |
| API auth | env `SNC_API_KEY` — **all POST/PUT/DELETE require header `X-API-Key`** (GET stays open for dashboard polling); 401 without it |
| Rate limit | in-memory per-IP per-minute, checked **before** auth (also throttles key brute-force): GET 120/min (`SNC_RATE_LIMIT_GET`), writes 20/min (`SNC_RATE_LIMIT_WRITE`); 429 + `Retry-After: 60` when exceeded |
| Public SNC dashboard (tunnel live) | `https://nursecall.nithep.com` (health `/health`, API docs `/docs`). Ingress → `http://172.17.0.1:8000` (Docker bridge gateway) or `http://localhost:8000` (tunnel as host systemd service). Do **not** use LAN IPs in ingress rules — DHCP drift causes 502. |

## Event decision matrix (software SoT = listener + server)

| Physical / SMDR signal | Software event | Priority | Dashboard |
|------------------------|----------------|----------|-----------|
| First `e.{room}` call | `CALL_BEDSIDE` | `urgent` | Red flash + siren; start \(t_1\) |
| Repeat `e.{room}` within **90s** | `CALL_BATHROOM_EMERGENCY` | `stat` | Faster alert |
| `offM` / `offx` clear | `CALL_CLEARED` | routine | Green; stop resolution timer \(t_3\) |
| Nurse Ack on UI | `POST /api/events/acknowledge/{room_id}` | — | Yellow; stop ack timer \(t_2\) |

Room IDs are **zero-padded to 4 digits** in payloads (`400` → `0400`).

**Room-mapping rule (fixed 2026-08-12):** for `e.` events the PBX sends the destination **group code** in `event_code` (`e.400`) but the real calling station in `station_ext`. The listener therefore uses **`station_ext`** as the room — e.g. a press from station `401` shows as **ห้อง 0401**, never 0400.

SMDR regex accepts `==SMDX` and `--SMDX`. Skip Phonik binary keep-alives starting `0x5A`.

Handshake order (listener→PBX): `..tcmd=1` → `..VERS=` → `..PASS=…` → `..EVNT=ALL`.

**Heartbeat (anti idle-timeout):** the PBX drops the telnet session after **60s of silence**. The listener runs `_heartbeat_loop` sending `..VERS=\r\n` every **30s** to hold the connection 24/7.

**Schema is self-migrating**: `init_db()` in `server.py` runs `ensure_column` for `ack_time_seconds`, `resolution_time_seconds`, `sla_breached` on every start — old DBs upgrade in place, no manual SQL needed.

**Timestamp naming map** (spec term ↔ code): `created_at` = DB column `timestamp` (and FHIR `occurrenceDateTimeField`); `acknowledged_at` = `acknowledged_at`; `cleared`/`resolved` = `resolved_at` (status `resolved`). Computed SLA columns: `ack_time_seconds`, `resolution_time_seconds`, `sla_breached` (breach: ack > 30s or resolution > 180s).

## TCP SMDR Proxy — Room Manager mirror on port 2323 (proxy mode)

The Phonik PBX allows only **one** telnet session on `:23` (the listener holds it 24/7). To let the PC **Phonik Room Manager / System Monitor** read history without stealing the session, `snc_pbx_listener.py` starts a built-in asyncio TCP server on **`0.0.0.0:2323`** (`PROXY_PORT`):

1. PC tool points its PBX IP at the **Pi on port 2323** instead of the cabinet `:23`.
2. On connect the listener sends the standard banner `Phonik PABX Telnet system\r\n..\r\n`.
3. **Handshake emulation** — commands from the PC are answered with genuine-looking cabinet replies, so the PC tool never shows `Authenticate Failed!!`:
   - `..tcmd=` → `===tcmd=1`
   - `..VERS=` → `===VERS=DX-COMPACT V5.4r1 (V5.1r0)`
   - `..PASS=` → `===ACKW`
   - `..EVNT=` → `===EVNT=END`
   - `..` / `.` → `..`
4. Telnet IAC/control bytes (`0xFF …`) sent by the PC are stripped before matching.
5. Every raw SMDR line received from the cabinet is **broadcast verbatim** (`\r\n`-terminated) to all connected clients (`broadcast_to_proxy_clients`), so the PC can pull history while the dashboard keeps streaming live.

Verify proxy: `telnet <pi-ip> 2323` then send `..VERS=`, expect `===VERS=DX-COMPACT V5.4r1 (V5.1r0)`.

## KPI targets

| Metric | Target |
|--------|--------|
| Nurse Ack Response Time | ≤ 30 s |
| Total Resolution Time | ≤ 180 s |
| SLA compliance (ops goal) | ≥ 98% |

## Operating modes (slash / prompt)

When invoked with an argument or clear intent, run **one** mode:

### `diagnose` (default if unclear)

1. Confirm cwd under Hotel-ECS; read `snc-poc/QUICK_REFERENCE.md` only if needed  
2. Check code health: parser unit tests, backend health route, listener env defaults  
3. If on network with Pi/PBX: connectivity to `:23`, `:2323`, and `:8000/health` — otherwise report offline limits  
4. Output: symptom → likely layer (PBX / listener / backend / UI / tunnel) → next command  

### `start` / ops

Prefer existing scripts; do not invent parallel supervisord stacks:

```bash
# On Pi (typical)
cd /home/ecs-agent/snc-poc
./start-snc-system.sh
./monitor-snc-status.sh
```

Live Pi runs systemd units — see `deploy` below. Local Windows quick path: `snc-poc/quick_start.ps1` when present.

### `test`

1. Run parser tests: `python snc-poc/pbx-connector/test_smdr_parser.py` (26 tests, all PASSED expected)  
2. Backend: `health_check.py` / `integration_test.py` if present  
3. Synthetic event (no PBX required):

```bash
curl -X POST http://localhost:8000/api/events/trigger \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SNC_API_KEY" \
  -d "{\"room_id\":\"400\",\"event_type\":\"CALL_BEDSIDE\"}"
```

POST without `X-API-Key` must return **401**. On Windows PowerShell run `$env:SNC_API_KEY=...` first or load `.env` with `set -a; . ./.env; set +a`.

4. Field scenarios only when hardware available: bedside → EMER escalate → clear at pull switch  

### `deploy`

Follow `DEPLOYMENT_PI4.md` / `DEPLOYMENT_CHECKLIST.md`. Coordinate tunnel work with `Cloudflare_Tunnel_Setup`. Never open inbound router ports as the default design (outbound tunnel + private PBX LAN).

**On the live Pi** the code runs under user `ecs-agent` with **systemd**, working dir `/home/ecs-agent/snc-poc/`:

- `snc-backend.service` — FastAPI/Uvicorn, `WorkingDirectory=/home/ecs-agent/snc-poc/backend`, `Restart=always`, `RestartSec=5s`
- `snc-pbx-listener.service` — `WorkingDirectory=/home/ecs-agent/snc-poc/pbx-connector`, `After=network.target snc-backend.service`, `Requires=snc-backend.service`, `Restart=always`, `RestartSec=5s`

Steps:

1. Backup first: `cp server.py server.py.bak.$(date +%Y%m%d%H%M%S)` on the Pi  
2. `scp` the file(s), verify `md5sum` matches local  
3. Restart: `sudo systemctl restart snc-backend.service` (and/or `snc-pbx-listener.service`); or `pkill -f 'python.*server\\.py'` → systemd auto-restarts  
4. Verify: `curl http://localhost:8000/health`, re-run the KPI synthetic test (scratch room `999`), and for listener `tail -f /home/ecs-agent/snc-poc/pbx_listener.log` expecting `Connected successfully to Phonik PBX!`  
5. Dashboard: main dashboard is served at `/` from `backend/public/index.html` — deploy that file (not only `dashboard-status.html`) to keep `/` fresh; `dashboard-status.html` is the legacy status page  

Server loads `.env` itself (`GEMINI_API_KEY`, `SNC_API_KEY`) — no `EnvironmentFile` needed in the unit; the listener also reads `SNC_API_KEY` + `PBX_PASS` from its own `pbx-connector/.env`. Deploying a version without a key in env **must not crash** — guard for missing keys in `gemini_direct_service.py`.

### `kpi`

Query `/api/analytics/kpi` or read SQLite timestamps; summarize ack/resolution distributions vs targets. No fake numbers — if DB empty, say so.

### `proxy`

Inspect or explain the port-2323 SMDR mirror / handshake emulation. Useful when a PC Room Manager reports `Authenticate Failed!!`, or someone wants history without stealing the listener's session. See the TCP SMDR Proxy section above.

### `fix <topic>`

Implement or document a change: keep FHIR-like shape, UTF-8 explicit for Thai markdown, update `docs/wiki` / timeline only when the change is material (per Hotel-ECS AGENTS.md).

## Safety rules

1. **No silent hardware commands** — SMDR listen is passive; CCH2 write commands need tests + explicit user intent (`PBX_Protocol_Handler` / `State_Verifier`).  
2. **Secrets only in env** — `PBX_PASS`, tunnel tokens, API keys never in committed config; server/listener load `.env` themselves and must tolerate missing keys.  
3. **Do not confuse products** — Hotel room power (`..ROOM=`) ≠ Nurse Call SMDR (`==SMDX` / `e.room`).  
4. **UTF-8** for all Thai docs and scripts writing Thai text.  
5. **Prefer existing scripts** under `snc-poc/` over greenfield process managers.  
6. **Never put LAN IPs in Cloudflare ingress rules** — use loopback/Docker-bridge targets so DHCP drift can't cause 502 (see `CLOUDFLARE_TUNNEL_SUMMARY.md`).

## Troubleshooting cheat sheet

- **`Connection refused` / `Errno 111` on `192.168.1.91:23`** → single-session cabinet: another client (PC Operator / stale terminal) holds `:23`. Close the stale session, or have the PC use the Pi's `:2323` proxy instead. Full playbook: `docs/wiki/PBX_CONNECTIVITY_TROUBLESHOOTING.md`.
- **`Not have free PABX telnet port`** (raw cabinet reply) → stale socket sessions fill cabinet RAM; **power-cycle the cabinet** (off ~15s) — handshake then completes 100% (`..tcmd=1` → `==tcmd=1`, `..VERS=` → real version, `..PASS=` → `==ACKW`, `..EVNT=ALL` → `==EVNT=END`).
- **Idle disconnect every ~60s** → heartbeat missing (listener older than the `_heartbeat_loop` fix); upgrade `snc_pbx_listener.py`.
- **PC Room Manager says `Authenticate Failed!!` on `:2323`** → listener too old (no handshake emulation); upgrade and reconnect.
- **SMDR flows but wrong room (`0400` instead of `0401`)** → room-mapping fix missing; use `station_ext` for `e.` events (see matrix above).
- **Dashboard `/` 404/blank** → `backend/public/index.html` not deployed; copy it from `snc-poc/backend/public/index.html` (repo) or `frontend/index.html`.
- **502 on `nursecall.nithep.com`** → ingress rule points at a LAN IP or `hotel-app:3000`; must be `http://172.17.0.1:8000` / `http://localhost:8000`.

## Collaboration

- **Librarian (OKF):** durable notes under `docs/wiki/`, not repo root clutter.  
- **Hotel ECS main AGENTS.md:** premium UI, self-healing, timeline on major fixes.  
- **Saen Barrel roles (ant/cur/architect):** only if the user bridges SNC with that vault — default stay in Hotel-ECS.

## Activation

* `/snc` or `/snc diagnose` → full stack triage  
* `/snc test` → parser + API synthetic path  
* `/snc deploy` → Pi / tunnel checklist execution  
* `/snc proxy` → port-2323 Room Manager mirror / handshake emulation  
* Phrases: "snc-poc", "Smart Nurse Call", "ดึงสาย EMER", "วัด SLA nurse call", "Room Manager 2323"

*Orchestrate SNC PoC work end-to-end; defer HW catalogs and CCH2 power protocol to sibling skills.*
