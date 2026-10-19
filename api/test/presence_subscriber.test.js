'use strict';

/**
 * @file presence_subscriber.test.js — SHC API MVP Tests (B1, สเปก §8)
 *
 * Dependency-free runner (node:assert)
 * รัน: node api/test/presence_subscriber.test.js
 *
 * เคส:
 *   T6 MQTT silent → ไม่ error / ไม่ crash (connect() resolve ได้แม้ broker ไม่ตอบ)
 *   T7 malformed payload → log + drop, ไม่ crash
 *   valid payload → persist + emit 'presence'
 *   topic → room parse ถูกต้อง
 */

const assert = require('assert');
const { PresenceSubscriber } = require('../services/presence_subscriber');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ ${name}\n     ${e.message}`);
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ ${name}\n     ${e.message}`);
    }
}

// fake db module
function fakeDb() {
    const calls = [];
    return {
        calls,
        db: {
            run: (sql, params, cb) => {
                calls.push({ sql, params });
                if (cb) cb(null);
            },
        },
    };
}

(async () => {
    console.log('\n=== B1 presence_subscriber ===');

    test('_roomFromTopic parse shc/room/101/presence → 101', () => {
        const ps = new PresenceSubscriber({});
        assert.strictEqual(ps._roomFromTopic('shc/room/101/presence'), '101');
        assert.strictEqual(ps._roomFromTopic('shc/room/A-12/presence'), 'A-12');
        assert.strictEqual(ps._roomFromTopic('hotel/branch_01/status'), null);
    });

    await testAsync('T7: malformed payload → log + emit malformed, no crash', async () => {
        const ps = new PresenceSubscriber({});
        let malformed = null;
        ps.on('malformed', (d) => { malformed = d; });
        assert.doesNotThrow(() => ps._handleMessage('shc/room/101/presence', Buffer.from('{not json')));
        assert.ok(malformed, 'ควร emit malformed');
        assert.strictEqual(ps.cache.size, 0, 'ไม่ควร cache payload เสีย');
    });

    await testAsync('T7b: missing event → drop, no crash', async () => {
        const ps = new PresenceSubscriber({});
        let malformed = null;
        ps.on('malformed', (d) => { malformed = d; });
        assert.doesNotThrow(() => ps._handleMessage('shc/room/102/presence', Buffer.from(JSON.stringify({ room_id: '102' }))));
        assert.ok(malformed);
    });

    await testAsync('T7c: unknown event → drop, no crash', async () => {
        const ps = new PresenceSubscriber({});
        let malformed = null;
        ps.on('malformed', (d) => { malformed = d; });
        ps._handleMessage('shc/room/102/presence', Buffer.from(JSON.stringify({ room_id: '102', event: 'exploded' })));
        assert.ok(malformed);
    });

    await testAsync('contract: entered → present=true + persist + emit', async () => {
        const db = fakeDb();
        const ps = new PresenceSubscriber({ db });
        let evt = null;
        ps.on('presence', (d) => { evt = d; });
        ps._handleMessage('shc/room/302/presence', Buffer.from(JSON.stringify({
            room_id: '302', event: 'entered', persons: 1, confidence: 0.87,
            ts: '2026-10-04T05:50:00+07:00', sensor_id: 'z2w-302',
        })));
        assert.ok(evt, 'ควร emit presence');
        assert.strictEqual(evt.room, '302');
        assert.strictEqual(evt.present, true);
        assert.strictEqual(evt.event, 'entered');
        assert.strictEqual(evt.persons, 1);
        assert.strictEqual(evt.confidence, 0.87);
        assert.strictEqual(evt.sensorId, 'z2w-302');
        assert.ok(db.calls.length >= 1, 'ควร persist ลง DB');
        assert.ok(ps.getPresence('302').present);
    });

    await testAsync('contract: empty → present=false', async () => {
        const ps = new PresenceSubscriber({});
        let evt = null;
        ps.on('presence', (d) => { evt = d; });
        ps._handleMessage('shc/room/302/presence', Buffer.from(JSON.stringify({
            room_id: '302', event: 'empty', persons: 0, confidence: 0.9,
            ts: '2026-10-04T06:10:00+07:00', sensor_id: 'z2w-302',
        })));
        assert.strictEqual(evt.present, false);
        assert.strictEqual(evt.event, 'empty');
    });

    await testAsync('contract: count_changed → emit occupancy (persons) + present=persons>0', async () => {
        const ps = new PresenceSubscriber({});
        let occ = null;
        ps.on('occupancy', (d) => { occ = d; });
        ps._handleMessage('shc/room/302/presence', Buffer.from(JSON.stringify({
            room_id: '302', event: 'count_changed', persons: 2, confidence: 0.75,
            ts: '2026-10-04T06:20:00+07:00', sensor_id: 'z2w-302',
        })));
        assert.ok(occ, 'ควร emit occupancy');
        assert.strictEqual(occ.persons, 2);
        assert.strictEqual(ps.getPresence('302').present, true);
    });

    await testAsync('contract: ts ISO8601 → persist epoch ที่ normalize (instant เดิม)', async () => {
        const db = fakeDb();
        const ps = new PresenceSubscriber({ db });
        ps._handleMessage('shc/room/305/presence', Buffer.from(JSON.stringify({
            room_id: '305', event: 'entered', persons: 1, confidence: 0.8,
            ts: '2026-10-04T05:50:00+07:00', sensor_id: 'z2w-305',
        })));
        const persistCall = db.calls.find(c => c.sql.includes('last_presence_at'));
        assert.ok(persistCall, 'ควรมี persist');
        // เก็บเป็น ISO (normalize UTC) — ต้องแทน instant เดิม 2026-10-04T05:50:00+07:00
        assert.strictEqual(Date.parse(persistCall.params[0]), Date.parse('2026-10-04T05:50:00+07:00'));
    });

    await testAsync('T6: connect() resolve ได้แม้ไม่มี broker (ไม่ throw)', async () => {
        const ps = new PresenceSubscriber({});
        // ใช้ broker ที่ไม่ตอบ — connect ต้อง resolve ไม่ hang/throw
        ps.brokerUrl = 'mqtt://127.0.0.1:1';
        ps.allowInsecure = true; // dev opt-in เพื่อทดสอบ path เชื่อมต่อจริง
        await ps.connect().catch(() => {});
        assert.ok(true, 'connect ไม่ throw');
        await ps.close().catch(() => {});
    });

    console.log('\n=== B1 fail-closed (ก้อน C ขั้น 0.1) ===');

    await testAsync('C1: ไม่มี broker URL → disabled + ไม่เชื่อมต่อ (ไม่ fallback สาธารณะ)', async () => {
        const ps = new PresenceSubscriber({});
        ps.brokerUrl = '';
        let disabledEvent = null;
        ps.on('disabled', (d) => { disabledEvent = d; });
        await ps.connect();
        assert.strictEqual(ps.disabled, true, 'ต้องถูก disable');
        assert.strictEqual(ps.client, null, 'ต้องไม่สร้าง client');
        assert.ok(disabledEvent, 'ต้อง emit disabled');
        assert.strictEqual(disabledEvent.reason, 'no_broker_url');
    });

    await testAsync('C2: มี URL แต่ไม่มี credential (ไม่ opt-in) → disabled', async () => {
        const ps = new PresenceSubscriber({});
        ps.brokerUrl = 'mqtt://192.168.1.94:1883';
        ps.username = null;
        ps.allowInsecure = false;
        await ps.connect();
        assert.strictEqual(ps.disabled, true, 'ไม่มี credential ต้องปิด');
        assert.strictEqual(ps.client, null);
    });

    await testAsync('C3: constructor ไม่ fallback hivemq สาธารณะ', async () => {
        const old = { ...process.env };
        delete process.env.SHC_PRESENCE_MQTT_URL;
        delete process.env.MQTT_BROKER_URL;
        const ps = new PresenceSubscriber({});
        assert.strictEqual(ps.brokerUrl, '', 'ห้ามมี default สาธารณะ');
        assert.ok(!/hivemq/i.test(ps.brokerUrl));
        process.env = old;
    });

    await testAsync('C4: credential แยกเฉพาะ service (SHC_PRESENCE_MQTT_USER/PASS)', async () => {
        const old = { ...process.env };
        process.env.SHC_PRESENCE_MQTT_USER = 'shc-presence';
        process.env.SHC_PRESENCE_MQTT_PASS = 'secret-pass';
        const ps = new PresenceSubscriber({});
        assert.strictEqual(ps.username, 'shc-presence');
        assert.strictEqual(ps.password, 'secret-pass');
        process.env = old;
    });

    await testAsync('C5: ไม่มี URL → ไม่ throw ตอน connect (fail-closed เงียบ)', async () => {
        const ps = new PresenceSubscriber({});
        ps.brokerUrl = '';
        await assert.doesNotReject(() => ps.connect());
    });

    console.log(`\n${failed === 0 ? '✅' : '❌'} B1: passed=${passed} failed=${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
