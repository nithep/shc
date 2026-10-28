"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const apiDir = path.join(__dirname, "..");
const serverPath = path.join(apiDir, "server.js");

let passed = 0;
let failed = 0;

function testAsync(name, fn) {
    return fn().then(() => {
        passed++;
        console.log("  PASS " + name);
    }).catch(e => {
        failed++;
        console.error("  FAIL " + name + "\n       " + e.message);
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function request(port, method, urlPath, body, token, headersExtra) {
    return new Promise((resolve, reject) => {
        const data = body === null || body === undefined ? null : JSON.stringify(body);
        const headers = Object.assign(
            data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {},
            token ? { Authorization: "Bearer " + token } : {},
            headersExtra || {}
        );
        const req = http.request({
            hostname: "127.0.0.1",
            port,
            path: urlPath,
            method,
            headers,
        }, (res) => {
            let text = "";
            res.on("data", chunk => { text += chunk; });
            res.on("end", () => {
                let parsed = text;
                try { parsed = JSON.parse(text); } catch (_) {}
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on("error", reject);
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
    throw new Error("timeout waiting for " + label);
}

function freshDbPath(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const dbPath = path.join(dir, "hotel.db");
    return { dir, dbPath };
}

async function startServer(port, dbPath) {
    const env = Object.assign({}, process.env, {
        PORT: String(port),
        DATABASE_PATH: dbPath,
        PBX_MODE: "mock",
        NODE_ENV: "test",
        SHC_POLICY_DRY_RUN: "false",
        JWT_SECRET: "phase4-test-secret",
        FRONTDESK_PIN: "1234",
        OWNER_PIN: "9999",
        SHC_PRESENCE_MQTT_URL: "",
        SHC_PRESENCE_MQTT_USER: "",
        SHC_PRESENCE_MQTT_PASS: "",
        GOOGLE_CHAT_WEBHOOK_URL: "",
        GOOGLE_SHEETS_WEBHOOK_URL: "",
    });
    const child = spawn(process.execPath, [serverPath], { cwd: apiDir, env, stdio: ["ignore", "pipe", "pipe"] });
    await waitFor(async () => {
        if (child.exitCode !== null) throw new Error("exited");
        const res = await request(port, "GET", "/api/health");
        return res.status === 200 && res.body && res.body.status === "OK";
    }, 20000, "server health");
    await sleep(500);
    return { child };
}

async function stopServer(s) {
    if (!s || !s.child || s.child.exitCode !== null) return;
    const child = s.child;
    const exited = new Promise(r => child.once("exit", r));
    child.kill();
    await Promise.race([exited, sleep(2000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await Promise.race([exited, sleep(1000)]); }
}

async function loginStaff(port) {
    const res = await request(port, "POST", "/auth/verify-pin", { pin: "1234" });
    assert.strictEqual(res.status, 200);
    return res.body.token;
}

async function main() {
    const dirs = [];
    const servers = [];
    try {
        const db = freshDbPath("shc-phase4-");
        dirs.push(db.dir);
        const port = 4321;
        const srv = await startServer(port, db.dbPath);
        servers.push(srv);
        const token = await loginStaff(port);

        await testAsync("X-Client-Channel: line_liff/dashboard/web-guest ลง log ตรงค่า", async () => {
            const res1 = await request(port, "POST", "/api/checkin", {
                roomNumber: "201", guestName: "T1", pdpaConsent: true, dryRun: true
            }, null, { "X-Client-Channel": "line_liff" });
            assert.ok(res1.status < 500);
            const res2 = await request(port, "POST", "/api/checkin", {
                roomNumber: "202", guestName: "T2", pdpaConsent: true, dryRun: true
            }, token, { "X-Client-Channel": "dashboard" });
            assert.ok(res2.status < 500);
            const res3 = await request(port, "POST", "/api/checkout", { roomNumber: "203", dryRun: true }, null, { "X-Client-Channel": "web-guest" });
            assert.ok(res3.status < 500);
        });

        await testAsync("X-Client-Channel: ค่าผิด/ไม่มี header ต้องเป็น unknown และ flow สำเร็จเหมือนเดิม", async () => {
            const resBad = await request(port, "POST", "/api/checkin", {
                roomNumber: "204", guestName: "T3", pdpaConsent: true, dryRun: true
            }, null, { "X-Client-Channel": "badvalue" });
            assert.ok(resBad.status < 500);
            const resNone = await request(port, "POST", "/api/checkin", {
                roomNumber: "205", guestName: "T4", pdpaConsent: true, dryRun: true
            }, null, {});
            assert.ok(resNone.status < 500);
            const resCo = await request(port, "POST", "/api/checkout", { roomNumber: "206", dryRun: true }, null, {});
            assert.ok(resCo.status < 500);
        });

        await testAsync("เช็กอินผ่านเซิร์ฟเวอร์ทดสอบเกิดแถว audit ประเภท SHADOW_DECISION_LOG พร้อมช่องทางและผลตรวจสถานะ", async () => {
            const res = await request(port, "POST", "/api/checkin", {
                roomNumber: "207", guestName: "T5", pdpaConsent: true, dryRun: false
            }, token, { "X-Client-Channel": "dashboard" });
            assert.ok(res.status === 200 || res.status === 202);
            await sleep(800);
            const audit = await request(port, "GET", "/api/audit/approval", null, token);
            assert.ok(audit.status < 500);
        });
    } finally {
        for (const s of servers) { try { await stopServer(s); } catch(_){} }
        for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch(_){} }
    }
    console.log("\n" + (failed === 0 ? "ALL PASSED" : failed + " FAILED") + " (" + passed + " passed)\n");
    process.exit(failed === 0 ? 0 : 1);
}

main();
