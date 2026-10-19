'use strict';

/**
 * @file cron_idle_checker.test.js — SHC API MVP Tests (B5, สเปก §8)
 *
 * Dependency-free runner (node:assert)
 * รัน: node api/test/cron_idle_checker.test.js
 *
 * เคส:
 *   - idle 30 min → ecoOff counted (dry-run, ไม่ยิงจริง)
 *   - idle 29 min (normal, threshold 20) → ไม่นับ ecoOff (แต่ warned ถ้าใน warn zone)
 *   - warn zone → warned++
 *   - dry-run บังคับ → ไม่เรียก pbx/executed
 *   - malformed room (ไม่มี last_presence_at) → ข้าม ไม่ crash
 */

const assert = require('assert');
const { runPresenceIdleRound } = require('../services/cron_scheduler');
const { PolicyVerifier } = require('../services/policy_verifier');

let passed = 0;
let failed = 0;

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

function fixedNow(hour) {
    const d = new Date('2026-10-20T00:00:00+07:00');
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
}

function fakeDb(rooms) {
    return {
        getAllRooms: (cb) => cb(null, rooms),
        db: { run: (sql, params, cb) => { if (cb) cb(null); } },
    };
}

(async () => {
    console.log('\n=== B5 idle 60s checker (dry-run) ===');
    const noon = fixedNow(14);

    await testAsync('idle 30 min (threshold 20) → นับ ecoOff, dry-run ไม่ยิงจริง', async () => {
        const rooms = [{ id: 101, status: 'occupied', power: true, last_presence_at: new Date(noon - 30 * 60000).toISOString(), warned: 0 }];
        const pv = new PolicyVerifier({ now: () => noon });
        const summary = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(summary.checked, 1);
        assert.strictEqual(summary.ecoOff, 1, `ecoOff=${summary.ecoOff}`);
        assert.strictEqual(summary.dryRun, true);
    });

    await testAsync('idle 19 min (warn zone threshold 20) → warned++ แต่ไม่ ecoOff', async () => {
        const rooms = [{ id: 102, status: 'occupied', power: true, last_presence_at: new Date(noon - 19 * 60000).toISOString(), warned: 0 }];
        const pv = new PolicyVerifier({ now: () => noon });
        const summary = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(summary.warned, 1, `warned=${summary.warned}`);
        assert.strictEqual(summary.ecoOff, 0);
    });

    await testAsync('idle 5 min → ไม่ทำอะไร (checked แต่ไม่มี action)', async () => {
        const rooms = [{ id: 103, status: 'occupied', power: true, last_presence_at: new Date(noon - 5 * 60000).toISOString(), warned: 0 }];
        const pv = new PolicyVerifier({ now: () => noon });
        const summary = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(summary.checked, 1);
        assert.strictEqual(summary.ecoOff, 0);
        assert.strictEqual(summary.warned, 0);
    });

    await testAsync('vacant room → ข้าม (ไม่นับ checked)', async () => {
        const rooms = [{ id: 104, status: 'vacant', power: false, last_presence_at: new Date(noon - 30 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const summary = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(summary.checked, 0);
    });

    await testAsync('room ไม่มี last_presence_at → ข้าม ไม่ crash', async () => {
        const rooms = [{ id: 105, status: 'occupied', power: true, last_presence_at: null }];
        const pv = new PolicyVerifier({ now: () => noon });
        const summary = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(summary.checked, 0);
    });

    await testAsync('override_locked room idle 30 min → policy deny (ไม่ ecoOff)', async () => {
        const rooms = [{ id: 106, status: 'occupied', power: true, override_locked: 1, last_presence_at: new Date(noon - 30 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const summary = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        assert.strictEqual(summary.denied, 1, `denied=${summary.denied}`);
        assert.strictEqual(summary.ecoOff, 0);
    });

    console.log(`\n${failed === 0 ? '✅' : '❌'} B5: passed=${passed} failed=${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
