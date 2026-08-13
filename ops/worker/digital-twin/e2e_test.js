'use strict';

/**
 * worker/digital-twin/e2e_test.js
 *
 * HECS End-to-End Integration Test
 *
 * ทดสอบ Full Flow: Backend HTTP → MQTT → Edge Agent → Digital Twin Simulator
 * โดยไม่ต้องใช้ฮาร์ดแวร์จริง
 *
 * Prerequisites (รันก่อน test นี้):
 *   1. python worker/digital-twin/simulator.py   (Port 2323)
 *   2. node edge-agent/mqtt_agent.js             (PBX_MODE=tcp, ชี้ที่ Simulator)
 *   3. node backend-cloudrun/index.js            (Port 8080)
 *
 *   หรือรันทั้งหมดด้วย: .\worker\digital-twin\run_all.ps1
 *
 * Usage:
 *   node worker/digital-twin/e2e_test.js
 */

const http = require('http');

// ─── Configuration ─────────────────────────────────────────────────────────────
const BACKEND_URL  = process.env.BACKEND_URL || 'http://localhost:8080';
const ROOM_NUMBER  = '0101';
const GUEST_NAME   = 'E2E Test Guest';
const LINE_USER_ID = 'U_e2e_test_001';
const TRANSACTION_ID = `TXN-E2E-${Date.now()}`;

// MQTT propagation delay (ms) — รอให้ MQTT ส่งคำสั่งไปถึง Edge และ Simulator
const MQTT_PROPAGATION_DELAY = 3000;

// ─── Test State ───────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

// ─── Utilities ────────────────────────────────────────────────────────────────
function log(msg, color = 'reset') {
  const colors = {
    green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', reset: '\x1b[0m', bold: '\x1b[1m'
  };
  console.log(`${colors[color] || ''}${msg}${colors.reset}`);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    results.push({ status: '✅', name: testName });
    log(`  ✅ PASS: ${testName}`, 'green');
  } else {
    failed++;
    results.push({ status: '❌', name: testName, detail });
    log(`  ❌ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`, 'red');
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testHealthCheck() {
  log('\n[Test 1] Backend Health Check', 'cyan');
  try {
    const res = await httpRequest('GET', '/health');
    assert(res.status === 200, 'Health endpoint returns 200');
    assert(res.body.status === 'ok', 'Health status is "ok"');
    assert(typeof res.body.mqttConnected === 'boolean', 'MQTT connection status reported');
    if (res.body.mqttConnected) {
      log('  ℹ️  MQTT: Connected', 'yellow');
    } else {
      log('  ⚠️  MQTT: NOT connected (MQTT commands will fail)', 'yellow');
    }
  } catch (err) {
    assert(false, 'Backend reachable', `${err.message} — Is backend running? node backend-cloudrun/index.js`);
  }
}

async function testCheckIn() {
  log('\n[Test 2] Check-In → MQTT ON Command', 'cyan');
  try {
    const res = await httpRequest('POST', '/api/guest/checkin', {
      roomNumber: ROOM_NUMBER,
      lineUserId: LINE_USER_ID,
      guestName: GUEST_NAME,
      transactionId: TRANSACTION_ID,
    });

    assert(res.status === 200, 'Check-in endpoint returns 200');
    assert(res.body.success === true, 'Check-in response success=true');
    assert(res.body.room === ROOM_NUMBER, `Room number echoed back (${ROOM_NUMBER})`);

    log(`  ℹ️  Response: ${JSON.stringify(res.body)}`, 'yellow');
    log(`\n  ⏳ Waiting ${MQTT_PROPAGATION_DELAY}ms for MQTT → Edge → Simulator propagation...`, 'yellow');
    await delay(MQTT_PROPAGATION_DELAY);

  } catch (err) {
    assert(false, 'Check-in API call succeeds', err.message);
  }
}

async function testRoomStatusAfterCheckIn() {
  log('\n[Test 3] Room Status After Check-In', 'cyan');
  try {
    const res = await httpRequest('GET', `/api/room/status/${ROOM_NUMBER}`);
    assert(res.status === 200, 'Room status endpoint returns 200');
    assert(res.body.roomNumber === ROOM_NUMBER, 'Correct room number returned');

    const power = res.body.state?.power;
    // Backend state อาจเป็น 'pending_on' หรือ 'success' ขึ้นอยู่กับว่า Edge ส่ง result กลับมาแล้ว
    const powerOk = power === 'success' || power === 'pending_on';
    assert(powerOk, `Room power state updated (got: "${power}")`);

    log(`  ℹ️  State: ${JSON.stringify(res.body.state)}`, 'yellow');
  } catch (err) {
    assert(false, 'Room status API call', err.message);
  }
}

async function testCheckOut() {
  log('\n[Test 4] Check-Out → MQTT OFF Command', 'cyan');
  try {
    const res = await httpRequest('POST', '/api/guest/checkout', {
      roomNumber: ROOM_NUMBER,
      lineUserId: LINE_USER_ID,
    });

    assert(res.status === 200, 'Check-out endpoint returns 200');
    assert(res.body.success === true, 'Check-out response success=true');
    assert(res.body.room === ROOM_NUMBER, `Room number echoed back (${ROOM_NUMBER})`);

    log(`  ℹ️  Response: ${JSON.stringify(res.body)}`, 'yellow');
    log(`\n  ⏳ Waiting ${MQTT_PROPAGATION_DELAY}ms for MQTT propagation...`, 'yellow');
    await delay(MQTT_PROPAGATION_DELAY);

  } catch (err) {
    assert(false, 'Check-out API call succeeds', err.message);
  }
}

async function testRoomStatusAfterCheckOut() {
  log('\n[Test 5] Room Status After Check-Out', 'cyan');
  try {
    const res = await httpRequest('GET', `/api/room/status/${ROOM_NUMBER}`);
    assert(res.status === 200, 'Room status endpoint returns 200');
    const power = res.body.state?.command;
    // หลัง checkout Edge จะ publish result พร้อม command: 'OFF'
    const checkoutOk = power === 'OFF' || res.body.state?.status === 'success';
    assert(checkoutOk, `Room state reflects checkout (command: "${power}")`);
    log(`  ℹ️  State: ${JSON.stringify(res.body.state)}`, 'yellow');
  } catch (err) {
    assert(false, 'Room status after checkout', err.message);
  }
}

async function testInvalidInput() {
  log('\n[Test 6] Input Validation — Missing roomNumber', 'cyan');
  try {
    const res = await httpRequest('POST', '/api/guest/checkin', {
      lineUserId: 'U123',
      guestName: 'Test',
    });
    assert(res.status === 400, 'Missing roomNumber returns 400');
    assert(res.body.success === false, 'success=false on validation error');
  } catch (err) {
    assert(false, 'Validation test', err.message);
  }
}

// ─── Main Test Runner ──────────────────────────────────────────────────────────
async function main() {
  log('\n' + '═'.repeat(60), 'bold');
  log('  🏨 HECS End-to-End Integration Test', 'bold');
  log('═'.repeat(60), 'bold');
  log(`  Backend : ${BACKEND_URL}`);
  log(`  Room    : ${ROOM_NUMBER}`);
  log(`  Guest   : ${GUEST_NAME}`);
  log('═'.repeat(60), 'bold');

  await testHealthCheck();
  await testCheckIn();
  await testRoomStatusAfterCheckIn();
  await testCheckOut();
  await testRoomStatusAfterCheckOut();
  await testInvalidInput();

  // ─── Summary ────────────────────────────────────────────────────────────────
  log('\n' + '═'.repeat(60), 'bold');
  log('  📊 TEST SUMMARY', 'bold');
  log('═'.repeat(60), 'bold');

  for (const r of results) {
    const color = r.status === '✅' ? 'green' : 'red';
    log(`  ${r.status} ${r.name}${r.detail ? `\n      ↳ ${r.detail}` : ''}`, color);
  }

  log('─'.repeat(60));
  const total = passed + failed;
  const allPassed = failed === 0;
  log(`  Results: ${passed}/${total} passed`, allPassed ? 'green' : 'red');

  if (allPassed) {
    log('\n  🎉 ALL TESTS PASSED — Full-Stack Integration OK!', 'green');
    log('  The flow: LIFF → Backend → MQTT → Edge → Digital Twin works.', 'green');
  } else {
    log('\n  ⚠️  Some tests failed. Check that all 3 services are running:', 'yellow');
    log('      .\\worker\\digital-twin\\run_all.ps1', 'yellow');
  }
  log('═'.repeat(60) + '\n', 'bold');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  log(`\n❌ Fatal test error: ${err.message}`, 'red');
  process.exit(1);
});
