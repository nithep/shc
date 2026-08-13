# PBX Connector

Phonik PBX connector module สำหรับระบบ Hotel ECS Smart Check-in.

## Architecture

```
pbx-connector/
├── index.js              # Main entry — createConnector() factory
├── protocol.js           # Pure-function protocol engine (command builder + parser)
├── mock_pbx.js           # Legacy mock (fallback for mode='mock')
├── transport/
│   ├── tcp.js            # TCP/Telnet transport (Node.js net module)
│   └── serial.js         # พอร์ต LAN ของPBX transport (serialport library)
├── simulator/
│   └── pbx-simulator.js  # TCP server simulating real Phonik PBX
└── test/
    ├── harness.js         # 7 automated test scenarios
    └── test-loop.js       # Continuous realistic traffic simulation
```

## Quick Start

### 1. เปิด PBX Simulator (Terminal 1)

```bash
npm run simulator
```

Simulator จะเปิด TCP Server ที่ port 10001 พร้อม Live Dashboard แสดงสถานะห้อง 101-106

### 2. รัน Test Harness (Terminal 2)

```bash
npm run test
```

รัน 7 test scenarios อัตโนมัติ:
1. Basic Check-in/Check-out
2. Multiple Rooms Concurrent
3. Error Handling (NACK, invalid room)
4. Idempotency (ส่งซ้ำ)
5. Resilience & Keep-Alive (Retry, Heartbeat, Auto-Reconnect)
6. Full Lifecycle (Check-in → Name → Check-out)
7. Stress Test (50 iterations)

### 3. รัน Continuous Test Loop (ทดสอบต่อเนื่อง)

```bash
npm run test:loop
```

จำลองโรงแรมจริง: สุ่ม Check-in/Check-out ทุก 2-5 วินาที พร้อม Live Stats

## Fault Injection (Chaos Testing)

```bash
# เพิ่ม latency 300ms + 5% packet loss
npm run simulator:chaos

# ห้อง 103 ตอบ NACK ตลอด (hardware fault)
npm run simulator:nack

# Custom
node simulator/pbx-simulator.js --delay 500 --drop-rate 0.1 --nack-room 103 --port 10001
```

## Manual Testing via Telnet

```bash
telnet localhost 10001
# พิมพ์: ..ROOM101=1     → Check-in (ON)
# พิมพ์: ..ROOM101=      → Read status
# พิมพ์: ..ROOM101=0     → Check-out (OFF)
# พิมพ์: ..VERS=          → Read PBX version
# พิมพ์: ..STOP           → Disconnect
```

## Connector API Usage

```javascript
const { createConnector } = require('./pbx-connector');

// TCP mode (for simulator or real PBX)
const pbx = createConnector({
  mode: 'tcp',
  host: '127.0.0.1',
  port: 10001,
  heartbeatInterval: 30000,  // Ping every 30s
  retryAttempts: 3,          // Retry with exponential backoff
});

await pbx.connect();

await pbx.checkIn(101, 'John Doe');   // ON + set name
await pbx.getRoomStatus(101);          // Read status
await pbx.checkOut(101);               // OFF + clear name
await pbx.ping();                      // Heartbeat check

await pbx.destroy();
```

## Phonik Protocol Reference

| Command | Description |
|:---|:---|
| `..ROOMnumb=r` | Set room status (r=0 OFF, 1 ON, 2 MAINT, 3 OOO) |
| `..ROOMnumb=` | Read room status |
| `..NAMEnumb=name` | Set guest name (max 16 chars) |
| `..VERS=` | Read PBX version (also used as heartbeat ping) |
| `..STOP` | Disconnect |
| `=NACK` | Error response |
