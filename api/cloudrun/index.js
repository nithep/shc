'use strict';

/**
 * backend-cloudrun/index.js
 * 
 * Cloud Run Backend สำหรับ HECS (Hotel ECS Hybrid Cloud-Native Edge Architecture)
 * 
 * ทำหน้าที่เป็น API Gateway ระหว่าง LINE MINI App (Frontend) และ Edge Agent (Pi Zero 2W)
 * โดยสื่อสารผ่าน MQTT Broker ไปยัง Edge ที่ควบคุมตู้ PBX จริง
 */

const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// ─── Environment Variables ───────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883';
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASS = process.env.MQTT_PASS || '';
const BRANCH_ID = process.env.BRANCH_ID || 'branch-a';

// ─── In-Memory State Store (สำหรับ Dev — Production ควรใช้ Redis/Firestore) ──
const roomStateStore = {};

// ─── MQTT Client Setup ───────────────────────────────────────────────────────
console.log(`[MQTT] Connecting to ${MQTT_BROKER}...`);
const mqttOptions = {
  clientId: `cloud-backend-${Math.random().toString(16).substr(2, 8)}`,
};
if (MQTT_USER) mqttOptions.username = MQTT_USER;
if (MQTT_PASS) mqttOptions.password = MQTT_PASS;

const mqttClient = mqtt.connect(MQTT_BROKER, mqttOptions);

mqttClient.on('connect', () => {
  console.log('[MQTT] ✅ Backend connected to MQTT Broker.');
  
  // Subscribe รับ result กลับจาก Edge Agent
  const resultTopic = `hotel/${BRANCH_ID}/room/+/result`;
  mqttClient.subscribe(resultTopic, { qos: 1 }, (err) => {
    if (!err) console.log(`[MQTT] Subscribed to result topic: ${resultTopic}`);
  });
});

mqttClient.on('message', (topic, message) => {
  // ประมวลผล result จาก Edge เพื่ออัปเดต State Store
  try {
    const parts = topic.split('/');
    const roomNo = parts[3];
    const result = JSON.parse(message.toString());
    roomStateStore[roomNo] = { ...roomStateStore[roomNo], ...result, lastUpdated: new Date().toISOString() };
    console.log(`[MQTT] State updated for Room ${roomNo}:`, result);
  } catch (e) {
    // ไม่ใช่ JSON — ข้ามไป
  }
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] ❌ Connection Error:', err.message);
});

// ─── Helper: Publish Command to Edge ─────────────────────────────────────────
function publishToEdge(roomNumber, command, extra = {}) {
  return new Promise((resolve, reject) => {
    const topic = `hotel/${BRANCH_ID}/room/${roomNumber}/command`;
    const payload = JSON.stringify({
      command,
      timestamp: new Date().toISOString(),
      ...extra
    });
    mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) return reject(err);
      console.log(`[MQTT] ✅ Published "${command}" to ${topic}`);
      resolve();
    });
  });
}

// ─── API Routes ───────────────────────────────────────────────────────────────

/**
 * POST /api/guest/checkin
 * LINE MINI App เรียกเมื่อแขกชำระเงินสำเร็จ → สั่ง ON ผ่าน MQTT
 */
app.post('/api/guest/checkin', async (req, res) => {
  try {
    const { roomNumber, lineUserId, guestName, transactionId } = req.body;

    if (!roomNumber) {
      return res.status(400).json({ success: false, error: 'roomNumber is required' });
    }

    console.log(`[CheckIn] Room ${roomNumber} | Guest: ${guestName} | LINE: ${lineUserId}`);

    // 1. อัปเดต Local State Store
    roomStateStore[roomNumber] = {
      power: 'pending_on',
      guestName,
      lineUserId,
      transactionId,
      checkInTime: new Date().toISOString(),
    };

    // 2. Publish คำสั่ง ON ไปยัง Edge ผ่าน MQTT
    await publishToEdge(roomNumber, 'ON', { guestName, transactionId });

    // 3. Google Workspace Integration (Async — ไม่ block Response)
    const { syncToCalendar, recordFinancialTransaction } = require('./google_workspace');
    syncToCalendar(roomNumber, guestName, new Date(), new Date(Date.now() + 86400000)).catch(console.error);
    recordFinancialTransaction(1000, 'INCOME', `Room ${roomNumber} check-in (Tx: ${transactionId})`).catch(console.error);

    res.status(200).json({
      success: true,
      message: 'Check-in successful. Power ON command sent to Edge.',
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
 * แขกกด Check-out → สั่ง OFF ผ่าน MQTT → ตัดไฟห้องทันที
 */
app.post('/api/guest/checkout', async (req, res) => {
  try {
    const { roomNumber, lineUserId } = req.body;

    if (!roomNumber) {
      return res.status(400).json({ success: false, error: 'roomNumber is required' });
    }

    console.log(`[CheckOut] Room ${roomNumber} | LINE: ${lineUserId}`);

    // 1. อัปเดต State Store
    if (roomStateStore[roomNumber]) {
      roomStateStore[roomNumber].power = 'pending_off';
      roomStateStore[roomNumber].checkOutTime = new Date().toISOString();
    }

    // 2. Publish คำสั่ง OFF ไปยัง Edge ผ่าน MQTT
    await publishToEdge(roomNumber, 'OFF');

    // 3. บันทึกการ Check-out ลง Google Workspace (Async)
    const { recordFinancialTransaction } = require('./google_workspace');
    recordFinancialTransaction(0, 'NOTE', `Room ${roomNumber} checked out`).catch(console.error);

    res.status(200).json({
      success: true,
      message: 'Check-out successful. Power OFF command sent to Edge.',
      room: roomNumber,
    });
  } catch (error) {
    console.error('[CheckOut] ❌ Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /api/room/status/:roomNumber
 * Query สถานะห้องพักจาก State Store
 */
app.get('/api/room/status/:roomNumber', (req, res) => {
  const { roomNumber } = req.params;
  const state = roomStateStore[roomNumber] || { power: 'unknown', note: 'No data yet' };
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
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏨 HECS Cloud Run Backend listening on port ${PORT}`);
  console.log(`   Branch ID : ${BRANCH_ID}`);
  console.log(`   MQTT      : ${MQTT_BROKER}`);
  console.log(`   Health    : http://localhost:${PORT}/health\n`);
});
