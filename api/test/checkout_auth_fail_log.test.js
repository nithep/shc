'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const apiDir = path.join(__dirname, '..');
const serverPath = path.join(apiDir, 'server.js');
const port = 4331;
let passed = 0;
let failed = 0;
let child;
let dbDir;

function request(method, urlPath, body, token, extraHeaders) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : JSON.stringify(body);
        const headers = Object.assign(
            data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
            token ? { Authorization: 'Bearer ' + token } : {},
            extraHeaders || {}
        );
        const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
            let text = '';
            res.on('data', (chunk) => { text += chunk; });
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            const res = await request('GET', '/api/health');
            if (res.status === 200 && res.body && res.body.status === 'OK') return;
        } catch (_) {}
        await sleep(150);
    }
    throw new Error('server health timeout');
}

async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  PASS ${name}`);
    } catch (e) {
        failed++;
        console.error(`  FAIL ${name}\n       ${e.message}`);
    }
}

(async () => {
    console.log('\n=== Checkout auth failure log ===');
    const output = [];
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shc-auth-log-'));
    const dbPath = path.join(dbDir, 'hotel.db');

    try {
        child = spawn(process.execPath, [serverPath], {
            cwd: apiDir,
            env: Object.assign({}, process.env, {
                PORT: String(port),
                DATABASE_PATH: dbPath,
                PBX_MODE: 'mock',
                NODE_ENV: 'test',
                SHC_POLICY_DRY_RUN: 'true',
                ENFORCE_SCHEDULE: 'false',
                JWT_SECRET: 'auth-log-test-secret',
                FRONTDESK_PIN: '1234',
                OWNER_PIN: '9999',
                SHC_PRESENCE_MQTT_URL: '',
                GOOGLE_CHAT_WEBHOOK_URL: '',
                GOOGLE_SHEETS_WEBHOOK_URL: '',
            }),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', (chunk) => output.push(chunk.toString()));
        child.stderr.on('data', (chunk) => output.push(chunk.toString()));
        await waitForHealth();

        await testAsync('missing token logs 401_no_token', async () => {
            const res = await request('POST', '/api/checkout', { roomNumber: '101' }, null, { 'X-Client-Channel': 'line_liff' });
            assert.strictEqual(res.status, 401);
            await sleep(150);
            assert.ok(
                output.join('').includes('[AUTH_FAIL] path=/api/checkout room=101 channel=line_liff hasAuthHeader=false result=401_no_token'),
                'missing auth log line'
            );
        });

        await testAsync('invalid token logs 403_invalid', async () => {
            const res = await request('POST', '/api/checkout', { roomNumber: '101' }, 'invalid-token', { 'X-Client-Channel': 'dashboard' });
            assert.strictEqual(res.status, 403);
            await sleep(150);
            assert.ok(
                output.join('').includes('[AUTH_FAIL] path=/api/checkout room=101 channel=dashboard hasAuthHeader=true result=403_invalid'),
                'invalid auth log line'
            );
        });

        await testAsync('mismatched guest token logs 403_forbidden', async () => {
            const checkin = await request('POST', '/api/checkin', {
                roomNumber: '101',
                guestName: 'Auth Log Test',
                pdpaConsent: { privacyPolicyAccepted: true },
            }, null, { 'X-Client-Channel': 'web-guest' });
            assert.strictEqual(checkin.status, 200);
            assert.ok(checkin.body.token, 'checkin must return guest token');

            const res = await request('POST', '/api/checkout', { roomNumber: '102' }, checkin.body.token, { 'X-Client-Channel': 'dashboard' });
            assert.strictEqual(res.status, 403);
            await sleep(150);
            assert.ok(
                output.join('').includes('[AUTH_FAIL] path=/api/checkout room=102 channel=dashboard hasAuthHeader=true result=403_forbidden'),
                'forbidden auth log line'
            );
        });
    } finally {
        if (child && child.exitCode === null) {
            child.kill();
            await sleep(300);
        }
        if (dbDir) {
            try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch (_) {}
        }
    }

    console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} (${passed} passed)\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
