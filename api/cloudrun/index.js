'use strict';

// Load .env สำหรับ Local Dev (Cloud Run จะ inject env vars จาก platform แทน — no-op เมื่อไม่มีไฟล์)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * backend-cloudrun/index.js
 *
 * Cloud Run Backend สำหรับ HECS (Hotel ECS Hybrid Cloud-Native Edge Architecture)
 *
 * ทำหน้าที่เป็น API Gateway ระหว่าง LINE MINI App (Frontend) และ Edge Agent (Pi 4 / Pi Zero 2W)
 * โดยสื่อสารผ่าน MQTT Broker ไปยัง Edge ที่ควบคุมตู้ PBX จริง
 *
 * ── Asynchronous State Flow ──────────────────────────────────────────────────
 *   Guest → POST /api/guest/checkin → สร้าง session (PENDING_RELAY)
 *        → publish command ผ่าน MQTT (QoS 1 + session_id)
 *        → Edge execute + verify (read-back) → publish state กลับ
 *        → Cloud match session_id → SUCCESS / FAILED / TIMEOUT
 *        → SSE push กลับไปยัง LINE LIFF แบบเรียลไทม์ (premium "ไฟสว่างวาบ")
 */

const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');

const { StateStore, SESSION_STATUS } = require('./state_store');
const { SseBroker } = require('./sse_broker');

const app = express();
app.use(express.json());
app.use(cors());

// ─── Environment Variables ───────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883';
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASS = process.env.MQTT_PASS || '';
const BRANCH_ID = process.env.BRANCH_ID || 'branch-a';
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || '30000', 10);
const STATE_FILE = process.env.STATE_FILE || '';

// ─── State Store + SSE Broker ────────────────────────────────────────────────
const store = new StateStore({ stateFile: STATE_FILE, sessionTimeoutMs: SESSION_TIMEOUT_MS });
const sseBroker = new SseBroker();
store.startSweeper(5000);

// ─── Wire StateStore events → SSE Broker (push แบบ real-time ไปยัง LINE LIFF) ──
store.on('room_update', ({ roomNo, state }) => {
  sseBroker.publish(roomNo, 'state', { room: roomNo, state });
});
store.on('session_update', (session) => {
  sseBroker.publish(session.roomNumber, 'session', { room: session.roomNumber, session });
});

// ─── MQTT Client Setup ───────────────────────────────────────────────────────
console.log(`[MQTT] Connecting to ${MQTT_BROKER}...`);
const mqttOptions = {
  clientId: `cloud-backend-${Math.random().toString(16).substr(2, 8)}`,
};
if (MQTT_USER) mqttOptions.username = MQTT_USER;
if (MQTT_PASS) mqttOptions.password = MQTT_PASS;

// TLS: สำหรับ self-signed cert (dev/internal Mosquitto) ตั้ง MQTT_TLS_REJECT_UNAUTHORIZED=false
// Production ที่ใช้ CA จริง (HiveMQ Cloud/EMQX) ปล่อยค่า default (true) ไว้เพื่อความปลอดภัย
if (process.env.MQTT_TLS_REJECT_UNAUTHORIZED === 'false') {
  mqttOptions.rejectUnauthorized = false;
}

const mqttClient = mqtt.connect(MQTT_BROKER, mqttOptions);

mqttClient.on('connect', () => {
  console.log('[MQTT] ✅ Backend connected to MQTT Broker.');

  // Subscribe รับผลลัพธ์กลับจาก Edge Agent (รองรับทั้ง /state และ /result เพื่อ backward-compat)
  const stateTopic = `hotel/${BRANCH_ID}/room/+/state`;
  const resultTopic = `hotel/${BRANCH_ID}/room/+/result`;
  mqttClient.subscribe([stateTopic, resultTopic], { qos: 1 }, (err) => {
    if (!err) {
      console.log(`[MQTT] Subscribed to: ${stateTopic}, ${resultTopic}`);
    } else {
      console.error(`[MQTT] ❌ Subscribe error: ${err.message}`);
    }
  });
});

/**
 * ประมวลผล state/result จาก Edge เพื่อปิด loop ของ session + push SSE.
 *
 * Payload ที่คาดหวัง (จาก edge-agent):
 *   { status: 'success'|'error', command: 'ON'|'OFF', session_id, roomNo,
 *     verified: boolean, power: 'on'|'off', timestamp }
 */
mqttClient.on('message', (topic, message) => {
  try {
    const parts = topic.split('/'); // ['hotel', branch, 'room', roomNo, topicKind]
    const roomNo = parts[3];
    const result = JSON.parse(message.toString());

    const sessionId = result.session_id || result.sessionId || null;
    const command = String(result.command || result.status || '').toUpperCase();
    const isError = result.status === 'error' || result.verified === false;
    const power = result.power || (command === 'ON' ? 'on' : command === 'OFF' ? 'off' : undefined);

    // 1. อัปเดต Room State
    store.setRoom(roomNo, {
      ...(power ? { power } : {}),
      verified: result.verified !== false,
      lastResult: result,
    });

    // 2. ปิด loop ของ session (ถ้ามี session_id)
    if (sessionId && store.getSession(sessionId)) {
      const finalStatus = isError ? SESSION_STATUS.FAILED : SESSION_STATUS.SUCCESS;
      store.updateSession(sessionId, finalStatus, { result });
    }

    console.log(`[MQTT] State updated for Room ${roomNo}:`, result);
  } catch (e) {
    // ไม่ใช่ JSON ที่เราสนใจ — ข้ามไป
  }
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] ❌ Connection Error:', err.message);
});

// ─── Helper: Publish Command to Edge ─────────────────────────────────────────
// Fire-and-forget: ไม่ block HTTP response — session จะถูกปิดเมื่อ Edge ตอบกลับ
// (หรือถูก Sweeper ทำ TIMEOUT ถ้า MQTT ขัดข้องนานเกินกำหนด)
function publishToEdge(roomNumber, command, extra = {}) {
  const topic = `hotel/${BRANCH_ID}/room/${roomNumber}/command`;
  const payload = JSON.stringify({
    command,
    session_id: extra.sessionId || null,
    timestamp: new Date().toISOString(),
    ...extra,
  });

  if (!mqttClient.connected) {
    console.warn(`[MQTT] ⚠️ Broker not connected — "${command}" for ${topic} will be queued (QoS 1).`);
  }

  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(`[MQTT] ❌ Publish failed to ${topic}: ${err.message}`);
      if (extra.sessionId) {
        store.updateSession(extra.sessionId, SESSION_STATUS.FAILED, { error: `MQTT publish failed: ${err.message}` });
      }
    } else {
      console.log(`[MQTT] ✅ Published "${command}" to ${topic} (session: ${extra.sessionId || 'n/a'})`);
    }
  });
}

// ─── Helper: Build command payload + create session ─────────────────────────
function startRelayCommand(roomNumber, command, extra = {}) {
  const session = store.createSession({
    roomNumber,
    command,
    requestedBy: extra.requestedBy || 'guest',
    meta: extra.meta || {},
  });
  return session;
}

// ─── SSE Endpoint ─────────────────────────────────────────────────────────────

/**
 * GET /api/guest/stream?room=0101
 * เปิดท่อ SSE แบบเรียลไทม์ให้ LINE LIFF คอยรับสถานะยืนยันจาก Edge.
 */
app.get('/api/guest/stream', (req, res) => {
  // ใช้หมายเลขห้องตามที่ส่งมาโดยตรง (ห้าม strip ศูนย์หน้า) เพื่อให้ตรงกับ MQTT topic
  // และ roomStateStore ซึ่งใช้ roomNo เช่น '0101' อย่างสม่ำเสมอ
  const roomNo = String(req.query.room || '').trim();
  if (!roomNo) {
    return res.status(400).json({ success: false, error: 'room query param is required' });
  }

  // ── SSE Response Headers ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  // ส่งสถานะปัจจุบันทันทีเมื่อเชื่อมต่อ
  const current = store.getRoom(roomNo);
  res.write(`event: state\ndata: ${JSON.stringify({ room: roomNo, state: current })}\n\n`);

  // ลงทะเบียน client กับ broker
  const cleanup = sseBroker.addClient(roomNo, res);

  // Heartbeat comment ทุก 15s กัน connection ถูกตัดจาก proxy
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      /* connection ปิดแล้ว */
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    cleanup();
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

/**
 * POST /api/guest/checkin
 * LINE MINI App เรียกเมื่อแขกชำระเงินสำเร็จ → สั่ง ON ผ่าน MQTT (async + session)
 */
app.post('/api/guest/checkin', async (req, res) => {
  try {
    const { roomNumber, lineUserId, guestName, transactionId } = req.body;

    if (!roomNumber) {
      return res.status(400).json({ success: false, error: 'roomNumber is required' });
    }

    console.log(`[CheckIn] Room ${roomNumber} | Guest: ${guestName} | LINE: ${lineUserId}`);

    // 1. สร้าง session (PENDING_RELAY)
    const session = startRelayCommand(roomNumber, 'ON', {
      meta: { guestName, lineUserId, transactionId, flow: 'checkin' },
    });

    // 2. Publish คำสั่ง ON ไปยัง Edge ผ่าน MQTT (พร้อม session_id) — fire-and-forget
    publishToEdge(roomNumber, 'ON', {
      sessionId: session.sessionId,
      guestName,
      transactionId,
    });

    // 3. Google Workspace Integration (Async — ไม่ block Response)
    try {
      const { syncToCalendar, recordFinancialTransaction } = require('./google_workspace');
      syncToCalendar(roomNumber, guestName, new Date(), new Date(Date.now() + 86400000)).catch(console.error);
      recordFinancialTransaction(1000, 'INCOME', `Room ${roomNumber} check-in (Tx: ${transactionId})`).catch(console.error);
    } catch (_) {
      /* google_workspace เป็น optional */
    }

    res.status(202).json({
      success: true,
      message: 'Check-in accepted. Power ON command sent to Edge (awaiting verification).',
      session_id: session.sessionId,
      status: SESSION_STATUS.PENDING_RELAY,
      room: roomNumber,
      guestName,
    });
  } catch (error) {
    console.error('[CheckIn] ❌ Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /api/guest/checkout
 * แขกกด Check-out → สั่ง OFF ผ่าน MQTT → ตัดไฟห้องทันที (async + session)
 */
app.post('/api/guest/checkout', async (req, res) => {
  try {
    const { roomNumber, lineUserId } = req.body;

    if (!roomNumber) {
      return res.status(400).json({ success: false, error: 'roomNumber is required' });
    }

    console.log(`[CheckOut] Room ${roomNumber} | LINE: ${lineUserId}`);

    // 1. สร้าง session (PENDING_RELAY)
    const session = startRelayCommand(roomNumber, 'OFF', {
      meta: { lineUserId, flow: 'checkout' },
    });

    // 2. Publish คำสั่ง OFF ไปยัง Edge ผ่าน MQTT — fire-and-forget
    publishToEdge(roomNumber, 'OFF', { sessionId: session.sessionId });

    // 3. บันทึกการ Check-out ลง Google Workspace (Async)
    try {
      const { recordFinancialTransaction } = require('./google_workspace');
      recordFinancialTransaction(0, 'NOTE', `Room ${roomNumber} checked out`).catch(console.error);
    } catch (_) {
      /* google_workspace เป็น optional */
    }

    res.status(202).json({
      success: true,
      message: 'Check-out accepted. Power OFF command sent to Edge (awaiting verification).',
      session_id: session.sessionId,
      status: SESSION_STATUS.PENDING_RELAY,
      room: roomNumber,
    });
  } catch (error) {
    console.error('[CheckOut] ❌ Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /api/guest/control
 * Smart Room Controls — เปิด/ปิดไฟห้องพักเดี่ยวแบบ Real-time (จาก LINE Mini App)
 * action: 'ON' | 'OFF'
 */
app.post('/api/guest/control', async (req, res) => {
  try {
    const { roomNumber, action, lineUserId } = req.body;

    if (!roomNumber) {
      return res.status(400).json({ success: false, error: 'roomNumber is required' });
    }

    const command = String(action || '').toUpperCase();
    if (command !== 'ON' && command !== 'OFF') {
      return res.status(400).json({ success: false, error: 'action must be ON or OFF' });
    }

    console.log(`[Control] Room ${roomNumber} → ${command} | LINE: ${lineUserId || 'unknown'}`);

    // สร้าง session (PENDING_RELAY)
    const session = startRelayCommand(roomNumber, command, {
      meta: { lineUserId, flow: 'control' },
    });

    // Publish คำสั่งไปยัง Edge Agent ผ่าน MQTT — fire-and-forget
    publishToEdge(roomNumber, command, { sessionId: session.sessionId });

    res.status(202).json({
      success: true,
      message: `Power ${command} command sent to Edge (awaiting verification).`,
      session_id: session.sessionId,
      status: SESSION_STATUS.PENDING_RELAY,
      room: roomNumber,
      command,
    });
  } catch (error) {
    console.error('[Control] ❌ Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /api/guest/session/:sessionId
 * Query สถานะของ session (ให้ Frontend poll เป็น fallback เมื่อ SSE ไม่พร้อม)
 */
app.get('/api/guest/session/:sessionId', (req, res) => {
  const session = store.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.status(200).json({ success: true, session });
});

/**
 * GET /api/room/status/:roomNumber
 * Query สถานะห้องพักจาก State Store
 */
app.get('/api/room/status/:roomNumber', (req, res) => {
  const { roomNumber } = req.params;
  const state = store.getRoom(roomNumber);
  res.status(200).json({ success: true, roomNumber, state });
});

/**
 * GET /health
 * Health Check สำหรับ Cloud Run Load Balancer
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'hecs-backend-cloudrun',
    uptime: Math.floor(process.uptime()),
    mqttConnected: mqttClient.connected,
    sseClients: sseBroker.totalClients(),
    pendingSessions: Object.values(store.sessions).filter((s) => s.status === SESSION_STATUS.PENDING_RELAY).length,
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏨 HECS Cloud Run Backend listening on port ${PORT}`);
  console.log(`   Branch ID : ${BRANCH_ID}`);
  console.log(`   MQTT      : ${MQTT_BROKER}`);
  console.log(`   SSE       : http://localhost:${PORT}/api/guest/stream?room=0101`);
  console.log(`   Health    : http://localhost:${PORT}/health\n`);
});
