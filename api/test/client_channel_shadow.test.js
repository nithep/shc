'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const apiDir = path.join(__dirname, '..');
const serverPath = path.join(apiDir, 'server.js');

let passed = 0;
let failed = 0;

function testAsync(name, fn) {
    return fn().then(() => {
        passed++;
        console.log('  PASS ' + name);
    }).catch(e => {
        failed++;
        console.error('  FAIL ' + name + '\n       ' + e.message);
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function request(port, method, urlPath, body, token, headersExtra) {
    return new Promise((resolve, reject) => {
        const data = body === null || body === undefined ? null : JSON.stringify(body);
        const headers = Object.assign(
            data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
            token ? { Authorization: 'Bearer ' + token } : {},
            headersExtra || {}
        );
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
            headers,
        }, (res) => {
            let text = '';
            res.on('data', chunk => { text += chunk; });
            res.on('end', () => {
                let parsed = text;
                try { parsed = JSON.parse(text); } catch (_) {}
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
    while (Date.now() < deadline) {
        try {
            if (await fn()) return;
        } catch (_) {}
        await sleep(150);
    }
    throw new Error('timeout waiting for ' + label);
}

function freshDbPath(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const dbPath = path.join(dir, 'hotel.db');
    return { dir, dbPath };
}

async function startServer(port, dbPath, dryRun = 'false') {
    const env = Object.assign({}, process.env, {
        PORT: String(port),
        DATABASE_PATH: dbPath,
        PBX_MODE: 'mock',
        NODE_ENV: 'test',
        SHC_POLICY_DRY_RUN: dryRun,
        ENFORCE_SCHEDULE: 'false',
        JWT_SECRET: 'phase4-test-secret',
        FRONTDESK_PIN: '1234',
        OWNER_PIN: '9999',
        SHC_PRESENCE_MQTT_URL: '',
        SHC_PRESENCE_MQTT_USER: '',
        SHC_PRESENCE_MQTT_PASS: '',
        GOOGLE_CHAT_WEBHOOK_URL: '',
        GOOGLE_SHEETS_WEBHOOK_URL: '',
    });
    const child = spawn(process.execPath, [serverPath], { cwd: apiDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    await waitFor(async () => {
        if (child.exitCode !== null) throw new Error('exited');
        const res = await request(port, 'GET', '/api/health');
        return res.status === 200 && res.body && res.body.status === 'OK';
    }, 20000, 'server health');
    await sleep(500);
    return { child };
}

async function stopServer(s) {
    if (!s || !s.child || s.child.exitCode !== null) return;
    const child = s.child;
    const exited = new Promise(r => child.once('exit', r));
    child.kill();
    await Promise.race([exited, sleep(2000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await Promise.race([exited, sleep(1000)]); }
}

async function loginStaff(port) {
    const res = await request(port, 'POST', '/api/auth/verify-pin', { pin: '1234' });
    assert.strictEqual(res.status, 200);
    return res.body.token;
}

async function loginOwner(port) {
    const res = await request(port, 'POST', '/api/auth/verify-pin', { pin: '9999' });
    assert.strictEqual(res.status, 200);
    return res.body.token;
}

async function main() {
    const dirs = [];
    const servers = [];
    try {
        console.log('=== Phase 4A: Shadow Decision Log & Client Channel Verification ===');
        const db = freshDbPath('shc-phase4-dryrun-');
        dirs.push(db.dir);
        const port = 4325;
        // Start server with SHC_POLICY_DRY_RUN=true (identical to Pi environment)
        const srv = await startServer(port, db.dbPath, 'true');
        servers.push(srv);
        const staffToken = await loginStaff(port);
        const ownerToken = await loginOwner(port);

        // Record room states before operations
        const roomsBefore = await request(port, 'GET', '/api/rooms');
        assert.strictEqual(roomsBefore.status, 200);
        const r101Before = roomsBefore.body.rooms.find(r => String(r.id) === '101');
        const r102Before = roomsBefore.body.rooms.find(r => String(r.id) === '102');

        await testAsync('SHC_POLICY_DRY_RUN=true: checkin + checkout line_liff records SHADOW_DECISION_LOG', async () => {
            const resIn = await request(port, 'POST', '/api/checkin', {
                roomNumber: '101', guestName: 'Shadow Test', pdpaConsent: { privacyPolicyAccepted: true }
            }, null, { 'X-Client-Channel': 'line_liff' });
            assert.strictEqual(resIn.status, 200);
            assert.strictEqual(resIn.body.message, 'Check-in (Dry-run) successful');
            const guestToken = resIn.body.token;
            assert.ok(guestToken, 'must return guest token');

            const resOut = await request(port, 'POST', '/api/checkout', {
                roomNumber: '101'
            }, guestToken, { 'X-Client-Channel': 'line_liff' });
            assert.strictEqual(resOut.status, 200);
            assert.strictEqual(resOut.body.message, 'Check-out (Dry-run) successful');

            await sleep(400);

            const auditRes = await request(port, 'GET', '/api/audit/events?event_type=SHADOW_DECISION_LOG&limit=10', null, ownerToken);
            assert.strictEqual(auditRes.status, 200);
            const events = auditRes.body.events || [];
            assert.ok(events.length >= 2, 'Must record at least 2 SHADOW_DECISION_LOG events, got ' + events.length);

            const checkinShadow = events.find(e => e.command_type === 'ROOM_ON' && e.payload.command.client_channel === 'line_liff');
            assert.ok(checkinShadow, 'Must find ROOM_ON shadow log with client_channel=line_liff');
            assert.strictEqual(checkinShadow.payload.decision.result, 'dry_run');
            assert.strictEqual(checkinShadow.payload.decision.simulated, true);

            const checkoutShadow = events.find(e => e.command_type === 'ROOM_OFF' && e.payload.command.client_channel === 'line_liff');
            assert.ok(checkoutShadow, 'Must find ROOM_OFF shadow log with client_channel=line_liff');
            assert.strictEqual(checkoutShadow.payload.decision.result, 'dry_run');
            assert.strictEqual(checkoutShadow.payload.decision.simulated, true);
        });

        await testAsync('SHC_POLICY_DRY_RUN=true: checkin + checkout dashboard records SHADOW_DECISION_LOG', async () => {
            const resIn = await request(port, 'POST', '/api/checkin', {
                roomNumber: '102', guestName: 'Shadow Test', pdpaConsent: { privacyPolicyAccepted: true }
            }, staffToken, { 'X-Client-Channel': 'dashboard' });
            assert.strictEqual(resIn.status, 200);

            const resOut = await request(port, 'POST', '/api/checkout', {
                roomNumber: '102'
            }, staffToken, { 'X-Client-Channel': 'dashboard' });
            assert.strictEqual(resOut.status, 200);

            await sleep(400);

            const auditRes = await request(port, 'GET', '/api/audit/events?event_type=SHADOW_DECISION_LOG&limit=20', null, ownerToken);
            assert.strictEqual(auditRes.status, 200);
            const events = auditRes.body.events || [];

            const checkinShadow = events.find(e => e.command_type === 'ROOM_ON' && e.payload.command.client_channel === 'dashboard' && e.payload.command.target_rooms.includes('102'));
            assert.ok(checkinShadow, 'Must find ROOM_ON shadow log with client_channel=dashboard');
            assert.strictEqual(checkinShadow.payload.decision.result, 'dry_run');
            assert.strictEqual(checkinShadow.payload.decision.simulated, true);

            const checkoutShadow = events.find(e => e.command_type === 'ROOM_OFF' && e.payload.command.client_channel === 'dashboard' && e.payload.command.target_rooms.includes('102'));
            assert.ok(checkoutShadow, 'Must find ROOM_OFF shadow log with client_channel=dashboard');
            assert.strictEqual(checkoutShadow.payload.decision.result, 'dry_run');
            assert.strictEqual(checkoutShadow.payload.decision.simulated, true);
        });

        await testAsync('SHC_POLICY_DRY_RUN=true: rooms database remains strictly unchanged', async () => {
            const roomsAfter = await request(port, 'GET', '/api/rooms');
            assert.strictEqual(roomsAfter.status, 200);
            const r101After = roomsAfter.body.rooms.find(r => String(r.id) === '101');
            const r102After = roomsAfter.body.rooms.find(r => String(r.id) === '102');
            assert.deepStrictEqual(r101After, r101Before, 'Room 101 must not change under dry-run');
            assert.deepStrictEqual(r102After, r102Before, 'Room 102 must not change under dry-run');
        });
    } finally {
        for (const s of servers) { try { await stopServer(s); } catch(_){} }
        for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch(_){} }
    }
    console.log('\n' + (failed === 0 ? 'ALL PASSED' : failed + ' FAILED') + ' (' + passed + ' passed)\n');
    process.exit(failed === 0 ? 0 : 1);
}

main();
