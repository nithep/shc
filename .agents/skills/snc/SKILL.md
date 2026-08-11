---
name: snc
description: >
  Smart Nurse Call (SNC) PoC orchestrator for Hotel-ECS — Phonik PBX SMDR edge
  capture, FastAPI/WebSocket nurse station, HL7 FHIR-like events, SLA timers,
  Pi deploy and field diagnostics. Use when the user mentions snc, snc-poc,
  Smart Nurse Call, nurse call, EMER, CALL_BEDSIDE, CALL_BATHROOM_EMERGENCY,
  nurse_call_events, snc_pbx_listener, Phonik Help Call nurse dashboard, or
  runs /snc. Complements Phonik_SNC_Hardware_Spec, PBX_Protocol_Handler,
  State_Verifier, and Cloudflare_Tunnel_Setup.
user-invocable: true
argument-hint: "[diagnose|start|test|deploy|kpi|fix <topic>]"
when-to-use: >
  snc-poc, Smart Nurse Call, nurse call dashboard, EMER pull switch, SMDR
  listener, PBX port 23 nurse events, SLA ack/resolution time
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
2. Persist timestamps (`created_at`, `acknowledged_at`, `cleared`/`resolved`)  
3. Broadcast to nurse station (live SLA timer)  
4. Prove **Ack ≤ 30s**, **Resolution ≤ 180s**, field-demo ready  

## Canonical paths

Resolve from Hotel-ECS repo root (or absolute `…/Hotel-ECS/`):

| Asset | Path |
|-------|------|
| PoC root | `snc-poc/` |
| Edge listener | `snc-poc/pbx-connector/snc_pbx_listener.py` |
| Parser tests | `snc-poc/pbx-connector/test_smdr_parser.py` |
| Backend | `snc-poc/backend/server.py` |
| Dashboard | `snc-poc/dashboard-status.html` or `snc-poc/frontend/index.html` |
| Event DB | `snc-poc/backend/nurse_call_events.db` (also root copies may exist) |
| Start / monitor | `snc-poc/start-snc-system.sh`, `monitor-snc-status.sh`, `verify-installation.sh` |
| Quick ops card | `snc-poc/QUICK_REFERENCE.md` |
| PoC agent rules | `snc-poc/AGENTS.md` |
| Deploy checklists | `snc-poc/DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_PI4.md` |
| Sibling PBX (hotel) | `pbx-connector/`, `edge-agent/` — do not mix nurse-call SMDR path with room-power relay path unless asked |

## Network defaults (override via env)

| Role | Default |
|------|---------|
| Phonik PBX SMDR | `192.168.1.91:23` (`PBX_IP`, `PBX_PORT`) |
| PBX password | env `PBX_PASS` only — never commit secrets |
| Backend | `http://localhost:8000` (`BACKEND_API_URL`) |
| Edge Pi (ops docs) | `192.168.1.94` (LAN primary) / `192.168.1.109` (WiFi OOB backup) — alias `ssh pi4`; WiFi kept as out-of-band with power-save disabled via systemd `wifi-power-save-off.service` |
| API auth | env `SNC_API_KEY` — **all POST/PUT/DELETE require header `X-API-Key`** (GET stays open for dashboard polling); 401 without it |
| Rate limit | in-memory per-IP per-minute, checked **before** auth (also throttles key brute-force): GET 120/min (`SNC_RATE_LIMIT_GET`), writes 20/min (`SNC_RATE_LIMIT_WRITE`); 429 + `Retry-After: 60` when exceeded |
| Public demos (if tunnel live) | `https://hotel.nithep.com/nursecall`, admin console per deploy docs |

## Event decision matrix (software SoT = listener + server)

| Physical / SMDR signal | Software event | Priority | Dashboard |
|------------------------|----------------|----------|-----------|
| First `e.{room}` call | `CALL_BEDSIDE` | `urgent` | Red flash + siren; start \(t_1\) |
| Repeat `e.{room}` within **90s** | `CALL_BATHROOM_EMERGENCY` | `stat` | Faster alert |
| `offM` / `offx` clear | `CALL_CLEARED` | routine | Green; stop resolution timer \(t_3\) |
| Nurse Ack on UI | `POST /api/events/acknowledge/{room_id}` | — | Yellow; stop ack timer \(t_2\) |

Room IDs are **zero-padded to 4 digits** in payloads (`400` → `0400`).

SMDR regex accepts `==SMDX` and `--SMDX`. Skip Phonik binary keep-alives starting `0x5A`.

Handshake order (listener): `..tcmd=1` → `..VERS=` → `..PASS=…` → `..EVNT=ALL`.

**Schema is self-migrating**: `init_db()` in `server.py` runs `ensure_column` for `ack_time_seconds`, `resolution_time_seconds`, `sla_breached` on every start — old DBs upgrade in place, no manual SQL needed.

**PBX watch**: `pbx_watchdog.sh` (cron, every 5 min on Pi) logs to `pbx_watchdog.log` whenever TCP `:23` to the PBX drops — check it first when SMDR goes silent. `Connection refused` on `192.168.1.91:23` usually means the Phonik PC Operator tool holds the single telnet session.

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
3. If on network with Pi/PBX: connectivity to `:23` and `:8000/health` — otherwise report offline limits  
4. Output: symptom → likely layer (PBX / listener / backend / UI / tunnel) → next command  

### `start` / ops

Prefer existing scripts; do not invent parallel supervisord stacks:

```bash
# On Pi (typical)
cd /home/pi/Hotel-ECS/snc-poc
./start-snc-system.sh
./monitor-snc-status.sh
```

Local Windows quick path: `snc-poc/quick_start.ps1` when present.

### `test`

1. `python -m pytest` or run `test_smdr_parser.py` under `pbx-connector`  
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

**On the live Pi** the code lives at `/home/ecs-agent/snc-poc/backend/` (not `/home/pi/Hotel-ECS/...`) and runs as systemd units `snc-backend.service` + `snc-pbx-listener.service` (Restart=always):

1. Backup first: `cp server.py server.py.bak.$(date +%Y%m%d%H%M%S)` on the Pi  
2. `scp` the file, verify `md5sum` matches local  
3. Restart without sudo: `pkill -f 'python.*server\.py'` → systemd restarts it (`Restart=always`), or have the user run `sudo systemctl restart snc-backend.service`  
4. Verify: `curl http://localhost:8000/health` and re-run the KPI synthetic test (use a scratch room like `999`)  
5. Dashboard: deploy `snc-poc/dashboard-status.html` → `backend/public/dashboard-status.html` on the Pi  

Server loads `.env` itself (`GEMINI_API_KEY`, `SNC_API_KEY`) — no `EnvironmentFile` needed in the unit; the listener also reads `SNC_API_KEY` + `PBX_PASS` from its own `.env`. Deploying a version without a key in env **must not crash** — guard for missing keys in `gemini_direct_service.py`.

### `kpi`

Query `/api/analytics/kpi` or read SQLite timestamps; summarize ack/resolution distributions vs targets. No fake numbers — if DB empty, say so.

### `fix <topic>`

Implement or document a change: keep FHIR-like shape, UTF-8 explicit for Thai markdown, update `docs/wiki` / timeline only when the change is material (per Hotel-ECS AGENTS.md).

## Safety rules

1. **No silent hardware commands** — SMDR listen is passive; CCH2 write commands need tests + explicit user intent (`PBX_Protocol_Handler` / `State_Verifier`).  
2. **Secrets only in env** — `PBX_PASS`, tunnel tokens, API keys never in committed config; server/listener load `.env` themselves and must tolerate missing keys.  
3. **Do not confuse products** — Hotel room power (`..ROOM=`) ≠ Nurse Call SMDR (`==SMDX` / `e.room`).  
4. **UTF-8** for all Thai docs and scripts writing Thai text.  
5. **Prefer existing scripts** under `snc-poc/` over greenfield process managers.  

## Collaboration

- **Librarian (OKF):** durable notes under `docs/wiki/`, not repo root clutter.  
- **Hotel ECS main AGENTS.md:** premium UI, self-healing, timeline on major fixes.  
- **Saen Barrel roles (ant/cur/architect):** only if the user bridges SNC with that vault — default stay in Hotel-ECS.

## Activation

* `/snc` or `/snc diagnose` → full stack triage  
* `/snc test` → parser + API synthetic path  
* `/snc deploy` → Pi / tunnel checklist execution  
* Phrases: "snc-poc", "Smart Nurse Call", "ดึงสาย EMER", "วัด SLA nurse call"

*Orchestrate SNC PoC work end-to-end; defer HW catalogs and CCH2 power protocol to sibling skills.*
