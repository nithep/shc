'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const apiDir = path.join(__dirname, '..');
const serverPath = path.join(apiDir, 'server.js');
const simulatorPath = path.join(apiDir, '..', 'pbx', 'simulator', 'pbx-simulator.js');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function request(port, method, urlPath) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
        }, (res) => {
            let text = '';
            res.on('data', chunk => { text += chunk; });
            res.on('end', () => {
                let body = text;
                try { body = JSON.parse(text); } catch (_) { /* keep text */ }
                resolve({ status: res.statusCode, body });
            });
        });
        req.on('error', reject);
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
        await sleep(100);
    }
    throw new Error(`timeout waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

function waitForPort(port, timeoutMs) {
    return waitFor(() => new Promise((resolve) => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
    }), timeoutMs, `port ${port}`);
}

async function stopChild(child) {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, sleep(3000)]);
    if (child.exitCode === null) {
        child.kill('SIGKILL');
        await Promise.race([exited, sleep(1000)]);
    }
}

async function startBrokenApi(apiPort, pbxPort, dbPath) {
    const env = {
        ...process.env,
        PORT: String(apiPort),
        DATABASE_PATH: dbPath,
        PBX_MODE: 'tcp',
        PBX_HOST: '127.0.0.1',
        PBX_PORT: String(pbxPort),
        PBX_READ_ONLY: 'true',
        SHC_POLICY_DRY_RUN: 'true',
        SHC_SYNC_INTERVAL_MS: '250',
        NODE_ENV: 'test',
        JWT_SECRET: 'phase2-reconnect-test-secret',
        FRONTDESK_PIN: '1234',
        OWNER_PIN: '9999',
        SHC_PRESENCE_MQTT_URL: '',
        SHC_PRESENCE_MQTT_USER: '',
        SHC_PRESENCE_MQTT_PASS: '',
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_CHAT_ID: '',
        GOOGLE_CHAT_WEBHOOK_URL: '',
        GOOGLE_SHEETS_WEBHOOK_URL: '',
    };

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
        const res = await request(apiPort, 'GET', '/health');
        return res.status === 200 && res.body.status === 'OK';
    }, 20000, 'API health while PBX is down');

    return { child, logs: currentLogs };
}

function snapshotRooms(roomsBody) {
    assert.strictEqual(roomsBody.success, true, JSON.stringify(roomsBody));
    const snapshot = {};
    for (const id of [101, 102, 103, 104, 105, 106]) {
        const room = roomsBody.rooms.find(r => String(r.id) === String(id));
        assert.ok(room, `room ${id} missing`);
        snapshot[id] = { status: room.status, power: room.power };
    }
    return snapshot;
}

(async () => {
    console.log('\n=== Phase 2 — API survives initial PBX failure and reconnects ===');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shc-phase2-reconnect-'));
    const dbPath = path.join(dir, 'hotel.db');
    let apiPort;
    let pbxPort;
    let api = null;
    let simulator = null;

    try {
        apiPort = await getFreePort();
        do {
            pbxPort = await getFreePort();
        } while (pbxPort === apiPort);

        api = await startBrokenApi(apiPort, pbxPort, dbPath);

        const downHealth = await request(apiPort, 'GET', '/health');
        assert.strictEqual(downHealth.status, 200, JSON.stringify(downHealth.body));
        assert.strictEqual(downHealth.body.pbxConnected, false, JSON.stringify(downHealth.body));
        console.log('  PASS API is up and health reports pbxConnected=false while PBX is down');

        await waitFor(() => Promise.resolve(api.logs().includes('PBX unavailable — skipping sync')), 5000, 'graceful sync skip');
        console.log('  PASS sync skips gracefully while PBX is unavailable');

        let roomsBefore = null;
        await waitFor(async () => {
            const res = await request(apiPort, 'GET', '/api/rooms');
            if (res.status !== 200 || !res.body.success) return false;
            roomsBefore = res;
            return [101, 102, 103, 104, 105, 106].every(id =>
                res.body.rooms.some(r => String(r.id) === String(id)));
        }, 5000, 'seeded room state');
        assert.strictEqual(roomsBefore.status, 200, JSON.stringify(roomsBefore.body));
        const snapshotBefore = snapshotRooms(roomsBefore.body);
        console.log('  PASS failed reads did not change room state');

        simulator = spawn(process.execPath, [simulatorPath, '--port', String(pbxPort)], {
            cwd: path.join(apiDir, '..'),
            stdio: 'ignore',
        });
        await waitForPort(pbxPort, 5000);

        await waitFor(async () => {
            if (simulator.exitCode !== null) throw new Error(`simulator exited (${simulator.exitCode})`);
            const res = await request(apiPort, 'GET', '/health');
            return res.status === 200 && res.body.pbxConnected === true;
        }, 15000, 'automatic PBX reconnect');
        console.log('  PASS connector reconnected automatically without restarting the API');

        await waitFor(() => Promise.resolve(api.logs().includes('[SYNC][READ_ONLY] Summary:')), 15000, 'read-only sync after reconnect');
        assert.ok(api.logs().includes('readOnly=true'), 'read-only mode was not logged');
        console.log('  PASS read-only sync resumed after reconnect');

        const roomsAfter = await request(apiPort, 'GET', '/api/rooms');
        assert.strictEqual(roomsAfter.status, 200, JSON.stringify(roomsAfter.body));
        const snapshotAfter = snapshotRooms(roomsAfter.body);
        assert.deepStrictEqual(snapshotAfter, snapshotBefore);
        console.log('  PASS room state remained unchanged after reconnect sync');

        console.log('\nALL PASSED\n');
    } catch (err) {
        console.error(`\nFAILED: ${err.stack || err.message}\n`);
        if (api && api.logs) {
            console.error('--- server log ---\n' + api.logs());
        }
        process.exitCode = 1;
    } finally {
        await stopChild(simulator);
        if (api) await stopChild(api.child);
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore cleanup */ }
    }
})();
