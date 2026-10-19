'use strict';

/**
 * @file cron_idle_checker.test.js — SHC API MVP Tests (B5, สเปก §4/§8)
 *
 * Dependency-free runner (node:assert)
 * รัน: node api/test/cron_idle_checker.test.js
 *
 * ⚠️ เทสต์เขียนตามสเปก §4: idle = now − last_door_open_at (door = พยานหลัก)
 *
 * เคส §8 (round + verifier):
 *   - 23:00 door idle 2 ชม. → ไม่ ECO (night guard)
 *   - ประตูแง้ม → alert ไม่ ECO
 *   - ห้องไม่มี presence data + door idle 30 นาที → ECO ได้
 *   - presence empty แต่ประตูเพิ่งเปิด → ไม่ ECO
 *   - override → ไม่ ECO
 *   - door idle 30 min (กลางวัน) → ecoOn counted (dry-run)
 */

const assert = require('assert');
const { runPresenceIdleRound } = require('../services/cron_scheduler');
const { PolicyVerifier } = require('../services/policy_verifier');

let passed = 0;
let failed = 0;

async function testAsync(name, fn) {
    try { await fn(); passed++; console.log(`  ✅ ${name}`); }
    catch (e) { failed++; console.error(`  ❌ ${name}\n     ${e.message}`); }
}

function fixedNow(hour, minute = 0) {
    const d = new Date('2026-10-20T00:00:00+07:00');
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
}

function fakeDb(rooms) {
    return {
        getAllRooms: (cb) => cb(null, rooms),
        db: { run: (sql, params, cb) => { if (cb) cb(null); } },
    };
}

(async () => {
    console.log('\n=== B5 door idle 60s checker (dry-run, §4) ===');
    const noon = fixedNow(14);

    await testAsync('§8: door idle 30 min (กลางวัน, threshold 20) → ecoOn counted (dry-run)', async () => {
        const rooms = [{ id: 101, status: 'occupied', power: true, door_closed: 1, last_door_open_at: new Date(noon - 30 * 60000).toISOString(), warned: 0 }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(s.checked, 1);
        assert.strictEqual(s.ecoOn, 1, `ecoOn=${s.ecoOn}`);
        assert.strictEqual(s.dryRun, true);
    });

    await testAsync('§8: 23:00 door idle 2 ชม. → ไม่ ECO (night guard ใน verifier)', async () => {
        const night = fixedNow(23);
        const rooms = [{ id: 102, status: 'occupied', power: true, door_closed: 1, last_door_open_at: new Date(night - 120 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => night });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => night });
        assert.strictEqual(s.ecoOn, 0, `ecoOn=${s.ecoOn}`);
        assert.strictEqual(s.denied, 1, 'night guard ต้อง deny');
    });

    await testAsync('§8: ประตูแง้ม (เปิดค้าง > X) → alert ไม่ ECO', async () => {
        const rooms = [{ id: 103, status: 'occupied', power: true, door_closed: 0, last_door_open_at: new Date(noon - 30 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(s.doorAlerts, 1, `doorAlerts=${s.doorAlerts}`);
        assert.strictEqual(s.ecoOn, 0);
    });

    await testAsync('§8: ห้องไม่มี presence data + door idle 30 นาที → ECO ได้', async () => {
        const rooms = [{ id: 104, status: 'occupied', power: true, door_closed: 1, last_door_open_at: new Date(noon - 30 * 60000).toISOString(), last_presence_at: null }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(s.ecoOn, 1, `ecoOn=${s.ecoOn} (เส้นทาง pilot door+check-in §10)`);
    });

    await testAsync('§8: presence empty แต่ประตูเพิ่งเปิด (idle น้อย) → ไม่ ECO', async () => {
        const rooms = [{ id: 105, status: 'occupied', power: true, door_closed: 1, last_door_open_at: new Date(noon - 5 * 60000).toISOString(), last_presence_at: new Date(noon - 40 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(s.ecoOn, 0, 'door เพิ่งเปิด → ไม่ ECO');
        assert.strictEqual(s.warned, 0);
    });

    await testAsync('§8: override_locked → ไม่ ECO', async () => {
        const rooms = [{ id: 106, status: 'occupied', power: true, override_locked: 1, door_closed: 1, last_door_open_at: new Date(noon - 30 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(s.denied, 1, `denied=${s.denied}`);
        assert.strictEqual(s.ecoOn, 0);
    });

    await testAsync('door idle 5 min → ไม่ทำอะไร', async () => {
        const rooms = [{ id: 107, status: 'occupied', power: true, door_closed: 1, last_door_open_at: new Date(noon - 5 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(s.ecoOn, 0);
        assert.strictEqual(s.warned, 0);
    });

    await testAsync('vacant → ข้าม', async () => {
        const rooms = [{ id: 108, status: 'vacant', power: false, last_door_open_at: new Date(noon - 30 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(s.checked, 0);
    });

    await testAsync('occupied แต่ไม่มี door witness เลย → skip (ไม่ ECO)', async () => {
        const rooms = [{ id: 109, status: 'occupied', power: true, last_door_open_at: null }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(s.skipped, 1, `skipped=${s.skipped}`);
        assert.strictEqual(s.ecoOn, 0);
    });

    console.log(`\n${failed === 0 ? '✅' : '❌'} B5: passed=${passed} failed=${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
