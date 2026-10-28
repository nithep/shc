'use strict';

/**
 * @file http_state_verification.test.js — Phase 1 (ข้อ 6 + ข้อ 5)
 *
 * Integration test จริงผ่าน HTTP ต่อ server.js (mock PBX, DB แยก temp)
 * ครอบ:
 *   - /api/checkin            ผ่าน + verify ไม่ผ่าน
 *   - /api/checkout           ผ่าน + verify ไม่ผ่าน
 *   - /api/rooms/control      ผ่าน + verify ไม่ผ่าน
 *   - /api/admin/approval/:id/execute  ผ่าน + verify ไม่ผ่าน + dry-run
 *
 * ใช้ fault injection ผ่าน NODE_OPTIONS=--require เพื่อบังคับ StateVerifier fail
 * โดยไม่ต้องมี hook ใน production code
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const apiDir = path.join(__dirname, '..');
const serverPath = path.join(apiDir, 'server.js');
const faultFile = path.join(__dirname, 'fault_inject_state_mismatch.js');

let passed = 0;
let failed = 0;

function testAsync(name, fn) {
    return fn().then(() => {
        passed++;
        console.log(`  PASS ${name}`);
    }).catch(e => {
        failed++;
        console.error(`  FAIL ${name}\n       ${e.message}`);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function request(port, method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const data = body === null || body === undefined ? null : JSON.stringify(body);
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
            headers: {
                ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        }, (res) => {
            let text = '';
            res.on('data', chunk => { text += chunk; });
            res.on('end', () => {
                let parsed = text;
                try { parsed = JSON.parse(text); } catch (_) { /* keep text */ }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function waitFor(fn, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            if (await fn()) return;
        } catch (e) {
            lastError = e;
        }
        await sleep(150);
    }
    throw new Error(`timeout waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

async function startServer({ port, dbPath, dryRun, forceMismatch }) {
    const env = {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: dbPath,
        PBX_MODE: 'mock',
        NODE_ENV: 'test',
        SHC_POLICY_DRY_RUN: dryRun ? 'true' : 'false',
        JWT_SECRET: 'phase1-test-secret',
        FRONTDESK_PIN: '1234',
        OWNER_PIN: '9999',
        SHC_PRESENCE_MQTT_URL: '',
        SHC_PRESENCE_MQTT_USER: '',
        SHC_PRESENCE_MQTT_PASS: '',
        GOOGLE_CHAT_WEBHOOK_URL: '',
        GOOGLE_SHEETS_WEBHOOK_URL: '',
    };

    if (forceMismatch) {
        env.SHC_TEST_FORCE_STATE_MISMATCH = '1';
        const faultPath = faultFile.replace(/\\/g, '/');
        env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --require "${faultPath}"`.trim();
    }

    const child = spawn(process.execPath, [serverPath], {
        cwd: apiDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let logs = '';
    child.stdout.on('data', chunk => { logs += chunk.toString(); });
    child.stderr.on('data', chunk => { logs += chunk.toString(); });

    const currentLogs = () => logs;

    await waitFor(async () => {
        if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode})`);
        const res = await request(port, 'GET', '/api/health');
        return res.status === 200 && res.body.status === 'OK';
    }, 20000, 'server health');

    // รอ initial digital-twin sync ให้จบก่อนเริ่มยิงคำสั่ง
    await waitFor(() => Promise.resolve(currentLogs().includes('Synchronization Complete')), 10000, 'initial sync')
        .catch(() => { /* sync log อาจมาไม่ทัน แต่ health ผ่านแล้ว */ });
    await sleep(250);

    return { child, logs: currentLogs };
}

async function stopServer(server) {
    if (!server || !server.child || server.child.exitCode !== null) return;
    const child = server.child;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, sleep(3000)]);
    if (child.exitCode === null) {
        child.kill('SIGKILL');
        await Promise.race([exited, sleep(1000)]);
    }
}

async function getRoom(port, roomId) {
    const res = await request(port, 'GET', '/api/rooms');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const room = res.body.rooms.find(r => String(r.id) === String(roomId));
    assert.ok(room, `room ${roomId} not found`);
    return room;
}

async function loginStaff(port) {
    const res = await request(port, 'POST', '/api/auth/verify-pin', { pin: '1234' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.token, 'staff token missing');
    return res.body.token;
}

async function approveAndExecute(port, token, approvalId) {
    const approve = await request(port, 'POST', `/api/admin/approval/${approvalId}/approve`, {
        reason: 'phase1 integration test',
        decidedBy: 'test-staff',
    }, token);
    assert.strictEqual(approve.status, 200, JSON.stringify(approve.body));

    return request(port, 'POST', `/api/admin/approval/${approvalId}/execute`, null, token);
}

async function makeApproval(port, token, roomNumber, action) {
    const res = await request(port, 'POST', '/api/rooms/control', {
        roomNumber,
        action,
        source: 'appsheet_webhook',
        dryRun: false,
    }, token);
    assert.strictEqual(res.status, 202, JSON.stringify(res.body));
    assert.strictEqual(res.body.reason, 'APPROVAL_REQUIRED', JSON.stringify(res.body));
    assert.ok(res.body.approvalId, 'approvalId missing');
    return res.body.approvalId;
}

function freshDbPath(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    return { dir, dbPath: path.join(dir, 'hotel.db') };
}

(async () => {
    console.log('\n=== Phase 1.5/1.6 — HTTP routes + StateVerifier ===');
    const servers = [];
    const dirs = [];

    try {
        // ── Server A: happy path ──────────────────────────────────────────
        const a = freshDbPath('shc-phase1-pass-');
        dirs.push(a.dir);
        const passPort = 4310;
        const passServer = await startServer({ port: passPort, dbPath: a.dbPath, dryRun: false, forceMismatch: false });
        servers.push(passServer);
        const staffToken = await loginStaff(passPort);

        await testAsync('/api/checkin ผ่าน → DB occupied/power=true', async () => {
            const res = await request(passPort, 'POST', '/api/checkin', {
                roomNumber: '102',
                guestName: 'Phase1 Pass',
                pdpaConsent: true,
                dryRun: false,
            });
            assert.strictEqual(res.status, 200, JSON.stringify(res.body));
            const room = await getRoom(passPort, 102);
            assert.strictEqual(room.status, 'occupied');
            assert.strictEqual(room.power, true);
        });

        await testAsync('/api/checkout ผ่าน → DB vacant/power=false', async () => {
            const res = await request(passPort, 'POST', '/api/checkout', {
                roomNumber: '102',
                dryRun: false,
            }, staffToken);
            assert.strictEqual(res.status, 200, JSON.stringify(res.body));
            const room = await getRoom(passPort, 102);
            assert.strictEqual(room.status, 'vacant');
            assert.strictEqual(room.power, false);
        });

        await testAsync('/api/rooms/control ผ่าน → DB occupied/power=true', async () => {
            const res = await request(passPort, 'POST', '/api/rooms/control', {
                roomNumber: '103',
                action: 'ON',
                source: 'checkin_flow',
                dryRun: false,
            }, staffToken);
            assert.strictEqual(res.status, 200, JSON.stringify(res.body));
            const room = await getRoom(passPort, 103);
            assert.strictEqual(room.status, 'occupied');
            assert.strictEqual(room.power, true);
        });

        await testAsync('approval execute ผ่าน → DB vacant/power=false', async () => {
            const approvalId = await makeApproval(passPort, staffToken, '103', 'OFF');
            const res = await approveAndExecute(passPort, staffToken, approvalId);
            assert.strictEqual(res.status, 200, JSON.stringify(res.body));
            assert.strictEqual(res.body.dry_run, false);
            const room = await getRoom(passPort, 103);
            assert.strictEqual(room.status, 'vacant');
            assert.strictEqual(room.power, false);
        });

        await stopServer(passServer);

        // ── Server B: forced StateVerifier mismatch ──────────────────────
        const b = freshDbPath('shc-phase1-fail-');
        dirs.push(b.dir);
        const failPort = 4311;
        const failServer = await startServer({ port: failPort, dbPath: b.dbPath, dryRun: false, forceMismatch: true });
        servers.push(failServer);
        const failToken = await loginStaff(failPort);

        await testAsync('/api/checkin verify ไม่ผ่าน → 502 และ DB ไม่เปลี่ยน', async () => {
            const res = await request(failPort, 'POST', '/api/checkin', {
                roomNumber: '102',
                guestName: 'Phase1 Fail',
                pdpaConsent: true,
                dryRun: false,
            });
            assert.strictEqual(res.status, 502, JSON.stringify(res.body));
            assert.strictEqual(res.body.reason, 'STATE_VERIFICATION_FAILED');
            const room = await getRoom(failPort, 102);
            assert.strictEqual(room.status, 'vacant');
            assert.strictEqual(room.power, false);
        });

        await testAsync('/api/checkout verify ไม่ผ่าน → 502 และ DB ไม่ถูกบันทึก vacant', async () => {
            const res = await request(failPort, 'POST', '/api/checkout', {
                roomNumber: '101',
                dryRun: false,
            }, failToken);
            assert.strictEqual(res.status, 502, JSON.stringify(res.body));
            assert.strictEqual(res.body.reason, 'STATE_VERIFICATION_FAILED');
            const room = await getRoom(failPort, 101);
            assert.strictEqual(room.status, 'occupied');
            assert.strictEqual(room.power, true);
        });

        await testAsync('/api/rooms/control verify ไม่ผ่าน → 502 และ DB ไม่เปลี่ยน', async () => {
            const res = await request(failPort, 'POST', '/api/rooms/control', {
                roomNumber: '103',
                action: 'ON',
                source: 'checkin_flow',
                dryRun: false,
            }, failToken);
            assert.strictEqual(res.status, 502, JSON.stringify(res.body));
            assert.strictEqual(res.body.reason, 'STATE_VERIFICATION_FAILED');
            const room = await getRoom(failPort, 103);
            assert.strictEqual(room.status, 'vacant');
            assert.strictEqual(room.power, false);
        });

        await testAsync('approval execute verify ไม่ผ่าน → 502 และ DB ไม่เปลี่ยน', async () => {
            const approvalId = await makeApproval(failPort, failToken, '104', 'ON');
            const res = await approveAndExecute(failPort, failToken, approvalId);
            assert.strictEqual(res.status, 502, JSON.stringify(res.body));
            assert.strictEqual(res.body.error, 'STATE_VERIFICATION_FAILED');
            const room = await getRoom(failPort, 104);
            assert.strictEqual(room.status, 'vacant');
            assert.strictEqual(room.power, false);
        });

        await stopServer(failServer);

        // ── Server C: dry-run (server-side) ──────────────────────────────
        const c = freshDbPath('shc-phase1-dry-');
        dirs.push(c.dir);
        const dryPort = 4312;
        const dryServer = await startServer({ port: dryPort, dbPath: c.dbPath, dryRun: true, forceMismatch: false });
        servers.push(dryServer);
        const dryToken = await loginStaff(dryPort);

        await testAsync('dry-run: body=false ต้องถูกบังคับเป็น dry-run และไม่บันทึก DB', async () => {
            const res = await request(dryPort, 'POST', '/api/checkin', {
                roomNumber: '106',
                guestName: 'Phase1 Dry',
                pdpaConsent: true,
                dryRun: false,
            });
            assert.strictEqual(res.status, 200, JSON.stringify(res.body));
            assert.strictEqual(res.body.hardware_status.status, 'DRY_RUN_PASSED');
            const room = await getRoom(dryPort, 106);
            assert.strictEqual(room.status, 'vacant');
            assert.strictEqual(room.power, false);
        });

        await testAsync('approval execute dry-run → จำลองเท่านั้น ไม่ยิง pbx และไม่บันทึก DB', async () => {
            const approvalId = await makeApproval(dryPort, dryToken, '105', 'ON');
            const res = await approveAndExecute(dryPort, dryToken, approvalId);
            assert.strictEqual(res.status, 200, JSON.stringify(res.body));
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.dry_run, true);
            assert.strictEqual(res.body.hardware_status.status, 'DRY_RUN_SIMULATED');
            const room = await getRoom(dryPort, 105);
            assert.strictEqual(room.status, 'vacant');
            assert.strictEqual(room.power, false);
        });

        // ตรวจว่า approval ที่ dry-run ถูก mark executed จริง (execute ซ้ำต้องไม่สำเร็จ)
        await testAsync('approval dry-run ถูก mark executed (execute ซ้ำไม่ได้)', async () => {
            const approvalId = await makeApproval(dryPort, dryToken, '105', 'ON');
            const first = await approveAndExecute(dryPort, dryToken, approvalId);
            assert.strictEqual(first.status, 200, JSON.stringify(first.body));
            const second = await request(dryPort, 'POST', `/api/admin/approval/${approvalId}/execute`, null, dryToken);
            assert.notStrictEqual(second.status, 200, JSON.stringify(second.body));
        });

        await stopServer(dryServer);
    } finally {
        for (const server of servers) {
            try { await stopServer(server); } catch (_) { /* ignore cleanup */ }
        }
        for (const dir of dirs) {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore cleanup */ }
        }
    }

    console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} (${passed} passed)\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
