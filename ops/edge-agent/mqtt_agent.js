'use strict';

/**
 * edge-agent/mqtt_agent.js
 *
 * HECS Edge Agent — รันบน Raspberry Pi 4 / Pi Zero 2 W
 *
 * หน้าที่:
 *   1. Subscribe MQTT Topic รับคำสั่ง ON/OFF จาก Cloud Backend (QoS 1 + Persistent Session)
 *   2. แปลงคำสั่งเป็น CCH2 Protocol แล้วส่งผ่าน TCP/Serial ไปยัง PBX จริง (หรือ Simulator)
 *   3. Verify ผลลัพธ์ด้วย Read-back (`..PWER=ALL`) ก่อนยืนยันกลับ
 *   4. Publish ผลลัพธ์ + สถานะยืนยัน (verified) กลับ Cloud ผ่าน MQTT
 *
 * ── Offline Resilience (Self-Healing) ────────────────────────────────────────
 *   ใช้ `clean: false` + QoS 1 + Client ID คงที่ เพื่อให้ Broker เก็บคำสั่งที่
 *   เข้าแถวรอไว้ (Queued messages) แล้วส่งย้อนหลังทันทีที่เน็ตหน้างานกลับมา
 *   ออนไลน์ — ไม่พลาดคำสั่งสำคัญตอนเน็ตหลุด.
 *
 * PBX_MODE:
 *   - "mock"  : ใช้ Mock PBX ภายใน (ไม่ต้องต่อฮาร์ดแวร์ — สำหรับ Dev / Digital Twin)
 *   - "tcp"   : เชื่อมต่อตู้ PBX จริง/Simulator ผ่าน TCP (Production หรือ E2E Test)
 *   - "serial": เชื่อมต่อผ่าน Serial Port RS232
 */

const path = require('path');
// โหลด .env จากโฟลเดอร์ของสคริปต์นี้เสมอ (กันโดน .env ของ cwd อื่น override)
require('dotenv').config({ path: path.join(__dirname, '.env') });
const os = require('os');
const mqtt = require('mqtt');
const { createConnector } = require('./index');
const { logger } = require('./logger');

// ─── Configuration ────────────────────────────────────────────────────────────
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const MQTT_USERNAME   = process.env.MQTT_USERNAME   || null;
const MQTT_PASSWORD   = process.env.MQTT_PASSWORD   || null;
const BRANCH_ID       = process.env.BRANCH_ID       || 'branch-a';
const PBX_MODE        = process.env.PBX_MODE        || 'mock'; // 'mock' | 'tcp' | 'serial'
const PBX_HOST        = process.env.PBX_HOST        || '127.0.0.1';
const PBX_PORT        = parseInt(process.env.PBX_PORT, 10) || 2323;
const SERIAL_PATH     = process.env.SERIAL_PATH     || '/dev/ttyUSB0';

// ─── Verification (Self-Healing) ─────────────────────────────────────────────
// หลังส่งคำสั่งเปิด/ปิด จะดึงสถานะจริงกลับมา (..PWER=ALL) เพื่อยืนยันว่ารีเลย์เปลี่ยนตามสั่ง
const VERIFY_ENABLED  = process.env.VERIFY_ENABLED !== 'false'; // default: on

// ─── MQTT Topics ──────────────────────────────────────────────────────────────
const TOPIC_COMMAND   = `hotel/${BRANCH_ID}/room/+/command`;
const TOPIC_STATUS    = `hotel/${BRANCH_ID}/edge/status`;

// Stable Client ID (ห้าม random!) เพื่อให้ Persistent Session ทำงานถูกต้อง
const CLIENT_ID = `edge-agent-${BRANCH_ID}-${os.hostname() || 'pi'}`;

// ─── PBX Connector Factory ────────────────────────────────────────────────────
logger.info(`[Edge Agent] Starting in PBX_MODE="${PBX_MODE}"`);

const connectorConfig = { mode: PBX_MODE };
if (PBX_MODE === 'tcp') {
  connectorConfig.host = PBX_HOST;
  connectorConfig.port = PBX_PORT;
  logger.info(`[Edge Agent] TCP Target: ${PBX_HOST}:${PBX_PORT}`);
} else if (PBX_MODE === 'serial') {
  connectorConfig.serialPath = SERIAL_PATH;
  logger.info(`[Edge Agent] Serial Port: ${SERIAL_PATH}`);
} else {
  logger.info('[Edge Agent] Mock Mode — no hardware required (Digital Twin).');
}

const pbx = createConnector({
  ...connectorConfig,
  heartbeatInterval: 30000,
});

// ─── MQTT Client ──────────────────────────────────────────────────────────────
const mqttOptions = {
  clientId: CLIENT_ID,
  clean: false,          // ← Persistent Session: Broker เก็บ queued messages ไว้ให้ตอนเน็ตหลุด
  reconnectPeriod: 5000, // auto-reconnect ทุก 5s
  connectTimeout: 15000,
  keepalive: 30,
  will: {
    topic: TOPIC_STATUS,
    payload: JSON.stringify({ status: 'offline', branchId: BRANCH_ID, timestamp: Date.now() }),
    qos: 1,
    retain: true,
  },
};
if (MQTT_USERNAME) mqttOptions.username = MQTT_USERNAME;
if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;

// TLS: สำหรับ self-signed cert (dev/internal Mosquitto) ตั้ง MQTT_TLS_REJECT_UNAUTHORIZED=false
// Production ที่ใช้ CA จริง (HiveMQ Cloud/EMQX) ปล่อยค่า default (true) ไว้เพื่อความปลอดภัย
if (process.env.MQTT_TLS_REJECT_UNAUTHORIZED === 'false') {
  mqttOptions.rejectUnauthorized = false;
}

logger.info(`[MQTT] Connecting to ${MQTT_BROKER_URL} (clientId=${CLIENT_ID}, clean=false)...`);
const mqttClient = mqtt.connect(MQTT_BROKER_URL, mqttOptions);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Promise-based sleep */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read-back verification: ดึงสถานะจริงจาก PBX และเทียบกับ expected.
 * @param {string|number} roomNo
 * @param {'ON'|'OFF'} expected
 * @returns {Promise<boolean>} true ถ้าสถานะตรง
 */
async function verifyRelayState(roomNo, expected) {
  if (!VERIFY_ENABLED) return true;

  try {
    const st = await pbx.getRoomStatus(roomNo);
    const ok = st.statusLabel === expected;
    if (!ok) {
      logger.warn(`[Verify] State mismatch for room ${roomNo}: expected=${expected} actual=${st.statusLabel}`);
    }
    return ok;
  } catch (err) {
    logger.warn(`[Verify] Read-back error for room ${roomNo}: ${err.message}`);
    return false;
  }
}

/**
 * Execute command + verify ด้วย read-back + retry 1 ครั้งเมื่อ state mismatch.
 * @returns {Promise<boolean>} true ถ้า relay เปลี่ยนตามสั่งจริง
 */
async function applyRelayCommand(command, roomNo, guestName) {
  const expected = command === 'ON' ? 'ON' : 'OFF';

  // Attempt 1
  if (command === 'ON') {
    await pbx.checkIn(roomNo, guestName);
  } else {
    await pbx.checkOut(roomNo);
  }
  logger.info(`[PBX] ✅ ${command} executed → Room ${roomNo}`);

  let verified = await verifyRelayState(roomNo, expected);

  // Attempt 2 — Self-Healing retry เมื่อ read-back ยังไม่ตรง
  if (!verified) {
    logger.warn(`[PBX] ⚠️ Verification failed, retrying ${command} for Room ${roomNo}...`);
    await sleep(500);
    if (command === 'ON') {
      await pbx.checkIn(roomNo, guestName);
    } else {
      await pbx.checkOut(roomNo);
    }
    verified = await verifyRelayState(roomNo, expected);
  }

  return verified;
}

// ─── MQTT Event Handlers ──────────────────────────────────────────────────────
mqttClient.on('connect', () => {
  logger.info('[MQTT] ✅ Connected to Broker.');

  // Publish status online
  mqttClient.publish(TOPIC_STATUS, JSON.stringify({
    status: 'online', branchId: BRANCH_ID, pbxMode: PBX_MODE, timestamp: Date.now()
  }), { retain: true, qos: 1 });

  // Subscribe to command topic (QoS 1)
  mqttClient.subscribe(TOPIC_COMMAND, { qos: 1 }, (err) => {
    if (!err) {
      logger.info(`[MQTT] Subscribed to: ${TOPIC_COMMAND}`);
    } else {
      logger.error(`[MQTT] Subscribe error: ${err.message}`);
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  let roomNo, command, guestName, sessionId;
  try {
    logger.info(`[MQTT] ← Received: [${topic}] ${message.toString()}`);

    // Extract room number จาก topic: hotel/branch-a/room/0101/command
    const parts = topic.split('/');
    roomNo = parts[3];

    const payload = JSON.parse(message.toString());
    command   = (payload.command || payload.action || '').toUpperCase();
    guestName = payload.guestName || '';
    sessionId = payload.session_id || payload.sessionId || null;

    // ─── Execute + Verify PBX Command ────────────────────────────────────────
    if (command !== 'ON' && command !== 'OFF') {
      logger.warn(`[PBX] ⚠️ Unknown command: "${command}"`);
      return;
    }

    const verified = await applyRelayCommand(command, roomNo, guestName);

    // ─── Publish State กลับ Cloud (topic หลักตามสเปค) ────────────────────────
    const statePayload = {
      status: verified ? 'success' : 'error',
      command,
      session_id: sessionId,
      roomNo,
      verified,
      power: command === 'ON' ? 'on' : 'off',
      pbxMode: PBX_MODE,
      timestamp: Date.now(),
    };
    const stateTopic = `hotel/${BRANCH_ID}/room/${roomNo}/state`;
    mqttClient.publish(stateTopic, JSON.stringify(statePayload), { qos: 1 });
    logger.info(`[MQTT] → Published state to ${stateTopic} (verified=${verified})`);

    // Backward-compat: ส่ง /result เหมือนเดิม (Cloud รองรับทั้งสอง topic)
    const resultTopic = `hotel/${BRANCH_ID}/room/${roomNo}/result`;
    mqttClient.publish(resultTopic, JSON.stringify({
      status: verified ? 'success' : 'error',
      command,
      session_id: sessionId,
      roomNo,
      guestName,
      verified,
      pbxMode: PBX_MODE,
      timestamp: Date.now(),
    }), { qos: 1 });

  } catch (error) {
    logger.error(`[Edge Agent] ❌ Error processing command for Room ${roomNo}: ${error.message}`);

    // Publish failure state
    if (roomNo) {
      const failTopic = `hotel/${BRANCH_ID}/room/${roomNo}/state`;
      mqttClient.publish(failTopic, JSON.stringify({
        status: 'error',
        command,
        session_id: sessionId,
        roomNo,
        verified: false,
        error: error.message,
        timestamp: Date.now(),
      }), { qos: 1 });
    }
  }
});

mqttClient.on('error', (err) => {
  logger.error(`[MQTT] ❌ Error: ${err.message}`);
});

mqttClient.on('offline', () => {
  logger.warn('[MQTT] ⚠️ Client offline — attempting reconnect...');
});

mqttClient.on('reconnect', () => {
  logger.info('[MQTT] 🔄 Reconnecting...');
});

// ─── Start Edge Agent ─────────────────────────────────────────────────────────
async function start() {
  try {
    await pbx.connect();
    logger.info('[PBX] ✅ PBX Connector ready.');
  } catch (error) {
    logger.warn(`[PBX] ⚠️ Initial connect failed: ${error.message} — will retry automatically`);
  }
}

start();

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  logger.info('\n[Edge Agent] Shutting down gracefully...');
  mqttClient.publish(TOPIC_STATUS, JSON.stringify({
    status: 'offline', branchId: BRANCH_ID, timestamp: Date.now()
  }), { retain: true, qos: 1 });
  mqttClient.end();
  await pbx.disconnect();
  process.exit(0);
});
