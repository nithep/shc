'use strict';

/**
 * edge-agent/mqtt_agent.js
 * 
 * HECS Edge Agent — รันบน Raspberry Pi Zero 2 W
 * 
 * หน้าที่:
 *   1. Subscribe MQTT Topic รับคำสั่ง ON/OFF จาก Cloud Backend
 *   2. แปลงคำสั่งเป็น CCH2 Protocol แล้วส่งผ่าน TCP ไปยัง PBX จริง (หรือ Simulator)
 *   3. Publish ผลลัพธ์กลับ Cloud Backend ผ่าน MQTT
 * 
 * PBX_MODE:
 *   - "mock"  : ใช้ Mock PBX ภายใน (ไม่ต้องต่อฮาร์ดแวร์ — สำหรับ Dev)
 *   - "tcp"   : เชื่อมต่อตู้ PBX จริง/Simulator ผ่าน TCP (สำหรับ Production หรือ E2E Test)
 *   - "serial": เชื่อมต่อผ่าน Serial Port (สำหรับ Pi ที่ต่อสาย RS232)
 */

require('dotenv').config();
const mqtt = require('mqtt');
const { createConnector } = require('./index');
const { logger } = require('./logger');

// ─── Configuration ────────────────────────────────────────────────────────────
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const MQTT_USERNAME   = process.env.MQTT_USERNAME   || null;
const MQTT_PASSWORD   = process.env.MQTT_PASSWORD   || null;
const BRANCH_ID       = process.env.BRANCH_ID       || 'branch-a';
const PBX_MODE        = process.env.PBX_MODE        || 'mock'; // 'mock' | 'tcp' | 'serial'
const PBX_HOST        = process.env.PBX_HOST        || '127.0.0.1'; // ชี้ไปที่ Simulator ในโหมด Dev
const PBX_PORT        = parseInt(process.env.PBX_PORT, 10) || 2323; // Python Simulator port
const SERIAL_PATH     = process.env.SERIAL_PATH     || '/dev/ttyUSB0';

// ─── MQTT Topics ──────────────────────────────────────────────────────────────
// ⚠️  ต้องตรงกับที่ Backend publish: hotel/${BRANCH_ID}/room/${roomNumber}/command
const TOPIC_COMMAND   = `hotel/${BRANCH_ID}/room/+/command`;
const TOPIC_STATUS    = `hotel/${BRANCH_ID}/edge/status`;

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
  logger.info('[Edge Agent] Mock Mode — no hardware required.');
}

const pbx = createConnector({
  ...connectorConfig,
  heartbeatInterval: 30000,
});

// ─── MQTT Client ──────────────────────────────────────────────────────────────
const mqttOptions = {
  clientId: `edge-agent-${BRANCH_ID}-${Math.random().toString(16).substr(2, 8)}`,
  will: {
    topic: TOPIC_STATUS,
    payload: JSON.stringify({ status: 'offline', branchId: BRANCH_ID, timestamp: Date.now() }),
    qos: 1,
    retain: true,
  },
};
if (MQTT_USERNAME) mqttOptions.username = MQTT_USERNAME;
if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;

logger.info(`[MQTT] Connecting to ${MQTT_BROKER_URL}...`);
const mqttClient = mqtt.connect(MQTT_BROKER_URL, mqttOptions);

// ─── MQTT Event Handlers ──────────────────────────────────────────────────────
mqttClient.on('connect', () => {
  logger.info('[MQTT] ✅ Connected to Broker.');

  // Publish status online
  mqttClient.publish(TOPIC_STATUS, JSON.stringify({
    status: 'online', branchId: BRANCH_ID, pbxMode: PBX_MODE, timestamp: Date.now()
  }), { retain: true, qos: 1 });

  // Subscribe to command topic
  mqttClient.subscribe(TOPIC_COMMAND, { qos: 1 }, (err) => {
    if (!err) {
      logger.info(`[MQTT] Subscribed to: ${TOPIC_COMMAND}`);
    } else {
      logger.error(`[MQTT] Subscribe error: ${err.message}`);
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  let roomNo, command, guestName;
  try {
    logger.info(`[MQTT] ← Received: [${topic}] ${message.toString()}`);

    // Extract room number จาก topic: hotel/branch-a/room/0101/command
    const parts = topic.split('/');
    roomNo = parts[3];

    const payload = JSON.parse(message.toString());
    command   = (payload.command || '').toUpperCase();
    guestName = payload.guestName || '';

    // ─── Execute PBX Command ─────────────────────────────────────────────────
    if (command === 'ON') {
      await pbx.checkIn(roomNo, guestName);
      logger.info(`[PBX] ✅ CheckIn executed → Room ${roomNo}`);
    } else if (command === 'OFF') {
      await pbx.checkOut(roomNo);
      logger.info(`[PBX] ✅ CheckOut executed → Room ${roomNo}`);
    } else {
      logger.warn(`[PBX] ⚠️  Unknown command: "${command}"`);
      return;
    }

    // ─── Publish Result กลับ Backend ──────────────────────────────────────────
    const resultTopic = `hotel/${BRANCH_ID}/room/${roomNo}/result`;
    const resultPayload = JSON.stringify({
      status: 'success',
      command,
      roomNo,
      guestName,
      pbxMode: PBX_MODE,
      timestamp: Date.now(),
    });
    mqttClient.publish(resultTopic, resultPayload, { qos: 1 });
    logger.info(`[MQTT] → Published result to ${resultTopic}`);

  } catch (error) {
    logger.error(`[Edge Agent] ❌ Error processing command for Room ${roomNo}: ${error.message}`);

    // Publish failure result
    if (roomNo) {
      const failTopic = `hotel/${BRANCH_ID}/room/${roomNo}/result`;
      mqttClient.publish(failTopic, JSON.stringify({
        status: 'error',
        command,
        roomNo,
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
  logger.warn('[MQTT] ⚠️  Client offline — attempting reconnect...');
});

// ─── Start Edge Agent ─────────────────────────────────────────────────────────
async function start() {
  try {
    await pbx.connect();
    logger.info('[PBX] ✅ PBX Connector ready.');
  } catch (error) {
    logger.warn(`[PBX] ⚠️  Initial connect failed: ${error.message} — will retry automatically`);
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
