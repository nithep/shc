'use strict';

/**
 * @file migration.test.js — SHC API MVP Tests (B2)
 *
 * ตรวจว่า migration 004 (additive) ทำงาน idempotent บน DB เปล่า
 * รัน: node api/test/migration.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let passed = 0;
let failed = 0;

function testAsync(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { passed++; console.log(`  ✅ ${name}`); })
        .catch((e) => { failed++; console.error(`  ❌ ${name}\n     ${e.message}`); });
}

function run(db, sql) {
    return new Promise((resolve, reject) => db.run(sql, (e) => e ? reject(e) : resolve()));
}

function all(db, sql) {
    return new Promise((resolve, reject) => db.all(sql, (e, rows) => e ? reject(e) : resolve(rows)));
}

const NEW_COLUMNS = ['last_door_open_at', 'last_presence_at', 'door_closed', 'override_locked', 'warned'];

const ALTERS = [
    'ALTER TABLE rooms ADD COLUMN last_door_open_at TEXT',
    'ALTER TABLE rooms ADD COLUMN last_presence_at TEXT',
    'ALTER TABLE rooms ADD COLUMN door_closed BOOLEAN NOT NULL DEFAULT 0',
    'ALTER TABLE rooms ADD COLUMN override_locked BOOLEAN NOT NULL DEFAULT 0',
    'ALTER TABLE rooms ADD COLUMN warned BOOLEAN NOT NULL DEFAULT 0',
];

(async () => {
    console.log('\n=== B2 additive migration (idempotent) ===');
    const tmp = path.join(os.tmpdir(), `shc-mig-test-${Date.now()}.db`);

    await testAsync('migration 004 adds 5 columns; รันซ้ำก็ไม่พัง (idempotent)', async () => {
        const db = new sqlite3.Database(tmp);
        await run(db, `CREATE TABLE rooms (
            id INTEGER PRIMARY KEY, status TEXT NOT NULL, power BOOLEAN NOT NULL,
            guest_name TEXT, guest_email TEXT, consent_given_at TEXT, consent_ip TEXT,
            checkout_date TEXT, branch_id TEXT DEFAULT 'branch_01')`);

        // รอบแรก
        for (const sql of ALTERS) await run(db, sql);
        // รอบสอง — ต้อง ignore 'duplicate column name' แบบ idempotent
        for (const sql of ALTERS) {
            try { await run(db, sql); } catch (e) {
                assert.ok(e.message.includes('duplicate column name'), `unexpected: ${e.message}`);
            }
        }

        const cols = (await all(db, 'PRAGMA table_info(rooms)')).map(c => c.name);
        for (const c of NEW_COLUMNS) assert.ok(cols.includes(c), `missing column ${c}`);
        await new Promise((r) => db.close(r));
    });

    await testAsync('defaults: door_closed/override_locked/warned = 0', async () => {
        const db = new sqlite3.Database(tmp);
        await run(db, 'INSERT INTO rooms (id, status, power) VALUES (999, \'vacant\', 0)');
        const row = (await all(db, 'SELECT door_closed, override_locked, warned FROM rooms WHERE id = 999'))[0];
        assert.strictEqual(row.door_closed, 0);
        assert.strictEqual(row.override_locked, 0);
        assert.strictEqual(row.warned, 0);
        await new Promise((r) => db.close(r));
    });

    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }

    console.log(`\n${failed === 0 ? '✅' : '❌'} B2: passed=${passed} failed=${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
